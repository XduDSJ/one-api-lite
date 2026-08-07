# 多 Key 聚合与故障转移 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 one-api 中实现同渠道多 key 聚合、配额调度、分级故障转移与自动恢复。

**Architecture:** 新增 `channel_keys` 子表（渠道 1:N key），在 relay 阶段插入 SelectKey 调度层（四种模式：优先级/前缀分片/轮询/LUR），三维熔断器 `channel:key:model`，配额跟踪 + 自动恢复 goroutine。distributor 选渠道逻辑不变，ability 表不改。

**Tech Stack:** Go 1.20+ / Gin / GORM（SQLite+MySQL+PostgreSQL 三方言）/ React + Semantic UI（前端）

**Spec:** `docs/004-multi-key-failover-design-2026-08-07.md`

## Global Constraints

- Go + Gin + GORM，DB 三方言兼容（SQLite/MySQL/PostgreSQL），新表/索引必须三方言可建
- 中文注释、中文 commit message（conventional commits 规范）
- 向后兼容：老渠道（`MultiKeyMode=0`）继续用 `Channel.Key`，不查 `channel_keys`
- ability 表不改——多 key 仍是「一个 ChannelId」
- 流式响应（SSE）已发出后失败不重试
- 本项目测试稀疏，但本特性的 `PickKey`、状态迁移、配额自增必须有单测
- 配额单位用上游真实 token，不用 one-api quota

---

## File Structure

### 新建文件
- `model/channel_key.go` — ChannelKey model + CRUD + 调度 + 扫描 goroutine
- `model/channel_key_test.go` — PickKey/状态迁移/配额回写单测
- `relay/breaker/breaker.go` — 三维熔断器（内存版）
- `relay/breaker/breaker_test.go` — 熔断器单测
- `web/default/src/components/ChannelKeyList.js` — 渠道行展开后的 key 列表子组件

### 修改文件
- `model/channel.go` — Channel struct 加 3 字段；Delete 级联删 ChannelKey
- `model/cache.go` — 加载 ChannelKey 进缓存；CRUD 后主动失效
- `controller/channel.go` — AddChannel/UpdateChannel/DeleteChannel/TestChannel 支持 key 数组
- `controller/relay.go` — 插入 key 级重试循环
- `middleware/distributor.go:64-102` — SetupContextForSelectedChannel 改 key 注入路径
- `relay/meta/relay_meta.go` — 携带 KeyId
- `relay/controller/helper.go` — 新增 reportKeyResult + 错误分级状态机
- `relay/controller/text.go`/`image.go`/`audio.go`/`rerank.go` — 响应末尾调 reportKeyResult
- `common/config/config.go` — 4 个新配置项
- `common/ctxkey/key.go` — 新增 ChannelKeyId / MultiKeyMode
- `router/api-router.go` — 注册 key 级 API 路由
- `web/default/src/pages/Channel/EditChannel.js` — 多 key 动态列表
- `web/default/src/components/ChannelsTable.js` — 状态聚合 + 行展开
- `web/default/src/services/channel.js` — API 调用适配
- `web/default/src/i18n/zh-cn/channel.js` + `en-us/channel.js` — 新文案

---

## PR1：后端（Task 1-9）

### Task 1: ChannelKey model 与建表

**Files:**
- Create: `model/channel_key.go`
- Create: `model/channel_key_test.go`
- Modify: `model/main.go`（注册 AutoMigrate）

**Interfaces:**
- Produces: `model.ChannelKey` struct；`ChannelKey.TableName() string`；常量 `KeyStatusEnabled/Disabled/Cooling/Exhausted`；CRUD 函数 `GetChannelKeysByChannelId`/`GetEnabledChannelKeys`/`BatchInsertChannelKeys`/`DeleteChannelKeysByChannelId`/`UpdateChannelKey`

- [ ] **Step 1: 写 ChannelKey struct 与常量**

创建 `model/channel_key.go`：

```go
package model

const (
	KeyStatusEnabled   = 1
	KeyStatusDisabled  = 2 // 手动禁用（鉴权错，需人工恢复）
	KeyStatusCooling   = 3 // 冷却中（自动，到期自动恢复）
	KeyStatusExhausted = 4 // 配额耗尽（等待重置）
)

type ChannelKey struct {
	Id                int64   `json:"id" gorm:"primaryKey;autoIncrement"`
	ChannelId         int     `json:"channel_id" gorm:"index;not null"`
	KeyValue          string  `json:"key_value" gorm:"type:text;not null"` // 单key存原值；复合key存JSON
	Remark            string  `json:"remark" gorm:"type:varchar(128);default:''"`
	Status            int     `json:"status" gorm:"default:1;index"`
	Priority          int     `json:"priority" gorm:"default:0;index"`
	DailyQuotaLimit   int64   `json:"daily_quota_limit" gorm:"bigint;default:0"`
	DailyUsedQuota    int64   `json:"daily_used_quota" gorm:"bigint;default:0"`
	QuotaResetAt      int64   `json:"quota_reset_at" gorm:"bigint;default:0"`
	QuotaResetRule    string  `json:"quota_reset_rule" gorm:"type:varchar(32);default:''"`
	CooledUntil       int64   `json:"cooled_until" gorm:"bigint;default:0"`
	ConsecutiveErrors int     `json:"consecutive_errors" gorm:"default:0"`
	LastErrorTime     int64   `json:"last_error_time" gorm:"bigint;default:0"`
	LastErrorCode     int     `json:"last_error_code" gorm:"default:0"`
	AvgTokensPerReq   float64 `json:"avg_tokens_per_req" gorm:"default:0"`
	TotalUsedQuota    int64   `json:"total_used_quota" gorm:"bigint;default:0"`
	TotalRequests     int64   `json:"total_requests" gorm:"bigint;default:0"`
	CreatedTime       int64   `json:"created_time" gorm:"bigint"`
	UpdatedTime       int64   `json:"updated_time" gorm:"bigint"`
}

func (ChannelKey) TableName() string { return "channel_keys" }
```

