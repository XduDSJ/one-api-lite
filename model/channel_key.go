package model

import (
	"fmt"
	"hash/fnv"
	"math/rand"
	"sort"
	"sync"
	"time"

	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/relay/breaker"

	"gorm.io/gorm"
)

const (
	KeyStatusEnabled   = 1
	KeyStatusDisabled  = 2 // 手动禁用（鉴权错，需人工恢复）
	KeyStatusCooling   = 3 // 冷却中（自动，到期自动恢复）
	KeyStatusExhausted = 4 // 配额耗尽（等待重置）
)

// MultiKeyMode 多 key 调度模式
const (
	MultiKeyModeOff         = 0 // 单 key 兼容
	MultiKeyModePriority    = 1 // 优先级 + 故障转移
	MultiKeyModePrefixShard = 2 // 前缀哈希分片
	MultiKeyModePolling     = 3 // 轮询
	MultiKeyModeLUR         = 4 // 最少已用比例优先
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

// filterUsableKeys 按公共条件过滤出可用 key：
// 1) 状态非启用跳过；2) 仍在冷却期跳过；3) 配额已耗尽跳过；
// 4) 配额预判（剩余不足以支撑 1.5 倍平均 token）跳过；5) 熔断打开跳过。
func filterUsableKeys(channelId int, keys []ChannelKey, model string) []ChannelKey {
	now := time.Now().Unix()
	usable := make([]ChannelKey, 0, len(keys))
	for _, k := range keys {
		// 1. 状态非启用跳过
		if k.Status != KeyStatusEnabled {
			continue
		}
		// 2. 仍在冷却期跳过
		if k.CooledUntil > now {
			continue
		}
		// 3. 配额已耗尽跳过
		if k.DailyQuotaLimit > 0 && k.DailyUsedQuota >= k.DailyQuotaLimit {
			continue
		}
		// 4. 配额预判：剩余配额不足 1.5 倍平均 token 则跳过
		if k.DailyQuotaLimit > 0 && k.AvgTokensPerReq > 0 {
			remaining := k.DailyQuotaLimit - k.DailyUsedQuota
			if remaining < int64(1.5*k.AvgTokensPerReq) {
				continue
			}
		}
		// 5. 熔断打开跳过
		if breaker.GlobalBreaker.IsOpen(channelId, int(k.Id), model) {
			continue
		}
		usable = append(usable, k)
	}
	return usable
}

// pickByPriority 优先级模式：keys 已按 priority desc 排序，
// 取最高 priority 组，组内 rand.Intn 随机选。
func pickByPriority(keys []ChannelKey) *ChannelKey {
	if len(keys) == 0 {
		return nil
	}
	topPriority := keys[0].Priority
	group := []ChannelKey{keys[0]}
	for i := 1; i < len(keys); i++ {
		if keys[i].Priority == topPriority {
			group = append(group, keys[i])
		} else {
			break // 已按 priority desc 排序，后续均更低
		}
	}
	idx := rand.Intn(len(group))
	return &group[idx]
}

// pickByPrefixShard 前缀分片：systemPrompt 为空时回退 pickByPriority；
// 否则对 systemPrompt 取 fnv32a 哈希后对 len(keys) 取模选 key。
func pickByPrefixShard(keys []ChannelKey, systemPrompt string) *ChannelKey {
	if len(keys) == 0 {
		return nil
	}
	if systemPrompt == "" {
		return pickByPriority(keys)
	}
	h := fnv.New32a()
	h.Write([]byte(systemPrompt))
	idx := int(h.Sum32()) % len(keys)
	return &keys[idx]
}

// pickByPolling 轮询：rand.Intn(len(keys)) 随机选。
func pickByPolling(keys []ChannelKey) *ChannelKey {
	if len(keys) == 0 {
		return nil
	}
	idx := rand.Intn(len(keys))
	return &keys[idx]
}

// pickByLUR 最少已用比例优先：按 daily_used_quota/daily_quota_limit 升序
// （limit=0 视作比例 0），取第一个。
func pickByLUR(keys []ChannelKey) *ChannelKey {
	if len(keys) == 0 {
		return nil
	}
	sort.SliceStable(keys, func(i, j int) bool {
		ri := 0.0
		if keys[i].DailyQuotaLimit > 0 {
			ri = float64(keys[i].DailyUsedQuota) / float64(keys[i].DailyQuotaLimit)
		}
		rj := 0.0
		if keys[j].DailyQuotaLimit > 0 {
			rj = float64(keys[j].DailyUsedQuota) / float64(keys[j].DailyQuotaLimit)
		}
		return ri < rj
	})
	return &keys[0]
}

// PickKey 多 key 调度入口：按 multiKeyMode 选择策略返回一个可用 key。
// 无启用 key 或过滤后无可用 key 时返回 error。default 分支回退 pickByPriority。
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

// IncrChannelKeyUsage 原子自增 key 的配额与请求计数，并以 EMA 更新平均 token 数。
// EMA 公式：AvgTokensPerReq = AvgTokensPerReq*0.9 + tokens*0.1。
// 仅在请求成功时调用，保证 key 配额计费幂等（失败请求上游通常未消耗 token，不计入）。
func IncrChannelKeyUsage(keyId int64, tokens int64) {
	err := DB.Model(&ChannelKey{}).Where("id = ?", keyId).Updates(
		map[string]interface{}{
			"daily_used_quota":   gorm.Expr("daily_used_quota + ?", tokens),
			"total_used_quota":   gorm.Expr("total_used_quota + ?", tokens),
			"total_requests":     gorm.Expr("total_requests + ?", 1),
			"avg_tokens_per_req": gorm.Expr("avg_tokens_per_req * 0.9 + ? * 0.1", tokens),
		},
	).Error
	if err != nil {
		logger.SysError("failed to incr channel key usage: " + err.Error())
	}
}

// CoolDownChannelKey 将 key 置为冷却状态，cooled_until = now + cooldownSec。
// 冷却到期后由 filterUsableKeys 自动放行（CooledUntil <= now）。
func CoolDownChannelKey(keyId int64, cooldownSec int64) {
	cooledUntil := time.Now().Unix() + cooldownSec
	err := DB.Model(&ChannelKey{}).Where("id = ?", keyId).Updates(
		map[string]interface{}{
			"status":       KeyStatusCooling,
			"cooled_until": cooledUntil,
		},
	).Error
	if err != nil {
		logger.SysError("failed to cool down channel key: " + err.Error())
	}
}

// DisableChannelKey 将 key 置为指定状态（通常 KeyStatusDisabled，需人工恢复）。
func DisableChannelKey(keyId int64, status int) {
	err := DB.Model(&ChannelKey{}).Where("id = ?", keyId).Update("status", status).Error
	if err != nil {
		logger.SysError("failed to disable channel key: " + err.Error())
	}
}

// MarkChannelKeyExhaustedIfQuota 在配额已耗尽时将 key 标记为 Exhausted。
// 带 condition 乐观锁：仅当 daily_quota_limit>0 且 daily_used_quota>=daily_quota_limit 时更新，
// 避免并发自增导致误标记。
func MarkChannelKeyExhaustedIfQuota(keyId int64) {
	err := DB.Model(&ChannelKey{}).
		Where("id = ? AND daily_quota_limit > 0 AND daily_used_quota >= daily_quota_limit", keyId).
		Update("status", KeyStatusExhausted).Error
	if err != nil {
		logger.SysError("failed to mark channel key exhausted: " + err.Error())
	}
}

// parseNextResetTime 解析 "HH:MM" 规则，计算从 now 起下一个 HH:MM 时刻的 unix 秒。
// rule 为空或解析失败返回 0。例如 rule="00:00" 表示每天 0 点重置。
func parseNextResetTime(rule string, now int64) int64 {
	if rule == "" {
		return 0
	}
	t, err := time.Parse("15:04", rule)
	if err != nil {
		return 0
	}
	nowTime := time.Unix(now, 0)
	next := time.Date(nowTime.Year(), nowTime.Month(), nowTime.Day(), t.Hour(), t.Minute(), 0, 0, nowTime.Location())
	if !next.After(nowTime) {
		next = next.Add(24 * time.Hour)
	}
	return next.Unix()
}

// StartQuotaResetScanner 每 30s 扫描配额耗尽的 key，到期则重置
func StartQuotaResetScanner() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		func() {
			defer func() {
				if r := recover(); r != nil {
					logger.SysError(fmt.Sprintf("quota reset scanner panic: %v", r))
				}
			}()
			now := time.Now().Unix()
			var keys []ChannelKey
			if err := DB.Where("quota_reset_at > 0 AND quota_reset_at <= ? AND status = ?", now, KeyStatusExhausted).Find(&keys).Error; err != nil {
				logger.SysError("quota reset scanner query error: " + err.Error())
				return
			}
			for _, key := range keys {
				updates := map[string]interface{}{
					"daily_used_quota": 0,
					"status":           KeyStatusEnabled,
				}
				// 按 QuotaResetRule 解析下一次重置时刻，rule 为空则不设 QuotaResetAt
				if key.QuotaResetRule != "" {
					nextReset := parseNextResetTime(key.QuotaResetRule, now)
					if nextReset > 0 {
						updates["quota_reset_at"] = nextReset
					}
				}
				if err := DB.Model(&ChannelKey{}).Where("id = ?", key.Id).Updates(updates).Error; err != nil {
					logger.SysError(fmt.Sprintf("quota reset scanner update key %d error: %s", key.Id, err.Error()))
				}
			}
		}()
	}
}

