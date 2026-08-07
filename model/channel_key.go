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
