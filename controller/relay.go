package controller

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/middleware"
	dbmodel "github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/monitor"
	"github.com/songquanpeng/one-api/relay/controller"
	"github.com/songquanpeng/one-api/relay/model"
	"github.com/songquanpeng/one-api/relay/relaymode"
)

// https://platform.openai.com/docs/api-reference/chat

// pickKeyAndInject 多 key 模式下从 ctx 读取 channelId/multiKeyMode/model/systemPrompt，
// 调 model.PickKey 选 key 并注入 Authorization header。
// 单 key 模式（MultiKeyMode==0）直接返回 nil, nil 不处理。
// 重试时通过 ctxkey.FailedKeyIds 排除已失败 key：循环调用 PickKey 直到返回非失败 key 或达上限。
func pickKeyAndInject(c *gin.Context) (*dbmodel.ChannelKey, error) {
	channelId := c.GetInt(ctxkey.ChannelId)
	multiKeyMode := c.GetInt(ctxkey.MultiKeyMode)
	if multiKeyMode == dbmodel.MultiKeyModeOff {
		return nil, nil
	}
	modelName := c.GetString(ctxkey.RequestModel)
	systemPrompt := c.GetString(ctxkey.SystemPrompt)

	// 查询启用 key 总数，作为循环上限（避免 PickKey 反复选中已失败 key）
	keys, err := dbmodel.GetEnabledChannelKeys(channelId)
	if err != nil {
		return nil, err
	}
	if len(keys) == 0 {
		return nil, fmt.Errorf("渠道 %d 无可用 key", channelId)
	}

	failedIds := getFailedKeyIds(c)
	for i := 0; i < len(keys); i++ {
		key, err := dbmodel.PickKey(channelId, multiKeyMode, modelName, systemPrompt)
		if err != nil {
			return nil, err
		}
		if !containsInt(failedIds, int(key.Id)) {
			c.Set(ctxkey.ChannelKeyId, int(key.Id))
			c.Request.Header.Set("Authorization", "Bearer "+key.KeyValue)
			return key, nil
		}
	}
	return nil, fmt.Errorf("渠道 %d 所有 key 已失败或不可用", channelId)
}

// getFailedKeyIds 从 ctx 读取 key 级重试已失败 key id 列表
func getFailedKeyIds(c *gin.Context) []int {
	val, ok := c.Get(ctxkey.FailedKeyIds)
	if !ok {
		return nil
	}
	ids, ok := val.([]int)
	if !ok {
		return nil
	}
	return ids
}

// addFailedKeyId 把 key id 加入失败列表
func addFailedKeyId(c *gin.Context, keyId int) {
	ids := getFailedKeyIds(c)
	c.Set(ctxkey.FailedKeyIds, append(ids, keyId))
}

func containsInt(ids []int, id int) bool {
	for _, v := range ids {
		if v == id {
			return true
		}
	}
	return false
}

func relayHelper(c *gin.Context, relayMode int) *model.ErrorWithStatusCode {
	var err *model.ErrorWithStatusCode
	switch relayMode {
	case relaymode.ImagesGenerations:
		err = controller.RelayImageHelper(c, relayMode)
	case relaymode.AudioSpeech:
		fallthrough
	case relaymode.AudioTranslation:
		fallthrough
	case relaymode.AudioTranscription:
		err = controller.RelayAudioHelper(c, relayMode)
	case relaymode.Proxy:
		err = controller.RelayProxyHelper(c, relayMode)
	case relaymode.Rerank:
		err = controller.RelayRerankHelper(c)
	default:
		err = controller.RelayTextHelper(c)
	}
	return err
}

