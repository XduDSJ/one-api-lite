package cohere

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/relay/adaptor/openai"
	"github.com/songquanpeng/one-api/relay/meta"
	"github.com/songquanpeng/one-api/relay/model"
)

func (a *Adaptor) ConvertRerankRequest(c *gin.Context, request *model.RerankRequest) (any, error) {
	if request == nil {
		return nil, errors.New("request is nil")
	}
	return request, nil
}

func (a *Adaptor) DoRerankResponse(c *gin.Context, resp *http.Response, meta *meta.Meta) (*model.RerankResponse, *model.ErrorWithStatusCode) {
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, openai.ErrorWrapper(fmt.Errorf("upstream error: %s", string(body)), "upstream_error", resp.StatusCode)
	}

	rerankResponse := &model.RerankResponse{}
	if err := json.NewDecoder(resp.Body).Decode(rerankResponse); err != nil {
		return nil, openai.ErrorWrapper(err, "decode_rerank_response_failed", http.StatusInternalServerError)
	}
	return rerankResponse, nil
}
