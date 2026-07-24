# Rerank / Embedding / 异步任务系统 设计文档

> 编号：003  
> 日期：2026-07-24  
> 状态：待实现  
> 关联文档：`docs/001-reranker-api-format-research-2026-01-24.md`

## 一、背景

one-api-lite（精简版 one-api，已移除分发计费功能）需要扩展三类能力：

1. **Embedding token 计量修复**：当前 `getPromptTokens` 缺少 Embeddings 分支，本地 token 预估为 0
2. **Rerank 适配**：项目完全不支持 Reranker 模型，需新增独立通道
3. **异步任务系统**：视频/音乐/异步图像生成需要"提交→轮询→获取结果"的通用框架
4. **z-image-turbo 适配**：数据中心本地部署的图像生成模型，走 SiliconFlow/vLLM 兼容格式

### 调研结论

- **Embedding**：链路完整（relaymode、路由、适配器、计费均已实现），仅 `getPromptTokens` 缺 case
- **Rerank**：全项目零命中，需从零搭建
- **new-api 对比**：new-api 是 one-api 的 fork，新增了 Jina 独立适配器、Cohere rerank 扩展、TaskAdaptor 异步任务系统。可借鉴 DTO 定义和请求格式，但不能照搬代码（接口架构差异大：new-api 拆分式接口 vs one-api 统一 `ConvertRequest`）
- **z-image-turbo**：阿里 Tongyi-MAI 团队 6B 参数文生图模型，SiliconFlow 平台兼容 OpenAI `/v1/images/generations` 格式，同步返回图片 URL

### 设计原则

- 保持 one-api-lite 架构风格：统一 `ConvertRequest` + relayMode 分发，不引入 new-api 的拆分式接口
- 可选接口 + 类型断言：不污染现有 19 个适配器
- 不引入计费逻辑（已移除分发计费）
- 通用框架优先：异步任务系统做成通用框架，后续接入新模型只需实现接口

---

## 二、模块一：Embedding 修复

### 2.1 问题

`relay/controller/helper.go` 的 `getPromptTokens` 函数没有 `Embeddings` case：

```go
func getPromptTokens(textRequest *relaymodel.GeneralOpenAIRequest, relayMode int) int {
    switch relayMode {
    case relaymode.ChatCompletions:
        return openai.CountTokenMessages(textRequest.Messages, textRequest.Model)
    case relaymode.Completions:
        return openai.CountTokenInput(textRequest.Prompt, textRequest.Model)
    case relaymode.Moderations:
        return openai.CountTokenInput(textRequest.Input, textRequest.Model)
    }
    return 0 // ← Embeddings 落到这里，promptTokens = 0
}
```

后果：对不返回 usage 的上游（部分国产/自建），embedding 计费会丢失。

### 2.2 修复

```go
// relay/controller/helper.go - getPromptTokens 函数
func getPromptTokens(textRequest *relaymodel.GeneralOpenAIRequest, relayMode int) int {
    switch relayMode {
    case relaymode.ChatCompletions:
        return openai.CountTokenMessages(textRequest.Messages, textRequest.Model)
    case relaymode.Completions:
        return openai.CountTokenInput(textRequest.Prompt, textRequest.Model)
    case relaymode.Embeddings: // ← 新增
        return openai.CountTokenInput(textRequest.Input, textRequest.Model)
    case relaymode.Moderations:
        return openai.CountTokenInput(textRequest.Input, textRequest.Model)
    }
    return 0
}
```

### 2.3 改动清单

| # | 文件 | 类型 | 内容 |
|---|------|------|------|
| 1 | `relay/controller/helper.go` | 改 | `getPromptTokens` 补 `relaymode.Embeddings` case |

改动量：1 个 case 分支，3 行代码。

---

## 三、模块二：Rerank 适配

### 3.1 设计原则

- Rerank 请求结构（query + documents）与 `GeneralOpenAIRequest`（messages/input）完全不同，**不复用 `RelayTextHelper`**
- 采用**可选接口 + 类型断象**，不污染现有适配器
- 不引入计费逻辑
- 借鉴 new-api 的 DTO 字段定义和 Cohere/Jina 请求格式，保持 one-api-lite 架构风格

### 3.2 数据流

