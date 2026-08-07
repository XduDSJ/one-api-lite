package breaker

import (
	"testing"
	"time"
)

// TestBreakerOpenAndRecover 验证：未达阈值不熔断；达阈值熔断；不同 model 三维隔离；RecordSuccess 重置
func TestBreakerOpenAndRecover(t *testing.T) {
	b := NewBreaker()
	const (
		channelID = 1
		keyID     = 1
		model     = "gpt-4"
		other     = "gpt-3.5"
		threshold = 5
		cooldown  = 60
	)
	// 未达阈值不熔断
	for i := 1; i < threshold; i++ {
		b.RecordFailure(channelID, keyID, model, threshold, cooldown)
		if b.IsOpen(channelID, keyID, model) {
			t.Fatalf("第 %d 次失败后不应熔断", i)
		}
	}
	// 达阈值熔断
	b.RecordFailure(channelID, keyID, model, threshold, cooldown)
	if !b.IsOpen(channelID, keyID, model) {
		t.Fatal("达阈值后应熔断")
	}
	// 三维隔离：不同 model 不受影响
	if b.IsOpen(channelID, keyID, other) {
		t.Fatal("不同 model 不应被熔断")
	}
	// RecordSuccess 重置
	b.RecordSuccess(channelID, keyID, model)
	if b.IsOpen(channelID, keyID, model) {
		t.Fatal("RecordSuccess 后应恢复")
	}
}

// TestBreakerCooldownRecover 验证：冷却到期后 IsOpen 惰性返回 false
func TestBreakerCooldownRecover(t *testing.T) {
	b := NewBreaker()
	const (
		channelID   = 2
		keyID       = 2
		model       = "claude-3"
		threshold   = 2
		cooldownSec = 1
	)
	// 触发熔断
	for i := 0; i < threshold; i++ {
		b.RecordFailure(channelID, keyID, model, threshold, cooldownSec)
	}
	if !b.IsOpen(channelID, keyID, model) {
		t.Fatal("应已熔断")
	}
	// 等待冷却到期
	time.Sleep(1500 * time.Millisecond)
	if b.IsOpen(channelID, keyID, model) {
		t.Fatal("冷却到期后应惰性恢复")
	}
}

// TestBreakerResetByKey 验证：ResetByKey 删除指定 channelId+keyId 在所有 model 上的熔断记录，
// 且不误伤其他 key（如 keyId=1 的前缀 "3:1:" 不匹配 keyId=10 的 "3:10:foo"）。
func TestBreakerResetByKey(t *testing.T) {
	b := NewBreaker()
	const (
		channelID = 3
		keyID     = 3
		otherKey  = 4
		threshold = 2
		cooldown  = 60
	)
	// 在两个 model 上触发 keyID 熔断
	for _, m := range []string{"gpt-4", "claude-3-5-sonnet"} {
		for i := 0; i < threshold; i++ {
			b.RecordFailure(channelID, keyID, m, threshold, cooldown)
		}
		if !b.IsOpen(channelID, keyID, m) {
			t.Fatalf("model %s 应已熔断", m)
		}
	}
	// 另一个 key 也熔断，验证 ResetByKey 不误伤
	for i := 0; i < threshold; i++ {
		b.RecordFailure(channelID, otherKey, "gpt-4", threshold, cooldown)
	}
	if !b.IsOpen(channelID, otherKey, "gpt-4") {
		t.Fatal("otherKey 应已熔断")
	}
	// 范围重置 keyID
	b.ResetByKey(channelID, keyID)
	// keyID 在所有 model 上都应恢复
	if b.IsOpen(channelID, keyID, "gpt-4") {
		t.Fatal("ResetByKey 后 gpt-4 应恢复")
	}
	if b.IsOpen(channelID, keyID, "claude-3-5-sonnet") {
		t.Fatal("ResetByKey 后 claude-3-5-sonnet 应恢复")
	}
	// otherKey 不受影响
	if !b.IsOpen(channelID, otherKey, "gpt-4") {
		t.Fatal("ResetByKey 不应影响 otherKey")
	}
}

// TestBreakerResetByKeyPrefixSafety 验证前缀匹配安全性：
// keyId=1 的 ResetByKey 不应误删 keyId=10 的熔断记录。
func TestBreakerResetByKeyPrefixSafety(t *testing.T) {
	b := NewBreaker()
	const (
		channelID = 5
		threshold = 1
		cooldown  = 60
	)
	// 在 keyId=1 和 keyId=10 上各熔断一个 model
	b.RecordFailure(channelID, 1, "gpt-4", threshold, cooldown)
	b.RecordFailure(channelID, 10, "gpt-4", threshold, cooldown)
	if !b.IsOpen(channelID, 1, "gpt-4") || !b.IsOpen(channelID, 10, "gpt-4") {
		t.Fatal("两个 key 均应已熔断")
	}
	// 重置 keyId=1
	b.ResetByKey(channelID, 1)
	// keyId=1 恢复，keyId=10 不受影响
	if b.IsOpen(channelID, 1, "gpt-4") {
		t.Fatal("keyId=1 应已恢复")
	}
	if !b.IsOpen(channelID, 10, "gpt-4") {
		t.Fatal("keyId=10 不应被误删")
	}
}
