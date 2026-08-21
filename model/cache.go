package model

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"math/rand"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	TokenCacheSeconds         = config.SyncFrequency
	UserId2GroupCacheSeconds  = config.SyncFrequency
	UserId2QuotaCacheSeconds  = config.SyncFrequency
	UserId2StatusCacheSeconds = config.SyncFrequency
	GroupModelsCacheSeconds   = config.SyncFrequency
)

// 渠道级失败冷却缓存（纯内存，不落库）
var channelFailCacheMu sync.RWMutex
var channelFailCache = make(map[int]int64) // channelId -> 冷却到期时间(unix秒)

// MarkChannelFail 标记渠道失败，进入冷却期
func MarkChannelFail(channelId int, cooldownSec int) {
	if cooldownSec <= 0 {
		return
	}
	channelFailCacheMu.Lock()
	defer channelFailCacheMu.Unlock()
	channelFailCache[channelId] = time.Now().Unix() + int64(cooldownSec)
}

// IsChannelCooling 判断渠道是否在冷却期内
func IsChannelCooling(channelId int) bool {
	channelFailCacheMu.RLock()
	defer channelFailCacheMu.RUnlock()
	expire, ok := channelFailCache[channelId]
	if !ok {
		return false
	}
	return time.Now().Unix() < expire
}

// ClearChannelFail 清除渠道冷却（成功时调用）
func ClearChannelFail(channelId int) {
	channelFailCacheMu.Lock()
	defer channelFailCacheMu.Unlock()
	delete(channelFailCache, channelId)
}

// 渠道连续失败计数器（纯内存，不落库）
var channelFailCountMu sync.Mutex
var channelFailCount = make(map[int]int)

// IncChannelFailCount 连续失败+1，返回当前连续失败次数
func IncChannelFailCount(channelId int) int {
	channelFailCountMu.Lock()
	defer channelFailCountMu.Unlock()
	channelFailCount[channelId]++
	return channelFailCount[channelId]
}

// ResetChannelFailCount 重置连续失败计数（成功时调用）
func ResetChannelFailCount(channelId int) {
	channelFailCountMu.Lock()
	defer channelFailCountMu.Unlock()
	delete(channelFailCount, channelId)
}

func CacheGetTokenByKey(key string) (*Token, error) {
	keyCol := "`key`"
	if common.UsingPostgreSQL {
		keyCol = `"key"`
	}
	var token Token
	if !common.RedisEnabled {
		err := DB.Where(keyCol+" = ?", key).First(&token).Error
		return &token, err
	}
	tokenObjectString, err := common.RedisGet(fmt.Sprintf("token:%s", key))
	if err != nil {
		err := DB.Where(keyCol+" = ?", key).First(&token).Error
		if err != nil {
			return nil, err
		}
		jsonBytes, err := json.Marshal(token)
		if err != nil {
			return nil, err
		}
		err = common.RedisSet(fmt.Sprintf("token:%s", key), string(jsonBytes), time.Duration(TokenCacheSeconds)*time.Second)
		if err != nil {
			logger.SysError("Redis set token error: " + err.Error())
		}
		return &token, nil
	}
	err = json.Unmarshal([]byte(tokenObjectString), &token)
	return &token, err
}

func CacheGetUserGroup(id int) (group string, err error) {
	if !common.RedisEnabled {
		return GetUserGroup(id)
	}
	group, err = common.RedisGet(fmt.Sprintf("user_group:%d", id))
	if err != nil {
		group, err = GetUserGroup(id)
		if err != nil {
			return "", err
		}
		err = common.RedisSet(fmt.Sprintf("user_group:%d", id), group, time.Duration(UserId2GroupCacheSeconds)*time.Second)
		if err != nil {
			logger.SysError("Redis set user group error: " + err.Error())
		}
	}
	return group, err
}

func fetchAndUpdateUserQuota(ctx context.Context, id int) (quota int64, err error) {
	quota, err = GetUserQuota(id)
	if err != nil {
		return 0, err
	}
	err = common.RedisSet(fmt.Sprintf("user_quota:%d", id), fmt.Sprintf("%d", quota), time.Duration(UserId2QuotaCacheSeconds)*time.Second)
	if err != nil {
		logger.Error(ctx, "Redis set user quota error: "+err.Error())
	}
	return
}

