package model

import (
	"testing"
	"time"

	"github.com/songquanpeng/one-api/relay/breaker"
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

func TestHasUsableKey(t *testing.T) {
	// 用独立 channelId 避免与其他测试串扰
	const chMulti = 20 // 多 key 模式渠道
	const model = "gpt-4o"

	// 场景 1：单 key 兼容模式（MultiKeyModeOff）短路返回 true，无需建 channel_keys 行
	if !HasUsableKey(chMulti, MultiKeyModeOff, model) {
		t.Errorf("MultiKeyModeOff 应短路返回 true（用 channel.Key，无 channel_keys 行）")
	}

	// 场景 2：多 key 全 Disabled → false
	disabledKeys := []ChannelKey{
		{ChannelId: chMulti, KeyValue: "sk-dis-1", Status: KeyStatusDisabled, Priority: 10},
		{ChannelId: chMulti, KeyValue: "sk-dis-2", Status: KeyStatusDisabled, Priority: 5},
	}
	if err := BatchInsertChannelKeys(disabledKeys); err != nil {
		t.Fatalf("BatchInsertChannelKeys failed: %v", err)
	}
	defer DeleteChannelKeysByChannelId(chMulti)
	InvalidateChannelKeyUsableCache() // 清缓存避免串扰
	if HasUsableKey(chMulti, MultiKeyModePriority, model) {
		t.Errorf("全 Disabled 应返回 false")
	}

	// 场景 3：至少一个 Enabled/未冷却/有配额/熔断器闭 → true
	// 把 sk-dis-1 改为 Enabled
	disabledKeys[0].Status = KeyStatusEnabled
	if err := UpdateChannelKey(&disabledKeys[0]); err != nil {
		t.Fatalf("UpdateChannelKey failed: %v", err)
	}
	InvalidateChannelKeyUsableCache()
	if !HasUsableKey(chMulti, MultiKeyModePriority, model) {
		t.Errorf("至少一个 Enabled/未冷却 key 应返回 true")
	}

	// 场景 4：Enabled 但 breaker 对该 model open → false
	// 取 sk-dis-1 的 id 触发熔断（阈值 5 次）
	var enabledKey ChannelKey
	allKeys, _ := GetChannelKeysByChannelId(chMulti)
	for _, k := range allKeys {
		if k.Status == KeyStatusEnabled {
			enabledKey = k
			break
		}
	}
	for i := 0; i < 5; i++ {
		breaker.GlobalBreaker.RecordFailure(chMulti, int(enabledKey.Id), model, 5, 60)
	}
	InvalidateChannelKeyUsableCache()
	if HasUsableKey(chMulti, MultiKeyModePriority, model) {
		t.Errorf("唯一 Enabled key 熔断打开时应返回 false")
	}

	// 清理：重置该 key 的熔断，避免污染其他测试
	breaker.GlobalBreaker.ResetByKey(chMulti, int(enabledKey.Id))
	InvalidateChannelKeyUsableCache()

	// 场景 5：冷却中（CooledUntil 未到期）→ false
	enabledKey.CooledUntil = time.Now().Unix() + 600
	enabledKey.Status = KeyStatusCooling
	if err := UpdateChannelKey(&enabledKey); err != nil {
		t.Fatalf("UpdateChannelKey cooling failed: %v", err)
	}
	InvalidateChannelKeyUsableCache()
	if HasUsableKey(chMulti, MultiKeyModePriority, model) {
		t.Errorf("所有 key 冷却中应返回 false")
	}
}
