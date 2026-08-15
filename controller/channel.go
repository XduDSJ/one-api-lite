package controller

import (
	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/breaker"
	"net/http"
	"strconv"
	"strings"
)

// channelKeyRequest 包装渠道请求，额外接收 keys 数组（多 key 模式）
type channelKeyRequest struct {
	model.Channel
	Keys []channelKeyItem `json:"keys"`
}

// channelKeyItem 前端传的 key 子项
type channelKeyItem struct {
	Id              int64  `json:"id"`         // 编辑时回传，0 表示新增
	KeyValue        string `json:"key_value"`
	Remark          string `json:"remark"`
	Priority        int    `json:"priority"`
	DailyQuotaLimit int64  `json:"daily_quota_limit"`
	QuotaResetRule  string `json:"quota_reset_rule"`
}

func GetAllChannels(c *gin.Context) {
	p, _ := strconv.Atoi(c.Query("p"))
	if p < 0 {
		p = 0
	}
	channels, err := model.GetAllChannels(p*config.ItemsPerPage, config.ItemsPerPage, "limited")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    channels,
	})
	return
}

func SearchChannels(c *gin.Context) {
	keyword := c.Query("keyword")
	channels, err := model.SearchChannels(keyword)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    channels,
	})
	return
}

func GetChannel(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	channel, err := model.GetChannelById(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	// 多 key 模式时附带 channel_keys 供前端编辑展示
	var keys []model.ChannelKey
	if channel.MultiKeyMode != 0 {
		keys, err = model.GetEnabledChannelKeys(id)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "获取渠道密钥失败: " + err.Error(),
			})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    channel,
		"keys":    keys,
	})
	return
}

func AddChannel(c *gin.Context) {
	req := channelKeyRequest{}
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	channel := req.Channel
	channel.CreatedTime = helper.GetTimestamp()
	// 多 key 模式：插入单渠道 + 批量插入 channel_keys
	if channel.MultiKeyMode != model.MultiKeyModeOff && len(req.Keys) > 0 {
		channel.Key = req.Keys[0].KeyValue // 保留首个 key 到 channel.Key 兼容老逻辑
		err = channel.Insert()
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}
		keys := make([]model.ChannelKey, 0, len(req.Keys))
		for _, k := range req.Keys {
			if k.KeyValue == "" {
				continue
			}
			keys = append(keys, model.ChannelKey{
				ChannelId:       channel.Id,
				KeyValue:        k.KeyValue,
				Remark:          k.Remark,
				Status:          model.KeyStatusEnabled,
				Priority:        k.Priority,
				DailyQuotaLimit: k.DailyQuotaLimit,
				QuotaResetRule:  k.QuotaResetRule,
				CreatedTime:     helper.GetTimestamp(),
				UpdatedTime:     helper.GetTimestamp(),
			})
		}
		err = model.BatchInsertChannelKeys(keys)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}
	} else {
		// 单 key 兼容模式：保留原有 \n 拆分批量插入逻辑
		channelKeys := strings.Split(channel.Key, "\n")
		channels := make([]model.Channel, 0, len(channelKeys))
		for _, key := range channelKeys {
			if key == "" {
				continue
			}
			localChannel := channel
			localChannel.Key = key
			channels = append(channels, localChannel)
		}
		err = model.BatchInsertChannels(channels)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}
	}
	model.InvalidateChannelCache(channel.Id)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func DeleteChannel(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	channel := model.Channel{Id: id}
	err := channel.Delete()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	model.InvalidateChannelCache(id)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func DeleteDisabledChannel(c *gin.Context) {
	rows, err := model.DeleteDisabledChannel()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    rows,
	})
	return
}