func CacheGetUserQuota(ctx context.Context, id int) (quota int64, err error) {
	if !common.RedisEnabled {
		return GetUserQuota(id)
	}
	quotaString, err := common.RedisGet(fmt.Sprintf("user_quota:%d", id))
	if err != nil {
		return fetchAndUpdateUserQuota(ctx, id)
	}
	quota, err = strconv.ParseInt(quotaString, 10, 64)
	if err != nil {
		return 0, nil
	}
	if quota <= config.PreConsumedQuota { // when user's quota is less than pre-consumed quota, we need to fetch from db
		logger.Infof(ctx, "user %d's cached quota is too low: %d, refreshing from db", quota, id)
		return fetchAndUpdateUserQuota(ctx, id)
	}
	return quota, nil
}

func CacheUpdateUserQuota(ctx context.Context, id int) error {
	if !common.RedisEnabled {
		return nil
	}
	quota, err := CacheGetUserQuota(ctx, id)
	if err != nil {
		return err
	}
	err = common.RedisSet(fmt.Sprintf("user_quota:%d", id), fmt.Sprintf("%d", quota), time.Duration(UserId2QuotaCacheSeconds)*time.Second)
	return err
}

func CacheDecreaseUserQuota(id int, quota int64) error {
	if !common.RedisEnabled {
		return nil
	}
	err := common.RedisDecrease(fmt.Sprintf("user_quota:%d", id), int64(quota))
	return err
}

func CacheIsUserEnabled(userId int) (bool, error) {
	if !common.RedisEnabled {
		return IsUserEnabled(userId)
	}
	enabled, err := common.RedisGet(fmt.Sprintf("user_enabled:%d", userId))
	if err == nil {
		return enabled == "1", nil
	}

	userEnabled, err := IsUserEnabled(userId)
	if err != nil {
		return false, err
	}
	enabled = "0"
	if userEnabled {
		enabled = "1"
	}
	err = common.RedisSet(fmt.Sprintf("user_enabled:%d", userId), enabled, time.Duration(UserId2StatusCacheSeconds)*time.Second)
	if err != nil {
		logger.SysError("Redis set user enabled error: " + err.Error())
	}
	return userEnabled, err
}

func CacheGetGroupModels(ctx context.Context, group string) ([]string, error) {
	if !common.RedisEnabled {
		return GetGroupModels(ctx, group)
	}
	modelsStr, err := common.RedisGet(fmt.Sprintf("group_models:%s", group))
	if err == nil {
		return strings.Split(modelsStr, ","), nil
	}
	models, err := GetGroupModels(ctx, group)
	if err != nil {
		return nil, err
	}
	err = common.RedisSet(fmt.Sprintf("group_models:%s", group), strings.Join(models, ","), time.Duration(GroupModelsCacheSeconds)*time.Second)
	if err != nil {
		logger.SysError("Redis set group models error: " + err.Error())
	}
	return models, nil
}

var group2model2channels map[string]map[string][]*Channel
var channelSyncLock sync.RWMutex

func InitChannelCache() {
	newChannelId2channel := make(map[int]*Channel)
	var channels []*Channel
	DB.Where("status = ?", ChannelStatusEnabled).Find(&channels)
	for _, channel := range channels {
		newChannelId2channel[channel.Id] = channel
	}
	var abilities []*Ability
	DB.Find(&abilities)
	groups := make(map[string]bool)
	for _, ability := range abilities {
		groups[ability.Group] = true
	}
	newGroup2model2channels := make(map[string]map[string][]*Channel)
	for group := range groups {
		newGroup2model2channels[group] = make(map[string][]*Channel)
	}
	for _, channel := range channels {
		groups := strings.Split(channel.Group, ",")
		for _, group := range groups {
			models := strings.Split(channel.Models, ",")
			for _, model := range models {
				if _, ok := newGroup2model2channels[group][model]; !ok {
					newGroup2model2channels[group][model] = make([]*Channel, 0)
				}
				newGroup2model2channels[group][model] = append(newGroup2model2channels[group][model], channel)
			}
		}
	}

	// sort by priority
	for group, model2channels := range newGroup2model2channels {
		for model, channels := range model2channels {
			sort.Slice(channels, func(i, j int) bool {
				return channels[i].GetPriority() > channels[j].GetPriority()
			})
			newGroup2model2channels[group][model] = channels
		}
	}

	channelSyncLock.Lock()
	group2model2channels = newGroup2model2channels
	channelSyncLock.Unlock()
	logger.SysLog("channels synced from database")
}

func SyncChannelCache(frequency int) {
	for {
		time.Sleep(time.Duration(frequency) * time.Second)
		logger.SysLog("syncing channels from database")
		InitChannelCache()
	}
}

