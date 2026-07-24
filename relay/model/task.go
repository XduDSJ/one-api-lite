package model

import "encoding/json"

// TaskRequest 通用异步任务请求，各适配器按需使用字段
type TaskRequest struct {
	Model       string `json:"model"`
	Prompt      string `json:"prompt"`
	Action      string `json:"action"` // video_generation / music_generation / image_generation
	Duration    int    `json:"duration,omitempty"`
	Resolution  string `json:"resolution,omitempty"`
	AspectRatio string `json:"aspect_ratio,omitempty"`
	// 原始请求体，适配器可直接透传
	RawBody json.RawMessage `json:"-"`
}
