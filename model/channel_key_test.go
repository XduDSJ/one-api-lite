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
