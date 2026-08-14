package controller

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"

	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/relay/constant/role"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/adaptor/openai"
	billingratio "github.com/songquanpeng/one-api/relay/billing/ratio"
	"github.com/songquanpeng/one-api/relay/breaker"
	"github.com/songquanpeng/one-api/relay/channeltype"
	"github.com/songquanpeng/one-api/relay/controller/validator"
	"github.com/songquanpeng/one-api/relay/meta"
	relaymodel "github.com/songquanpeng/one-api/relay/model"
	"github.com/songquanpeng/one-api/relay/relaymode"
)

func getAndValidateTextRequest(c *gin.Context, relayMode int) (*relaymodel.GeneralOpenAIRequest, error) {
	textRequest := &relaymodel.GeneralOpenAIRequest{}
	err := common.UnmarshalBodyReusable(c, textRequest)
	if err != nil {
		return nil, err
	}
	if relayMode == relaymode.Moderations && textRequest.Model == "" {
		textRequest.Model = "text-moderation-latest"
	}
	if relayMode == relaymode.Embeddings && textRequest.Model == "" {
		textRequest.Model = c.Param("model")
	}
	err = validator.ValidateTextRequest(textRequest, relayMode)
	if err != nil {
		return nil, err
	}
	return textRequest, nil
}

func getPromptTokens(textRequest *relaymodel.GeneralOpenAIRequest, relayMode int) int {
	switch relayMode {
	case relaymode.ChatCompletions:
		return openai.CountTokenMessages(textRequest.Messages, textRequest.Model)
	case relaymode.Completions:
		return openai.CountTokenInput(textRequest.Prompt, textRequest.Model)
	case relaymode.Embeddings:
		return openai.CountTokenInput(textRequest.Input, textRequest.Model)
	case relaymode.Moderations:
		return openai.CountTokenInput(textRequest.Input, textRequest.Model)
	}
	return 0
}

func getPreConsumedQuota(textRequest *relaymodel.GeneralOpenAIRequest, promptTokens int, ratio float64) int64 {
	preConsumedTokens := config.PreConsumedQuota + int64(promptTokens)
	if textRequest.MaxTokens != 0 {
		preConsumedTokens += int64(textRequest.MaxTokens)
	}
	return int64(float64(preConsumedTokens) * ratio)
}

func preConsumeQuota(ctx context.Context, textRequest *relaymodel.GeneralOpenAIRequest, promptTokens int, ratio float64, meta *meta.Meta) (int64, *relaymodel.ErrorWithStatusCode) {
	preConsumedQuota := getPreConsumedQuota(textRequest, promptTokens, ratio)

	userQuota, err := model.CacheGetUserQuota(ctx, meta.UserId)
	if err != nil {
		return preConsumedQuota, openai.ErrorWrapper(err, "get_user_quota_failed", http.StatusInternalServerError)
	}
	if userQuota-preConsumedQuota < 0 {
		return preConsumedQuota, openai.ErrorWrapper(errors.New("user quota is not enough"), "insufficient_user_quota", http.StatusForbidden)
	}
	err = model.CacheDecreaseUserQuota(meta.UserId, preConsumedQuota)
	if err != nil {
		return preConsumedQuota, openai.ErrorWrapper(err, "decrease_user_quota_failed", http.StatusInternalServerError)
	}
	if userQuota > 100*preConsumedQuota {
		// in this case, we do not pre-consume quota
		// because the user has enough quota
		preConsumedQuota = 0
		logger.Info(ctx, fmt.Sprintf("user %d has enough quota %d, trusted and no need to pre-consume", meta.UserId, userQuota))
	}
	if preConsumedQuota > 0 {
		err := model.PreConsumeTokenQuota(meta.TokenId, preConsumedQuota)
		if err != nil {
			return preConsumedQuota, openai.ErrorWrapper(err, "pre_consume_token_quota_failed", http.StatusForbidden)
		}
	}
	return preConsumedQuota, nil
}

