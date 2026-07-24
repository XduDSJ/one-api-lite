package controller

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/client"
	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay"
	"github.com/songquanpeng/one-api/relay/adaptor"
	"github.com/songquanpeng/one-api/relay/meta"
	relaymodel "github.com/songquanpeng/one-api/relay/model"
)

// RelayTaskSubmit 提交异步任务
func RelayTaskSubmit(c *gin.Context) {
	meta := meta.GetByContext(c)

	// 解析请求
	taskRequest := &relaymodel.TaskRequest{}
	if err := common.UnmarshalBodyReusable(c, taskRequest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": err.Error(), "type": "one_api_error"}})
		return
	}
	if taskRequest.Model == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "model is required", "type": "one_api_error"}})
		return
	}

	// 保存原始请求体
	rawBody, _ := common.GetRequestBody(c)

	// 模型映射（getMappedModelName 定义在 relay/controller 包，此处内联实现）
	meta.OriginModelName = taskRequest.Model
	if mapped, ok := meta.ModelMapping[taskRequest.Model]; ok && mapped != "" {
		taskRequest.Model = mapped
	}
	meta.ActualModelName = taskRequest.Model

	// 获取适配器
	channelAdaptor := relay.GetAdaptor(meta.APIType)
	if channelAdaptor == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": fmt.Sprintf("invalid api type: %d", meta.APIType), "type": "one_api_error"}})
		return
	}

	// 类型断言检查 TaskAdaptor 支持
	taskAdaptor, ok := channelAdaptor.(adaptor.TaskAdaptor)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "channel does not support async tasks", "type": "one_api_error"}})
		return
	}
	channelAdaptor.Init(meta)

	// 转换请求
	convertedRequest, err := taskAdaptor.ConvertTaskRequest(c, taskRequest)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": err.Error(), "type": "one_api_error"}})
		return
	}
	jsonData, err := json.Marshal(convertedRequest)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": err.Error(), "type": "one_api_error"}})
		return
	}
	requestBody := bytes.NewBuffer(jsonData)

	// 构建提交 URL（使用 TaskAdaptor 专用方法，而非标准 GetRequestURL）
	requestURL, err := taskAdaptor.GetTaskRequestURL(meta)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": err.Error(), "type": "one_api_error"}})
		return
	}

	// 手动构建请求（DoRequest 内部调用 GetRequestURL 而非 GetTaskRequestURL，故不使用）
	req, err := http.NewRequest(c.Request.Method, requestURL, requestBody)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": err.Error(), "type": "one_api_error"}})
		return
	}
	if err := channelAdaptor.SetupRequestHeader(c, req, meta); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": err.Error(), "type": "one_api_error"}})
		return
	}
	resp, err := client.HTTPClient.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": err.Error(), "type": "one_api_error"}})
		return
	}
	defer resp.Body.Close()

	// 解析提交响应，提取 task_id
	taskID, respErr := taskAdaptor.ParseTaskSubmitResponse(resp)
	if respErr != nil {
		c.JSON(respErr.StatusCode, gin.H{"error": respErr.Error})
		return
	}

	// 保存任务记录到数据库
	task := &model.Task{
		TaskID:      taskID,
		Platform:    taskAdaptor.GetTaskPlatform(),
		Action:      taskRequest.Action,
		ChannelId:   meta.ChannelId,
		UserId:      meta.UserId,
		TokenId:     meta.TokenId,
		Status:      model.TaskStatusSubmitted,
		RequestBody: string(rawBody),
		SubmitTime:  meta.StartTime.Unix(),
	}
	if err := model.CreateTask(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": "failed to save task: " + err.Error(), "type": "one_api_error"}})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"task_id": taskID,
		"status":  model.TaskStatusSubmitted,
		"id":      task.ID,
	})
}

// RelayTaskQuery 查询任务状态
func RelayTaskQuery(c *gin.Context) {
	taskID := c.Param("task_id")
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "task_id is required", "type": "one_api_error"}})
		return
	}

	task, err := model.GetTaskByTaskID(taskID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"message": "task not found", "type": "one_api_error"}})
		return
	}

	// 权限检查：用户只能查自己的任务
	userId := c.GetInt(ctxkey.Id)
	if task.UserId != userId {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"message": "permission denied", "type": "one_api_error"}})
		return
	}

	// 直接返回数据库中的状态（后台轮询会自动更新）
	c.JSON(http.StatusOK, task)
}

// RelayTaskList 获取任务列表
func RelayTaskList(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))

	tasks, total, err := model.GetTasksByUserId(userId, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": err.Error(), "type": "one_api_error"}})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"tasks":     tasks,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}
