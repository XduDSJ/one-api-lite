package controller

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
)

// overviewResponse 总览仪表盘响应结构
type overviewResponse struct {
	Summary             summaryData             `json:"summary"`
	DailyTrend          []*model.LogDailyStat   `json:"daily_trend"`
	ModelDistribution   []*model.LogModelStat   `json:"model_distribution"`
	ChannelDistribution []*model.LogChannelStat `json:"channel_distribution"`
}

// summaryData 汇总数据
type summaryData struct {
	TotalRequests   int64 `json:"total_requests"`
	TotalTokens     int64 `json:"total_tokens"`
	TotalUsers      int64 `json:"total_users"`
	TotalChannels   int64 `json:"total_channels"`
	EnabledChannels int64 `json:"enabled_channels"`
	TotalTokenCount int64 `json:"total_token_count"`
}

// GetOverviewDashboard 管理员总览仪表盘接口
// 返回最近 7 天的消费趋势、模型分布、渠道分布及全局汇总数据
func GetOverviewDashboard(c *gin.Context) {
	now := time.Now()
	startOfDay := now.Truncate(24 * time.Hour).AddDate(0, 0, -6).Unix()
	endOfDay := now.Truncate(24 * time.Hour).Add(24*time.Hour - time.Second).Unix()

	dailyTrend, err := model.SearchLogsByDayAll(int(startOfDay), int(endOfDay))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取趋势数据失败: " + err.Error()})
		return
	}

	modelDist, err := model.SearchLogsByModelAll(int(startOfDay), int(endOfDay))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取模型分布失败: " + err.Error()})
		return
	}

	channelDist, err := model.SearchLogsByChannelAll(int(startOfDay), int(endOfDay))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取渠道分布失败: " + err.Error()})
		return
	}

	userCount, err := model.GetUserCount()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取用户数失败: " + err.Error()})
		return
	}

	totalChannels, enabledChannels, err := model.GetChannelCount()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取渠道数失败: " + err.Error()})
		return
	}

	tokenCount, err := model.GetTokenCount()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取令牌数失败: " + err.Error()})
		return
	}

	// 汇总最近 7 天的请求数与 token 数
	var totalRequests int64
	var totalTokens int64
	for _, d := range dailyTrend {
		totalRequests += int64(d.RequestCount)
		totalTokens += int64(d.PromptTokens + d.CompletionTokens)
	}

	resp := overviewResponse{
		Summary: summaryData{
			TotalRequests:   totalRequests,
			TotalTokens:     totalTokens,
			TotalUsers:      userCount,
			TotalChannels:   totalChannels,
			EnabledChannels: enabledChannels,
			TotalTokenCount: tokenCount,
		},
		DailyTrend:          dailyTrend,
		ModelDistribution:   modelDist,
		ChannelDistribution: channelDist,
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    resp,
	})
}
