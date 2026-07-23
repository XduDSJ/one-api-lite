# One API 个人化改造设计文档

> 日期: 2026-07-23
> 方案: 方案 A(渐进式改造)
> 后续: 方案 B(激进重构)列入后续改造计划

## 背景与目标

One API 是以标准 OpenAI API 格式聚合多家大模型的后端网关(Go + Gin + GORM,前端 React)。本项目仅个人及朋友使用,需进行两项改造:

1. **模型管理改造**:移除系统中硬编码的默认模型列表,改为从上游 API 获取(`/v1/models`)+ 手动添加。
2. **商业功能移除**:移除兑换码/充值、运营设置商业选项、用户分组与分组倍率等个人使用不需要的功能。

## 改造范围总览

两条独立主线,互不依赖,可并行实施:

### 主线一:模型管理改造

| 改动项 | 说明 |
|--------|------|
| 新增后端接口 `GET /api/channel/fetch_models/:id` | 用已保存渠道的 Key + BaseURL 请求上游 `/v1/models`,返回模型列表 |
| 改造 `controller/model.go` | 移除 `init()` 中基于适配器构建全局列表的逻辑,改为运行时从 `ability` 表聚合 |
| 改造 `/v1/models` 接口 | 从 `ability` 表 `DISTINCT model` 查询,去重返回 |
| 前端 `EditChannel.js` | 移除"填入相关模型""填入所有模型"按钮,新增"从上游获取"按钮 |
| 适配器 `constants.go` | **保留不动**(接口要求实现 `GetModelList()`),不再用于前端展示 |

### 主线二:商业功能移除

| 改动项 | 说明 |
|--------|------|
| 兑换码/充值系统 | 删除后端 controller+model、路由;删除前端页面+组件+路由+菜单 |
| 运营设置商业选项 | 移除 TopUpLink、QuotaForNewUser、QuotaForInviter 等;保留技术选项 |
| 用户分组与分组倍率 | 统一用 `default` 分组,移除前端分组倍率配置 UI;`GetGroupRatio` 返回固定值 1 |
| 倍率固定为 1 | 移除前端倍率配置 UI;`GetModelRatio`/`GetCompletionRatio` 返回固定值 1;保留计费框架 |

### 不动的部分

- 中继核心链路(`relay/controller/*`)
- 适配器目录(40 个)
- 优先级(`priority` 字段)/ 重试(`ignoreFirstPriority`)/ 自动禁用渠道(`monitor`)机制
- 令牌额度限制(`Token.RemainQuota` / `UnlimitedQuota`)
- 用户额度(`User.Quota`)与消费日志

## 详细设计

### 第 1 节:模型管理改造 — 后端

#### 1.1 新增上游模型获取接口

**新增文件**: `controller/channel_fetch_models.go`

**接口**: `GET /api/channel/fetch_models/:id`

**逻辑**:
1. 根据 `:id` 从数据库查询渠道,获取其 `Key`、`BaseURL`、`Type`
2. 根据渠道类型构建上游 `/v1/models` 请求 URL:
   - OpenAI 兼容渠道(大多数): `{BaseURL}/v1/models`
   - 特殊渠道按适配器逻辑处理(如 Gemini 用 `/v1beta/models`,智谱用 `/api/paas/v4/models`)——复用现有适配器的 `GetRequestURL` 机制,或对少数特殊类型做 switch-case
3. 用渠道的 Key 发起 GET 请求,解析返回的 `{"data": [{"id": "model-name"}, ...]}` 格式
4. 提取 `id` 字段列表返回给前端

**路由注册**: `router/api.go` 的 `channelRoute` 组内新增:
```go
channelRoute.GET("/fetch_models/:id", controller.FetchChannelModels)
```

**错误处理**: 上游不可达、Key 无效、返回格式异常时返回 `{"success": false, "message": "..."}`,不影响现有渠道数据。

**注意**: 此接口仅返回模型列表,**不自动写入渠道**。前端拿到列表后展示给用户确认,用户保存渠道时才写入 `Models` 字段并同步 `ability` 表。这与"保存后获取"交互一致。

#### 1.2 改造 controller/model.go

**移除 `init()` 函数**(第 49-115 行):不再在启动时遍历适配器构建全局 `models`/`modelsMap`/`channelId2Models`。

**移除全局变量**: `models`、`modelsMap`、`channelId2Models`。

**改造 `DashboardListModels`**(原返回 `channelId2Models`):改为从 `ability` 表查询,返回 `{channelId: [models]}` 映射。用 `model.GetChannelModelsMap()`(新增)从 `ability` 表聚合。