func UpdateChannel(c *gin.Context) {
	req := channelKeyRequest{}
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	channel := req.Channel
	err = channel.Update()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	// 多 key 模式：按 key_value 做 diff 增量更新，保留已存在 key 的 Id 和运行时字段
	// （DailyUsedQuota/CooledUntil/TotalUsedQuota/TotalRequests 等），避免先删后插重置运行时状态
	if channel.MultiKeyMode != model.MultiKeyModeOff {
		existingKeys, err := model.GetEnabledChannelKeys(channel.Id)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}
		existingMap := make(map[int64]*model.ChannelKey, len(existingKeys))
		for i := range existingKeys {
			existingMap[existingKeys[i].Id] = &existingKeys[i]
		}
		newKeys := make([]model.ChannelKey, 0)
		now := helper.GetTimestamp()
		for _, k := range req.Keys {
			if k.KeyValue == "" {
				continue
			}
			if k.Id != 0 {
				if existing, ok := existingMap[k.Id]; ok {
					// 复用：保留 Id 和运行时字段，只更新可编辑字段
					existing.KeyValue = k.KeyValue
					existing.Remark = k.Remark
					existing.Priority = k.Priority
					existing.DailyQuotaLimit = k.DailyQuotaLimit
					existing.QuotaResetRule = k.QuotaResetRule
					existing.Status = model.KeyStatusEnabled
					existing.UpdatedTime = now
					err = model.UpdateChannelKey(existing)
					if err != nil {
						c.JSON(http.StatusOK, gin.H{
							"success": false,
							"message": err.Error(),
						})
						return
					}
					delete(existingMap, k.Id) // 已处理
					continue
				}
			}
			// 新增（id=0 或 id 未匹配到现有记录）
			newKeys = append(newKeys, model.ChannelKey{
				ChannelId:       channel.Id,
				KeyValue:        k.KeyValue,
				Remark:          k.Remark,
				Status:          model.KeyStatusEnabled,
				Priority:        k.Priority,
				DailyQuotaLimit: k.DailyQuotaLimit,
				QuotaResetRule:  k.QuotaResetRule,
				CreatedTime:     now,
				UpdatedTime:     now,
			})
		}
		// 剩余 existingMap 中的 key：前端不再传，硬删除（不再保留历史统计，避免编辑时重复显示）
		for _, existing := range existingMap {
			err = model.DeleteChannelKeyById(existing.Id)
			if err != nil {
				c.JSON(http.StatusOK, gin.H{
					"success": false,
					"message": err.Error(),
				})
				return
			}
		}
		// 批量插入新增 key
		if len(newKeys) > 0 {
			err = model.BatchInsertChannelKeys(newKeys)
			if err != nil {
				c.JSON(http.StatusOK, gin.H{
					"success": false,
					"message": err.Error(),
				})
				return
			}
		}
	}
	model.InvalidateChannelCache(channel.Id)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    channel,
	})
	return
}

// EnableChannelKey 手动启用某个 key（重置冷却/禁用/熔断状态）
func EnableChannelKey(c *gin.Context) {
	channelId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	keyId, err := strconv.ParseInt(c.Param("keyId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	// 查询 key 确认存在且属于该渠道
	keys, err := model.GetChannelKeysByChannelId(channelId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	var targetKey *model.ChannelKey
	for i := range keys {
		if keys[i].Id == keyId {
			targetKey = &keys[i]
			break
		}
	}
	if targetKey == nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "key 不存在",
		})
		return
	}
	targetKey.Status = model.KeyStatusEnabled
	targetKey.CooledUntil = 0
	targetKey.UpdatedTime = helper.GetTimestamp()
	err = model.UpdateChannelKey(targetKey)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	// 范围重置该 key 在所有 model 上的熔断状态，使其立即可被调度
	breaker.GlobalBreaker.ResetByKey(channelId, int(keyId))
	// 失效 usable 预过滤缓存，使该渠道在 distributor 阶段立即可被选中
	model.InvalidateChannelCache(channelId)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

// GetChannelKeysStatus 查询某渠道所有 key 的状态摘要
func GetChannelKeysStatus(c *gin.Context) {
	channelId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	keys, err := model.GetEnabledChannelKeys(channelId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	// 每条 key 附带派生的 quota_state（active/low_quota/exhausted/cooling/disabled），
	// 让 UI 徽章反映「软预判已跳过→已转移」等运行态，而非仅看 status 字段。
	type keyWithState struct {
		model.ChannelKey
		QuotaState string `json:"quota_state"`
	}
	data := make([]keyWithState, 0, len(keys))
	for i := range keys {
		data = append(data, keyWithState{
			ChannelKey: keys[i],
			QuotaState: keys[i].QuotaState(),
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    data,
	})
	return
}

// GetAccessibleChannels 返回所有启用渠道的精简信息（id + name），供普通用户在令牌编辑页选择渠道子集。
// 不含 key/base_url 等敏感字段。
func GetAccessibleChannels(c *gin.Context) {
	type accessibleChannel struct {
		Id   int    `json:"id"`
		Name string `json:"name"`
	}
	var channels []accessibleChannel
	err := model.DB.Model(&model.Channel{}).Select("id, name").Where("status = ?", model.ChannelStatusEnabled).Find(&channels).Error
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    channels,
	})
	return
}