```
POST /v1/rerank
  → middleware.Distribute（选渠道，复用现有逻辑）
  → controller.Relay → relayHelper
  → case relaymode.Rerank → RelayRerankHelper（新建）
  → 解析 RerankRequest（独立 DTO）
  → 类型断言检查 adaptor 是否实现 RerankAdaptor
  → 模型映射
  → ConvertRerankRequest → DoRequest → DoRerankResponse
  → 透传响应给客户端
```

### 3.3 API 格式

请求（兼容 Cohere/Jina 标准 `/v1/rerank` 格式）：

```json
{
  "model": "rerank-v1",
  "query": "什么是one-api",
  "documents": ["文档1", "文档2", "文档3"],
  "top_n": 3,
  "return_documents": false
}
```

响应：

```json
{
  "results": [
    { "index": 0, "relevance_score": 0.95 },
    { "index": 2, "relevance_score": 0.82 }
  ]
}
```

### 3.4 核心代码设计

#### DTO（`relay/model/rerank.go` 新建）

```go
package model

// RerankRequest 兼容 Cohere/Jina 标准 /v1/rerank 格式
type RerankRequest struct {
    Model           string   `json:"model" binding:"required"`
    Query           string   `json:"query" binding:"required"`
    Documents       []string `json:"documents" binding:"required"`
    TopN            *int     `json:"top_n,omitempty"`
    ReturnDocuments *bool    `json:"return_documents,omitempty"`
}

type RerankResult struct {
    Index          int     `json:"index"`
    RelevanceScore float64 `json:"relevance_score"`
    Document       *string `json:"document,omitempty"`
}

type RerankResponse struct {
    Results []RerankResult `json:"results"`
    Usage   *Usage         `json:"usage,omitempty"`
}
```

#### 可选接口（`relay/adaptor/interface.go` 扩展）

```go
// RerankAdaptor 可选接口，只有支持 rerank 的适配器实现
// 不实现此接口的适配器，Helper 会返回 "rerank not supported" 错误
type RerankAdaptor interface {
    ConvertRerankRequest(c *gin.Context, request *model.RerankRequest) (any, error)
    DoRerankResponse(c *gin.Context, resp *http.Response, meta *meta.Meta) (*model.RerankResponse, *model.ErrorWithStatusCode)
}
```

#### Helper（`relay/controller/rerank.go` 新建）

```go
func RelayRerankHelper(c *gin.Context) *model.ErrorWithStatusCode {
    meta := meta.GetByContext(c)

    // 解析请求
    rerankRequest := &model.RerankRequest{}
    if err := common.UnmarshalBodyReusable(c, rerankRequest); err != nil {
        return openai.ErrorWrapper(err, "invalid_rerank_request", http.StatusBadRequest)
    }

    // 模型映射
    meta.OriginModelName = rerankRequest.Model
    rerankRequest.Model, _ = getMappedModelName(rerankRequest.Model, meta.ModelMapping)
    meta.ActualModelName = rerankRequest.Model

    // 获取适配器
    adaptor := relay.GetAdaptor(meta.APIType)
    if adaptor == nil {
        return openai.ErrorWrapper(fmt.Errorf("invalid api type: %d", meta.APIType), "invalid_api_type", http.StatusBadRequest)
    }

    // 类型断言检查 rerank 支持
    rerankAdaptor, ok := adaptor.(adaptor.RerankAdaptor)
    if !ok {
        return openai.ErrorWrapper(errors.New("channel does not support rerank"), "rerank_not_supported", http.StatusBadRequest)
    }
    adaptor.Init(meta)

    // 转换请求
    convertedRequest, err := rerankAdaptor.ConvertRerankRequest(c, rerankRequest)
    if err != nil {
        return openai.ErrorWrapper(err, "convert_rerank_request_failed", http.StatusInternalServerError)
    }
    jsonData, _ := json.Marshal(convertedRequest)
    requestBody := bytes.NewBuffer(jsonData)

    // 发送请求
    resp, err := adaptor.DoRequest(c, meta, requestBody)
    if err != nil {
        return openai.ErrorWrapper(err, "do_request_failed", http.StatusInternalServerError)
    }

    // 处理响应
    rerankResp, respErr := rerankAdaptor.DoRerankResponse(c, resp, meta)
    if respErr != nil {
        return respErr
    }

    // 透传响应
    c.JSON(http.StatusOK, rerankResp)
    return nil
}
```

#### relaymode 定义（`relay/relaymode/define.go` 改）

