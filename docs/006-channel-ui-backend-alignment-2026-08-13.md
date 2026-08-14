# 渠道界面与后台对接完整实现方案

> 日期：2026-08-13
> 范围：渠道管理列表页 + 渠道详情页（含 Key 管理、模型管理）
> 目标：确保前端界面操作与后台 API 完全对应，无遗漏或偏差

---

## 一、上次测试数据确认

### 1.1 后台数据状态

后端采用 Go + GORM，**启动时自动建表迁移**（`model.SetupDB()`）。首次运行即自动创建 `channels`、`channel_keys`、`abilities` 等表。

**初始状态**：
- 数据库为空（SQLite 默认 `one-api.db`），无预置渠道数据
- 初始账号 `root / 123456`，需登录获取 JWT Token 后才能调用 `AdminAuth` 保护的 API
- 设计稿中展示的渠道名（"OpenAI 主渠道"）、Key 脱敏值（`sk-...m3Kx`）、模型名（`gpt-4o`、`claude-3-5-sonnet`）均为**示意数据**，实际需先通过 `POST /api/channel/` 创建

### 1.2 数据流闭环

```
用户在设计稿看到的界面
    ↕ (一一对应)
前端 React 组件调用 API
    ↕ (HTTP JSON)
后端 Gin Controller → GORM Model → SQLite/MySQL
```

设计稿中的每个字段都能在 `Channel` / `ChannelKey` 模型中找到对应来源。

---

## 二、后台提供的所有渠道相关 API

### 2.1 完整路由清单（来自 `router/api.go`）

所有渠道 API 均在 `/api/channel` 组下，**统一经过 `middleware.AdminAuth()` 鉴权**（需管理员 Token）。

| # | 方法 | 路由 | Controller 函数 | 用途 |
|---|------|------|----------------|------|
| 1 | GET | `/api/channel/` | `GetAllChannels` | 分页获取渠道列表（`?p=页码`，每页 `config.ItemsPerPage` 条） |
| 2 | GET | `/api/channel/search?keyword=xxx` | `SearchChannels` | 按关键词搜索渠道 |
| 3 | GET | `/api/channel/models` | `ListAllModels` | 获取所有渠道的去重模型列表（返回 OpenAI 格式） |
| 4 | GET | `/api/channel/:id` | `GetChannel` | 获取单个渠道完整信息（含 Key，`selectAll=true`） |
| 5 | GET | `/api/channel/fetch_models/:id` | `FetchChannelModels` | **用已保存渠道的 Key+BaseURL 请求上游 `/v1/models` 拉取模型列表** |
| 6 | POST | `/api/channel/fetch_models` | `FetchChannelModelsByConfig` | **用前端临时配置 `{base_url, key, type}` 拉取上游模型（不依赖已保存渠道，用于新增时预览）** |
| 7 | GET | `/api/channel/test` | `TestChannels` | 测试所有渠道（`?scope=all\|limited`） |
| 8 | GET | `/api/channel/test/:id?model=xxx` | `TestChannel` | **测试单个渠道，可选指定模型** |
| 9 | GET | `/api/channel/update_balance/:id` | `UpdateChannelBalance` | 更新渠道余额（查询上游计费接口） |
| 10 | POST | `/api/channel/` | `AddChannel` | 新增渠道（支持多 Key 模式） |
| 11 | PUT | `/api/channel/` | `UpdateChannel` | 更新渠道（含 Key 增量 diff 更新） |
| 12 | DELETE | `/api/channel/disabled` | `DeleteDisabledChannel` | 删除所有已禁用渠道 |
| 13 | DELETE | `/api/channel/:id` | `DeleteChannel` | 删除单个渠道（级联删除 channel_keys） |
| 14 | POST | `/api/channel/:id/key/:keyId/enable` | `EnableChannelKey` | **手动启用某个 Key（重置冷却/禁用/熔断状态）** |
| 15 | GET | `/api/channel/:id/keys/status` | `GetChannelKeysStatus` | **查询某渠道所有 Key 的状态摘要** |

### 2.2 附加相关 API

| 方法 | 路由 | 用途 |
|------|------|------|
| GET | `/api/user/accessible_channels` | 普通用户获取启用渠道精简列表（id+name，无敏感字段，用于令牌编辑页选渠道子集） |
| GET | `/api/models` | 仪表盘模型列表（`DashboardListModels`，返回 channelId→models 映射） |
| GET | `/api/dashboard/overview` | 总览仪表盘数据（渠道数、请求量等） |

