# 多 Key 聚合与故障转移 设计文档

- **编号**：004
- **日期**：2026-08-07
- **状态**：已确认设计，待实现
- **作者**：架构方案（@oracle 评估）+ 用户决策

## 一、背景与目标

### 1.1 问题陈述

用户有多个上游 API key，每个 key 每天限量 50M token，0 点重置。希望：

1. 自动利用所有 key 的配额，不需手动切换
2. 重置时间可手动设置，冷却时长可手动设置
3. 多个渠道有相同模型时，处理「某渠道不可用」「某 key 配额上限」等组合失效
4. 同渠道多 key 聚合与故障转移
5. 不同渠道同模型聚合与故障转移
6. 合理的管理界面

### 1.2 现状（one-api）

- `Channel.Key` 是单 string 字段（`model/channel.go:23`），DB 层一个渠道一个 key
- 添加渠道时前端 textarea 支持「一行一个」填多个 key，后端按 `\n` 拆分**批量插入成 N 条独立渠道记录**（`controller/channel.go:88`）
- 运行时重试是**渠道级**（`controller/relay.go:72-93`），`CacheGetRandomSatisfiedChannel` 随机抽另一个渠道
- 渠道禁用 `ChannelStatusAutoDisabled=3` 是**永久的**，需手动启用或跑渠道测试恢复
- ability 表维护「渠道↔模型」映射，复合主键 (Group, Model, ChannelId)

### 1.3 参考项目调研

| 项目 | key 存储 | 调度 | 故障粒度 | 自动恢复 |
|------|---------|------|----------|----------|
| new-api | 单字段 `\n` 分隔 + JSON 元信息 | 随机/轮询 | 单 key（index） | 无（永久禁用） |
| lens | 凭证独立维度 list | SWRR 健康分加权 / FAILOVER | 分级：认证错冷却 key，服务错冷却模型 | 指数退避，无需半开 |
| octopus | 独立关联表 ChannelKey | 最低 TotalCost 优先 + 429 冷却5min | channel+key+model 三维熔断 | 429 冷却5min + 熔断退避600s |

**缓存命中调研**（@librarian 确认）：主流 LLM prompt cache 按-org/account/workspace/project 隔离，跨账号不共享。用户「每 key 50M/天」几乎必然是多个独立账号，轮询会使缓存命中率降到 ~1/N。

### 1.4 方案选型

**借鉴**：octopus 独立 ChannelKey 表 + 三维熔断键；lens 分级冷却；lens LUR 调度思路；octopus 指数退避上限 600s。

**舍弃**：new-api JSON 内嵌（难索引/难单 key 操作/并发竞态）；lens SWRR（Python 实现移植复杂）；octopus TotalCost 调度（不适用日额度场景）；octopus group 层多模式（one-api 已有 Priority+Group）。

---

## 二、架构总览

在 one-api 现有「distributor 选 channel → relay 执行」两段式基础上，插入第三段「SelectKey 选 key」，形成三层调度：

```
请求进入
  ↓
middleware/distributor.go: Distribute
  → 按 (group, model, priority) 选 Channel（现有逻辑不变）
  → 过滤掉「该 model 全 key 不可用」的渠道（新增熔断过滤）
  ↓
relay/controller: 解析请求 body（现有逻辑，拿 system_prompt/usage）
  ↓
SelectKey(channelId, model, systemPrompt)（新增）
  → 按 Channel.MultiKeyMode 选策略：
     priority    → 按 Priority 降序组，组内轮询
     prefix_shard→ hash(system_prompt) 一致性哈希环
     polling     → 轮询
     lur         → 最少已用比例优先
  → 过滤：status=启用 且 cooled_until<=now 且 有剩余配额
  → 配额预判：剩余 < 1.5×AvgTokensPerReq 则跳过
  ↓
注入 meta.APIKey = selectedKey.KeyValue（改 distributor.go:73）
  ↓
adaptor 发请求（现有逻辑）
  ↓
响应处理：回写 ChannelKey 统计 + 触发状态机
```