// StartCooldownScanner 每 10s 扫描冷却到期的 key，恢复为启用
func StartCooldownScanner() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		func() {
			defer func() {
				if r := recover(); r != nil {
					logger.SysError(fmt.Sprintf("cooldown scanner panic: %v", r))
				}
			}()
			now := time.Now().Unix()
			result := DB.Model(&ChannelKey{}).Where("cooled_until > 0 AND cooled_until <= ? AND status = ?", now, KeyStatusCooling).Updates(map[string]interface{}{
				"status":       KeyStatusEnabled,
				"cooled_until": 0,
			})
			if result.Error != nil {
				logger.SysError("cooldown scanner update error: " + result.Error.Error())
			}
		}()
	}
}

// StartChannelKeyScanners 启动配额重置与冷却恢复扫描 goroutine
func StartChannelKeyScanners() {
	go StartQuotaResetScanner()
	go StartCooldownScanner()
	logger.SysLog("channel key scanners started")
}

// —— distributor 阶段预过滤：判断渠道是否有至少一个对 model 可用的 key ——
//
// distributor 选渠道时跳过「该 model 全 key 不可用」的多 key 渠道，避免选中后到 relay
// 阶段才发现、浪费一次上游请求。本预过滤只是 hint，非最终裁决：relay 阶段 PickKey 仍为
// 权威，其 all_keys_unavailable 兜底保留。3s TTL 远小于冷却扫描 10s / 配额扫描 30s 粒度，
// breaker 惰性恢复在读时生效，陈旧窗口可接受。