```go
const (
    Unknown = iota
    ChatCompletions
    Completions
    Embeddings
    Moderations
    ImagesGenerations
    Edits
    AudioSpeech
    AudioTranscription
    AudioTranslation
    Proxy
    Rerank // ← 新增
)
```

#### 路径识别（`relay/relaymode/helper.go` 改）

```go
func GetByPath(path string) int {
    relayMode := Unknown
    if strings.HasPrefix(path, "/v1/chat/completions") {
        relayMode = ChatCompletions
    } else if strings.HasPrefix(path, "/v1/completions") {
        relayMode = Completions
    } else if strings.HasPrefix(path, "/v1/embeddings") {
        relayMode = Embeddings
    } else if strings.HasSuffix(path, "embeddings") {
        relayMode = Embeddings
    } else if strings.HasPrefix(path, "/v1/rerank") { // ← 新增
        relayMode = Rerank
    } else if strings.HasPrefix(path, "/v1/moderations") {
        relayMode = Moderations
    } else if strings.HasPrefix(path, "/v1/images/generations") {
        relayMode = ImagesGenerations
    } else if strings.HasPrefix(path, "/v1/edits") {
        relayMode = Edits
    } else if strings.HasPrefix(path, "/v1/audio/speech") {
        relayMode = AudioSpeech
    } else if strings.HasPrefix(path, "/v1/audio/transcriptions") {
        relayMode = AudioTranscription
    } else if strings.HasPrefix(path, "/v1/audio/translations") {
        relayMode = AudioTranslation
    } else if strings.HasPrefix(path, "/v1/oneapi/proxy") {
        relayMode = Proxy
    }
    return relayMode
}
```

#### 路由注册（`router/relay.go` 改）

```go
relayV1Router.POST("/rerank", controller.Relay)
```

#### 分发分支（`controller/relay.go` 改）

```go
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
    case relaymode.Rerank: // ← 新增
        err = controller.RelayRerankHelper(c)
    case relaymode.Proxy:
        err = controller.RelayProxyHelper(c, relayMode)
    default:
        err = controller.RelayTextHelper(c)
    }
    return err
}
```

### 3.5 供应商适配策略

| 供应商 | 实现方式 | 文件 | 说明 |
|--------|----------|------|------|
| **Cohere** | 请求透传 `/v1/rerank`，响应直接解析 | `relay/adaptor/cohere/rerank.go` | 基准实现 |
| **OpenAI 兼容透传** | 直接透传请求/响应 | `relay/adaptor/openai/rerank.go` | 覆盖 vLLM 部署的 qwen3-reranker、Jina |
| **阿里** | 请求转 DashScope 格式 | `relay/adaptor/ali/rerank.go` | `documents` → `input.texts`，响应转换 |

**本地部署路径**：vLLM 部署 qwen3-reranker → 兼容 Cohere `/v1/rerank` 格式 → 创建 OpenAI 兼容渠道 → `openai/rerank.go` 透传，无需额外适配。

**Jina**：通过 OpenAI 兼容渠道透传 `/v1/rerank`，不新建独立目录（Jina 格式与 Cohere 基本兼容）。

**百度**：暂不做，等有实际需求再加。

### 3.6 改动清单

| # | 文件 | 类型 | 内容 |
|---|------|------|------|
| 1 | `relay/relaymode/define.go` | 改 | 新增 `Rerank` 常量 |
| 2 | `relay/relaymode/helper.go` | 改 | `GetByPath` 增加 `/v1/rerank` 识别 |
| 3 | `router/relay.go` | 改 | 注册 `POST /v1/rerank` |
| 4 | `controller/relay.go` | 改 | `relayHelper` 增加 `case relaymode.Rerank` |
| 5 | `relay/adaptor/interface.go` | 改 | 新增 `RerankAdaptor` 可选接口 |
| 6 | `relay/model/rerank.go` | **新建** | RerankRequest / RerankResponse DTO |
| 7 | `relay/controller/rerank.go` | **新建** | `RelayRerankHelper` |
| 8 | `relay/adaptor/cohere/rerank.go` | **新建** | Cohere rerank 实现 |
| 9 | `relay/adaptor/openai/rerank.go` | **新建** | OpenAI 兼容透传（覆盖 vLLM/qwen3-reranker/Jina） |
| 10 | `relay/adaptor/ali/rerank.go` | **新建** | 阿里 DashScope rerank 转换 |

---

## 四、模块三：异步任务系统