- [ ] **Step 2: 注册 AutoMigrate**

读 `model/main.go` 找到 `DB.AutoMigrate(...)` 调用，把 `&ChannelKey{}` 加入迁移列表。

- [ ] **Step 3: 写 CRUD 函数**

在 `model/channel_key.go` 追加：

```go
// GetChannelKeysByChannelId 查询某渠道所有 key（按 priority 降序）
func GetChannelKeysByChannelId(channelId int) ([]ChannelKey, error) {
	var keys []ChannelKey
	err := DB.Where("channel_id = ?", channelId).Order("priority desc, id asc").Find(&keys).Error
	return keys, err
}

// GetEnabledChannelKeys 查询某渠道所有启用状态 key
func GetEnabledChannelKeys(channelId int) ([]ChannelKey, error) {
	var keys []ChannelKey
	err := DB.Where("channel_id = ? AND status = ?", channelId, KeyStatusEnabled).Order("priority desc, id asc").Find(&keys).Error
	return keys, err
}

// BatchInsertChannelKeys 批量插入 key
func BatchInsertChannelKeys(keys []ChannelKey) error {
	if len(keys) == 0 {
		return nil
	}
	return DB.Create(&keys).Error
}

// DeleteChannelKeysByChannelId 删除某渠道所有 key（删渠道时级联调用）
func DeleteChannelKeysByChannelId(channelId int) error {
	return DB.Where("channel_id = ?", channelId).Delete(&ChannelKey{}).Error
}

// UpdateChannelKey 更新单个 key
func UpdateChannelKey(key *ChannelKey) error {
	return DB.Save(key).Error
}
```

- [ ] **Step 4: 写测试 — 建表与基础 CRUD**

创建 `model/channel_key_test.go`，测试 BatchInsert 后 GetChannelKeysByChannelId 按 priority 降序、GetEnabledChannelKeys 过滤禁用、DeleteChannelKeysByChannelId 清空。用 SQLite 内存库初始化 DB 全局变量（若项目无 setupTestDB helper，在本测试文件新建）。

测试要点：
- 插入 3 个 key（priority 10/5/1，其中 priority=1 的 status=Disabled）
- `GetChannelKeysByChannelId(1)` 返回 3 个，顺序 priority 10→5→1
- `GetEnabledChannelKeys(1)` 返回 2 个（过滤 Disabled）
- `DeleteChannelKeysByChannelId(1)` 后再查返回 0 个

- [ ] **Step 5: 运行测试验证通过**

Run: `go test ./model/ -run TestChannelKeyCRUD -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add model/channel_key.go model/channel_key_test.go model/main.go
git commit -m "feat(model): 新增 ChannelKey 表与 CRUD

- 渠道 1:N key 关联表，支持配额/冷却/优先级/统计字段
- 状态机：启用/手动禁用/冷却/配额耗尽
- 含基础 CRUD 与 priority 降序查询单测"
```

---

### Task 2: Channel 表新增字段与配置项

**Files:**
- Modify: `model/channel.go:20-41`（struct 加字段）
- Modify: `model/channel.go` 的 `Delete()`（级联删 ChannelKey）
- Modify: `common/config/config.go`
- Modify: `model/option.go`（配置项注册）

**Interfaces:**
- Produces: `Channel.MultiKeyMode`/`Channel.KeyCooldownSec`/`Channel.KeyFailureThreshold` 字段；`config.ChannelKeyCooldownSec`/`config.ChannelKeyFailureThreshold`/`config.KeyRetryEnabled`/`config.AutomaticDisableKeyEnabled`

- [ ] **Step 1: Channel struct 加 3 字段**

在 `model/channel.go:41` 的 `SystemPrompt` 字段后追加：