func CacheGetRandomSatisfiedChannel(group string, model string, ignoreFirstPriority bool, channelIds []int) (*Channel, error) {
	if !config.MemoryCacheEnabled {
		return GetRandomSatisfiedChannel(group, model, ignoreFirstPriority, channelIds)
	}
	channelSyncLock.RLock()
	channels := group2model2channels[group][model]
	if len(channels) == 0 {
		channelSyncLock.RUnlock()
		return nil, errors.New("channel not found")
	}
	endIdx := len(channels)
	// choose by priority
	firstChannel := channels[0]
	if firstChannel.GetPriority() > 0 {
		for i := range channels {
			if channels[i].GetPriority() != firstChannel.GetPriority() {
				endIdx = i
				break
			}
		}
	}
	// 浅拷贝候选区间后立即释放读锁，避免持锁跨 DB 查询（HasUsableKey 可能查 channel_keys）。
	// []*Channel 是指针切片，浅拷贝只复制指针，不复制底层 Channel 对象，安全。
	var candidates []*Channel
	if ignoreFirstPriority {
		if endIdx < len(channels) { // which means there are more than one priority
			candidates = append(candidates, channels[endIdx:]...)
		}
	} else {
		candidates = append(candidates, channels[:endIdx]...)
	}
	channelSyncLock.RUnlock()

	// 渠道子集白名单 + 多 key 预过滤：channelIds 非空时先按 ch.Id 过滤（白名单短路，
	// 避免无谓的 HasUsableKey 查库），再跳过「该 model 全 key 不可用」的渠道。
	// 同时跳过处于失败冷却期的渠道（ChannelFailCooldownSec 控制）
	var usable []*Channel
	for _, ch := range candidates {
		if len(channelIds) > 0 && !containsInt(ch.Id, channelIds) {
			continue
		}
		if IsChannelCooling(ch.Id) {
			continue
		}
		if HasUsableKey(ch.Id, ch.MultiKeyMode, model) {
			usable = append(usable, ch)
		}
	}
	// 普通路径下顶级优先级全死：降级到低优先级尾，避免直接报「无渠道」
	if len(usable) == 0 && !ignoreFirstPriority && endIdx < len(channels) {
		channelSyncLock.RLock()
		lowTail := append([]*Channel(nil), channels[endIdx:]...)
		channelSyncLock.RUnlock()
		for _, ch := range lowTail {
			if len(channelIds) > 0 && !containsInt(ch.Id, channelIds) {
				continue
			}
			if IsChannelCooling(ch.Id) {
				continue
			}
			if HasUsableKey(ch.Id, ch.MultiKeyMode, model) {
				usable = append(usable, ch)
			}
		}
	}
	if len(usable) == 0 {
		// 所有候选渠道的 key 预过滤都失败（熔断/冷却/配额耗尽）。
		// 不直接拒绝，降级返回最高优先级候选渠道，让 relay 阶段尝试——
		// relay 失败后重试逻辑会切换到其他渠道，避免「有渠道但被预过滤拦截」的假性 503。
		if len(candidates) > 0 {
			return candidates[0], nil
		}
		return nil, errors.New("no channel with usable key")
	}
	return usable[rand.Intn(len(usable))], nil
}

// containsInt 判断 id 是否在 ids 切片中。
func containsInt(id int, ids []int) bool {
	for _, v := range ids {
		if v == id {
			return true
		}
	}
	return false
}

// InvalidateChannelCache 失效渠道缓存，CRUD 后主动调用以触发重新同步
func InvalidateChannelCache(channelId int) {
	// usable 预过滤缓存无论是否启用内存缓存都应清空（手动启用 key 等需近即时生效）
	InvalidateChannelKeyUsableCache()
	if !config.MemoryCacheEnabled {
		return
	}
	// 主动重新同步整个渠道缓存（简单实现，保证一致性）
	go InitChannelCache()
}

// WarnLegacyMultiKeyChannels 启动时检测老格式 \n 多 key 渠道并打 warning
func WarnLegacyMultiKeyChannels() {
	keyCol := "`key`"
	if common.UsingPostgreSQL {
		keyCol = `"key"`
	}
	var count int64
	DB.Model(&Channel{}).Where(keyCol + " LIKE ?", "%\n%").Count(&count)
	if count > 0 {
		logger.SysWarn(fmt.Sprintf("检测到 %d 个老格式多 key 渠道（key 字段含 \\n），建议重建为多 key 模式以使用配额调度与故障转移", count))
	}
}