**改造 `ListModels`**(`/v1/models`):改为从 `ability` 表 `DISTINCT model` 查询用户可用模型(基于用户分组,统一为 `default`),去重返回。不再依赖全局 `models` 数组。

**改造 `RetrieveModel`**(`/v1/models/:model`):改为从 `ability` 表查询该模型是否存在,存在则返回基本信息,不存在返回 `model_not_found`。

**改造 `ListAllModels`**(`/api/channel/models`):改为从 `ability` 表 `DISTINCT model` 查询所有已配置模型。

**改造 `GetUserAvailableModels`**:逻辑基本不变,仍从 `ability` 表按分组查询,但分组统一为 `default`。

#### 1.3 model 层新增查询

**`model/ability.go` 新增**:
- `GetAllDistinctModels() ([]string, error)` — `DISTINCT model` 查询所有已配置模型
- `GetChannelModelsMap() (map[int][]string, error)` — 按 `channel_id` 聚合模型列表

#### 1.4 适配器层不动

40 个适配器的 `constants.go` 中的 `ModelList` 保留。`Adaptor` 接口的 `GetModelList()` 方法保留——中继时适配器内部可能仍需引用(如默认模型映射),但不再用于前端展示和全局列表构建。这是方案 A 的核心权衡:用少量死代码换取零适配器改动风险。

### 第 2 节:模型管理改造 — 前端

#### 2.1 EditChannel.js 改造

**移除的按钮**(`EditChannel.js:440-488`):
- "填入相关模型"按钮(基于 `basicModels`)
- "填入所有模型"按钮(基于 `fullModels`)
- 相关的 `fetchModels()` 调用(`EditChannel.js:115-128`,从 `/api/channel/models` 获取所有模型)
- 切换渠道类型时自动加载默认模型的逻辑(`EditChannel.js:71-76`)

**保留的功能**:
- "自定义模型"输入框 + 添加按钮(`addCustomModel()`,`EditChannel.js:232-248`)——手动添加模型名
- "清空"按钮
- 已选模型的标签展示和删除
- 模型映射(ModelMapping)编辑功能

**新增"从上游获取"按钮**:
- 位置:模型选择区域,与"自定义模型"并排
- 状态控制:**仅当渠道已保存(存在 `channelId`)时启用**,新建渠道未保存时禁用并提示"请先保存渠道"
- 点击后调用 `GET /api/channel/fetch_models/:id`
- 成功:将返回的模型列表合并到当前已选模型(去重),展示 toast 提示"获取到 N 个模型"
- 失败:展示错误 toast,不影响当前已选模型
- 交互细节:获取后**不自动保存**,用户可在合并结果上增删,确认后点"保存"才写入

#### 2.2 utils.js 改造

**移除** `getChannelModels()`(`utils.js:204-217`):不再需要从缓存获取渠道默认模型。

**移除** `channelModels` 相关的 localStorage 缓存逻辑。

#### 2.3 channel.constants.js 不动

`CHANNEL_OPTIONS`(渠道类型选项)保留——用户仍需选择渠道类型(OpenAI、Anthropic 等),这决定使用哪个适配器中继请求。只是不再根据渠道类型预填模型列表。

#### 2.4 新建渠道的流程变化

**改造前**:选渠道类型 → 自动填入默认模型 → 保存

**改造后**:选渠道类型 → 填入 Key 和 BaseURL → 填一个占位模型(如 `gpt-4o`,用于通过前端校验)→ 保存 → 点"从上游获取" → 合并模型列表 → 再次保存

**占位模型问题**:前端表单校验要求至少一个模型。新建时用户需手动输入一个模型名或点"自定义模型"添加一个。这是"保存后获取"交互的固有代价——参考 new-api 也是同样流程。

### 第 3 节:商业功能移除 — 兑换码/充值系统

#### 3.1 后端移除

**删除文件**:
- `controller/redemption.go` — 兑换码管理 API
- `model/redemption.go` — 兑换码数据模型

**移除路由**(`router/api.go`):
- `redemptionRoute` 整组(第 97-106 行):`/api/redemption/*` 的 6 个端点
- `apiRouter.POST("/topup", ...)` (第 32 行)— 管理员充值
- `selfRoute.POST("/topup", ...)` (第 49 行)— 用户兑换

**移除引用**:
- `controller/relay.go` 或其他文件中对 redemption 的 import
- `model/log.go` 中 `LogTypeTopup` 常量保留(历史日志可能引用),但不再产生新的充值日志

#### 3.2 前端移除

**删除页面**:
- `web/default/src/pages/Redemption/index.js` — 兑换码列表
- `web/default/src/pages/Redemption/EditRedemption.js` — 兑换码编辑
- `web/default/src/pages/TopUp/index.js` — 充值页面