### 4.1 背景

视频生成、音乐生成、部分图像生成（异步模式）需要异步任务：提交 → task_id → 轮询 → 获取结果。需要一个**通用框架**，后续接入新模型只需实现接口，不改框架。

### 4.2 设计原则

- **通用**：一个框架覆盖视频/音乐/异步图像，后续接入新模型只加适配器
- **无计费**：已移除分发计费，Task 表不存计费字段
- **简化**：相比 new-api 的 TaskAdaptor（15+ 方法），精简到核心 6 个方法
- **后台轮询**：独立 goroutine 定期轮询未完成任务

### 4.3 数据库模型（`model/task.go` 新建）

```go
package model

type TaskStatus string

const (
    TaskStatusNotStart    TaskStatus = "not_start"
    TaskStatusSubmitted   TaskStatus = "submitted"
    TaskStatusInProgress  TaskStatus = "in_progress"
    TaskStatusSuccess     TaskStatus = "success"
    TaskStatusFailure     TaskStatus = "failure"
)

type Task struct {
    ID          int64      `json:"id" gorm:"primaryKey;autoIncrement"`
    TaskID      string     `json:"task_id" gorm:"index"`      // 上游返回的任务 ID
    Platform    string     `json:"platform" gorm:"index"`     // 平台标识：kling, sora, suno, zimage...
    Action      string     `json:"action"`                    // 动作：video_generation, music_generation, image_generation
    ChannelId   int        `json:"channel_id" gorm:"index"`   // 渠道 ID
    UserId      int        `json:"user_id" gorm:"index"`      // 用户 ID
    TokenId     int        `json:"token_id"`                  // 令牌 ID
    Status      TaskStatus `json:"status" gorm:"index"`       // 任务状态
    FailReason  string     `json:"fail_reason"`               // 失败原因
    Progress    string     `json:"progress"`                  // 进度：如 "50%"
    RequestBody string     `json:"request_body"`              // 原始请求 JSON（用于重试）
    Result      string     `json:"result"`                    // 结果 JSON（URL 等）
    SubmitTime  int64      `json:"submit_time"`
    FinishTime  int64      `json:"finish_time"`
    CreatedAt   int64      `json:"created_at" gorm:"autoCreateTime"`
    UpdatedAt   int64      `json:"updated_at" gorm:"autoUpdateTime"`
}
```

GORM 自动建表（`model/main.go` 中注册），无需手动迁移。

### 4.4 TaskAdaptor 接口（`relay/adaptor/interface.go` 扩展）

```go
// TaskAdaptor 异步任务适配器接口
// 用于视频生成、音乐生成、异步图像生成等场景
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
    // 解析查询响应，返回任务状态和结果
    ParseTaskQueryResponse(resp *http.Response) (status model.TaskStatus, progress string, result string, err *model.ErrorWithStatusCode)
}
```

### 4.5 通用请求 DTO（`relay/model/task.go` 新建）

```go
package model

import "encoding/json"

// TaskRequest 通用异步任务请求，各适配器按需使用字段
type TaskRequest struct {
    Model       string `json:"model" binding:"required"`
    Prompt      string `json:"prompt"`
    Action      string `json:"action"`       // video_generation / music_generation / image_generation
    Duration    int    `json:"duration,omitempty"`
    Resolution  string `json:"resolution,omitempty"`
    AspectRatio string `json:"aspect_ratio,omitempty"`
    // 原始请求体，适配器可直接透传
    RawBody     json.RawMessage `json:"-"`
}
```

### 4.6 路由设计（`router/relay.go` 扩展）

```go
// 异步任务路由
relayV1Router.POST("/tasks/generations", controller.RelayTaskSubmit)    // 提交任务
relayV1Router.GET("/tasks/:task_id", controller.RelayTaskQuery)         // 查询任务
relayV1Router.GET("/tasks", controller.RelayTaskList)                   // 任务列表（可选）
```

### 4.7 数据流

**提交任务**：

```
POST /v1/tasks/generations
  → middleware.Distribute（选渠道）
  → controller.RelayTaskSubmit
  → 解析 TaskRequest
  → 类型断言检查 adaptor 是否实现 TaskAdaptor
  → ConvertTaskRequest → DoRequest → ParseTaskSubmitResponse
  → 提取 task_id
  → 保存 Task 记录到数据库（status = submitted）
  → 返回 { task_id, status: "submitted" } 给客户端
```

