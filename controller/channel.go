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
	channel, err := model.GetChannelById(id, false)
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
		"data":    channel,
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
	// 多 key 模式：同步增删 channel_keys（先删后插，保证一致性）
	if channel.MultiKeyMode != model.MultiKeyModeOff && len(req.Keys) > 0 {
		err = model.DeleteChannelKeysByChannelId(channel.Id)
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
	// 重置该渠道该 key 的所有 model 熔断状态（model 传空串，Reset 按 channelId+keyId 删所有 model entry）
	breaker.GlobalBreaker.Reset(channelId, int(keyId), "")
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
	keys, err := model.GetChannelKeysByChannelId(channelId)
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
		"data":    keys,
	})
	return
}