---

## 三、从上游获取模型名称的机制

### 3.1 两个拉取接口

后端**已实现**从上游 `/v1/models` 拉取模型列表的能力，提供两种方式：

**方式一：`GET /api/channel/fetch_models/:id`**（用于已保存渠道）
- 用渠道已保存的 `Key` + `BaseURL` 请求上游
- 如果 `BaseURL` 未设置，从渠道类型默认 URL（`channeltype.ChannelBaseURLs[type]`）取值
- 自动处理 BaseURL 已含 `/v1` 的情况（拼接 `/models` 而非 `/v1/models`）
- 返回：`{success: true, data: ["gpt-4o", "gpt-4o-mini", ...]}`

**方式二：`POST /api/channel/fetch_models`**（用于新增渠道预览）
- 请求体：`{base_url: "https://api.openai.com", key: "sk-xxx", type: 1}`
- 不依赖已保存渠道，用前端临时输入的配置拉取
- 同样支持从渠道类型默认 URL 取值
- 返回格式相同

### 3.2 底层实现（`controller/channel_fetch_models.go`）

```go
// 请求上游 /v1/models
fetchModelsFromUpstream(url, key string) ([]string, error)
// → GET 请求，Header: Authorization: Bearer {key}
// → 解析 {data: [{id: "model-name"}, ...]} 格式
// → 返回模型 ID 字符串数组
```

### 3.3 前端对接方案

| 界面场景 | 调用接口 | 说明 |
|---------|---------|------|
| 新增渠道表单中"拉取模型"按钮 | `POST /api/channel/fetch_models` | 用户填入 BaseURL+Key 后，先拉取上游模型列表，勾选后填入 Models 字段 |
| 渠道详情页"同步上游模型"按钮 | `GET /api/channel/fetch_models/:id` | 用已保存渠道配置拉取，展示上游最新模型，对比当前 Models 差异 |

---

## 四、别名（ModelMapping）的修改方式与存储逻辑

### 4.1 数据模型

```go
// model/channel.go
type Channel struct {
    ...
    Models       string  `json:"models" gorm:"type:text"`        // 逗号分隔的模型列表，如 "gpt-4o,claude-3-5-sonnet"
    ModelMapping *string `json:"model_mapping" gorm:"type:json"` // JSON 格式的别名映射，如 {"gpt-4":"gpt-4-turbo-preview"}
    ...
}
```

### 4.2 存储格式

`ModelMapping` 字段存储 JSON 字符串：
```json
{
  "gpt-4": "gpt-4-turbo-preview",
  "gpt-3.5-turbo": "gpt-3.5-turbo-0125"
}
```

- Key = 用户请求时使用的模型名（对外暴露名）
- Value = 实际请求上游时使用的模型名（上游真实名）
- 为空或 `{}` 时视为无映射

### 4.3 解析方法

```go
func (channel *Channel) GetModelMapping() map[string]string {
    // 解析 ModelMapping JSON → map[string]string
    // 空值/无效 JSON 返回 nil
}
```

### 4.4 中继时的应用逻辑（`controller/channel-test.go:90-100`）

```go
modelName := request.Model           // 用户请求的模型名
modelMap := channel.GetModelMapping() // 获取别名映射
if modelName == "" || !strings.Contains(channel.Models, modelName) {
    // 回退到渠道第一个模型
    modelName = strings.Split(channel.Models, ",")[0]
}
if modelMap != nil && modelMap[modelName] != "" {
    modelName = modelMap[modelName]   // 应用别名映射
}
// 用 modelName 请求上游
```

### 4.5 修改方式

**通过 `PUT /api/channel/` 更新**。请求体中包含 `model_mapping` 字段即可：

```json
{
  "id": 1,
  "name": "OpenAI 主渠道",
  "models": "gpt-4o,gpt-4o-mini",
  "model_mapping": "{\"gpt-4\":\"gpt-4-turbo-preview\"}",
  ...
}
```

后端 `channel.Update()` → `DB.Model(channel).Updates(channel)` 会覆盖更新 `model_mapping` 字段，然后调用 `channel.UpdateAbilities()` 同步 ability 表。

### 4.6 前端对接方案

渠道详情页"模型列表"区域，每个模型行支持：
- 显示当前模型名（`Models` 字段拆分）
- 显示别名映射（从 `ModelMapping` JSON 解析）
- 点击"编辑别名"→ 弹出输入框 → 修改后调用 `PUT /api/channel/` 提交完整 `model_mapping` JSON