### 关键设计决策

- **ability 表完全不改**——多 key 仍是「一个 ChannelId」，ability 维度不变（最大简化点）
- **distributor 只选 channel，SelectKey 在 relay 阶段做**——因为 prefix_shard 需要 system_prompt，只有解析 body 后才有；四种模式统一代码路径
- **`Channel.Key` 字段保留为兼容读**——老渠道（MultiKeyMode=0）直接用它，不查 channel_keys 表
- **熔断器状态用内存，不落库**——高频短生命周期，落库拖慢请求路径；配额必须落库（重启不能清零）

---

## 三、数据模型

### 3.1 新增 `channel_keys` 表

```go
// model/channel_key.go
const (
    KeyStatusEnabled   = 1
    KeyStatusDisabled  = 2 // 手动禁用（鉴权错等，需人工恢复）
    KeyStatusCooling   = 3 // 冷却中（自动，到期自动恢复）
    KeyStatusExhausted = 4 // 配额耗尽（等待重置）
)

type ChannelKey struct {
    Id                int64   `json:"id" gorm:"primaryKey;autoIncrement"`
    ChannelId         int     `json:"channel_id" gorm:"index;not null"`
    KeyValue          string  `json:"key_value" gorm:"type:text;not null"` // 单key存原值；复合key存JSON
    Remark            string  `json:"remark" gorm:"type:varchar(128);default:''"`
    Status            int     `json:"status" gorm:"default:1;index"`
    Priority          int     `json:"priority" gorm:"default:0;index"`     // 大优先，与Channel.Priority一致
    // 配额维度
    DailyQuotaLimit   int64   `json:"daily_quota_limit" gorm:"bigint;default:0"` // 0不限，单位token
    DailyUsedQuota    int64   `json:"daily_used_quota" gorm:"bigint;default:0"`
    QuotaResetAt      int64   `json:"quota_reset_at" gorm:"bigint;default:0"`
    QuotaResetRule    string  `json:"quota_reset_rule" gorm:"type:varchar(32);default:''"` // "HH:MM"
    // 冷却维度
    CooledUntil       int64   `json:"cooled_until" gorm:"bigint;default:0"`
    ConsecutiveErrors int     `json:"consecutive_errors" gorm:"default:0"`
    LastErrorTime     int64   `json:"last_error_time" gorm:"bigint;default:0"`
    LastErrorCode     int     `json:"last_error_code" gorm:"default:0"`
    // 统计（配额预判用）
    AvgTokensPerReq   float64 `json:"avg_tokens_per_req" gorm:"default:0"` // EMA
    TotalUsedQuota    int64   `json:"total_used_quota" gorm:"bigint;default:0"`
    TotalRequests     int64   `json:"total_requests" gorm:"bigint;default:0"`
    CreatedTime       int64   `json:"created_time" gorm:"bigint"`
    UpdatedTime       int64   `json:"updated_time" gorm:"bigint"`
}

func (ChannelKey) TableName() string { return "channel_keys" }
```

**索引**：
- `(channel_id, status)` 复合索引——调度查询
- `cooled_until`——冷却恢复扫描
- `quota_reset_at`——配额重置扫描

### 3.2 `Channel` 表新增字段

```go
// 在 model/channel.go:20 的 Channel struct 末尾追加
    MultiKeyMode        int    `json:"multi_key_mode" gorm:"default:0"`        // 0单key兼容 1优先级 2前缀分片 3轮询 4LUR
    KeyCooldownSec      int    `json:"key_cooldown_sec" gorm:"default:0"`      // 0用全局默认
    KeyFailureThreshold int    `json:"key_failure_threshold" gorm:"default:0"` // 0用全局默认
    // Channel.Key 保留：MultiKeyMode=0 时用它；>0 时置空，密钥存 channel_keys
```

### 3.3 全局新增配置项