**查询任务**：

```
GET /v1/tasks/:task_id
  → controller.RelayTaskQuery
  → 从数据库查 Task 记录
  → 如果 status 已是终态（success/failure），直接返回
  → 如果 status 非终态，调用 TaskAdaptor 查询上游
  → ParseTaskQueryResponse → 更新数据库
  → 返回 { task_id, status, progress, result }
```

**后台轮询**：

```
独立 goroutine（main.go 启动）
  → 每 10 秒扫描 status 为 submitted/in_progress 的任务
  → 按渠道分组，调用对应 TaskAdaptor 查询上游
  → 更新数据库状态
  → 超时任务（如 30 分钟）标记为 failure
```

### 4.8 后台轮询服务（`service/task_poller.go` 新建）

```go
package service

import (
    "time"
    "github.com/songquanpeng/one-api/common/logger"
    "github.com/songquanpeng/one-api/model"
)

const (
    pollInterval    = 10 * time.Second // 轮询间隔
    taskTimeout     = 30 * time.Minute  // 任务超时时间
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
}

func pollTasks() {
    // 获取所有未完成任务
    tasks, err := model.GetPendingTasks()
    if err != nil {
        logger.SysError("获取待轮询任务失败: " + err.Error())
        return
    }
    for _, task := range tasks {
        // 超时检查
        if time.Since(time.Unix(task.SubmitTime, 0)) > taskTimeout {
            model.UpdateTaskStatus(task.ID, model.TaskStatusFailure, "100%", "", "任务超时")
            continue
        }
        // 按渠道获取适配器，查询上游
        pollSingleTask(task)
    }
}
```

### 4.9 改动清单

| # | 文件 | 类型 | 内容 |
|---|------|------|------|
| 1 | `model/task.go` | **新建** | Task 模型 + CRUD 方法 |
| 2 | `model/main.go` | 改 | 注册 Task 自动建表 |
| 3 | `relay/adaptor/interface.go` | 改 | 新增 `TaskAdaptor` 接口 |
| 4 | `relay/model/task.go` | **新建** | TaskRequest DTO |
| 5 | `controller/task.go` | **新建** | RelayTaskSubmit / RelayTaskQuery / RelayTaskList |
| 6 | `router/relay.go` | 改 | 注册任务路由 |
| 7 | `service/task_poller.go` | **新建** | 后台轮询服务 |
| 8 | `main.go` | 改 | 启动轮询 goroutine |

---

## 五、模块四：z-image-turbo 适配

### 5.1 模型信息

z-image-turbo 是阿里 Tongyi-MAI 团队开发的 6B 参数文本到图像模型，专为生产工作流设计，优化了速度和吞吐量。

### 5.2 部署方式

用户在数据中心通过 SiliconFlow/vLLM 兼容格式部署，兼容 OpenAI `/v1/images/generations` 端点，同步返回图片 URL。

### 5.3 适配方案：零代码改动

由于走 SiliconFlow 兼容格式，现有 `/v1/images/generations` → `RelayImageHelper` → OpenAI 适配器透传链路直接覆盖，**无需任何代码改动**。

部署后在管理后台配置渠道：

| 配置项 | 值 |
|--------|-----|
| 渠道类型 | `OpenAICompatible` |
| Base URL | `http://数据中心地址/v1` |
| 模型 | `z-image-turbo` |
| 模型映射 | 按需 |

### 5.4 请求/响应格式

请求（兼容 OpenAI 格式）：

```json
{
  "model": "z-image-turbo",
  "prompt": "an island near sea, with seagulls, moon shining over the sea",
  "image_size": "1024x1024",
  "batch_size": 1,
  "num_inference_steps": 20,
  "guidance_scale": 7.5,
  "seed": 12345
}
```

响应：

```json
{
  "images": [
    { "url": "https://..." }
  ],
  "timings": { "inference": 0.1 },
  "seed": 0
}
```

### 5.5 后续扩展

当后续接入其他本地部署模型时：

- **同步模型**（图像/嵌入/重排）→ 配置 OpenAI 兼容渠道，零代码改动
- **异步模型**（视频/音乐/长任务图像）→ 实现一个 `TaskAdaptor`，注册到 `GetAdaptor`，框架自动处理提交/轮询/查询

---

## 六、总览

### 6.1 改动汇总