---

## 五、手动添加模型的流程与字段

### 5.1 模型列表的存储

模型列表存储在 `Channel.Models` 字段，**逗号分隔的字符串**：
```
"gpt-4o,gpt-4o-mini,claude-3-5-sonnet,dall-e-3"
```

### 5.2 手动添加流程

**无独立的"添加模型"API**，模型增删统一通过 `PUT /api/channel/` 更新 `models` 字段完成：

1. 前端获取当前 `models` 字符串 → 拆分为数组
2. 用户输入新模型名 → 追加到数组
3. 数组 join 为逗号字符串 → 随 `PUT /api/channel/` 提交
4. 后端 `channel.Update()` → `UpdateAbilities()` 自动同步 `ability` 表（渠道↔模型映射）

### 5.3 从上游拉取后添加

推荐流程（结合第三节）：
1. 调用 `GET /api/channel/fetch_models/:id` 拉取上游模型列表
2. 前端展示上游模型 vs 当前模型的差异（新增的打勾、已移除的标灰）
3. 用户勾选要添加的模型 → 合并到 `models` 数组
4. 调用 `PUT /api/channel/` 提交更新

### 5.4 模型相关字段

| 字段 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `models` | Channel | string（逗号分隔） | 渠道支持的模型列表 |
| `model_mapping` | Channel | *string（JSON） | 模型别名映射 |
| `ability` 表 | 独立表 | — | 渠道↔模型↔分组 的多对多映射，由 `UpdateAbilities()` 自动维护 |

---

## 六、Key 管理的完整对接

### 6.1 Key 数据模型（`model/channel_key.go`）

```go
type ChannelKey struct {
    Id               int64  // 主键
    ChannelId        int    // 所属渠道
    KeyValue         string // API Key 明文
    Remark           string // 备注
    Status           int    // 1=启用 2=禁用 3=冷却中 4=配额耗尽
    Priority         int    // 优先级（数字越大越优先）
    DailyQuotaLimit  int64  // 日配额上限
    DailyUsedQuota   int64  // 今日已用配额
    QuotaResetAt     int64  // 配额重置时间戳
    QuotaResetRule   string // 配额重置规则
    CooledUntil      int64  // 冷却截止时间戳
    ConsecutiveErrors int   // 连续错误数
    LastErrorTime    int64  // 最后错误时间
    LastErrorCode    int    // 最后错误码
    AvgTokensPerReq  int    // 平均每请求 Token 数
    TotalUsedQuota   int64  // 历史总用量
    TotalRequests    int64  // 历史总请求数
    CreatedTime      int64
    UpdatedTime      int64
}
```

### 6.2 Key 的增删改（通过 `PUT /api/channel/`）

**没有独立的 Key 增删 API**。Key 管理集成在 `UpdateChannel` 中，通过 **diff 机制**实现：

请求体格式：
```json
{
  "id": 1,
  "name": "OpenAI 主渠道",
  "multi_key_mode": 1,
  "models": "gpt-4o",
  "keys": [
    {"key_value": "sk-aaa", "remark": "主Key", "priority": 10, "daily_quota_limit": 500000, "quota_reset_rule": "daily"},
    {"key_value": "sk-bbb", "remark": "备用Key", "priority": 5, "daily_quota_limit": 200000, "quota_reset_rule": "daily"}
  ]
}
```

后端 diff 逻辑（`controller/channel.go:227-302`）：

| 情况 | 后端行为 |
|------|---------|
| Key 已存在（按 `key_value` 匹配） | 更新 `Remark`/`Priority`/`DailyQuotaLimit`/`QuotaResetRule`，**保留运行时字段**（DailyUsedQuota/CooledUntil/TotalUsedQuota/TotalRequests），Status 重置为 Enabled |
| Key 是新增的 | 批量插入，Status=Enabled |
| 原有 Key 前端不再传 | **软删除**（Status=Disabled），保留历史统计 |

### 6.3 Key 状态管理 API

| 操作 | API | 说明 |
|------|-----|------|
| 手动启用 Key（解除冷却/禁用/熔断） | `POST /api/channel/:id/key/:keyId/enable` | 重置 Status=Enabled、CooledUntil=0，重置熔断器，清缓存 |
| 查询 Key 状态摘要 | `GET /api/channel/:id/keys/status` | 返回所有启用状态的 Key（含运行时字段） |