func Relay(c *gin.Context) {
	ctx := c.Request.Context()
	relayMode := relaymode.GetByPath(c.Request.URL.Path)
	if config.DebugEnabled {
		requestBody, _ := common.GetRequestBody(c)
		logger.Debugf(ctx, "request body: %s", string(requestBody))
	}
	channelId := c.GetInt(ctxkey.ChannelId)
	userId := c.GetInt(ctxkey.Id)
	// 多 key 模式：在 relayHelper 之前 PickKey 注入 Authorization；
	// 单 key 模式 pickKeyAndInject 返回 nil, nil 不处理（Authorization 已由 distributor 注入）。
	// 此处统一注入覆盖所有 relaymode（text/image/audio/rerank/proxy）。
	if _, err := pickKeyAndInject(c); err != nil {
		bizErr := &model.ErrorWithStatusCode{
			StatusCode: http.StatusServiceUnavailable,
			Error: model.Error{
				Message: "渠道所有 key 不可用",
				Type:    "one_api_error",
				Code:    "all_keys_unavailable",
			},
		}
		requestId := c.GetString(helper.RequestIdKey)
		bizErr.Error.Message = helper.MessageWithRequestId(bizErr.Error.Message, requestId)
		c.JSON(bizErr.StatusCode, gin.H{
			"error": bizErr.Error,
		})
		return
	}
	bizErr := relayHelper(c, relayMode)
	if bizErr == nil {
		monitor.Emit(channelId, true)
		return
	}
	lastFailedChannelId := channelId
	channelName := c.GetString(ctxkey.ChannelName)
	group := c.GetString(ctxkey.Group)
	originalModel := c.GetString(ctxkey.OriginalModel)
	go processChannelRelayError(ctx, userId, channelId, channelName, *bizErr)
	requestId := c.GetString(helper.RequestIdKey)
	retryTimes := config.RetryTimes
	if !shouldRetry(c, bizErr.StatusCode) {
		logger.Errorf(ctx, "relay error happen, status code is %d, won't retry in this case", bizErr.StatusCode)
		retryTimes = 0
	}
	// key 级重试：多 key 模式下换同渠道可用 key 重试。
	// 仅当 KeyRetryEnabled 且多 key 模式且应重试且流式响应未写出时进入。
	if config.KeyRetryEnabled && c.GetInt(ctxkey.MultiKeyMode) != dbmodel.MultiKeyModeOff &&
		shouldRetry(c, bizErr.StatusCode) && !c.Writer.Written() {
		if failedKeyId := c.GetInt(ctxkey.ChannelKeyId); failedKeyId != 0 {
			addFailedKeyId(c, failedKeyId)
		}
		// 循环上限 len(keys)-1（首个 key 已失败，剩余可重试）
		if keys, err := dbmodel.GetEnabledChannelKeys(channelId); err == nil && len(keys) > 1 {
			maxKeyRetry := len(keys) - 1
			for i := 0; i < maxKeyRetry; i++ {
				key, pickErr := pickKeyAndInject(c)
				if pickErr != nil {
					logger.Infof(ctx, "key 级重试：无可用 key，落入渠道级重试: %v", pickErr)
					break
				}
				logger.Infof(ctx, "key 级重试：使用 key #%d 重试 (remain %d)", key.Id, maxKeyRetry-i-1)
				requestBody, _ := common.GetRequestBody(c)
				c.Request.Body = io.NopCloser(bytes.NewBuffer(requestBody))
				bizErr = relayHelper(c, relayMode)
				if bizErr == nil {
					return
				}
				addFailedKeyId(c, int(key.Id))
				channelId = c.GetInt(ctxkey.ChannelId)
				channelName = c.GetString(ctxkey.ChannelName)
				// key 级重试不调 processChannelRelayError——per-key 错误不应禁用整渠道。
				// per-key 的禁用/冷却/熔断已由 reportKeyResult 在各 relay controller 内处理。
				logger.Errorf(ctx, "key 级重试失败 (channel id %d, key id %d): %s", channelId, key.Id, bizErr.Error.Message)
				if !shouldRetry(c, bizErr.StatusCode) || c.Writer.Written() {
					break
				}
			}
		}
	}
	// 令牌渠道子集白名单：从 ctx 取一次，重试循环内持续生效（Context 跨重试持久）
	var tokenChannelIds []int
	if val, ok := c.Get(ctxkey.ChannelIds); ok {
		tokenChannelIds, _ = val.([]int)
	}
	for i := retryTimes; i > 0; i-- {
		channel, err := dbmodel.CacheGetRandomSatisfiedChannel(group, originalModel, i != retryTimes, tokenChannelIds)
		if err != nil {
			logger.Errorf(ctx, "CacheGetRandomSatisfiedChannel failed: %+v", err)
			break
		}
		logger.Infof(ctx, "using channel #%d to retry (remain times %d)", channel.Id, i)
		if channel.Id == lastFailedChannelId {
			continue
		}
		middleware.SetupContextForSelectedChannel(c, channel, originalModel)
		// 换渠道后清空 FailedKeyIds，并对多 key 渠道重新 PickKey 注入
		c.Set(ctxkey.FailedKeyIds, []int{})
		if _, err := pickKeyAndInject(c); err != nil {
			logger.Infof(ctx, "渠道 #%d key 不可用，跳过: %v", channel.Id, err)
			continue
		}
		requestBody, err := common.GetRequestBody(c)
		c.Request.Body = io.NopCloser(bytes.NewBuffer(requestBody))
		bizErr = relayHelper(c, relayMode)
		if bizErr == nil {
			return
		}
		channelId := c.GetInt(ctxkey.ChannelId)
		lastFailedChannelId = channelId
		channelName := c.GetString(ctxkey.ChannelName)
		go processChannelRelayError(ctx, userId, channelId, channelName, *bizErr)
	}
	if bizErr != nil {
		if bizErr.StatusCode == http.StatusTooManyRequests {
			bizErr.Error.Message = "当前分组上游负载已饱和，请稍后再试"
		}

		// BUG: bizErr is in race condition
		bizErr.Error.Message = helper.MessageWithRequestId(bizErr.Error.Message, requestId)
		c.JSON(bizErr.StatusCode, gin.H{
			"error": bizErr.Error,
		})
	}
}

func shouldRetry(c *gin.Context, statusCode int) bool {
	if _, ok := c.Get(ctxkey.SpecificChannelId); ok {
		return false
	}
	if statusCode == http.StatusTooManyRequests {
		return true
	}
	if statusCode/100 == 5 {
		return true
	}
	if statusCode == http.StatusBadRequest {
		return false
	}
	if statusCode/100 == 2 {
		return false
	}
	return true
}

func processChannelRelayError(ctx context.Context, userId int, channelId int, channelName string, err model.ErrorWithStatusCode) {
	logger.Errorf(ctx, "relay error (channel id %d, user id: %d): %s", channelId, userId, err.Message)
	// https://platform.openai.com/docs/guides/error-codes/api-errors
	if monitor.ShouldDisableChannel(&err.Error, err.StatusCode) {
		monitor.DisableChannel(channelId, channelName, err.Message)
	} else {
		monitor.Emit(channelId, false)
	}
}

func RelayNotImplemented(c *gin.Context) {
	err := model.Error{
		Message: "API not implemented",
		Type:    "one_api_error",
		Param:   "",
		Code:    "api_not_implemented",
	}
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": err,
	})
}

func RelayNotFound(c *gin.Context) {
	err := model.Error{
		Message: fmt.Sprintf("Invalid URL (%s %s)", c.Request.Method, c.Request.URL.Path),
		Type:    "invalid_request_error",
		Param:   "",
		Code:    "",
	}
	c.JSON(http.StatusNotFound, gin.H{
		"error": err,
	})
}
