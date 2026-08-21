package controller

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"

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

	// PickKey 内部 filterUsableKeys 会排除 failedIds 里的 key，
	// 避免优先级模式反复选中已失败 key 导致"所有 key 已失败"误报。
	failedIds := getFailedKeyIds(c)
	key, err := dbmodel.PickKey(channelId, multiKeyMode, modelName, systemPrompt, failedIds)
	if err != nil {
		return nil, err
	}
	c.Set(ctxkey.ChannelKeyId, int(key.Id))
	c.Request.Header.Set("Authorization", "Bearer "+key.KeyValue)
	return key, nil
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
		dbmodel.ClearChannelFail(channelId)
		dbmodel.ResetChannelFailCount(channelId)
		return
	}
	lastFailedChannelId := channelId
	channelName := c.GetString(ctxkey.ChannelName)
	group := c.GetString(ctxkey.Group)
	originalModel := c.GetString(ctxkey.OriginalModel)
	go processChannelRelayError(ctx, userId, channelId, channelName, *bizErr)
	// 标记渠道失败冷却，冷却期内 Distribute 和重试都会跳过该渠道
	if shouldRetry(c, bizErr.StatusCode) && config.ChannelFailCooldownSec > 0 {
		dbmodel.MarkChannelFail(channelId, config.ChannelFailCooldownSec)
	}
	// 渠道连续失败自动禁用：达阈值后禁用渠道，需手动启用
	if config.ChannelAutoDisableEnabled && shouldRetry(c, bizErr.StatusCode) {
		failCount := dbmodel.IncChannelFailCount(channelId)
		if failCount >= config.ChannelAutoDisableFailureCount {
			logger.Errorf(ctx, "channel #%d failed %d times consecutively, auto disabling", channelId, failCount)
			dbmodel.UpdateChannelStatusById(channelId, dbmodel.ChannelStatusAutoDisabled)
			dbmodel.ResetChannelFailCount(channelId)
		}
	}
	requestId := c.GetString(helper.RequestIdKey)
	retryTimes := config.RetryTimes
	if !shouldRetry(c, bizErr.StatusCode) {
		logger.Errorf(ctx, "relay error happen, status code is %d, won't retry in this case", bizErr.StatusCode)
		retryTimes = 0
	}
	// key 级重试：多 key 模式下换同渠道可用 key 重试。
	// 仅当 KeyRetryEnabled 且多 key 模式且应重试且流式响应未写出时进入。
	if config.KeyRetryEnabled && c.GetInt(ctxkey.MultiKeyMode) != dbmodel.MultiKeyModeOff &&
		shouldRetryByKey(bizErr.StatusCode, bizErr.Error.Message) && !c.Writer.Written() {
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
				if !shouldRetryByKey(bizErr.StatusCode, bizErr.Error.Message) || c.Writer.Written() {
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
	// 渠道级重试：最多 retryTimes 次实际重试（跳过 lastFailed 不消耗次数）
	retryCount := 0
	consecutiveSkips := 0
	for retryCount < retryTimes {
		// 重试时忽略最高优先级（刚失败的渠道通常是最高优先级），
		// 直接从低优先级渠道里选，避免反复选到刚失败的渠道
		channel, err := dbmodel.CacheGetRandomSatisfiedChannel(group, originalModel, true, tokenChannelIds)
		if err != nil {
			logger.Errorf(ctx, "CacheGetRandomSatisfiedChannel failed: %+v", err)
			break
		}
		logger.Infof(ctx, "using channel #%d to retry (remain times %d)", channel.Id, retryTimes-retryCount)
		if channel.Id == lastFailedChannelId {
			// 跳过刚失败的渠道，不消耗重试次数
			consecutiveSkips++
			if consecutiveSkips > retryTimes {
				break
			}
			continue
		}
		consecutiveSkips = 0
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
			dbmodel.ClearChannelFail(c.GetInt(ctxkey.ChannelId))
			dbmodel.ResetChannelFailCount(c.GetInt(ctxkey.ChannelId))
			return
		}
		channelId := c.GetInt(ctxkey.ChannelId)
		lastFailedChannelId = channelId
		channelName := c.GetString(ctxkey.ChannelName)
		go processChannelRelayError(ctx, userId, channelId, channelName, *bizErr)
		if config.ChannelFailCooldownSec > 0 {
			dbmodel.MarkChannelFail(channelId, config.ChannelFailCooldownSec)
		}
		if config.ChannelAutoDisableEnabled {
			failCount := dbmodel.IncChannelFailCount(channelId)
			if failCount >= config.ChannelAutoDisableFailureCount {
				logger.Errorf(ctx, "channel #%d failed %d times consecutively, auto disabling", channelId, failCount)
				dbmodel.UpdateChannelStatusById(channelId, dbmodel.ChannelStatusAutoDisabled)
				dbmodel.ResetChannelFailCount(channelId)
			}
		}
		retryCount++
	}
	if bizErr != nil {
		if bizErr.StatusCode == http.StatusTooManyRequests {
			bizErr.Error.Message = "当前分组上游负载已饱和，请稍后再试"
		}

		// 写错误日志到数据库，日志页面可见
		errContent := fmt.Sprintf("%d: %s", bizErr.StatusCode, bizErr.Error.Message)
		if len(errContent) > 200 {
			errContent = errContent[:200]
		}
		dbmodel.RecordConsumeLog(ctx, &dbmodel.Log{
			UserId:           userId,
			ChannelId:        lastFailedChannelId,
			ChannelKeyId:     c.GetInt(ctxkey.ChannelKeyId),
			ModelName:        originalModel,
			TokenName:        c.GetString(ctxkey.TokenName),
			Type:             dbmodel.LogTypeError,
			Content:          errContent,
			RequestId:        requestId,
		})

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

// shouldRetryByKey 判断 key 级重试是否应触发。
// 与 shouldRetry 的区别：400 且错误属于预算/配额类时也重试（换 key 可解决）。
// 渠道级重试不使用此函数——换渠道未必能解决 per-key 的预算问题。
func shouldRetryByKey(statusCode int, message string) bool {
	if statusCode == http.StatusBadRequest {
		msg := strings.ToLower(message)
		// 预算/配额/余额类 400：换 key 有意义
		keywords := []string{
			"budget", "quota", "exceeded", "insufficient", "limit", "balance",
			"预算", "额度", "余额", "配额", "超限", "不足",
		}
		for _, kw := range keywords {
			if strings.Contains(msg, kw) {
				return true
			}
		}
		return false
	}
	// 非 400 沿用原逻辑：5xx/429/其他可重试状态码
	return shouldRetry(nil, statusCode)
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