### 6.4 Key 状态自动转换（后台扫描器，无需前端干预）

| 扫描器 | 周期 | 逻辑 |
|--------|------|------|
| `StartQuotaResetScanner` | 30s | 检查 `QuotaResetAt` 到期的 Key，重置 `DailyUsedQuota=0`，Status→Enabled |
| `StartCooldownScanner` | 10s | 检查 `CooledUntil` 到期的 Key，Status→Enabled |

### 6.5 前端对接方案

| 界面操作 | 调用 API | 请求参数 |
|---------|---------|---------|
| 新增 Key | `PUT /api/channel/` | keys 数组中添加新 key_item |
| 编辑 Key 备注/优先级/配额 | `PUT /api/channel/` | keys 数组中对应 key_item 更新字段 |
| 删除 Key | `PUT /api/channel/` | keys 数组中移除该 key_item（后端自动软删除） |
| 手动启用（解除冷却/禁用） | `POST /api/channel/:id/key/:keyId/enable` | 路径参数 |
| 查看实时状态 | `GET /api/channel/:id/keys/status` | 路径参数 |

---

## 七、界面操作与后台 API 完整映射表

### 7.1 渠道管理列表页

| # | 界面元素/操作 | 后台 API | 请求参数 | 响应字段映射 |
|---|-------------|---------|---------|------------|
| 1 | 渠道列表加载 | `GET /api/channel/?p=0` | `p`=页码（从0开始） | `data[].id, name, type, status, models, response_time, test_time, priority, multi_key_mode` |
| 2 | 搜索渠道 | `GET /api/channel/search?keyword=xxx` | `keyword`=关键词 | 同上 |
| 3 | 点击某渠道进入详情 | `GET /api/channel/:id` | 路径参数 | 完整 Channel 对象（含 Key） |
| 4 | 新增渠道按钮 | → 跳转新增表单 | — | — |
| 5 | 删除渠道 | `DELETE /api/channel/:id` | 路径参数 | `{success: true}` |
| 6 | 删除所有已禁用渠道 | `DELETE /api/channel/disabled` | 无 | `{success: true, data: rows}` |
| 7 | 测试单个渠道（默认模型） | `GET /api/channel/test/:id` | 路径参数 | `{success, message, time, modelName}` |
| 8 | 测试所有渠道 | `GET /api/channel/test?scope=all` | `scope`=all/limited | `{success: true}`（异步执行） |
| 9 | 更新渠道余额 | `GET /api/channel/update_balance/:id` | 路径参数 | `{success, balance}` |
| 10 | 分页控件 | `GET /api/channel/?p=N` | `p`=页码 | — |

### 7.2 渠道详情页 - 渠道信息卡片

| # | 界面元素 | 数据来源 | 修改 API |
|---|---------|---------|---------|
| 1 | 渠道名称 | `channel.name` | `PUT /api/channel/` |
| 2 | 渠道类型 | `channel.type`（前端映射为供应商名称） | `PUT /api/channel/` |
| 3 | 状态（启用/手动禁用/自动禁用） | `channel.status`（1/2/3） | `PUT /api/channel/`（改 status 字段） |
| 4 | Base URL | `channel.base_url` | `PUT /api/channel/` |
| 5 | 优先级 | `channel.priority` | `PUT /api/channel/` |
| 6 | MultiKey 模式 | `channel.multi_key_mode`（0/1/2/3/4） | `PUT /api/channel/` |
| 7 | 响应时间 | `channel.response_time` | 自动更新（测试时） |
| 8 | 最后测试时间 | `channel.test_time` | 自动更新（测试时） |
| 9 | 测试按钮 | — | `GET /api/channel/test/:id?model=xxx` |
| 10 | 同步上游模型按钮 | — | `GET /api/channel/fetch_models/:id` |
| 11 | 编辑按钮 | → 跳转编辑表单 | — |
| 12 | 删除按钮 | — | `DELETE /api/channel/:id` |

### 7.3 渠道详情页 - Key 管理区