| 模块 | 新建文件 | 修改文件 | 总计 |
|------|----------|----------|------|
| 一、Embedding 修复 | 0 | 1 | 1 |
| 二、Rerank 适配 | 5 | 5 | 10 |
| 三、异步任务系统 | 4 | 4 | 8 |
| 四、z-image-turbo | 0 | 0 | 0 |
| **合计** | **9** | **10** | **19** |

### 6.2 完整改动清单

| # | 模块 | 文件 | 类型 | 内容 |
|---|------|------|------|------|
| 1 | 一 | `relay/controller/helper.go` | 改 | `getPromptTokens` 补 `relaymode.Embeddings` case |
| 2 | 二 | `relay/relaymode/define.go` | 改 | 新增 `Rerank` 常量 |
| 3 | 二 | `relay/relaymode/helper.go` | 改 | `GetByPath` 增加 `/v1/rerank` 识别 |
| 4 | 二 | `router/relay.go` | 改 | 注册 `POST /v1/rerank` |
| 5 | 二 | `controller/relay.go` | 改 | `relayHelper` 增加 `case relaymode.Rerank` |
| 6 | 二 | `relay/adaptor/interface.go` | 改 | 新增 `RerankAdaptor` 可选接口 |
| 7 | 二 | `relay/model/rerank.go` | **新建** | RerankRequest / RerankResponse DTO |
| 8 | 二 | `relay/controller/rerank.go` | **新建** | `RelayRerankHelper` |
| 9 | 二 | `relay/adaptor/cohere/rerank.go` | **新建** | Cohere rerank 实现 |
| 10 | 二 | `relay/adaptor/openai/rerank.go` | **新建** | OpenAI 兼容透传（覆盖 vLLM/qwen3-reranker/Jina） |
| 11 | 二 | `relay/adaptor/ali/rerank.go` | **新建** | 阿里 DashScope rerank 转换 |
| 12 | 三 | `model/task.go` | **新建** | Task 模型 + CRUD 方法 |
| 13 | 三 | `model/main.go` | 改 | 注册 Task 自动建表 |
| 14 | 三 | `relay/adaptor/interface.go` | 改 | 新增 `TaskAdaptor` 接口 |
| 15 | 三 | `relay/model/task.go` | **新建** | TaskRequest DTO |
| 16 | 三 | `controller/task.go` | **新建** | RelayTaskSubmit / RelayTaskQuery / RelayTaskList |
| 17 | 三 | `router/relay.go` | 改 | 注册任务路由 |
| 18 | 三 | `service/task_poller.go` | **新建** | 后台轮询服务 |
| 19 | 三 | `main.go` | 改 | 启动轮询 goroutine |

### 6.3 依赖关系

```
模块一（Embedding 修复）→ 独立，可先做
模块二（Rerank 适配）→ 独立，可与模块一并行
模块三（异步任务系统）→ 独立，可与模块一、二并行
模块四（z-image-turbo）→ 无代码依赖，仅配置渠道
```

### 6.4 实施顺序

```
第一批（并行）：
  ├─ 模块一：Embedding 修复（1 处，5 分钟）
  └─ 模块二：Rerank 适配（10 处，独立通道）

第二批：
  └─ 模块三：异步任务系统（8 处，框架搭建）

第三批：
  └─ 模块四：z-image-turbo（配置渠道，无代码）
```

### 6.5 验证方式

| 模块 | 验证方法 |
|------|----------|
| 一 | `go build` 编译通过；embedding 请求返回正确 token 计数 |
| 二 | `go build` 编译通过；`POST /v1/rerank` 能正确转发到 Cohere/vLLM 并返回 rerank 结果 |
| 三 | `go build` 编译通过；`POST /v1/tasks/generations` 返回 task_id；`GET /v1/tasks/:id` 返回状态；后台轮询自动更新状态 |
| 四 | 配置 OpenAICompatible 渠道后，`POST /v1/images/generations` 能正确生成图片 |

---

## 七、参考

- new-api 仓库：https://github.com/QuantumNous/new-api
- Cohere Rerank API：https://docs.cohere.com/reference/rerank
- Jina Rerank API：https://jina.ai/reranker/
- vLLM Rerank 部署：https://docs.vllm.ai/en/latest/serving/rerank.html
- SiliconFlow 图像生成 API：https://docs.siliconflow.cn/api-reference/images/images-generations
- 关联调研文档：`docs/001-reranker-api-format-research-2026-01-24.md`
