package model

import (
	"testing"
)

func TestChannelKeyCRUD(t *testing.T) {
	// 准备：插入 3 个 key，priority 10/5/1，其中 priority=1 的 status=Disabled
	keys := []ChannelKey{
		{ChannelId: 1, KeyValue: "key-priority-10", Status: KeyStatusEnabled, Priority: 10},
		{ChannelId: 1, KeyValue: "key-priority-5", Status: KeyStatusEnabled, Priority: 5},
		{ChannelId: 1, KeyValue: "key-priority-1", Status: KeyStatusDisabled, Priority: 1},
	}
	if err := BatchInsertChannelKeys(keys); err != nil {
		t.Fatalf("BatchInsertChannelKeys failed: %v", err)
	}

	// 校验 1：GetChannelKeysByChannelId 返回 3 个，按 priority 降序（10→5→1）
	all, err := GetChannelKeysByChannelId(1)
	if err != nil {
		t.Fatalf("GetChannelKeysByChannelId failed: %v", err)
	}
	if len(all) != 3 {
		t.Fatalf("expected 3 keys, got %d", len(all))
	}
	expectedPriority := []int{10, 5, 1}
	for i, k := range all {
		if k.Priority != expectedPriority[i] {
			t.Errorf("all[%d].Priority = %d, expected %d", i, k.Priority, expectedPriority[i])
		}
	}

	// 校验 2：GetEnabledChannelKeys 过滤 Disabled，返回 2 个（priority 10/5）
	enabled, err := GetEnabledChannelKeys(1)
	if err != nil {
		t.Fatalf("GetEnabledChannelKeys failed: %v", err)
	}
	if len(enabled) != 2 {
		t.Fatalf("expected 2 enabled keys, got %d", len(enabled))
	}
	expectedEnabledPriority := []int{10, 5}
	for i, k := range enabled {
		if k.Priority != expectedEnabledPriority[i] {
			t.Errorf("enabled[%d].Priority = %d, expected %d", i, k.Priority, expectedEnabledPriority[i])
		}
		if k.Status != KeyStatusEnabled {
			t.Errorf("enabled[%d].Status = %d, expected %d", i, k.Status, KeyStatusEnabled)
		}
	}

	// 校验 3：DeleteChannelKeysByChannelId 清空后再查返回 0 个
	if err := DeleteChannelKeysByChannelId(1); err != nil {
		t.Fatalf("DeleteChannelKeysByChannelId failed: %v", err)
	}
	afterDelete, err := GetChannelKeysByChannelId(1)
	if err != nil {
		t.Fatalf("GetChannelKeysByChannelId after delete failed: %v", err)
	}
	if len(afterDelete) != 0 {
		t.Fatalf("expected 0 keys after delete, got %d", len(afterDelete))
	}
}

func TestPickKeyPriority(t *testing.T) {
	// 准备：渠道 10 插入两个启用 key，priority 1 和 10
	keys := []ChannelKey{
		{ChannelId: 10, KeyValue: "sk-low", Status: KeyStatusEnabled, Priority: 1},
		{ChannelId: 10, KeyValue: "sk-high", Status: KeyStatusEnabled, Priority: 10},
	}
	if err := BatchInsertChannelKeys(keys); err != nil {
		t.Fatalf("BatchInsertChannelKeys failed: %v", err)
	}
	defer DeleteChannelKeysByChannelId(10)

	// 校验：优先级模式应总返回 priority=10（最高优先级组只有一个 key）
	for i := 0; i < 20; i++ {
		picked, err := PickKey(10, MultiKeyModePriority, "gpt-4o", "")
		if err != nil {
			t.Fatalf("PickKey iter %d failed: %v", i, err)
		}
		if picked.Priority != 10 {
			t.Errorf("iter %d: picked.Priority = %d, expected 10", i, picked.Priority)
		}
	}
}

func TestPickKeyFiltersDisabled(t *testing.T) {
	// 准备：渠道 11 插入一个禁用（priority=10）和一个启用（priority=1, sk-ok）
	keys := []ChannelKey{
		{ChannelId: 11, KeyValue: "sk-disabled", Status: KeyStatusDisabled, Priority: 10},
		{ChannelId: 11, KeyValue: "sk-ok", Status: KeyStatusEnabled, Priority: 1},
	}
	if err := BatchInsertChannelKeys(keys); err != nil {
		t.Fatalf("BatchInsertChannelKeys failed: %v", err)
	}
	defer DeleteChannelKeysByChannelId(11)

	// 校验：应跳过禁用 key，返回 sk-ok
	picked, err := PickKey(11, MultiKeyModePriority, "gpt-4o", "")
	if err != nil {
		t.Fatalf("PickKey failed: %v", err)
	}
	if picked.KeyValue != "sk-ok" {
		t.Errorf("picked.KeyValue = %s, expected sk-ok", picked.KeyValue)
	}
	if picked.Status != KeyStatusEnabled {
		t.Errorf("picked.Status = %d, expected %d (Enabled)", picked.Status, KeyStatusEnabled)
	}
}

func TestPickKeyNoUsable(t *testing.T) {
	// 准备：渠道 12 只插入一个禁用 key
	keys := []ChannelKey{
		{ChannelId: 12, KeyValue: "sk-disabled", Status: KeyStatusDisabled, Priority: 10},
	}
	if err := BatchInsertChannelKeys(keys); err != nil {
		t.Fatalf("BatchInsertChannelKeys failed: %v", err)
	}
	defer DeleteChannelKeysByChannelId(12)

	// 校验：无可用 key 应返回 error
	picked, err := PickKey(12, MultiKeyModePriority, "gpt-4o", "")
	if err == nil {
		t.Errorf("expected error when no usable key, got picked=%+v", picked)
	}
}