| # | 界面元素/操作 | 数据来源 / API | 说明 |
|---|-------------|---------------|------|
| 1 | Key 列表加载 | `GET /api/channel/:id` → `channel.keys`（或 `GET /api/channel/:id/keys/status`） | 详情接口返回完整渠道但不含 keys 数组；需调 keys/status |
| 2 | Key 脱敏显示 | `channel_key.key_value`（前端脱敏：显示前4+后4） | — |
| 3 | Key 备注 | `channel_key.remark` | — |
| 4 | Key 状态圆点 | `channel_key.status`（1青/3琥珀/4红/2灰） | — |
| 5 | Key 优先级 | `channel_key.priority` | — |
| 6 | 今日用量/配额 | `channel_key.daily_used_quota` / `channel_key.daily_quota_limit` | — |
| 7 | 总请求数 | `channel_key.total_requests` | — |
| 8 | 新增 Key | `PUT /api/channel/`（keys 数组追加） | 需提交完整渠道+keys |
| 9 | 编辑 Key | `PUT /api/channel/`（keys 数组中对应项更新） | — |
| 10 | 删除 Key | `PUT /api/channel/`（keys 数组中移除） | 后端软删除，保留统计 |
| 11 | 手动启用 Key | `POST /api/channel/:id/key/:keyId/enable` | 解除冷却/禁用/熔断 |
| 12 | 刷新状态 | `GET /api/channel/:id/keys/status` | 获取最新运行时数据 |

### 7.4 渠道详情页 - 模型列表区

| # | 界面元素/操作 | 数据来源 / API | 说明 |
|---|-------------|---------------|------|
| 1 | 模型列表加载 | `GET /api/channel/:id` → `channel.models`（逗号分隔，前端 split） | — |
| 2 | 别名映射显示 | `channel.model_mapping`（JSON，前端解析为 map） | 显示为 "模型名 → 别名" |
| 3 | 添加模型 | `PUT /api/channel/`（models 字段追加） | 前端维护逗号分隔字符串 |
| 4 | 删除模型 | `PUT /api/channel/`（models 字段移除） | — |
| 5 | 编辑别名 | `PUT /api/channel/`（model_mapping JSON 更新） | 前端维护 JSON 对象 |
| 6 | 从上游同步 | `GET /api/channel/fetch_models/:id` → 对比差异 → `PUT /api/channel/` | 两步操作 |
| 7 | 测试单个模型 | `GET /api/channel/test/:id?model=模型名` | model 参数指定测试模型 |
| 8 | "已测试/未测试"标记 | `channel.test_time`（>0 为已测试） | 前端判断 |

---

## 八、数据对应核实

### 8.1 设计稿字段 vs 后端模型字段

| 设计稿显示 | 后端字段 | 类型 | 对应关系 |
|-----------|---------|------|---------|
| 渠道名称 | `Channel.name` | string | ✅ 直接对应 |
| 渠道类型名 | `Channel.type` → channeltype 映射 | int | ✅ 前端用 type 值映射为显示名 |
| 状态标签 | `Channel.status` | int (1/2/3) | ✅ 1=启用(青)/2=手动禁用(红)/3=自动禁用(灰) |
| Base URL | `Channel.base_url` | *string | ✅ 直接对应 |
| 响应时间 | `Channel.response_time` | int64 (ms) | ✅ 直接对应 |
| 优先级 | `Channel.priority` | *int64 | ✅ 直接对应 |
| MultiKey 模式 | `Channel.multi_key_mode` | int (0-4) | ✅ 0=关闭/1=优先级/2=前缀分片/3=轮询/4=LUR |
| Key 脱敏值 | `ChannelKey.key_value` | string | ✅ 前端脱敏显示 |
| Key 备注 | `ChannelKey.remark` | string | ✅ 直接对应 |
| Key 状态圆点 | `ChannelKey.status` | int (1-4) | ✅ 1=启用(青)/2=禁用(灰)/3=冷却中(琥珀)/4=配额耗尽(红) |
| Key 优先级 | `ChannelKey.priority` | int | ✅ 直接对应 |
| 今日用量 | `ChannelKey.daily_used_quota` | int64 | ✅ 直接对应 |
| 日配额 | `ChannelKey.daily_quota_limit` | int64 | ✅ 直接对应 |
| 总请求数 | `ChannelKey.total_requests` | int64 | ✅ 直接对应 |
| 模型名 | `Channel.models` split(",") | string | ✅ 前端拆分显示 |
| 模型别名 | `Channel.model_mapping` JSON parse | *string | ✅ 前端解析为 map 显示 |
| 已测试标记 | `Channel.test_time > 0` | int64 | ✅ 前端判断 |

### 8.2 无遗漏确认

**界面上的每个可操作元素都有对应的后台 API**：

