package service

import (
	"fmt"
	"net/http"
	"time"

	"github.com/songquanpeng/one-api/common/client"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay"
	"github.com/songquanpeng/one-api/relay/adaptor"
	"github.com/songquanpeng/one-api/relay/channeltype"
	"github.com/songquanpeng/one-api/relay/meta"
)

const (
	pollInterval = 10 * time.Second // 轮询间隔
	taskTimeout  = 30 * time.Minute // 任务超时时间
)

// StartTaskPoller 启动后台任务轮询服务
func StartTaskPoller() {
	go func() {
		ticker := time.NewTicker(pollInterval)
		defer ticker.Stop()
		for range ticker.C {
			pollTasks()
		}
	}()
	logger.SysLog("task poller started")
}

func pollTasks() {
	tasks, err := model.GetPendingTasks()
	if err != nil {
		logger.SysError("获取待轮询任务失败: " + err.Error())
		return
	}
	if len(tasks) == 0 {
		return
	}
	for _, task := range tasks {
		// 超时检查
		if time.Since(time.Unix(task.SubmitTime, 0)) > taskTimeout {
			model.UpdateTaskStatus(task.ID, model.TaskStatusFailure, "100%", "", "任务超时")
			continue
		}
		pollSingleTask(task)
	}
}

func pollSingleTask(task model.Task) {
	// 获取渠道信息
	channel, err := model.GetChannelById(task.ChannelId, true)
	if err != nil {
		logger.SysError(fmt.Sprintf("获取渠道 %d 失败: %s", task.ChannelId, err.Error()))
		return
	}

	// 构建 meta
	m := &meta.Meta{
		ChannelType: channel.Type,
		ChannelId:   channel.Id,
		BaseURL:     channel.GetBaseURL(),
		APIKey:      channel.Key,
		APIType:     channeltype.ToAPIType(channel.Type),
	}

	// 获取适配器
	channelAdaptor := relay.GetAdaptor(m.APIType)
	if channelAdaptor == nil {
		return
	}

	// 类型断言检查 TaskAdaptor
	taskAdaptor, ok := channelAdaptor.(adaptor.TaskAdaptor)
	if !ok {
		return
	}
	channelAdaptor.Init(m)

	// 构建查询 URL
	queryURL, err := taskAdaptor.GetTaskQueryURL(m, task.TaskID)
	if err != nil {
		logger.SysError(fmt.Sprintf("构建查询 URL 失败: %s", err.Error()))
		return
	}

	// 发送查询请求
	req, err := http.NewRequest("GET", queryURL, nil)
	if err != nil {
		return
	}
	// 后台轮询无 gin.Context，直接设置认证头（不调用 SetupRequestHeader，避免 nil context panic）
	req.Header.Set("Authorization", "Bearer "+m.APIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.HTTPClient.Do(req)
	if err != nil {
		logger.SysError(fmt.Sprintf("查询任务 %s 失败: %s", task.TaskID, err.Error()))
		return
	}
	defer resp.Body.Close()

	// 解析查询响应
	status, progress, result, respErr := taskAdaptor.ParseTaskQueryResponse(resp)
	if respErr != nil {
		logger.SysError(fmt.Sprintf("解析任务 %s 响应失败: %s", task.TaskID, respErr.Error.Message))
		return
	}

	// 更新数据库
	var failReason string
	if model.TaskStatus(status) == model.TaskStatusFailure {
		// 失败时将上游返回的 result 作为失败原因，保留具体错误信息
		if result != "" {
			failReason = result
		} else {
			failReason = "upstream reported failure"
		}
	}
	if err := model.UpdateTaskStatus(task.ID, model.TaskStatus(status), progress, result, failReason); err != nil {
		logger.SysError(fmt.Sprintf("更新任务 %s 状态失败: %s", task.TaskID, err.Error()))
	}
}