```go
// common/config/config.go
var ChannelKeyCooldownSec      = 300  // 基础冷却秒数
var ChannelKeyFailureThreshold = 5    // 熔断阈值
var KeyRetryEnabled            = true // 是否开启key级重试
var AutomaticDisableKeyEnabled = true // key级自动禁用总开关
```

### 3.4 复合 key 存储

`ChannelKey.KeyValue` 统一存字符串：
- 单 key：存原始密钥
- 复合 key（AWS/Vertex 等）：存 JSON，如 `{"ak":"...","sk":"...","region":"us-east-1"}`
- 适配器按 channel type 决定如何解析 KeyValue

### 3.5 配额单位

用「上游真实 token」而非 one-api quota。响应处理已拿到上游 `usage.total_tokens`，累加到 `ChannelKey.DailyUsedQuota`。one-api quota 受 model 倍率影响，与上游「50M token/天」语义不对应。

---

## 四、调度策略（SelectKey）

### 4.1 调用时机

在 relay 阶段（解析完请求 body 拿到 system_prompt 后），**不在 distributor 阶段**。distributor 只选 channel。四种模式统一在此处选 key。

### 4.2 公共过滤（所有模式前置）

```
候选 = 该channel的 channel_keys 中 status=启用 且 cooled_until<=now
       且 (daily_quota_limit==0 或 daily_used_quota < daily_quota_limit)
       且 剩余配额 >= 1.5 × AvgTokensPerReq（配额预判）
       且 熔断器(channel,key,model)!=Open
```

### 4.3 四种模式

| 模式 | 算法 | 适用 |
|------|------|------|
| `priority`（默认） | 按 Priority 降序分组，最高组内轮询；该组无候选降级下一组 | 主备、最简单 |
| `prefix_shard` | `hash(system_prompt)` FNV-1a → 一致性哈希环（虚拟节点150/key）映射到 key；该 key 不可用顺时针找下一个 | 保缓存命中（多账号场景） |
| `polling` | 候选集轮询 | 配额均摊、无缓存诉求 |
| `lur` | 按 `daily_used_quota/daily_quota_limit` 升序，limit=0 视作0 | 榨干每 key 配额 |

### 4.4 prefix_shard 边界处理

无 system_prompt 时 `hash("")` 固定值会让所有请求集中到一个 key → **回退到 priority 模式**，避免单 key 过载。

哈希函数：FNV-1a（Go 标准库 `hash/fnv`）；一致性哈希环虚拟节点 150/key。

### 4.5 重试分层

```
失败 → key级重试（换同channel可用key，上限len(keys)）
  全失败 → channel级重试（换channel，走现有RetryTimes）
    全失败 → 返回错误
```

- **key 级重试上限** = `len(keys)`（不新增配置项）
- **流式响应（SSE）已发出后失败不重试**（body 已流出）
- **选 key 阶段失败可重试**（请求还没发出）
- `KeyRetryEnabled`（默认 true）控制是否开启 key 级重试

---

## 五、故障转移与自动恢复

### 5.1 错误分级处理

| HTTP/错误码 | 处理 | 落库 | 自动恢复 |
|-------------|------|------|----------|
| 401/403/invalid_api_key | KeyStatusDisabled | ChannelKey.Status | 仅手动 |
| 429/rate_limit/quota_exceeded | CooledUntil=now+cooldown；达配额则 Exhausted | CooledUntil/Status | 冷却到期/配额重置 |
| 5xx/超时/网络错 | ConsecutiveErrors++，达阈值熔断(channel,key,model) | breaker 内存 | 冷却到期自动 Closed |
| insufficient_quota/balance | KeyStatusDisabled | ChannelKey.Status | 仅手动 |
| 400/其他4xx | 不处理 | — | — |

- **429 专用冷却** = `KeyCooldownSec × 2`（429 通常持续更久）
- **与现有 `ShouldDisableChannel` 兼容并存**：某 channel 所有 key 都 Disabled/Cooling/Exhausted → 触发渠道级 `DisableChannel`（保留现有逻辑）；否则只禁 key 不禁 channel

### 5.2 熔断器

