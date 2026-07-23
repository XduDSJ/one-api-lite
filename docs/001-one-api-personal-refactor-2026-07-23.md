# one-api 个人化改造实现记录

> 编号: 001-one-api-personal-refactor-2026-07-23
> 日期: 2026-07-23

## 改造概述

对 one-api 开源项目进行两项改造:
1. **模型管理改造**:移除硬编码默认模型列表,改为从上游 API 获取 + 手动添加,`/v1/models` 从 ability 表聚合
2. **商业功能移除**:移除兑换码/充值系统、运营设置商业选项、用户分组与分组倍率,倍率固定为 1

## 设计决策

- **方案 A(渐进式改造)**:保留适配器 `constants.go` 中的 `ModelList`(避免改 40 个适配器),移除前端展示和全局列表构建
- **模型获取交互**:渠道先保存,再点"从上游获取"按钮拉取模型
- **倍率处理**:移除前端倍率配置 UI,`GetModelRatio`/`GetGroupRatio` 返回固定值 1,保留计费框架(额度扣减、消费日志)
- **/v1/models 接口**:改为从 ability 表 DISTINCT model 查询,去重返回

## 改动详情

### 模型管理改造

#### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `model/ability.go` | 修改 | 新增 `GetAllDistinctModels()`、`GetChannelModelsMap()` 查询函数 |
| `model/ability_test.go` | 新建 | 测试聚合查询函数 |
| `controller/channel_fetch_models.go` | 新建 | `FetchChannelModels` 接口,用已保存渠道的 Key+BaseURL 请求上游 `/v1/models` |
| `controller/channel_fetch_models_test.go` | 新建 | 测试 JSON 解析和 mock HTTP 请求 |
| `controller/model.go` | 修改 | 移除 `init()` 全局模型列表构建,`ListModels`/`DashboardListModels`/`ListAllModels`/`RetrieveModel` 改为从 ability 表运行时查询 |
| `router/api.go` | 修改 | channelRoute 组新增 `GET /fetch_models/:id` 路由 |

#### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `web/default/src/pages/Channel/EditChannel.js` | 修改 | 移除"填入"按钮和 `fetchModels` 函数,新增"从上游获取"按钮(`fetchUpstreamModels`),保存后可用 |
| `web/default/src/helpers/utils.js` | 修改 | 删除 `channelModels` 变量、`loadChannelModels`、`getChannelModels` 函数 |
| `web/default/src/components/ChannelsTable.js` | 修改 | 移除 `loadChannelModels` import 和调用 |

### 商业功能移除

#### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `controller/redemption.go` | 删除 | 兑换码管理 API |
| `model/redemption.go` | 删除 | 兑换码数据模型 |
| `controller/user.go` | 修改 | 移除 `TopUp`、`AdminTopUp` 函数 |
| `router/api.go` | 修改 | 移除 `/topup` 和 `/redemption` 路由组 |
| `controller/group.go` | 修改 | `GetGroups` 简化为返回 `["default"]` |
| `relay/billing/ratio/group.go` | 修改 | `GetGroupRatio` 返回固定值 1 |
| `relay/billing/ratio/model.go` | 修改 | `GetModelRatio`、`GetCompletionRatio` 返回固定值 1 |
| `model/option.go` | 修改 | 移除商业选项默认值和 updateOptionMap case |
| `controller/misc.go` | 修改 | 移除 `top_up_link` |

#### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `web/default/src/pages/Redemption/` | 删除 | 兑换码页面目录 |
| `web/default/src/pages/TopUp/` | 删除 | 充值页面目录 |
| `web/default/src/components/RedemptionsTable.js` | 删除 | 兑换码表格组件 |
| `web/default/src/App.js` | 修改 | 移除 Redemption/TopUp 路由和 import |
| `web/default/src/components/Header.js` | 修改 | 移除兑换/充值菜单项 |
| `web/default/src/components/OperationSetting.js` | 修改 | 移除额度奖励、倍率配置、充值链接等商业选项 UI |
| `web/default/src/components/TokensTable.js` | 修改 | 移除未使用的 `showTopUpModal` 死代码 |

## 保留的功能

- 计费框架:额度扣减、消费日志、令牌额度限制
- 中继核心:渠道选择、负载均衡、优先级、故障转移、自动禁用
- 适配器层:`GetModelList()` 和 `constants.go` 中的 `ModelList` 保留不动
- 倍率 map 和 JSON 序列化函数:保留(被 `model/option.go` 引用),但 `GetModelRatio`/`GetGroupRatio` 不再读取它们
- `config.DisplayInCurrencyEnabled`、`config.QuotaPerUnit` 等变量:保留(默认值安全,属于计费框架)