func postConsumeQuota(ctx context.Context, usage *relaymodel.Usage, meta *meta.Meta, textRequest *relaymodel.GeneralOpenAIRequest, ratio float64, preConsumedQuota int64, modelRatio float64, groupRatio float64, systemPromptReset bool) {
	if usage == nil {
		logger.Error(ctx, "usage is nil, which is unexpected")
		return
	}
	// quota 口径与 getUsageQuota 完全一致（单一真相源），保证 key 配额回写与用户/渠道计费同单位。
	quota := getUsageQuota(usage, textRequest.Model, meta.ChannelType, ratio)
	promptTokens := usage.PromptTokens
	completionTokens := usage.CompletionTokens
	// completionRatio 仅供日志展示，已在 getUsageQuota 内参与计费，此处重取仅用于日志文案。
	completionRatio := billingratio.GetCompletionRatio(textRequest.Model, meta.ChannelType)
	quotaDelta := quota - preConsumedQuota
	err := model.PostConsumeTokenQuota(meta.TokenId, quotaDelta)
	if err != nil {
		logger.Error(ctx, "error consuming token remain quota: "+err.Error())
	}
	err = model.CacheUpdateUserQuota(ctx, meta.UserId)
	if err != nil {
		logger.Error(ctx, "error update user quota cache: "+err.Error())
	}
	logContent := fmt.Sprintf("倍率：%.2f × %.2f × %.2f", modelRatio, groupRatio, completionRatio)
	model.RecordConsumeLog(ctx, &model.Log{
		UserId:            meta.UserId,
		ChannelId:         meta.ChannelId,
		ChannelKeyId:      meta.ChannelKeyId,
		PromptTokens:      promptTokens,
		CompletionTokens:  completionTokens,
		ModelName:         textRequest.Model,
		TokenName:         meta.TokenName,
		Quota:             int(quota),
		Content:           logContent,
		IsStream:          meta.IsStream,
		ElapsedTime:       helper.CalcElapsedTime(meta.StartTime),
		SystemPromptReset: systemPromptReset,
	})
	model.UpdateUserUsedQuotaAndRequestCount(meta.UserId, quota)
	model.UpdateChannelUsedQuota(meta.ChannelId, quota)
}

// getUsageQuota 按「prompt + completion×completionRatio」再乘 ratio 算计费 quota，
// 与 postConsumeQuota 口径完全一致。抽出为单一真相源，供 text.go 把「已计费 quota」
// （而非原始 totalTokens）回写给 key 配额，确保 channel_keys.daily_used_quota 与
// 用户/渠道计费、日志 Quota 同单位（修复 text 路径与 image/audio 的单位不一致）。
// ratio=0 时按 0 计（保留原行为，避免除零路径）；prompt+completion=0 时按 0 计
// （此时通常已发生错误，需走 pre-consume 退还，不应记 1）。
func getUsageQuota(usage *relaymodel.Usage, modelName string, channelType int, ratio float64) int64 {
	if usage == nil {
		return 0
	}
	completionRatio := billingratio.GetCompletionRatio(modelName, channelType)
	quota := int64(math.Ceil((float64(usage.PromptTokens) + float64(usage.CompletionTokens)*completionRatio) * ratio))
	if ratio != 0 && quota <= 0 {
		quota = 1
	}
	if usage.PromptTokens+usage.CompletionTokens == 0 {
		quota = 0
	}
	return quota
}

func getMappedModelName(modelName string, mapping map[string]string) (string, bool) {
	if mapping == nil {
		return modelName, false
	}
	mappedModelName := mapping[modelName]
	if mappedModelName != "" {
		return mappedModelName, true
	}
	return modelName, false
}