```go
	SystemPrompt       *string `json:"system_prompt" gorm:"type:text"`
	// —— 多 Key 模式 ——
	MultiKeyMode        int    `json:"multi_key_mode" gorm:"default:0"`        // 0单key兼容 1优先级 2前缀分片 3轮询 4LUR
	KeyCooldownSec      int    `json:"key_cooldown_sec" gorm:"default:0"`      // 0用全局默认
	KeyFailureThreshold int    `json:"key_failure_threshold" gorm:"default:0"` // 0用全局默认
}
```

- [ ] **Step 2: 新增全局配置项**

在 `common/config/config.go` 的 `AutomaticDisableChannelEnabled` 附近追加：

```go
var ChannelKeyCooldownSec      = 300  // key 基础冷却秒数
var ChannelKeyFailureThreshold = 5    // key 熔断阈值
var KeyRetryEnabled            = true // 是否开启 key 级重试
var AutomaticDisableKeyEnabled = true // key 级自动禁用总开关
```

- [ ] **Step 3: 注册配置项到 option map**

读 `model/option.go`，参照 `RetryTimes`/`AutomaticDisableChannelEnabled` 的注册方式，把 4 个新配置项加入 `OptionMap` 初始化与 `updateOptionMap` switch 分支（值用 `strconv.Itoa`/`strconv.FormatBool`）。

- [ ] **Step 4: Channel.Delete 级联删 ChannelKey**

读 `model/channel.go` 的 `Delete()` 方法，在删渠道后追加 `DeleteChannelKeysByChannelId(channel.Id)`，失败时 `logger.SysError` 记录但不阻断。

- [ ] **Step 5: 编译验证**

Run: `go build ./...`
Expected: 无编译错误

- [ ] **Step 6: Commit**

```bash
git add model/channel.go common/config/config.go model/option.go
git commit -m "feat(model): Channel 表新增多 key 模式字段与全局配置

- MultiKeyMode/KeyCooldownSec/KeyFailureThreshold
- 全局配置：冷却300s/阈值5/key级重试/key级自动禁用
- 删渠道级联删 channel_keys"
```

---

### Task 3: 熔断器（三维 channel:key:model）

**Files:**
- Create: `relay/breaker/breaker.go`
- Create: `relay/breaker/breaker_test.go`

**Interfaces:**
- Produces: `breaker.Breaker` struct；`breaker.GlobalBreaker *Breaker`；方法 `IsOpen(channelId, keyId int, model string) bool`；`RecordFailure(channelId, keyId int, model string, threshold int, cooldownSec int)`；`RecordSuccess(channelId, keyId int, model string)`；`Reset(channelId, keyId int, model string)`

- [ ] **Step 1: 写熔断器实现**

创建 `relay/breaker/breaker.go`，实现：
- `breakerEntry` 结构：`state`(BreakerClosed=0/BreakerOpen=1)、`failCount`、`cooledUntil`(int64 unix 秒)
- `Breaker` 结构：`mu sync.RWMutex` + `m map[string]*breakerEntry`
- `circuitKey(channelId, keyId int, model string) string` = `fmt.Sprintf("%d:%d:%s", ...)`
- `GlobalBreaker = NewBreaker()` 全局实例
- `IsOpen`：读锁判断；若 BreakerOpen 且 `now>=cooledUntil` 返回 false（惰性恢复视为已恢复）
- `RecordFailure`：写锁；若已 Open 且未到期直接返回不重复计数；否则 `failCount++`，达 threshold 则 `state=Open`、`cooledUntil=now+cooldownSec`
- `RecordSuccess`：写锁；重置 `state=Closed`、`failCount=0`、`cooledUntil=0`
- `Reset`：写锁；`delete(map, key)`（手动恢复时调用）

- [ ] **Step 2: 写熔断器测试**

创建 `relay/breaker/breaker_test.go`，测试：
- `TestBreakerOpenAndRecover`：未达阈值不熔断；达阈值（5次）熔断；不同 model 不受影响（三维隔离）；RecordSuccess 后重置
- `TestBreakerCooldownRecover`：用 `cooldownSec=1` 触发熔断，`sleep 1.5s` 后 `IsOpen` 返回 false（惰性恢复）

- [ ] **Step 3: 运行测试**

Run: `go test ./relay/breaker/ -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add relay/breaker/breaker.go relay/breaker/breaker_test.go
git commit -m "feat(breaker): 三维熔断器 channel:key:model

- 熔断阈值 + 冷却秒数，到期惰性自动恢复
- RecordFailure/RecordSuccess/Reset/IsOpen
- 含熔断与冷却恢复单测"
```

---

### Task 4: SelectKey 调度（四种模式）

**Files:**
- Modify: `model/channel_key.go`（追加 PickKey 与策略函数）

**Interfaces:**
- Consumes: `relay/breaker.GlobalBreaker`
- Produces: `model.MultiKeyModeOff/Priority/PrefixShard/Polling/LUR` 常量；`model.PickKey(channelId int, multiKeyMode int, model string, systemPrompt string) (*ChannelKey, error)`

- [ ] **Step 1: 写 MultiKeyMode 常量与公共过滤函数**

