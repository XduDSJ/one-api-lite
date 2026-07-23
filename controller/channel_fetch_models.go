package controller

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/client"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/channeltype"
)

// upstreamModelResponse 上游 /v1/models 的响应格式
type upstreamModelResponse struct {
	Data []struct {
		Id string `json:"id"`
	} `json:"data"`
}

// parseUpstreamModels 解析上游返回的模型列表 JSON
func parseUpstreamModels(body []byte) ([]string, error) {
	var resp upstreamModelResponse
	err := json.Unmarshal(body, &resp)
	if err != nil {
		return nil, fmt.Errorf("解析模型列表失败: %w", err)
	}
	models := make([]string, 0, len(resp.Data))
	for _, m := range resp.Data {
		if m.Id != "" {
			models = append(models, m.Id)
		}
	}
	return models, nil
}

// fetchModelsFromUpstream 请求上游 /v1/models 获取模型列表
func fetchModelsFromUpstream(url, key string) ([]string, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Accept", "application/json")

	resp, err := client.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求上游失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("上游返回状态码 %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	return parseUpstreamModels(body)
}

// FetchChannelModels 用已保存渠道的 Key + BaseURL 请求上游 /v1/models
func FetchChannelModels(c *gin.Context) {
	channelId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "无效的渠道 ID",
		})
		return
	}

	// selectAll=true 以获取 Key
	channel, err := model.GetChannelById(channelId, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "获取渠道失败: " + err.Error(),
		})
		return
	}

	baseURL := channel.GetBaseURL()
	if baseURL == "" {
		// BaseURL 未设置时,从渠道类型默认 URL 取值
		if channel.Type >= 0 && channel.Type < len(channeltype.ChannelBaseURLs) {
			baseURL = channeltype.ChannelBaseURLs[channel.Type]
		}
	}
	if baseURL == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "该渠道未设置 BaseURL,无法获取模型列表",
		})
		return
	}

	// 构建 /v1/models URL，处理 baseURL 已含 /v1 的情况
	baseURL = strings.TrimSuffix(baseURL, "/")
	var url string
	if strings.HasSuffix(baseURL, "/v1") {
		url = baseURL + "/models"
	} else {
		url = baseURL + "/v1/models"
	}

	models, err := fetchModelsFromUpstream(url, channel.Key)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "获取模型失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    models,
	})
}

// fetchModelsRequest POST 请求体
type fetchModelsRequest struct {
	BaseURL string `json:"base_url"`
	Key     string `json:"key"`
	Type    int    `json:"type"`
}

// FetchChannelModelsByConfig 接受 {base_url, key, type}，不依赖已保存渠道
func FetchChannelModelsByConfig(c *gin.Context) {
	var req fetchModelsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "请求参数无效: " + err.Error(),
		})
		return
	}

	baseURL := strings.TrimSpace(req.BaseURL)
	if baseURL == "" {
		// BaseURL 未设置时，从渠道类型默认 URL 取值
		if req.Type >= 0 && req.Type < len(channeltype.ChannelBaseURLs) {
			baseURL = channeltype.ChannelBaseURLs[req.Type]
		}
	}
	if baseURL == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "未设置 BaseURL，无法获取模型列表",
		})
		return
	}

	// 构建 /models URL，处理 baseURL 已含 /v1 的情况
	baseURL = strings.TrimSuffix(baseURL, "/")
	var url string
	if strings.HasSuffix(baseURL, "/v1") {
		url = baseURL + "/models"
	} else {
		url = baseURL + "/v1/models"
	}

	models, err := fetchModelsFromUpstream(url, req.Key)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "获取模型失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    models,
	})
}
