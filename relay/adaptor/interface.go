package adaptor

import (
	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/relay/meta"
	"github.com/songquanpeng/one-api/relay/model"
	"io"
	"net/http"
)

type Adaptor interface {
	Init(meta *meta.Meta)
	GetRequestURL(meta *meta.Meta) (string, error)
	SetupRequestHeader(c *gin.Context, req *http.Request, meta *meta.Meta) error
	ConvertRequest(c *gin.Context, relayMode int, request *model.GeneralOpenAIRequest) (any, error)
	ConvertImageRequest(request *model.ImageRequest) (any, error)
	DoRequest(c *gin.Context, meta *meta.Meta, requestBody io.Reader) (*http.Response, error)
	DoResponse(c *gin.Context, resp *http.Response, meta *meta.Meta) (usage *model.Usage, err *model.ErrorWithStatusCode)
	GetChannelName() string
}

// RerankAdaptor 可选接口，只有支持 rerank 的适配器实现
// 不实现此接口的适配器，Helper 会返回 "rerank not supported" 错误
type RerankAdaptor interface {
	ConvertRerankRequest(c *gin.Context, request *model.RerankRequest) (any, error)
	DoRerankResponse(c *gin.Context, resp *http.Response, meta *meta.Meta) (*model.RerankResponse, *model.ErrorWithStatusCode)
}

// TaskAdaptor 异步任务适配器接口
// 用于视频生成、音乐生成、异步图像生成等场景
// status 使用 string 类型而非 model.TaskStatus，避免 relay/model 与 model 两个包的命名冲突
type TaskAdaptor interface {
	// 平台标识，对应 Task.Platform 字段
	GetTaskPlatform() string
	// 构建提交请求的 URL
	GetTaskRequestURL(meta *meta.Meta) (string, error)
	// 转换提交请求体
	ConvertTaskRequest(c *gin.Context, request *model.TaskRequest) (any, error)
	// 解析提交响应，提取 task_id
	ParseTaskSubmitResponse(resp *http.Response) (taskID string, err *model.ErrorWithStatusCode)
	// 构建查询请求的 URL
	GetTaskQueryURL(meta *meta.Meta, taskID string) (string, error)
	// 解析查询响应，返回任务状态（string 类型，调用方转换为 model.TaskStatus）和结果
	ParseTaskQueryResponse(resp *http.Response) (status string, progress string, result string, err *model.ErrorWithStatusCode)
}
