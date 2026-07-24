package main

// 预下载 tiktoken BPE 词表缓存，避免容器启动时从外网下载卡 2 分钟
// 构建时运行：TIKTOKEN_CACHE_DIR=/tiktoken_cache go run ./cmd/cache_tiktoken

import (
	"fmt"
	"os"

	"github.com/pkoukk/tiktoken-go"
)

func main() {
	cacheDir := os.Getenv("TIKTOKEN_CACHE_DIR")
	if cacheDir == "" {
		fmt.Fprintln(os.Stderr, "TIKTOKEN_CACHE_DIR 未设置")
		os.Exit(1)
	}
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "创建缓存目录失败: %s\n", err)
		os.Exit(1)
	}

	models := []string{"gpt-3.5-turbo", "gpt-4o", "gpt-4"}
	for _, model := range models {
		_, err := tiktoken.EncodingForModel(model)
		if err != nil {
			fmt.Fprintf(os.Stderr, "下载 %s 词表失败: %s\n", model, err)
			os.Exit(1)
		}
		fmt.Printf("已缓存 %s 词表\n", model)
	}
	fmt.Println("tiktoken 词表缓存完成")
}