在 `model/channel_key.go` 追加 import (`hash/fnv`, `math/rand`, `sort`, `time`, `fmt`, `relay/breaker`) 和常量：

```go
const (
	MultiKeyModeOff         = 0 // 单 key 兼容
	MultiKeyModePriority    = 1 // 优先级 + 故障转移
	MultiKeyModePrefixShard = 2 // 前缀哈希分片
	MultiKeyModePolling     = 3 // 轮询
	MultiKeyModeLUR         = 4 // 最少已用比例优先
)
```

`filterUsableKeys(channelId int, keys []ChannelKey, model string) []ChannelKey` 过滤逻辑：
- `k.Status != KeyStatusEnabled` 跳过
- `k.CooledUntil > now` 跳过
- `k.DailyQuotaLimit > 0 && k.DailyUsedQuota >= k.DailyQuotaLimit` 跳过
- 配额预判：`k.DailyQuotaLimit > 0 && k.AvgTokensPerReq > 0` 时，若 `remaining < int64(1.5*k.AvgTokensPerReq)` 跳过
- `breaker.GlobalBreaker.IsOpen(channelId, int(k.Id), model)` 跳过

- [ ] **Step 2: 写四种策略函数**

- `pickByPriority(keys) *ChannelKey`：keys 已按 priority desc 排序，取最高 priority 组，组内 `rand.Intn` 随机选
- `pickByPrefixShard(keys, systemPrompt) *ChannelKey`：systemPrompt 为空时回退 `pickByPriority`；否则 `fnv.New32a` 哈希后 `int(hashVal) % len(keys)` 取模选
- `pickByPolling(keys) *ChannelKey`：`rand.Intn(len(keys))` 随机选
- `pickByLUR(keys) *ChannelKey`：`sort.SliceStable` 按 `daily_used_quota/daily_quota_limit` 升序（limit=0 视作 0），取第一个

- [ ] **Step 3: 写 PickKey 入口**

```go
func PickKey(channelId int, multiKeyMode int, model string, systemPrompt string) (*ChannelKey, error) {
	keys, err := GetEnabledChannelKeys(channelId)
	if err != nil {
		return nil, err
	}
	if len(keys) == 0 {
		return nil, fmt.Errorf("渠道 %d 无可用 key", channelId)
	}
	usable := filterUsableKeys(channelId, keys, model)
	if len(usable) == 0 {
		return nil, fmt.Errorf("渠道 %d 所有 key 不可用（冷却/配额耗尽/熔断）", channelId)
	}
	switch multiKeyMode {
	case MultiKeyModePriority:
		return pickByPriority(usable), nil
	case MultiKeyModePrefixShard:
		return pickByPrefixShard(usable, systemPrompt), nil
	case MultiKeyModePolling:
		return pickByPolling(usable), nil
	case MultiKeyModeLUR:
		return pickByLUR(usable), nil
	default:
		return pickByPriority(usable), nil
	}
}
```

- [ ] **Step 4: 写 PickKey 测试**

在 `model/channel_key_test.go` 追加：
- `TestPickKeyPriority`：插入 priority 1 和 10 两个启用 key，优先级模式应总返回 priority=10
- `TestPickKeyFiltersDisabled`：插入一个 Disabled（priority=10）和一个 Enabled（priority=1），应跳过禁用返回 sk-ok
- `TestPickKeyNoUsable`：只插入 Disabled key，应返回 error

- [ ] **Step 5: 运行测试**

Run: `go test ./model/ -run TestPickKey -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add model/channel_key.go model/channel_key_test.go
git commit -m "feat(model): SelectKey 四种调度模式

- 优先级/前缀分片/轮询/LUR
- 公共过滤：状态/冷却/配额/熔断/配额预判
- 前缀分片无 system_prompt 回退优先级
- 含 PickKey 单测"
```

---

### Task 5: ctxkey 与 meta 携带 KeyId

**Files:**
- Modify: `common/ctxkey/key.go`
- Modify: `relay/meta/relay_meta.go:40-66`

**Interfaces:**
- Produces: `ctxkey.ChannelKeyId`；`ctxkey.MultiKeyMode`；`meta.Meta.ChannelKeyId int`

- [ ] **Step 1: 新增 ctxkey**

在 `common/ctxkey/key.go` 的 `ChannelName` 附近追加 `ChannelKeyId = "channel_key_id"`，并在文件中追加 `MultiKeyMode = "multi_key_mode"`。

- [ ] **Step 2: Meta 加 ChannelKeyId 字段**

在 `relay/meta/relay_meta.go:18` 的 `ChannelId` 后追加 `ChannelKeyId int`（注释：多 key 模式下选中的 key id，0 表示单 key 兼容）。

- [ ] **Step 3: GetByContext 读取 ChannelKeyId**

在 `relay_meta.go:44` 的 `ChannelId: c.GetInt(ctxkey.ChannelId),` 后追加 `ChannelKeyId: c.GetInt(ctxkey.ChannelKeyId),`。

- [ ] **Step 4: 编译验证**