func isErrorHappened(meta *meta.Meta, resp *http.Response) bool {
	if resp == nil {
		if meta.ChannelType == channeltype.AwsClaude {
			return false
		}
		return true
	}
	if resp.StatusCode != http.StatusOK &&
		// replicate return 201 to create a task
		resp.StatusCode != http.StatusCreated {
		return true
	}
	if meta.ChannelType == channeltype.DeepL {
		// skip stream check for deepl
		return false
	}

	if meta.IsStream && strings.HasPrefix(resp.Header.Get("Content-Type"), "application/json") &&
		// Even if stream mode is enabled, replicate will first return a task info in JSON format,
		// requiring the client to request the stream endpoint in the task info
		meta.ChannelType != channeltype.Replicate {
		return true
	}
	return false
}

func setSystemPrompt(ctx context.Context, request *relaymodel.GeneralOpenAIRequest, prompt string) (reset bool) {
	if prompt == "" {
		return false
	}
	if len(request.Messages) == 0 {
		return false
	}
	if request.Messages[0].Role == role.System {
		request.Messages[0].Content = prompt
		logger.Infof(ctx, "rewrite system prompt")
		return true
	}
	request.Messages = append([]relaymodel.Message{{
		Role:    role.System,
		Content: prompt,
	}}, request.Messages...)
	logger.Infof(ctx, "add system prompt")
	return true
}

// reportKeyResult 向 key 状态机回写本次请求结果。
// 单 key 兼容模式（ChannelKeyId==0）直接 return，不影响老渠道。
// 成功：熔断器 RecordSuccess + 异步自增配额（仅成功请求才扣 key 配额，保证计费幂等）；
// 失败：按状态码分级——401/403 禁用或短冷却兜底、429 冷却×2+MarkExhausted、5xx 熔断计数。
// 冷却秒数与熔断阈值优先读每渠道配置（meta.KeyCooldownSec/KeyFailureThreshold），0 回退全局默认。
// 失败时不自增配额（上游拒绝请求通常未消耗 token）。
// 熔断器统一用 OriginModelName（映射前），与 PickKey→IsOpen 的检查维度一致。
func reportKeyResult(meta *meta.Meta, statusCode int, tokens int64, success bool) {
	if meta.ChannelKeyId == 0 {
		return // 单 key 兼容模式不处理
	}
	if success {
		breaker.GlobalBreaker.RecordSuccess(meta.ChannelId, meta.ChannelKeyId, meta.OriginModelName)
		go model.IncrChannelKeyUsage(int64(meta.ChannelKeyId), tokens)
		return
	}
	// 失败：按状态码分级
	// 每渠道 key 配置优先，0 用全局默认
	cooldownSec := meta.KeyCooldownSec
	if cooldownSec == 0 {
		cooldownSec = config.ChannelKeyCooldownSec
	}
	threshold := meta.KeyFailureThreshold
	if threshold == 0 {
		threshold = config.ChannelKeyFailureThreshold
	}
	switch {
	case statusCode == 401 || statusCode == 403:
		// 鉴权错：自动禁用时永久禁用 key（需人工恢复）；
		// 关闭自动禁用时用配置的冷却秒数兜底退避，避免坏 key 被无限重选
		if config.AutomaticDisableKeyEnabled {
			go model.DisableChannelKey(int64(meta.ChannelKeyId), model.KeyStatusDisabled)
		} else {
			go model.CoolDownChannelKey(int64(meta.ChannelKeyId), int64(cooldownSec))
		}
	case statusCode == 429:
		// 限流：冷却 × 2
		cooldownSec *= 2
		go model.CoolDownChannelKey(int64(meta.ChannelKeyId), int64(cooldownSec))
		go model.MarkChannelKeyExhaustedIfQuota(int64(meta.ChannelKeyId))
	case statusCode/100 == 5:
		// 5xx：熔断计数
		breaker.GlobalBreaker.RecordFailure(meta.ChannelId, meta.ChannelKeyId, meta.OriginModelName, threshold, cooldownSec)
	}
}