**删除组件**:
- `web/default/src/components/RedemptionsTable.js` — 兑换码表格

**移除路由**(`web/default/src/App.js`):
- `/redemption`、`/redemption/edit/:id`、`/redemption/add`、`/topup` 四条路由

**移除菜单项**(`web/default/src/components/Header.js`):
- `header.redemption`(兑换)— 仅管理员可见的菜单项
- `header.topup`(充值)— 用户菜单项

**移除引用**:其他组件中对兑换码/充值 API 的调用(如 `TokensTable.js` 中可能有的充值入口链接)。

#### 3.3 数据库

`redemptions` 表不主动删除(避免迁移风险),但不再有任何代码读写它。GORM 自动建表时仍会创建该表(因为 `model/redemption.go` 被删除,`Redemption` 结构体不存在,GORM 不会创建)。已存在的 `redemptions` 表保留在数据库中,不影响运行。

### 第 4 节:商业功能移除 — 运营设置、分组、倍率

#### 4.1 运营设置商业选项移除

**后端**(`model/option.go`、`controller/option.go`):
- 移除以下选项的默认值定义和初始化逻辑:
  - `TopUpLink`(充值链接)
  - `QuotaForNewUser`(新用户初始额度)— 设为 0
  - `QuotaForInviter`(邀请者奖励)— 设为 0
  - `QuotaForInvitee`(被邀请者奖励)— 设为 0
  - `QuotaRemindThreshold`(额度提醒阈值)
  - `QuotaPerUnit`(单位货币兑换额度)
  - `DisplayInCurrencyEnabled`(货币显示开关)
- `controller/option.go` 的 `GetOptions`/`UpdateOption` 不做硬性过滤——选项是动态 KV 存储,前端不展示即不会写入。但移除 `model/option.go` 中这些选项的默认值初始化,确保新部署不产生这些配置。

**保留的技术选项**:
- `RetryTimes`(重试次数)
- `AutomaticDisableChannelEnabled`/`AutomaticEnableChannelEnabled`(自动禁用/启用渠道)
- `ChannelDisableThreshold`(渠道禁用阈值)
- `LogConsumeEnabled`(消费日志)
- `ApproximateTokenEnabled`(Token 估算)
- `DisplayTokenStatEnabled`(令牌额度显示)

**前端**(`web/default/src/components/OperationSetting.js`):
- 移除上述商业选项的配置 UI
- 保留技术选项的配置 UI
- 如果 `OperationSetting.js` 移除商业选项后内容过少,可将剩余技术选项合并到 `SystemSetting.js` 或 `OtherSetting.js`,删除 `OperationSetting.js`。具体在实现时根据剩余内容量决定。

#### 4.2 用户分组与分组倍率移除

**后端**:
- `relay/billing/ratio/group.go` 的 `GetGroupRatio` 返回固定值 `1.0`,移除 `groupRatio` map 和 `groupRatio2` JSON 配置
- `controller/group.go` 的 `GetGroups` 简化为返回 `["default"]`
- `model/user.go` 的 `User.Group` 字段保留(数据库结构不动),但新用户注册时固定设为 `"default"`
- `model/channel.go` 的 `Channel.Group` 字段保留,渠道保存时默认填 `"default"`
- `ability` 表的 `Group` 列保留,所有记录固定为 `"default"`——这保证 `GetRandomSatisfiedChannel` 和 `GetGroupModels` 的查询逻辑无需改动

**前端**:
- `OperationSetting.js` 中移除分组倍率配置 UI
- 渠道编辑页 `EditChannel.js` 移除分组选择器(或固定为 `default` 隐藏)
- 用户编辑页移除分组选择器(或固定为 `default` 隐藏)

**关键决策**:不删除 `Group` 字段和 `ability` 表的 `Group` 列,而是固定为 `"default"`。这样 `GetRandomSatisfiedChannel`、`GetGroupModels`、`CacheGetRandomSatisfiedChannel` 等核心查询逻辑**零改动**,风险最低。

#### 4.3 倍率固定为 1

**后端**:
- `relay/billing/ratio/model.go` 的 `GetModelRatio` 返回固定值 `1.0`,移除 `modelRatio` map(622 行硬编码定价表)
- `relay/billing/ratio/model.go` 的 `GetCompletionRatio` 返回固定值 `1.0`
- `relay/billing/ratio/image.go` 的图片倍率同理返回固定值
- 计费逻辑(`relay/billing/billing.go`、`relay/controller/text.go` 等)**不改动**——它们调用 `GetModelRatio`/`GetGroupRatio`/`GetCompletionRatio`,这些函数现在返回 1,效果是按 token 数 1:1 扣额度