Run: `go build ./...`
Expected: 无编译错误

- [ ] **Step 5: Commit**

```bash
git add common/ctxkey/key.go relay/meta/relay_meta.go
git commit -m "feat(relay): ctxkey 与 meta 携带 ChannelKeyId"
```

---

### Task 6: distributor 改 key 注入路径

**Files:**
- Modify: `middleware/distributor.go:64-102`

**Interfaces:**
- Consumes: `model.MultiKeyModeOff`、`ctxkey.MultiKeyMode`
- Produces: `SetupContextForSelectedChannel` 多 key 模式延后注入 key

- [ ] **Step 1: 改 SetupContextForSelectedChannel**

设计调整：distributor 阶段先不注入 key（多 key 模式），由 relay 阶段 PickKey 后注入。单 key 兼容模式（MultiKeyMode=0）仍用 `channel.Key`。

修改 `middleware/distributor.go:73`：
- 新增 `c.Set(ctxkey.MultiKeyMode, channel.MultiKeyMode)`
- 把 `c.Request.Header.Set("Authorization", ...)` 改为只在 `channel.MultiKeyMode == model.MultiKeyModeOff` 时执行
- 其余 Config 逻辑不变

- [ ] **Step 2: 编译验证**

Run: `go build ./...`
Expected: 无编译错误

- [ ] **Step 3: Commit**

```bash
git add middleware/distributor.go
git commit -m "feat(distributor): 多 key 模式延后注入 key 到 relay 阶段

- 单 key 兼容模式仍用 channel.Key
- 多 key 模式传递 MultiKeyMode 到 relay 阶段"
```

---

### Task 7: relay 阶段注入 key + key 级重试

**Files:**
- Modify: `controller/relay.go:47-105`
- Modify: `relay/controller/text.go`（RelayTextHelper 入口处 PickKey 注入）

**Interfaces:**
- Consumes: `model.PickKey`、`ctxkey.ChannelKeyId`、`ctxkey.MultiKeyMode`、`config.KeyRetryEnabled`

- [ ] **Step 1: 抽取 pickKeyAndInject 辅助函数**

在 `controller/relay.go` 新增辅助函数：从 ctx 读 `channelId`/`multiKeyMode`/`model`/`systemPrompt`，调 `model.PickKey`，成功后 `c.Set(ctxkey.ChannelKeyId, key.Id)` 并 `c.Request.Header.Set("Authorization", "Bearer "+key.KeyValue)`，返回 `(*model.ChannelKey, error)`。单 key 模式（MultiKeyMode==0）直接返回 `nil, nil` 不处理。

- [ ] **Step 2: 在 RelayTextHelper 入口调用 pickKeyAndInject**

读 `relay/controller/text.go` 的 `RelayTextHelper`，在解析请求 body 拿到 `systemPrompt` 之后、调 adaptor 之前，调用 `pickKeyAndInject`。若返回 error（所有 key 不可用），返回 `model.ErrorWithStatusCode`（StatusCode=503，message「渠道所有 key 不可用」）。

- [ ] **Step 3: 在 Relay 函数加 key 级重试循环**

读 `controller/relay.go:56` 的 `bizErr := relayHelper(...)` 之后，在现有渠道级重试循环之前，插入 key 级重试：
- 仅当 `config.KeyRetryEnabled && multiKeyMode != Off && shouldRetry(c, bizErr.StatusCode)` 时进入
- 循环最多 `len(keys)-1` 次：调 `pickKeyAndInject`（排除上次失败的 key，用 `ctxkey.FailedKeyIds` 记录已失败 key id 列表），重新 `relayHelper`
- 成功则 return；全失败则落入现有渠道级重试

注：流式响应（`c.Get(ctxkey.IsStream)` 已在响应中）不重试，保持现状。

- [ ] **Step 4: 编译验证**

Run: `go build ./...`
Expected: 无编译错误

- [ ] **Step 5: Commit**

```bash
git add controller/relay.go relay/controller/text.go
git commit -m "feat(relay): relay 阶段 PickKey 注入与 key 级重试

- 多 key 模式在解析 body 后 PickKey 注入 Authorization
- key 级重试：换同渠道可用 key，上限 len(keys)-1
- 全 key 失败后落入现有渠道级重试"
```

---

### Task 8: 错误分级状态机与配额回写

**Files:**
- Modify: `relay/controller/helper.go`（新增 reportKeyResult + 错误分级）
- Modify: `relay/controller/text.go`/`image.go`/`audio.go`/`rerank.go`（响应处调 reportKeyResult）
- Modify: `model/channel_key.go`（状态机迁移函数）

**Interfaces:**
- Consumes: `meta.ChannelKeyId`、`breaker.GlobalBreaker`、`config.ChannelKeyCooldownSec`/`ChannelKeyFailureThreshold`/`AutomaticDisableKeyEnabled`
- Produces: `reportKeyResult(meta *meta.Meta, statusCode int, tokens int64, success bool)`；`model.IncrChannelKeyUsage`/`CoolDownChannelKey`/`DisableChannelKey`/`MarkChannelKeyExhaustedIfQuota`