const channelKeyUsableTTL = 3 * time.Second

type usableCacheEntry struct {
	value     bool
	expiredAt time.Time
}

var (
	channelKeyUsableCache   = make(map[string]usableCacheEntry)
	channelKeyUsableCacheMu sync.RWMutex
)

// usableCacheKey 拼接缓存键：channelId:model。model 维度隔离，因 breaker 是三维 channel:key:model。
func usableCacheKey(channelId int, modelName string) string {
	return fmt.Sprintf("%d:%s", channelId, modelName)
}

// HasUsableKey 判断渠道 channelId 是否有至少一个对 model 可用的 key。
// 单 key 兼容模式（MultiKeyModeOff）直接返回 true（无 channel_keys 行，用 Channel.Key）。
// 结果带 3s TTL 缓存，避免高 QPS 下每请求查库。
func HasUsableKey(channelId int, multiKeyMode int, modelName string) bool {
	// 单 key 兼容模式：无 channel_keys 行，用 channel.Key，不参与预过滤
	if multiKeyMode == MultiKeyModeOff {
		return true
	}
	cacheKey := usableCacheKey(channelId, modelName)
	// 命中缓存直接返回
	channelKeyUsableCacheMu.RLock()
	if entry, ok := channelKeyUsableCache[cacheKey]; ok && time.Now().Before(entry.expiredAt) {
		channelKeyUsableCacheMu.RUnlock()
		return entry.value
	}
	channelKeyUsableCacheMu.RUnlock()
	// 未命中：查库 + 五重过滤（复用 filterUsableKeys）
	keys, err := GetEnabledChannelKeys(channelId)
	usable := false
	if err == nil && len(keys) > 0 {
		usable = len(filterUsableKeys(channelId, keys, modelName)) > 0
	}
	// 回填缓存
	channelKeyUsableCacheMu.Lock()
	channelKeyUsableCache[cacheKey] = usableCacheEntry{value: usable, expiredAt: time.Now().Add(channelKeyUsableTTL)}
	channelKeyUsableCacheMu.Unlock()
	return usable
}

// InvalidateChannelKeyUsableCache 清空 usable 预过滤缓存。CRUD 后调用，使手动启用/冷却/禁用近即时生效。
func InvalidateChannelKeyUsableCache() {
	channelKeyUsableCacheMu.Lock()
	channelKeyUsableCache = make(map[string]usableCacheEntry)
	channelKeyUsableCacheMu.Unlock()
}