- ✅ 列表查看 → `GET /api/channel/`
- ✅ 搜索 → `GET /api/channel/search`
- ✅ 详情查看 → `GET /api/channel/:id`
- ✅ 新增 → `POST /api/channel/`
- ✅ 编辑 → `PUT /api/channel/`
- ✅ 删除 → `DELETE /api/channel/:id`
- ✅ 删除已禁用 → `DELETE /api/channel/disabled`
- ✅ 测试单个（指定模型）→ `GET /api/channel/test/:id?model=xxx`
- ✅ 测试全部 → `GET /api/channel/test`
- ✅ 更新余额 → `GET /api/channel/update_balance/:id`
- ✅ 拉取上游模型（已保存）→ `GET /api/channel/fetch_models/:id`
- ✅ 拉取上游模型（临时配置）→ `POST /api/channel/fetch_models`
- ✅ Key 启用 → `POST /api/channel/:id/key/:keyId/enable`
- ✅ Key 状态查询 → `GET /api/channel/:id/keys/status`
- ✅ 所有模型列表 → `GET /api/channel/models`

**无偏差确认**：
- ✅ Key 增删改统一走 `PUT /api/channel/`，与后端 diff 逻辑一致
- ✅ 模型增删改统一走 `PUT /api/channel/`，修改 `models` 字段
- ✅ 别名修改统一走 `PUT /api/channel/`，修改 `model_mapping` 字段
- ✅ 测试模型通过 `?model=` 参数指定，与后端 `c.Query("model")` 一致

---

## 九、前端实现要点

### 9.1 Key 管理的提交策略

**重要**：Key 的增删改不是独立 API，而是通过 `PUT /api/channel/` 的 `keys` 数组做 diff。前端需要：

1. 维护完整的 keys 数组状态（包含未修改的 Key）
2. 提交时发送**完整的渠道对象 + 完整的 keys 数组**
3. 删除 Key = 从 keys 数组中移除该 item（后端检测到原有 key 不在新数组中 → 软删除）
4. 新增 Key = 在 keys 数组中添加新 item
5. 编辑 Key = 在 keys 数组中更新对应 item 的字段

### 9.2 模型管理的提交策略

同理，模型增删通过修改 `models` 字符串字段：
1. 前端维护模型数组 `["gpt-4o", "claude-3-5-sonnet", ...]`
2. 提交时 `join(",")` 为字符串
3. 别名映射维护为 JS 对象 `{gpt-4: "gpt-4-turbo"}`，提交时 `JSON.stringify`

### 9.3 测试模型的交互

`GET /api/channel/test/:id?model=gpt-4o` 返回：
```json
{
  "success": true,
  "message": "响应内容",
  "time": 1.23,
  "modelName": "gpt-4o"
}
```
- `time` 单位为秒（后端 `float64(milliseconds) / 1000.0`）
- 测试成功后后端自动更新 `channel.response_time` 和 `channel.test_time`
- 前端可在测试后刷新渠道详情或直接更新本地状态

### 9.4 上游模型同步的交互流程

```
1. 用户点击"同步上游模型"
2. 前端调用 GET /api/channel/fetch_models/:id
3. 展示对比视图：
   - 上游有、当前无 → 可添加（绿色+勾选框）
   - 上游无、当前有 → 可移除（红色+勾选框）
   - 两边都有 → 保持（灰色）
4. 用户勾选后点击"应用变更"
5. 前端合并 models 数组 → 调用 PUT /api/channel/
6. 刷新模型列表
```

---

## 十、总结

| 需求项 | 结论 |
|--------|------|
| ① 上次测试时后台是否已存在数据 | 后端自动建表，首次运行为空，需先通过 API 创建渠道 |
| ② 从上游获取模型名称的机制 | ✅ 已实现，`GET /api/channel/fetch_models/:id`（已保存）+ `POST /api/channel/fetch_models`（临时配置） |
| ③ 别名修改的方式与存储逻辑 | `Channel.model_mapping` 字段，JSON 格式，通过 `PUT /api/channel/` 修改 |
| ④ 手动添加模型的流程 | 修改 `Channel.models` 逗号分隔字符串，通过 `PUT /api/channel/` 提交 |
| ⑤ 功能与后台数据一一对应 | ✅ 已逐字段核实（见第八节） |
| ⑥ 后台所有相关 API | ✅ 15 个渠道 API + 3 个附加 API（见第二节） |
| ⑦ 界面操作与 API 完全对应 | ✅ 无遗漏无偏差（见第七节映射表） |
