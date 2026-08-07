package breaker

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

// 熔断器状态常量
const (
	BreakerClosed = 0 // 关闭（正常放行）
	BreakerOpen   = 1 // 打开（熔断中）
)

// breakerEntry 单个三维键的熔断状态（纯内存，高频短生命周期，不落库）
type breakerEntry struct {
	state       int   // 熔断状态：BreakerClosed / BreakerOpen
	failCount   int   // 连续失败计数
	cooledUntil int64 // 冷却到期时间（unix 秒）
}

// Breaker 三维 channel:key:model 熔断器
type Breaker struct {
	mu sync.RWMutex
	m  map[string]*breakerEntry
}

// GlobalBreaker 全局熔断器实例
var GlobalBreaker = NewBreaker()

// NewBreaker 构造一个空熔断器
func NewBreaker() *Breaker {
	return &Breaker{m: make(map[string]*breakerEntry)}
}

// circuitKey 拼接三维键 channel:key:model
func circuitKey(channelId, keyId int, model string) string {
	return fmt.Sprintf("%d:%d:%s", channelId, keyId, model)
}

// IsOpen 判断该三维键是否处于熔断打开状态。
// 已过冷却期则惰性视为已恢复（返回 false），但不修改 map 状态。
func (b *Breaker) IsOpen(channelId, keyId int, model string) bool {
	key := circuitKey(channelId, keyId, model)
	b.mu.RLock()
	defer b.mu.RUnlock()
	e, ok := b.m[key]
	if !ok || e.state != BreakerOpen {
		return false
	}
	// 已过冷却期，惰性恢复
	if time.Now().Unix() >= e.cooledUntil {
		return false
	}
	return true
}

// RecordFailure 记录一次失败，达阈值则熔断。
// 已熔断且未到期则直接返回，不重复计数。
func (b *Breaker) RecordFailure(channelId, keyId int, model string, threshold int, cooldownSec int) {
	key := circuitKey(channelId, keyId, model)
	b.mu.Lock()
	defer b.mu.Unlock()
	e, ok := b.m[key]
	if !ok {
		e = &breakerEntry{}
		b.m[key] = e
	}
	// 已 Open 且未到期：不重复计数
	if e.state == BreakerOpen && time.Now().Unix() < e.cooledUntil {
		return
	}
	// 否则累计失败，达阈值即熔断
	e.failCount++
	if e.failCount >= threshold {
		e.state = BreakerOpen
		e.cooledUntil = time.Now().Unix() + int64(cooldownSec)
	}
}

// RecordSuccess 记录一次成功，立即重置该三维键状态
func (b *Breaker) RecordSuccess(channelId, keyId int, model string) {
	key := circuitKey(channelId, keyId, model)
	b.mu.Lock()
	defer b.mu.Unlock()
	e, ok := b.m[key]
	if !ok {
		return
	}
	e.state = BreakerClosed
	e.failCount = 0
	e.cooledUntil = 0
}

// Reset 手动重置（删除）该三维键的熔断记录
func (b *Breaker) Reset(channelId, keyId int, model string) {
	key := circuitKey(channelId, keyId, model)
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.m, key)
}

// ResetByKey 范围重置：删除指定 channelId+keyId 在所有 model 上的熔断记录。
// 用于 EnableChannelKey 等「按 key 维度立即恢复」场景，
// 避免对每个 model 逐条调用 Reset（传空串 model 的 Reset 只会删 channelId:keyId: 这一条不存在的 entry）。
// 前缀 "channelId:keyId:" 不会误伤其他 key（如 keyId=1 的前缀 "3:1:" 不匹配 "3:10:foo"）。
func (b *Breaker) ResetByKey(channelId, keyId int) {
	prefix := fmt.Sprintf("%d:%d:", channelId, keyId)
	b.mu.Lock()
	defer b.mu.Unlock()
	for k := range b.m {
		if strings.HasPrefix(k, prefix) {
			delete(b.m, k)
		}
	}
}