```go
// relay/breaker/breaker.go
type BreakerState int
const (
    BreakerClosed BreakerState = 0 // 正常
    BreakerOpen   BreakerState = 1 // 熔断（冷却中）
)

type breakerEntry struct {
    state       BreakerState
    failCount   int
    openedAt    int64
    cooledUntil int64
}

type Breaker struct {
    mu sync.RWMutex
    m  map[string]*breakerEntry // key = fmt.Sprintf("%d:%d:%s", channelId, keyId, model)
}
```

**三维熔断键** `channel:key:model`（参考 octopus），不禁用 key 的 Enabled 字段，只熔断该组合。

### 5.3 自动恢复（三个独立 goroutine）

1. **配额重置**：每 30s 扫 `quota_reset_at<=now AND status=Exhausted`，重置 `DailyUsedQuota=0`、`Status=Enabled`、`QuotaResetAt=下一HH:MM`
2. **冷却到期**：每 10s 扫 `cooled_until<=now AND status=Cooling`，置 `Status=Enabled`
3. **熔断器**：纯内存，SelectKey 时惰性判断 `cooled_until<=now` 即 Closed（无需后台扫描）

### 5.4 手动恢复

新增 API：`POST /api/channel/:id/key/:keyId/enable` 强制 `Status=Enabled, CooledUntil=0` 并清内存熔断器。

### 5.5 配额预判数据源

`ChannelKey.AvgTokensPerReq` 用 EMA（指数移动平均）维护：
```
每次成功请求后：avg = avg*0.9 + tokens*0.1
配额预判：if (DailyQuotaLimit - DailyUsedQuota) < AvgTokensPerReq * 1.5 then 跳过该key
```

---

## 六、UI 设计

### 6.1 渠道编辑页（`EditChannel.js`）—— 动态列表，非 textarea

```
┌─ 编辑渠道 ─────────────────────────────────────┐
│ 类型[下拉] 名称[输入] 分组[输入] BaseURL[输入]   │
│ 模型[多选标签]                                  │
│ 多Key模式[下拉: 优先级/前缀分片/轮询/LUR]        │
│ ── 密钥列表(3) ──────────── [+添加密钥] ──      │
│ ┌ key#1 ─────────────────────────────────┐    │
│ │ 密钥[输入/掩码切换] [测试][删除]          │    │
│ │ 复合字段(AWS等): ak[__] sk[__] region[__]│    │
│ │ 优先级[__] 每日配额[__] 已用1.2k/10k      │    │
│ │ 重置时刻[时:分] 冷却[__]秒 状态●健康       │    │
│ └─────────────────────────────────────────┘    │
│ ┌ key#2 ... 状态◐冷却剩45s ┐                   │
│ ┌ key#3 ... 状态○已禁用 ─────────────────┐    │
│ 渠道级: 优先级[__] 权重[__] 重试[__]            │
│ [保存] [测试全部密钥]                           │
└─────────────────────────────────────────────────┘
```

- **复合 key（AWS/Vertex）**：选对应 type 时每行展开 ak/sk/region 子字段，前端不再拼接 `ak|sk|region`，后端适配器消费 JSON
- **配额/重置/冷却**默认折叠在「高级」开关内，单 key 用户无感
- **掩码切换**：默认掩码，点眼睛图标显明文；非超管始终掩码且无测试/删除权限

### 6.2 渠道列表页（`ChannelsTable.js`）—— 聚合徽标 + 行展开

```
│ ID 名称  类型  状态      密钥        模型  响应 │
│ 1  主渠道 OpenAI ●正常   8(6✓1◐1✗)  gpt-4 120ms│
│ 2  备用  Azure  ◐部分可用 3(1✓2✗)   gpt-4 --   │
  点行展开▼:
  key#1 sk-...ab3c ●健康 1.2k/10k [测][禁]
  key#2 sk-...7f2d ◐冷却 8.9k/10k 剩30s
  key#3 sk-...e1a0 ✗禁用 超额 [启用]
```