- [ ] **Step 1: 写 reportKeyResult 函数**

在 `relay/controller/helper.go` 新增：

```go
func reportKeyResult(meta *meta.Meta, statusCode int, tokens int64, success bool) {
	if meta.ChannelKeyId == 0 {
		return // 单 key 兼容模式不处理
	}
	if success {
		breaker.GlobalBreaker.RecordSuccess(meta.ChannelId, meta.ChannelKeyId, meta.ActualModelName)
		go model.IncrChannelKeyUsage(meta.ChannelKeyId, tokens)
		return
	}
	// 失败：按状态码分级
	cooldownSec := config.ChannelKeyCooldownSec
	switch {
	case statusCode == 401 || statusCode == 403:
		// 鉴权错：禁用 key（需人工恢复）
		if config.AutomaticDisableKeyEnabled {
			go model.DisableChannelKey(meta.ChannelKeyId, model.KeyStatusDisabled)
		}
	case statusCode == 429:
		// 限流：冷却 × 2
		cooldownSec = config.ChannelKeyCooldownSec * 2
		go model.CoolDownChannelKey(meta.ChannelKeyId, int64(cooldownSec))
		go model.MarkChannelKeyExhaustedIfQuota(meta.ChannelKeyId)
	case statusCode/100 == 5:
		// 5xx：熔断计数
		threshold := config.ChannelKeyFailureThreshold
		breaker.GlobalBreaker.RecordFailure(meta.ChannelId, meta.ChannelKeyId, meta.ActualModelName, threshold, cooldownSec)
	}
}
```

- [ ] **Step 2: 在 model/channel_key.go 加状态机迁移函数**

- `IncrChannelKeyUsage(keyId int64, tokens int64)`：原子自增 `DailyUsedQuota`/`TotalUsedQuota`/`TotalRequests`，EMA 更新 `AvgTokensPerReq = AvgTokensPerReq*0.9 + float64(tokens)*0.1`（用 `DB.Model(&ChannelKey{}).Where("id=?", keyId).Updates(map{...})` 配合 `gorm.Expr` 自增）
- `CoolDownChannelKey(keyId int64, cooldownSec int64)`：`UPDATE channel_keys SET status=KeyStatusCooling, cooled_until=now+cooldownSec WHERE id=?`
- `DisableChannelKey(keyId int64, status int)`：`UPDATE channel_keys SET status=? WHERE id=?`
- `MarkChannelKeyExhaustedIfQuota(keyId int64)`：`UPDATE channel_keys SET status=KeyStatusExhausted WHERE id=? AND daily_quota_limit>0 AND daily_used_quota>=daily_quota_limit`（带 condition，乐观锁）

- [ ] **Step 3: 在响应处调用 reportKeyResult**

读 `relay/controller/text.go` 的响应处理（成功路径和错误路径），在拿到 `usage.total_tokens` 和 `statusCode` 后调 `reportKeyResult(&meta, statusCode, totalTokens, bizErr==nil)`。`image.go`/`audio.go`/`rerank.go` 同构改造。

- [ ] **Step 4: 编译验证**

Run: `go build ./...`
Expected: 无编译错误

- [ ] **Step 5: Commit**

```bash
git add relay/controller/helper.go relay/controller/text.go relay/controller/image.go relay/controller/audio.go relay/controller/rerank.go model/channel_key.go
git commit -m "feat(relay): 错误分级状态机与配额回写

- reportKeyResult：401/403禁用、429冷却×2、5xx熔断计数
- 配额自增（原子）+ EMA 更新 AvgTokensPerReq
- 成功时熔断器 RecordSuccess
- text/image/audio/rerank 四处响应回写"
```

---

### Task 9: 自动恢复 goroutine + key 级 API + 老渠道 warning

**Files:**
- Modify: `model/channel_key.go`（扫描 goroutine）
- Modify: `main.go`（启动 goroutine）
- Modify: `controller/channel.go`（key 级 API + AddChannel/UpdateChannel 支持 key 数组）
- Modify: `router/api-router.go`（注册路由）
- Modify: `model/cache.go`（启动 warning + CRUD 失效）

**Interfaces:**
- Produces: `model.StartChannelKeyScanners()`；API `POST /api/channel/:id/key/:keyId/enable`；API `GET /api/channel/:id/keys/status`；`model.InvalidateChannelCache(channelId int)`

- [ ] **Step 1: 写配额重置扫描 goroutine**

在 `model/channel_key.go` 加 `StartQuotaResetScanner()`：每 30s 扫 `quota_reset_at<=now AND status=KeyStatusExhausted`，重置 `DailyUsedQuota=0`、`Status=Enabled`、`QuotaResetAt=下一 HH:MM`（按 `QuotaResetRule` 解析）。

- [ ] **Step 2: 写冷却到期扫描 goroutine**

