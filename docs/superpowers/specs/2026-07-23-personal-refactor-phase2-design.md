# One API 个人化改造第二阶段设计文档

> 日期: 2026-07-23
> 阶段: 第二阶段（UI/UX 改造 + 功能精简 + 统计仪表盘）
> 前置: 第一阶段已完成（模型管理改造、商业功能移除、模型别名功能，提交 `167fd90`）

## 背景

第一阶段完成了模型管理改造和商业功能移除。第二阶段聚焦 UI/UX 改造、功能精简和统计增强，共 7 个子项目（按推荐实施顺序）：

| 编号 | 子项目 | 复杂度 | 说明 |
|------|--------|--------|------|
| B | 令牌默认无限额度 | 低 | EditToken.js 一行改动 |
| A | 渠道编辑页改造 | 中 | fetch URL、移除 model_mapping 只读框/system_prompt、密钥框位置 |
| D | 移除第三方登录 | 中高 | 删 7 文件改 12 文件（含 OIDC） |
| E | 设置页合并精简 | 中高 | 4 Tab→2 Tab，合并运营/其他设置 |
| F | 品牌文案更新 | 低 | 仓库链接、首页状态、i18n 文案 |
| G | 硬编码模型精简 + 简化计费 | 中 | 清空适配器模型列表、删计费比率表、精简前端 |
| C | 总览统计分析仪表盘 | 高 | 新增管理员全局总览 |

## 子项目 B：令牌默认无限额度

### 需求

新建令牌时默认勾选"无限额度"，避免每次手动设置。

### 改动

| 文件 | 改动 |
|------|------|
| `web/default/src/pages/Token/EditToken.js` 第 32 行 | `unlimited_quota: false` → `unlimited_quota: true` |

编辑已有令牌时 `loadToken` 会覆盖默认值，不受影响。

---

## 子项目 A：渠道编辑页改造

### 需求

1. fetch_models 的 URL 从 `baseURL+/v1/models` 改为 `baseURL+/models`（BaseURL 已含 `/v1`）
2. 新增 `POST /api/channel/fetch_models` 接口，接受 `{base_url, key, type}`，支持新建渠道未保存时 fetch
3. 移除 model_mapping 只读文本框（由别名表格自动生成，无需展示）
4. 移除 system_prompt 字段
5. 密钥框移到 BaseURL 下方、模型选择上方

### 改动

#### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `controller/channel_fetch_models.go` | 修改 | A1: `FetchChannelModels` 中 URL 拼接改为 `baseURL+/models`（去掉 `/v1` 前缀）；A2: 新增 `FetchChannelModelsByConfig` 函数，接受 `{base_url, key, type}` POST body，不依赖已保存渠道 |
| `router/api.go` | 修改 | channelRoute 组新增 `POST /fetch_models` 路由 |

#### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `web/default/src/pages/Channel/EditChannel.js` | 修改 | A1: fetch URL 改用 `/models`；A2: 新建渠道时用 POST `/api/channel/fetch_models` 传 `{base_url, key, type}`，已保存渠道保持用 GET `/fetch_models/:id`；A3: 移除 model_mapping 只读文本框及相关状态；A4: 移除 system_prompt 输入框及状态；A5: 调整表单字段顺序：名称→类型→BaseURL→密钥→模型→别名→优先级→权重 |
| `web/default/src/locales/*/translation.json` | 修改 | 移除 model_mapping、system_prompt 相关 i18n key |

---

## 子项目 D：移除第三方登录（含 OIDC）

### 需求

移除 GitHub OAuth、飞书登录、微信登录、OIDC、Turnstile 人机验证。保留邮箱注册 + SMTP 验证 + 密码登录。

### 改动

#### 删除文件（7 个）

| 文件 | 说明 |
|------|------|
| `controller/auth/github.go` | GitHub OAuth 后端 |
| `controller/auth/lark.go` | 飞书登录后端 |
| `controller/auth/wechat.go` | 微信登录后端 |
| `controller/auth/oidc.go` | OIDC 登录后端 |
| `middleware/turnstile-check.go` | Turnstile 人机验证中间件 |
| `web/default/src/components/GitHubOAuth.js` | GitHub OAuth 前端组件 |
| `web/default/src/components/LarkOAuth.js` | 飞书登录前端组件 |

#### 修改文件（12 个）