- **渠道级状态**由 key 状态聚合（后端 `Channel.GetStatus()`）：全健康→正常；混合→部分可用；全失效→全部失效
- **配色**沿用 Semantic UI green/yellow/red
- **冷却倒计时**前端轮询（5-10s），不引入 SSE

### 6.3 不新增独立看板页

Key 状态在列表行展开即可见。后端新增 `GET /api/channel/:id/keys/status` 支撑行展开。

### 6.4 与现有 React + Semantic UI 融合

- 多 key 动态列表用 `Card.Group` 或 `Segment` 堆叠，每 key 一个 `Card`；状态徽标复用现有 `<Label>` 封装
- 表单沿用 `EditChannel.js` 现有 `Form.Field` + `inputs` state 模式，新增字段挂到 `inputs.keys` 数组
- 表格展开用 `Table.Row` + 受控 `activeRow` state，展开行用 `colSpan` 渲染内嵌 `ChannelKeyList`，不换手风琴组件
- 所有新文案走 `t('channel.keys.*')`，与现有 `t('channel.edit.*')` 平级，不硬编码中文

---

## 七、实现范围

### 7.1 MVP（2-3 周，1 人）

1. `channel_keys` 表 + GORM model + 建表
2. `Channel` 加 3 字段 + 4 个全局配置项
3. `SelectKey` 四种模式 + 公共过滤 + 配额预判
4. key 级重试链路（改 `controller/relay.go` + `middleware/distributor.go`）
5. 熔断器（内存版 `relay/breaker/breaker.go`）
6. 配额跟踪 + 重置/冷却扫描 goroutine
7. 适配器取 key 路径改造（`meta.APIKey` 来源改为 SelectKey 返回值）
8. 渠道编辑页多 key 动态列表 + 列表页行展开
9. 兼容老渠道（MultiKeyMode=0 用 Channel.Key）
10. 启动时检测老 `channels.key` 含 `\n` 打 warning

### 7.2 增强阶段（2 周，MVP 不做）

- 健康分加权随机（改 `model/cache.go` 缓存结构）
- 半开探测 + 指数退避（上限 600s）
- cron 表达式重置规则
- Redis 共享熔断/配额状态（多节点）
- key 级冷却时长覆盖（ChannelKey 加 CooldownSec）
- Key 健康监控独立看板

### 7.3 改造文件清单

| 文件 | 改造点 | 工作量 |
|------|--------|--------|
| `model/channel_key.go` | 新增：CRUD + 调度 + 扫描 goroutine | L |
| `model/channel.go` | 改 struct + Insert/Update/Delete 同步 ChannelKey | M |
| `model/cache.go:170-255` | 加载 ChannelKey 进缓存 + 熔断过滤 | M |
| `controller/channel.go:77-111` | AddChannel 支持多 key 数组；Update 支持增删 key | M |
| `controller/relay.go:47-105` | 插入 key 级重试循环；processChannelRelayError 按 key 上报 | L |
| `middleware/distributor.go:64-101` | 选 key 后注入 Authorization header + ctxkey.KeyId | M |
| `relay/meta/relay_meta.go:40-66` | 携带 KeyId 用于配额回写 | S |
| `relay/controller/text.go` | 响应末尾回写 key 统计/健康（image.go/audio.go/rerank.go 同构） | M |
| `relay/controller/helper.go` | 新增 reportKeyResult；解析 429/401/403 触发状态机迁移 | L |
| `relay/adaptor.go` 及各 `<provider>/adaptor.go` | SetupRequestHeader 取 key 改从 meta.ChannelKey 读；复合 key 适配器拆解 JSON | M-L |
| `common/config/config.go` | 新增 4 个配置项 | S |
| `model/log.go` | Log 加 ChannelKeyID（可空索引） | S-M |
| `web/default/src/pages/Channel/EditChannel.js` | 单 key 输入框 → 多 key 动态列表；复合 key 改结构化子表单 | L |
| `web/default/src/components/ChannelsTable.js` | 状态列扩展 + 行展开 | M |
| `web/default/src/components/ChannelKeyList.js` | 新增：行展开后的 key 列表子组件 | M |
| `web/default/src/services/channel.js` | API 调用适配 + 新增 key 级接口 | S |
| i18n `web/default/src/i18n/*/channel.js` | 新增多 key 相关文案 | S-M |
| `model/channel_key_test.go` | 状态机迁移、PickKey 策略、配额回写单测 | M |

