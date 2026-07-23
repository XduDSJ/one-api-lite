package model

import (
	"os"
	"sort"
	"testing"

	"github.com/songquanpeng/one-api/common"
)

func TestMain(m *testing.M) {
	// 使用内存 SQLite 进行测试,避免产生文件
	os.Setenv("SQL_DSN", "")
	common.SQLitePath = ":memory:"
	InitDB()
	// 插入测试数据
	channel1 := Channel{
		Id: 1, Type: 1, Status: ChannelStatusEnabled,
		Models: "gpt-4o,gpt-4o-mini", Group: "default",
	}
	if err := channel1.Insert(); err != nil {
		panic(err)
	}
	channel2 := Channel{
		Id: 2, Type: 1, Status: ChannelStatusEnabled,
		Models: "gpt-4o,claude-3-opus", Group: "default",
	}
	if err := channel2.Insert(); err != nil {
		panic(err)
	}
	os.Exit(m.Run())
}

func TestGetAllDistinctModels(t *testing.T) {
	models, err := GetAllDistinctModels()
	if err != nil {
		t.Fatalf("GetAllDistinctModels failed: %v", err)
	}
	expected := []string{"claude-3-opus", "gpt-4o", "gpt-4o-mini"}
	sort.Strings(models)
	if len(models) != len(expected) {
		t.Fatalf("expected %d models, got %d: %v", len(expected), len(models), models)
	}
	for i, m := range models {
		if m != expected[i] {
			t.Errorf("expected[%d]=%s, got %s", i, expected[i], m)
		}
	}
}

func TestGetChannelModelsMap(t *testing.T) {
	m, err := GetChannelModelsMap()
	if err != nil {
		t.Fatalf("GetChannelModelsMap failed: %v", err)
	}
	if len(m) != 2 {
		t.Fatalf("expected 2 channels, got %d", len(m))
	}
	if len(m[1]) != 2 {
		t.Errorf("channel 1: expected 2 models, got %d", len(m[1]))
	}
	if len(m[2]) != 2 {
		t.Errorf("channel 2: expected 2 models, got %d", len(m[2]))
	}
}
