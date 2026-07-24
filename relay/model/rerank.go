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