**建议分两个 PR**：① 后端结构 + 状态机 + 适配器（含单测）；② 前端 UI + 联调。

---

## 八、风险与未决问题

### 8.1 风险点

1. **缓存一致性**（高）：编辑 key 后最长 600s 才生效 → CRUD 后主动 `cache.InvalidateChannel(id)`，不依赖定时同步
2. **并发竞态**（中）：配额回写用 `UPDATE...SET used=used+?` 原子自增；状态迁移用带 condition 的 UPDATE（乐观锁，靠 affected rows 判定）
3. **配额统计精度**（中）：流式 usage 在最后一帧，中断则统计不到 → 明确「尽力而为，非计费级精确」；中断时按上游已返回累计 token 估算，否则记 0 并告警
4. **重试与冷却交互**（中）：标记某 key 冷却后重试应换 key 而非换渠道 → 重试分层（先同渠道换 key，全冷却再换渠道）
5. **ability 表一致性**（中）：删渠道时需级联删 `channel_keys`，别漏
6. **测试覆盖**（中）：本项目测试稀疏，`PickKey`、状态迁移、配额自增必须有单测

### 8.2 未决问题（MVP 取舍已定，记录备查）

- **复合 key 兼容范围**：AWS/Vertex 已知，需扫 `relay/adaptor/<provider>/` 确认是否还有其他
- **历史日志无 ChannelKeyID**：显示「历史（未记录 key）」不回填
- **配额重置时区**：用服务器本地时区，UI 提示设 TZ 环境变量
- **多节点部署**：MVP 单节点内存状态，多节点 Redis 共享放增强阶段
- **是否支持单渠道混合多账号**：本期 base_url 仍渠道级，key 只管凭证

---

## 九、核心决策清单

1. **采用「新增 `channel_keys` 子表 + 渠道 1:N key」结构**，原 `channels.key` 字段保留为兼容读，不再写入
2. **本期只做上游配额管控与 key 健康状态机，不触碰对用户计费体系**，计费仍按渠道级 `logs` 表走
3. **key 选取四种模式可选，默认「优先级+故障转移」**：priority（默认）/ prefix_shard / polling / lur
4. **每 key 配额语义为「每日配额 + 可配重置时刻（默认本地时区 00:00）」**，不做滚动窗口；冷却时长 MVP 只渠道级，key 级覆盖放增强
5. **重试分层：先同渠道换可用 key，key 全冷却/失效再换渠道**；流式响应中途失败不重试
6. **新增「配额预判切换」**：key 剩余配额 < 1.5× 近期平均请求量（EMA）时主动切换
7. **前端多 key 编辑用动态列表（非 textarea）**，复合 key 改结构化子表单，移除前端 `ak|sk|region` 拼接
8. **本期不新增独立看板页面**，key 状态在渠道列表行展开展示
9. **不支持自动迁移**：启动时检测老 `channels.key` 含 `\n` 打 warning，docker 用户可直接删库重建

---

## 十、参考来源

- **new-api**：https://github.com/QuantumNous/new-api （`model/channel.go` GetNextEnabledKey、`constant/multi_key_mode.go`）
- **lens**：https://github.com/dyedd/lens （`lens_api/gateway/router/{cooldown,routing,health}.py`）
- **octopus**：https://github.com/bestruirui/octopus （`internal/model/channel.go` GetChannelKey、`internal/relay/balancer/circuit.go`）
- **缓存作用域**：OpenAI/Anthropic/Gemini/DeepSeek 官方文档（@librarian 研究确认）
