package model

import (
	"fmt"
	"hash/fnv"
	"math/rand"
	"sort"
	"time"

	"github.com/songquanpeng/one-api/relay/breaker"
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