**前端**:
- `OperationSetting.js` 中移除模型倍率、补全倍率配置 UI

**效果**:额度 = token 数 × 1(模型倍率) × 1(分组倍率) = token 数。消费日志记录的是实际 token 消耗,用量统计照常工作。

### 第 5 节:错误处理、测试与验证

#### 5.1 错误处理

**上游模型获取失败**:
- 上游不可达 / Key 无效 / 返回非 JSON:`FetchChannelModels` 返回 `{"success": false, "message": "获取模型失败: <具体错误>"}`,前端 toast 提示,不影响渠道现有数据
- 上游返回空模型列表:返回 `{"success": true, "message": "上游未返回任何模型", "data": []}`,前端提示用户检查 Key 和 BaseURL
- 超时:复用 `common/client` 的 HTTP client,默认超时由 `RELAY_TIMEOUT` 或 client 默认值控制

**移除功能后的兼容性处理**:
- 已有数据库中的 `redemptions` 表、`Group` 非 default 的用户/渠道记录:不主动迁移,代码固定用 `default` 分组查询,非 default 分组的 ability 记录不会被命中(自然失效)
- 已有 `ModelRatio`/`GroupRatio` 配置项:函数返回固定值 1,配置项即使存在于 option 表也被忽略
- 前端旧路由(如 `/topup`)被移除后,直接访问返回 404,无特殊处理

#### 5.2 测试策略

**后端**:
- 新增 `controller/channel_fetch_models_test.go`:测试 `FetchChannelModels` 的 URL 构建、响应解析、错误处理(用 mock HTTP server)
- 新增 `model/ability_test.go`:测试 `GetAllDistinctModels`、`GetChannelModelsMap` 查询正确性
- 改造 `controller/model_test.go`(如存在)或新增:测试改造后的 `ListModels` 从 ability 表聚合、去重逻辑
- 现有测试(`relay/adaptor_test.go` 等)应全部通过——适配器零改动

**前端**:
- 无自动化测试框架(项目用 react-scripts,但无测试文件),依赖手动验证

#### 5.3 验证清单

**模型管理**:
- [ ] 新建渠道 → 保存 → 点"从上游获取" → 模型列表正确回填
- [ ] 手动添加自定义模型 → 保存 → ability 表正确写入
- [ ] `/v1/models` 返回的模型列表 = ability 表 DISTINCT model
- [ ] 不同渠道配同一模型 → `/v1/models` 去重 → 请求该模型时负载均衡正常
- [ ] 删除渠道 → ability 表同步清理 → `/v1/models` 不再返回该渠道独有模型

**商业功能移除**:
- [ ] 兑换码页面/菜单消失,直接访问 `/redemption` 返回 404
- [ ] 充值页面消失,`/api/topup`、`/api/user/topup` 返回 404
- [ ] 运营设置页无商业选项,技术选项正常
- [ ] 新用户注册 → 分组为 default,无邀请奖励
- [ ] 请求中继 → 额度按 token 数 1:1 扣减,消费日志正常
- [ ] 优先级和故障转移正常工作(低成本渠道优先,失败自动切换)

**构建**:
- [ ] 前端 `npm run build` 成功
- [ ] 后端 `go build` 成功(web/build 存在)
- [ ] `go test ./...` 全部通过

## 优先级与故障转移说明(现有功能,不在改造范围)

one-api 已内置以下机制,本次改造不动:

- **优先级**: `Channel.Priority` 字段,数值越大越优先。前端渠道列表已支持内联编辑。
- **故障转移**: `controller/relay.go` 重试循环,首次失败后 `ignoreFirstPriority=true` 跳到次优先级渠道。
- **自动禁用**: `monitor/manage.go` 根据错误类型判断是否禁用渠道。

使用方式:给低成本渠道设高 `priority`(如 10),高成本渠道设低 `priority`(如 1),配置 `RetryTimes` > 0。

## 后续改造计划(方案 B,本次不实施)

- 删除所有 40 个适配器的 `constants.go` 中的 `ModelList`,修改 `Adaptor` 接口移除 `GetModelList()` 方法
- 彻底删除 `relay/billing/ratio/` 目录,重写 `relay/controller/text.go` 等的计费逻辑为纯 token 计数
- 删除 `model/redemption.go`、`controller/redemption.go` 等
- 引入健康评分系统(参考 lens 的滑动窗口统计)
- 引入错误分类与差异化冷却(参考 lens 的熔断机制)
- 引入 SWRR 算法(平滑加权轮询)
