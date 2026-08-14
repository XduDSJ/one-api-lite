package controller

import (
	"testing"

	relaymodel "github.com/songquanpeng/one-api/relay/model"
)

// TestGetUsageQuota 锁定「已计费 quota」公式，保证 key 配额回写与用户/渠道计费同单位。
// completionRatio 在本仓库恒为 1.0（GetCompletionRatio 直接返回 1.0），故公式
// 退化为 ceil((prompt + completion) * ratio)；一旦该默认值将来调整，本测试需同步更新。
func TestGetUsageQuota(t *testing.T) {
	// name 仅用于日志可读性，channelType 不影响当前 completionRatio 实现
	const modelName = "GLM-5.2"
	const channelType = 50

	tests := []struct {
		name    string
		usage   *relaymodel.Usage
		ratio   float64
		want    int64
	}{
		{
			name:  "Models.rd 日志 line 327 真实用例（ratio=1.0，prompt+completion=Quota）",
			usage: &relaymodel.Usage{PromptTokens: 25524, CompletionTokens: 340, TotalTokens: 25864},
			ratio: 1.0,
			want:  25864,
		},
		{
			name:  "ratio=2 放大，已计费 quota 应为 token 数 × ratio",
			usage: &relaymodel.Usage{PromptTokens: 100, CompletionTokens: 50, TotalTokens: 150},
			ratio: 2.0,
			want:  300,
		},
		{
			name:  "ratio=0.5 收缩",
			usage: &relaymodel.Usage{PromptTokens: 100, CompletionTokens: 50, TotalTokens: 150},
			ratio: 0.5,
			want:  75,
		},
		{
			name:  "0 token 守卫：prompt+completion=0 应返回 0（走 pre-consume 退还，不计 1）",
			usage: &relaymodel.Usage{PromptTokens: 0, CompletionTokens: 0, TotalTokens: 0},
			ratio: 1.0,
			want:  0,
		},
		{
			name:  "usage==nil 返回 0",
			usage: nil,
			ratio: 1.0,
			want:  0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := getUsageQuota(tt.usage, modelName, channelType, tt.ratio)
			if got != tt.want {
				t.Fatalf("getUsageQuota = %d, want %d", got, tt.want)
			}
		})
	}
}