| 文件 | 改动 |
|------|------|
| `router/api.go` | 移除 OAuth 回调路由、Turnstile 路由 |
| `controller/auth/auth.go` | 移除 OAuth state 生成/验证函数 |
| `controller/user.go` | 移除 `BindByOAuth` 等第三方绑定函数 |
| `controller/misc.go` | `GetStatus` 移除 `github_oauth`/`wechat_login`/`turnstile_check`/`lark_client_id`/`oidc_*` 字段 |
| `middleware/auth.go` | 移除 Turnstile 校验调用 |
| `model/user.go` | `User` 结构体移除 `GitHubId`/`WeChatId`/`LarkId`/`OidcId` 字段（保留数据库列，仅移除 Go 结构体字段——注意：GORM AutoMigrate 不会删列，需评估风险） |
| `model/option.go` | 移除第三方登录相关选项默认值 |
| `web/default/src/pages/Login/index.js` | 移除 GitHubOAuth/LarkOAuth 组件引用、Turnstile 组件 |
| `web/default/src/pages/Register/index.js` | 移除 Turnstile 组件、第三方注册入口 |
| `web/default/src/components/OtherSetting.js` | 移除第三方登录配置 UI（注：子项目 E 会合并此文件） |
| `web/default/src/components/utils.js` | 移除 `getOAuthState`/`getGitHubClientId`/`getLarkClientId` 等函数 |
| `web/default/src/pages/Home/index.js` | 移除 GitHub OAuth/WeChat/Turnstile 状态显示（与子项目 F 协同） |

#### 风险

- `User` 结构体移除字段后，GORM AutoMigrate 不会删除数据库列，旧数据保留但不再读写。如果后续有代码引用这些字段会编译失败，需全局搜索确认无残留引用。
- `model/user.go` 中 `setupLogin` 等函数可能引用 `GitHubId` 等字段，需同步清理。

---

## 子项目 E：设置页合并精简

### 需求

设置页从 4 Tab（个人设置/运营设置/其他设置/系统设置）精简为 2 Tab（个人设置/系统设置）。系统设置内分区块。移除"检查更新"功能。

### 改动

#### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `web/default/src/pages/Setting/index.js` | 修改 | 4 Tab→2 Tab：个人设置 + 系统设置 |
| `web/default/src/components/OperationSetting.js` | 删除 | 内容合并入新 SystemSetting.js |
| `web/default/src/components/OtherSetting.js` | 删除 | 内容合并入新 SystemSetting.js |
| `web/default/src/components/SystemSetting.js` | 新建/重写 | 合并运营设置+其他设置+原系统设置，分 7 区块：通用/登录注册/邮件/运营/渠道监控/日志/内容 |
| `web/default/src/locales/*/translation.json` | 修改 | 调整设置页相关 i18n key |

#### 系统设置 7 区块内容

1. **通用**：系统名称、Logo、服务器地址、页脚
2. **登录注册**：邮箱验证开关、注册开关（移除第三方登录配置——与子项目 D 协同）
3. **邮件**：SMTP 服务器、端口、账号、密码、发件人
4. **运营**：预扣额度、重试次数、Token 估算、令牌额度显示（移除商业选项——第一阶段已完成）
5. **渠道监控**：自动禁用/启用渠道、渠道禁用阈值
6. **日志**：消费日志开关、日志清理
7. **内容**：首页内容、关于内容（移除"检查更新"）

---

## 子项目 F：品牌文案更新

### 需求

将所有指向原仓库 `songquanpeng/one-api` 的链接和文案更新为 `XduDSJ/one-api-lite`。

### 改动

| 文件 | 改动 |
|------|------|
| `common/config/config.go` 第 15 行 | `SystemName = "One API"` → `"One API Lite"` |
| `web/default/src/pages/About/index.js` 第 43-44 行 | 仓库链接改为 `https://github.com/XduDSJ/one-api-lite` |
| `web/default/src/pages/Home/index.js` 第 136 行 | 源码链接改为 `https://github.com/XduDSJ/one-api-lite` |
| `web/default/src/pages/Home/index.js` 第 207-271 行 | 删除 GitHub OAuth/WeChat/Turnstile 状态显示（与子项目 D 协同） |
| `web/default/src/locales/*/translation.json` | 更新 `about.*`、`home.welcome.*`、`home.system_status.*` 文案；删除 `github_oauth`/`wechat_login`/`turnstile` 相关 key |

---

## 子项目 G：硬编码模型精简 + 简化计费

### 需求

1. 简化计费：删除计费比率表，倍率固定为 1（第一阶段已部分完成，此处彻底清理）
2. 清空适配器 constants.go 中的模型列表（保留空数组，不影响适配器核心功能）
3. 精简前端示例和翻译中的硬编码模型名

### 改动

#### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `relay/billing/ratio/model.go` | 修改 | 删除 `modelRatio`/`completionRatio` map（622 行硬编码定价表），`GetModelRatio`/`GetCompletionRatio` 返回固定 1.0 |
| `relay/billing/ratio/image.go` | 修改 | 图片倍率同理返回固定值 |
| `relay/adaptor/*/constants.go`（32 个适配器） | 修改 | 清空 `ModelList` 为空数组 `var ModelList = []string{}`，保留变量定义避免编译错误 |
| `controller/channel-test.go` 第 39 行 | 修改 | 渠道测试默认模型从 `gpt-3.5-turbo` 改为取渠道第一个模型 |

#### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `web/default/src/pages/Channel/EditChannel.js` 第 9-12 行 | 修改 | `MODEL_MAPPING_EXAMPLE` 改为通用占位符示例 |
| `web/default/src/locales/*/translation.json` | 修改 | 翻译文件中模型名说明文本改为通用描述 |

#### 不动的部分

- **适配器核心**（`adaptor.go`、`relay.go` 等）：请求/响应格式转换逻辑保留
- **token 编码器映射**（`relay/adaptor/openai/token.go`）：根据模型名选择 tokenizer，删了会导致 token 统计不准
- **适配器内部逻辑**（如 anthropic 根据模型名判断上下文长度）：运行时需要

---

## 子项目 C：总览统计分析仪表盘

### 需求

管理员看到全局总览（汇总卡片 + 趋势图 + 模型/渠道分布），普通用户保持现有个人统计。

### 改动

#### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `model/log.go` | 修改 | 新增 `SearchLogsByDayAll(start, end)` — 全局每日统计（去掉 userId 过滤）；新增 `SearchLogsByModelAll(start, end)` — 按模型聚合；新增 `SearchLogsByChannelAll(start, end)` — 按渠道聚合 |
| `model/user.go` | 修改 | 新增 `GetUserCount()` — 用户总数 |
| `model/channel.go` | 修改 | 新增 `GetChannelCount(status)` — 渠道计数（按状态） |
| `model/token.go` | 修改 | 新增 `GetTokenCount()` — 令牌总数 |
| `controller/dashboard.go` | 新建 | `GetOverviewDashboard` — 返回汇总卡片 + 趋势 + 模型/渠道分布 |
| `router/api.go` | 修改 | 新增 `GET /api/dashboard/overview`（AdminAuth） |

#### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `web/default/src/pages/Dashboard/index.js` | 修改 | 管理员视图：新增顶部 6 汇总卡片（总请求/总 token/总用户/渠道数/令牌数）+ 2 折线图（全局每日请求/token）+ 2 柱状图（模型分布 top10/渠道分布 top10）；普通用户视图保持现有 |
| `web/default/src/locales/*/translation.json` | 修改 | 新增 dashboard.overview.* 相关 i18n key |

#### API 响应结构

```json
{
  "success": true,
  "data": {
    "summary": {
      "total_requests": 12345,
      "total_tokens": 67890,
      "total_users": 5,
      "total_channels": 3,
      "enabled_channels": 2,
      "total_tokens_count": 8
    },
    "daily_trend": [
      {"day": "2026-07-17", "requests": 100, "tokens": 5000},
      ...
    ],
    "model_distribution": [
      {"model_name": "gpt-4o", "requests": 500, "tokens": 20000},
      ...
    ],
    "channel_distribution": [
      {"channel_id": 1, "channel_name": "OpenAI", "requests": 300, "tokens": 15000},
      ...
    ]
  }
}
```

---

## 实施顺序与依赖

```
B（独立）──────────────────────────────┐
A（独立）──────────────────────────────┤
D（独立）──────────────────────────────┤
E（依赖 D：移除第三方登录配置 UI）──────┤
F（依赖 D：删除首页 OAuth 状态显示）────┤
G（独立）──────────────────────────────┤
C（独立）──────────────────────────────┘
```

- B、A、G、C 完全独立，可并行
- D 是 E 和 F 的前置（E 需移除第三方登录配置 UI，F 需删除首页 OAuth 状态显示）
- 建议实施顺序：B → A → D → E → F → G → C

## 已知限制

1. **仅修改 default 主题**：berry/air 主题不在本次改造范围
2. **User 结构体字段移除风险**：子项目 D 移除 `GitHubId` 等字段后需全局搜索确认无残留引用，GORM AutoMigrate 不会删列
3. **适配器 constants.go 清空后**：`GetModelList()` 返回空数组，不影响中继（模型列表已从 ability 表获取），但如有代码依赖适配器 ModelList 做模型校验需确认
4. **简化计费后**：quota = token 数 × 1，额度图表和 token 图表数值一致，Dashboard 中可考虑合并或保留两者