`StartCooldownScanner()`：每 10s 扫 `cooled_until<=now AND status=KeyStatusCooling`，置 `Status=Enabled`、`CooledUntil=0`。

- [ ] **Step 3: 启动 goroutine**

在 `model/channel_key.go` 加 `StartChannelKeyScanners()` 聚合启动两个 goroutine。读 `main.go` 在 `InitChannelCache` 之后调用 `go model.StartChannelKeyScanners()`。

- [ ] **Step 4: 改 AddChannel/UpdateChannel 支持 key 数组**

读 `controller/channel.go:77` 的 `AddChannel`：把现有按 `\n` 拆分批量插入多渠道的逻辑改为——插入单渠道 + 批量插入 `channel_keys`（接收前端 `keys` 数组）。`UpdateChannel`（:148）类似：更新渠道字段 + 同步增删 `channel_keys`。

- [ ] **Step 5: 写 key 级 API**

在 `controller/channel.go` 新增：
- `EnableChannelKey(c)`：`POST /api/channel/:id/key/:keyId/enable`，`UpdateChannelKey` 置 `Status=Enabled`/`CooledUntil=0`，并 `breaker.GlobalBreaker.Reset(channelId, keyId, "")` 重置熔断
- `GetChannelKeysStatus(c)`：`GET /api/channel/:id/keys/status`，返回该渠道所有 key 的状态/配额/冷却摘要

- [ ] **Step 6: 注册路由**

读 `router/api-router.go`，在渠道相关路由组注册两个新 API（需 admin 权限中间件）。

- [ ] **Step 7: 启动时老渠道 warning**

在 `model/cache.go` 的 `InitChannelCache` 或 `main.go` 启动时，查 `channels` 表 `key` 字段含 `\n` 的记录，`logger.SysWarning` 提示「检测到老格式多 key 渠道，建议重建为多 key 模式」。

- [ ] **Step 8: CRUD 后主动失效缓存**

在 `controller/channel.go` 的 `AddChannel`/`UpdateChannel`/`DeleteChannel` 成功后，调 `model.InvalidateChannelCache(channelId)`（在 `model/cache.go` 加该函数，删除 `channelId2channel` 对应项并触发重新同步）。

- [ ] **Step 9: 编译验证**

Run: `go build ./...`
Expected: 无编译错误

- [ ] **Step 10: Commit**

```bash
git add model/channel_key.go main.go controller/channel.go router/api-router.go model/cache.go
git commit -m "feat(multi-key): 自动恢复 goroutine + key 级 API + 老渠道 warning

- 配额重置/冷却到期两个扫描 goroutine
- AddChannel/UpdateChannel 支持 key 数组
- API: 启用 key、查 key 状态
- 启动检测老 \\n 多 key 渠道打 warning
- CRUD 后主动失效缓存"
```

---

## PR2：前端（Task 10-12）

### Task 10: 渠道编辑页多 key 动态列表

**Files:**
- Modify: `web/default/src/pages/Channel/EditChannel.js`

- [ ] **Step 1: 改 state 结构**

把现有 `inputs.key` 单字段改为 `inputs.keys` 数组（每项 `{key_value, remark, status, priority, daily_quota_limit, quota_reset_rule, cooled_until}`）。新增 `inputs.multi_key_mode`（0-4）。保留对老数据兼容：GET 返回单 key 时初始化为 `[{key_value: channel.key}]`。

- [ ] **Step 2: 渲染多 key 动态列表**

用 Semantic UI `Card.Group` 渲染 `inputs.keys`，每张 Card 含：密钥输入（掩码切换）、优先级输入、每日配额输入、重置时刻下拉（HH:MM）、冷却秒数输入、状态徽标、测试/删除按钮。顶部加「+ 添加密钥」按钮。复合 key（AWS/Vertex 等 type）时每行展开 ak/sk/region 子字段（`key_value` 存 JSON）。

- [ ] **Step 3: 加多 Key 模式下拉**

在表单顶部加 `multi_key_mode` 下拉（优先级/前缀分片/轮询/LUR），默认优先级。

- [ ] **Step 4: 提交适配**

提交 POST/PUT 时把 `keys` 数组和 `multi_key_mode` 一起发。

- [ ] **Step 5: 构建验证**

Run: `cd web/default && npm run build`
Expected: 构建成功，产物到 `web/build/default`

- [ ] **Step 6: Commit**

```bash
git add web/default/src/pages/Channel/EditChannel.js
git commit -m "feat(web): 渠道编辑页多 key 动态列表

- 单 key 输入框改为动态列表（Card.Group）
- 每 key 含密钥/优先级/配额/重置/冷却字段
- 复合 key（AWS/Vertex）结构化子表单
- 多 Key 模式下拉选择"
```

---

### Task 11: 渠道列表页状态聚合 + 行展开

**Files:**
- Modify: `web/default/src/components/ChannelsTable.js`
- Create: `web/default/src/components/ChannelKeyList.js`

- [ ] **Step 1: 状态列扩展**

