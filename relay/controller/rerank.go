package controller

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/relay"
	"github.com/songquanpeng/one-api/relay/adaptor"
	"github.com/songquanpeng/one-api/relay/adaptor/openai"
	"github.com/songquanpeng/one-api/relay/meta"
	relaymodel "github.com/songquanpeng/one-api/relay/model"
)

func RelayRerankHelper(c *gin.Context) *relaymodel.ErrorWithStatusCode {
	meta := meta.GetByContext(c)

	// 解析请求
	rerankRequest := &relaymodel.RerankRequest{}
	if err := common.UnmarshalBodyReusable(c, rerankRequest); err != nil {
		return openai.ErrorWrapper(err, "invalid_rerank_request", http.StatusBadRequest)
	}

	// 模型映射
	meta.OriginModelName = rerankRequest.Model
	rerankRequest.Model, _ = getMappedModelName(rerankRequest.Model, meta.ModelMapping)
	meta.ActualModelName = rerankRequest.Model

	// 获取适配器
	// 注意：变量名用 channelAdaptor 而非 adaptor，避免遮蔽导入的 adaptor 包
	// （后续需要用 adaptor.RerankAdaptor 做类型断言）
	channelAdaptor := relay.GetAdaptor(meta.APIType)
	if channelAdaptor == nil {
		return openai.ErrorWrapper(fmt.Errorf("invalid api type: %d", meta.APIType), "invalid_api_type", http.StatusBadRequest)
	}

	// 类型断言检查 rerank 支持
	rerankAdaptor, ok := channelAdaptor.(adaptor.RerankAdaptor)
	if !ok {
		return openai.ErrorWrapper(errors.New("channel does not support rerank"), "rerank_not_supported", http.StatusBadRequest)
	}
	channelAdaptor.Init(meta)

	// 转换请求
	convertedRequest, err := rerankAdaptor.ConvertRerankRequest(c, rerankRequest)
	if err != nil {
		return openai.ErrorWrapper(err, "convert_rerank_request_failed", http.StatusInternalServerError)
	}
	jsonData, err := json.Marshal(convertedRequest)
	if err != nil {
		return openai.ErrorWrapper(err, "marshal_rerank_request_failed", http.StatusInternalServerError)
	}
	requestBody := bytes.NewBuffer(jsonData)

	// 发送请求
	resp, err := channelAdaptor.DoRequest(c, meta, requestBody)
	if err != nil {
		return openai.ErrorWrapper(err, "do_request_failed", http.StatusInternalServerError)
	}
	defer resp.Body.Close()

	// 处理响应
	rerankResp, respErr := rerankAdaptor.DoRerankResponse(c, resp, meta)
	if respErr != nil {
		return respErr
	}

	// 透传响应
	c.JSON(http.StatusOK, rerankResp)
	return nil
}