## 已知限制

1. **Go 编译验证未执行**:Go 未安装,代码改动已通过静态检查和前端构建验证
2. **berry/air 主题未修改**:仅修改了 default 主题
3. **残留 config 变量**:`QuotaForNewUser`/`QuotaForInviter`/`QuotaForInvitee` 默认值为 0(不赠送),`QuotaRemindThreshold` 默认 1000(低额度提醒),行为正确

## 模型别名功能

> 日期: 2026-07-23(追加)

### 需求

从上游获取模型后,可为每个模型设置别名(留空则用原始名)。别名作为对外暴露的模型名,同名模型走负载均衡。通过别名可区分不同渠道的同一模型(如渠道 A 的 `deepseek-chat` 别名为 `ds-a-chat`,渠道 B 的别名为 `ds-b-chat`)。

### 设计决策

- **复用 ModelMapping**:别名本质是反向的 model_mapping。`models` 字段存别名(或原始名),`model_mapping` 存 `{别名: 原始名}`,后端请求时自动替换。
- **前端独立管理**:新增 `modelAliases` 状态(`[{original, alias}]`),与 `inputs.models`(存原始名)分离,submit 时从 modelAliases 生成最终 models 和 model_mapping。
- **model_mapping 文本框设为只读**:由别名表格自动生成,避免手动编辑与别名数据不一致。

### 改动详情

| 文件 | 操作 | 说明 |
|------|------|------|
| `web/default/src/pages/Channel/EditChannel.js` | 修改 | 新增 `modelAliases` 状态、别名表格 UI、`handleModelsChange`/`updateModelAlias`/`removeModelAlias` 函数;`loadChannel` 反向解析 modelAliases;`submit` 从 modelAliases 生成 models+model_mapping;model_mapping 文本框设为只读 |
| `web/default/src/locales/zh/translation.json` | 修改 | 新增 `model_aliases`/`model_aliases_hint`/`alias_original`/`alias_name`/`alias_actions`/`alias_remove`/`model_mapping_auto` |
| `web/default/src/locales/en/translation.json` | 修改 | 同上英文翻译 |

### 数据流

1. **加载渠道**: `loadChannel` 从 `models`(逗号分隔)+ `model_mapping`(JSON)反向解析 → `modelAliases`(`inputs.models` 存原始名)
2. **从上游获取**: `fetchUpstreamModels` 合并新模型到 `inputs.models`,同步追加空别名条目到 `modelAliases`
3. **下拉框增删**: `handleModelsChange` 同步增删 `modelAliases` 条目
4. **编辑别名**: `updateModelAlias` 更新 `modelAliases[index].alias`,useEffect 自动同步 `model_mapping` 文本框
5. **提交**: `submit` 从 `modelAliases` 生成 `models`(别名||原始名)和 `model_mapping`({别名:原始名},仅 alias!==original)

### 代码审查修复(Oracle 审查后)

| 问题 | 严重度 | 修复 |
|------|--------|------|
| 别名含逗号破坏 models 字段分隔 | P0 | submit 前校验,含逗号则 showError 阻止提交 |
| 别名重复/与其它原始名冲突无校验 | P1 | submit 前用 Set 检测重复对外名,showError 阻止提交 |
| 旧数据 models 含 mapping value 时反向解析重复 | P1 | loadChannel 两遍解析:先处理 mapping key,再跳过已被引用的 value |
| mapping key 不在 models 中静默丢失 | P2 | 检测未消费 key 数量,showInfo 提示用户 |
| 硬编码中文未走 i18n | P2 | 6 条提示信息改用 t() + 新增 i18n key(zh/en) |
| clear 按钮未清 modelOptions | P3 | 显式 setModelOptions([]) |
| fetchUpstreamModels 手动 setModelOptions 冗余 | P3 | 删除,依赖 useEffect 重建 |
| `t() \|\| '兜底'` 死代码 | P3 | 删除兜底 |

## 相关文档

- 设计文档: `docs/superpowers/specs/2026-07-23-one-api-personal-refactor-design.md`
- 实现计划一: `docs/superpowers/plans/2026-07-23-model-management-refactor.md`
- 实现计划二: `docs/superpowers/plans/2026-07-23-commercial-removal.md`
