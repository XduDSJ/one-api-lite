package controller

import (
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/model"
	relaymodel "github.com/songquanpeng/one-api/relay/model"
	"net/http"
	"strings"
)

// https://platform.openai.com/docs/api-reference/models/list

type OpenAIModelPermission struct {
	Id                 string  `json:"id"`
	Object             string  `json:"object"`
	Created            int     `json:"created"`
	AllowCreateEngine  bool    `json:"allow_create_engine"`
	AllowSampling      bool    `json:"allow_sampling"`
	AllowLogprobs      bool    `json:"allow_logprobs"`
	AllowSearchIndices bool    `json:"allow_search_indices"`
	AllowView          bool    `json:"allow_view"`
	AllowFineTuning    bool    `json:"allow_fine_tuning"`
	Organization       string  `json:"organization"`
	Group              *string `json:"group"`
	IsBlocking         bool    `json:"is_blocking"`
}

type OpenAIModels struct {
	Id         string                  `json:"id"`
	Object     string                  `json:"object"`
	Created    int                     `json:"created"`
	OwnedBy    string                  `json:"owned_by"`
	Permission []OpenAIModelPermission `json:"permission"`
	Root       string                  `json:"root"`
	Parent     *string                 `json:"parent"`
}

func DashboardListModels(c *gin.Context) {
	channelId2Models, err := model.GetChannelModelsMap()
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
		"data":    channelId2Models,
	})
}

func ListAllModels(c *gin.Context) {
	allModels, err := model.GetAllDistinctModels()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	openAIModels := make([]OpenAIModels, 0, len(allModels))
	for _, m := range allModels {
		openAIModels = append(openAIModels, OpenAIModels{
			Id:      m,
			Object:  "model",
			Created: 1626777600,
			OwnedBy: "custom",
			Root:    m,
			Parent:  nil,
		})
	}
	c.JSON(200, gin.H{
		"object": "list",
		"data":   openAIModels,
	})
}

func ListModels(c *gin.Context) {
	ctx := c.Request.Context()
	var availableModels []string
	if c.GetString(ctxkey.AvailableModels) != "" {
		availableModels = strings.Split(c.GetString(ctxkey.AvailableModels), ",")
	} else {
		userId := c.GetInt(ctxkey.Id)
		userGroup, _ := model.CacheGetUserGroup(userId)
		availableModels, _ = model.CacheGetGroupModels(ctx, userGroup)
	}
	// 去重
	modelSet := make(map[string]bool)
	for _, m := range availableModels {
		modelSet[m] = true
	}
	availableOpenAIModels := make([]OpenAIModels, 0, len(modelSet))
	for modelName := range modelSet {
		availableOpenAIModels = append(availableOpenAIModels, OpenAIModels{
			Id:      modelName,
			Object:  "model",
			Created: 1626777600,
			OwnedBy: "custom",
			Root:    modelName,
			Parent:  nil,
		})
	}
	c.JSON(200, gin.H{
		"object": "list",
		"data":   availableOpenAIModels,
	})
}

func RetrieveModel(c *gin.Context) {
	modelId := c.Param("model")
	// 从 ability 表查询该模型是否存在
	allModels, err := model.GetAllDistinctModels()
	if err != nil {
		c.JSON(200, gin.H{
			"error": relaymodel.Error{
				Message: fmt.Sprintf("Failed to query models: %s", err.Error()),
				Type:    "invalid_request_error",
				Param:   "model",
				Code:    "internal_error",
			},
		})
		return
	}
	for _, m := range allModels {
		if m == modelId {
			c.JSON(200, OpenAIModels{
				Id:      modelId,
				Object:  "model",
				Created: 1626777600,
				OwnedBy: "custom",
				Root:    modelId,
				Parent:  nil,
			})
			return
		}
	}
	c.JSON(200, gin.H{
		"error": relaymodel.Error{
			Message: fmt.Sprintf("The model '%s' does not exist", modelId),
			Type:    "invalid_request_error",
			Param:   "model",
			Code:    "model_not_found",
		},
	})
}

func GetUserAvailableModels(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.GetInt(ctxkey.Id)
	userGroup, err := model.CacheGetUserGroup(id)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	models, err := model.CacheGetGroupModels(ctx, userGroup)
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
		"data":    models,
	})
	return
}
