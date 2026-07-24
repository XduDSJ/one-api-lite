package ali

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

type aliRerankRequest struct {
	Model      string             `json:"model"`
	Input      aliRerankInput     `json:"input"`
	Parameters aliRerankParameters `json:"parameters,omitempty"`
}

type aliRerankInput struct {
	Query     string   `json:"query"`
	Documents []string `json:"documents"`
}

type aliRerankParameters struct {
	TopN            *int  `json:"top_n,omitempty"`
	ReturnDocuments *bool `json:"return_documents,omitempty"`
}

type aliRerankResponse struct {
	Output struct {
		Results []model.RerankResult `json:"results"`
	} `json:"output"`
	Usage *model.Usage `json:"usage"`
}

func (a *Adaptor) ConvertRerankRequest(c *gin.Context, request *model.RerankRequest) (any, error) {
	if request == nil {
		return nil, errors.New("request is nil")
	}
	aliRequest := aliRerankRequest{
		Model: request.Model,
		Input: aliRerankInput{
			Query:     request.Query,
			Documents: request.Documents,
		},
		Parameters: aliRerankParameters{
			TopN:            request.TopN,
			ReturnDocuments: request.ReturnDocuments,
		},
	}
	return aliRequest, nil
}

func (a *Adaptor) DoRerankResponse(c *gin.Context, resp *http.Response, meta *meta.Meta) (*model.RerankResponse, *model.ErrorWithStatusCode) {
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, openai.ErrorWrapper(fmt.Errorf("upstream error: %s", string(body)), "upstream_error", resp.StatusCode)
	}

	var aliResp aliRerankResponse
	if err := json.NewDecoder(resp.Body).Decode(&aliResp); err != nil {
		return nil, openai.ErrorWrapper(err, "decode_rerank_response_failed", http.StatusInternalServerError)
	}

	rerankResponse := &model.RerankResponse{
		Results: aliResp.Output.Results,
		Usage:   aliResp.Usage,
	}
	return rerankResponse, nil
}