把现有单状态徽标改为聚合展示：密钥总数 + 健康/冷却/失效计数（如 `8(6✓1◐1✗)`）。数据从 `GET /api/channel/:id/keys/status` 懒加载或列表接口附带。

- [ ] **Step 2: 行展开**

点击行展开内嵌 `ChannelKeyList` 子组件，展示每 key 详情：掩码 key、状态徽标、配额进度条、冷却倒计时、手动启用/禁用/测试按钮。

- [ ] **Step 3: 新建 ChannelKeyList 组件**

`web/default/src/components/ChannelKeyList.js`：接收 `channelId`，调 `GET /api/channel/:id/keys/status` 拉数据，用 `Table.Row` + `colSpan` 渲染每 key 一行。状态徽标用 Semantic UI `Label`（green/yellow/red）。冷却倒计时用 `setInterval` 每 5s 刷新。

- [ ] **Step 4: 构建验证**

Run: `cd web/default && npm run build`
Expected: 构建成功

- [ ] **Step 5: Commit**

```bash
git add web/default/src/components/ChannelsTable.js web/default/src/components/ChannelKeyList.js
git commit -m "feat(web): 渠道列表页状态聚合与行展开

- 状态列展示密钥健康/冷却/失效计数
- 行展开内嵌 ChannelKeyList 子组件
- 每 key 含掩码/状态/配额进度/冷却倒计时/操作按钮"
```

---

### Task 12: i18n 文案与 API 服务层适配

**Files:**
- Modify: `web/default/src/services/channel.js`
- Modify: `web/default/src/i18n/zh-cn/channel.js`
- Modify: `web/default/src/i18n/en-us/channel.js`

- [ ] **Step 1: API 服务层适配**

在 `web/default/src/services/channel.js` 新增：
- `enableChannelKey(channelId, keyId)` → `POST /api/channel/:id/key/:keyId/enable`
- `getChannelKeysStatus(channelId)` → `GET /api/channel/:id/keys/status`
- `addChannel`/`updateChannel` 的请求体适配 `keys` 数组 + `multi_key_mode`

- [ ] **Step 2: 中文 i18n 文案**

在 `web/default/src/i18n/zh-cn/channel.js` 新增 `channel.keys.*`（添加密钥/密钥列表/每日配额/重置时刻/冷却时长/优先级/多Key模式/优先级/前缀分片/轮询/最少使用）和 `channel.key_status.*`（健康/冷却中/已禁用/配额耗尽）。

- [ ] **Step 3: 英文 i18n 文案**

在 `web/default/src/i18n/en-us/channel.js` 同步新增对应英文文案。

- [ ] **Step 4: 构建验证**

Run: `cd web/default && npm run build`
Expected: 构建成功

- [ ] **Step 5: Commit**

```bash
git add web/default/src/services/channel.js web/default/src/i18n/zh-cn/channel.js web/default/src/i18n/en-us/channel.js
git commit -m "feat(web): i18n 文案与 API 服务层适配多 key

- API 服务层新增 enableChannelKey/getChannelKeysStatus
- 中英文 i18n 新增 channel.keys.* 与 channel.key_status.*"
```

---

## Self-Review

**1. Spec coverage：**
- 数据模型（spec 三章）→ Task 1, 2 ✓
- 调度策略四种模式（spec 四章）→ Task 4 ✓
- SelectKey 在 relay 阶段（spec 4.1）→ Task 6, 7 ✓
- 重试分层（spec 4.5）→ Task 7 ✓
- 错误分级处理（spec 5.1）→ Task 8 ✓
- 熔断器（spec 5.2）→ Task 3 ✓
- 自动恢复 goroutine（spec 5.3）→ Task 9 ✓
- 手动恢复 API（spec 5.4）→ Task 9 ✓
- 配额预判 EMA（spec 5.5）→ Task 4 过滤 + Task 8 自增 ✓
- UI 编辑页（spec 6.1）→ Task 10 ✓
- UI 列表页（spec 6.2）→ Task 11 ✓
- 不新增独立看板（spec 6.3）→ 未新增 ✓
- 老渠道兼容（spec 决策1）→ Task 6 单 key 兼容分支 ✓
- 启动 warning（spec 决策9）→ Task 9 ✓
- CRUD 后失效缓存（spec 风险1）→ Task 9 ✓

**2. Placeholder scan：** 无 TBD/TODO，所有步骤含具体代码或明确指令 ✓

**3. Type consistency：**
- `PickKey` 签名 Task 4 定义 → Task 7 调用一致 ✓
- `ChannelKeyId` Task 5 定义 → Task 7/8 调用一致 ✓
- `reportKeyResult` Task 8 定义 → Task 8 Step 3 调用一致 ✓
- `IncrChannelKeyUsage`/`CoolDownChannelKey`/`DisableChannelKey` Task 8 Step 2 定义 → Step 1 调用一致 ✓
- `StartChannelKeyScanners` Task 9 定义 → main.go 调用一致 ✓

无遗漏，无需补充任务。
