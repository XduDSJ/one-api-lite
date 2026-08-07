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
