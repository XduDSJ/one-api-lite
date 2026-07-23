package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/songquanpeng/one-api/common/client"
)

func init() {
	// 测试环境中 client.Init() 未调用,手动初始化 HTTPClient
	client.HTTPClient = &http.Client{Timeout: 5 * time.Second}
}

func TestParseUpstreamModels(t *testing.T) {
	// 测试标准 OpenAI 格式响应解析
	body := `{"data": [{"id": "gpt-4o"}, {"id": "gpt-4o-mini"}, {"id": "claude-3-opus"}]}`
	models, err := parseUpstreamModels([]byte(body))
	if err != nil {
		t.Fatalf("parseUpstreamModels failed: %v", err)
	}
	if len(models) != 3 {
		t.Fatalf("expected 3 models, got %d", len(models))
	}
	expected := []string{"gpt-4o", "gpt-4o-mini", "claude-3-opus"}
	for i, m := range models {
		if m != expected[i] {
			t.Errorf("expected[%d]=%s, got %s", i, expected[i], m)
		}
	}
}

func TestParseUpstreamModels_Empty(t *testing.T) {
	body := `{"data": []}`
	models, err := parseUpstreamModels([]byte(body))
	if err != nil {
		t.Fatalf("parseUpstreamModels failed: %v", err)
	}
	if len(models) != 0 {
		t.Fatalf("expected 0 models, got %d", len(models))
	}
}

func TestParseUpstreamModels_InvalidJSON(t *testing.T) {
	body := `not json`
	_, err := parseUpstreamModels([]byte(body))
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestFetchChannelModels_MockServer(t *testing.T) {
	// 启动 mock 上游服务器
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/models", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]string{
				{"id": "gpt-4o"},
				{"id": "gpt-4o-mini"},
			},
		})
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	models, err := fetchModelsFromUpstream(server.URL+"/v1/models", "test-key")
	if err != nil {
		t.Fatalf("fetchModelsFromUpstream failed: %v", err)
	}
	if len(models) != 2 {
		t.Fatalf("expected 2 models, got %d", len(models))
	}
}

func TestFetchChannelModels_Unauthorized(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/models", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	_, err := fetchModelsFromUpstream(server.URL+"/v1/models", "bad-key")
	if err == nil {
		t.Fatal("expected error for unauthorized request")
	}
}
