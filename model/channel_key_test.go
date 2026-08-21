package model

import (
	"testing"
	"time"

	"github.com/songquanpeng/one-api/relay/breaker"
)

// TestParseNextResetTime 锁定 "HH:MM" 规则解析：今天已过则顺延到明天、未过则今天。
// 时区按 time.Local（测试机本地时区）。相对时刻，不依赖绝对时间戳。
func TestParseNextResetTime(t *testing.T) {
	now := time.Now()
	nowTs := now.Unix()

	tests := []struct {
		name string
		rule string
		// want 是「从 now 起下一个 rule 时刻」相对 now 的期望：
		// todayRulePassed=true → 明天该时刻；false → 今天该时刻。
		passed bool
		hh, mm int
	}{
		{"00:00 今天已过(凌晨已过)", "00:00", true, 0, 0},
		{"23:59 今天未过(晚上还没到)", "23:59", false, 23, 59},
		{"空规则返回0", "", false, 0, 0},
		{"非法规则返回0", "daily", false, 0, 0},
		{"非法格式返回0", "25:99", false, 0, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseNextResetTime(tt.rule, nowTs)
			if tt.rule == "" || tt.rule == "daily" || tt.rule == "25:99" {
				if got != 0 {
					t.Errorf("rule=%q: got %d, want 0", tt.rule, got)
				}
				return
			}
			if got <= 0 {
				t.Fatalf("rule=%q: got %d, want >0", tt.rule, got)
			}
			// 校验时刻落在期望的「今天或明天的 hh:mm」
			gotT := time.Unix(got, 0)
			if gotT.Hour() != tt.hh || gotT.Minute() != tt.mm {
				t.Errorf("rule=%q: got time %02d:%02d, want %02d:%02d", tt.rule, gotT.Hour(), gotT.Minute(), tt.hh, tt.mm)
			}
			// 校验是「未来」且不超过 24h
			d := gotT.Sub(now)
			if d <= 0 {
				t.Errorf("rule=%q: next reset %v not after now", tt.rule, gotT)
			}
			if d > 25*time.Hour {
				t.Errorf("rule=%q: next reset %v more than 24h ahead", tt.rule, gotT)
			}
		})
	}
}

// TestTodayRulePassed 锁定「今日规则时刻是否已过」判定。
func TestTodayRulePassed(t *testing.T) {
	now := time.Now()
	// 用当前小时构造：上一小时已过，下一小时未过
	prevHH := (now.Hour() + 23) % 24
	nextHH := (now.Hour() + 1) % 24
	prevRule := timeFormatter(prevHH, now.Minute())
	nextRule := timeFormatter(nextHH, now.Minute())

	if !todayRulePassed(prevRule, now.Unix()) {
		t.Errorf("rule=%s (上一小时) 应判定为已过", prevRule)
	}
	if todayRulePassed(nextRule, now.Unix()) {
		t.Errorf("rule=%s (下一小时) 应判定为未过", nextRule)
	}
	if todayRulePassed("", now.Unix()) {
		t.Errorf("空规则应返回 false")
	}
	if todayRulePassed("daily", now.Unix()) {
		t.Errorf("非法规则应返回 false")
	}
}

// timeFormatter 把 HH:MM 拼成字符串（辅助 TestTodayRulePassed）。
func timeFormatter(hh, mm int) string {
	return formatTwo(hh) + ":" + formatTwo(mm)
}
func formatTwo(n int) string {
	if n < 10 {
		return "0" + itoa(n)
	}
	return itoa(n)
}
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

// TestArmQuotaReset 锁定「上闹钟」逻辑：合法规则→QuotaResetAt>0；空/非法→0。
func TestArmQuotaReset(t *testing.T) {
	now := time.Now().Unix()
	cases := []struct {
		name      string
		rule      string
		wantZero  bool // true=期望 QuotaResetAt==0
	}{
		{"合法 00:00 上闹钟", "00:00", false},
		{"合法 03:30 上闹钟", "03:30", false},
		{"空规则→0", "", true},
		{"非法 daily→0", "daily", true},
		{"非法 25:99→0", "25:99", true},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			k := &ChannelKey{QuotaResetRule: tt.rule}
			armQuotaReset(k, now)
			if tt.wantZero {
				if k.QuotaResetAt != 0 {
					t.Errorf("rule=%q: QuotaResetAt=%d, want 0", tt.rule, k.QuotaResetAt)
				}
			} else {
				if k.QuotaResetAt <= 0 {
					t.Errorf("rule=%q: QuotaResetAt=%d, want >0", tt.rule, k.QuotaResetAt)
				}
			}
		})
	}
}

// TestBatchInsertChannelKeysArmsReset DB 驱动：插入带规则的 key 应自动上闹钟。
func TestBatchInsertChannelKeysArmsReset(t *testing.T) {
	const ch = 9001
	keys := []ChannelKey{
		{ChannelId: ch, KeyValue: "sk-with-rule", Status: KeyStatusEnabled, Priority: 1, QuotaResetRule: "00:00"},
		{ChannelId: ch, KeyValue: "sk-no-rule", Status: KeyStatusEnabled, Priority: 2, QuotaResetRule: ""},
	}
	if err := BatchInsertChannelKeys(keys); err != nil {
		t.Fatalf("BatchInsertChannelKeys failed: %v", err)
	}
	defer DeleteChannelKeysByChannelId(ch)

	all, err := GetChannelKeysByChannelId(ch)
	if err != nil {
		t.Fatalf("GetChannelKeysByChannelId failed: %v", err)
	}
	for _, k := range all {
		switch k.KeyValue {
		case "sk-with-rule":
			if k.QuotaResetAt <= 0 {
				t.Errorf("sk-with-rule: QuotaResetAt=%d, want >0 (应自动上闹钟)", k.QuotaResetAt)
			}
		case "sk-no-rule":
			if k.QuotaResetAt != 0 {
				t.Errorf("sk-no-rule: QuotaResetAt=%d, want 0", k.QuotaResetAt)
			}
		}
	}
}

// TestUpdateChannelKeyRearmsReset DB 驱动：编辑 key（改规则）后闹钟应按新规则重算。
// 验证「额度/规则变化→重置时刻跟随」。
func TestUpdateChannelKeyRearmsReset(t *testing.T) {
	const ch = 9002
	keys := []ChannelKey{
		{ChannelId: ch, KeyValue: "sk-edit", Status: KeyStatusEnabled, Priority: 1, QuotaResetRule: "00:00"},
	}
	if err := BatchInsertChannelKeys(keys); err != nil {
		t.Fatalf("BatchInsertChannelKeys failed: %v", err)
	}
	defer DeleteChannelKeysByChannelId(ch)

	all, _ := GetChannelKeysByChannelId(ch)
	if len(all) != 1 {
		t.Fatalf("expected 1 key, got %d", len(all))
	}
	oldResetAt := all[0].QuotaResetAt
	if oldResetAt <= 0 {
		t.Fatalf("初始 QuotaResetAt 应 >0，实际 %d", oldResetAt)
	}

	// 改规则为 03:30，更新后闹钟应重算
	all[0].QuotaResetRule = "03:30"
	if err := UpdateChannelKey(&all[0]); err != nil {
		t.Fatalf("UpdateChannelKey failed: %v", err)
	}
	after, _ := GetChannelKeysByChannelId(ch)
	if after[0].QuotaResetAt <= 0 {
		t.Fatalf("改规则后 QuotaResetAt 应 >0，实际 %d", after[0].QuotaResetAt)
	}
	// 03:30 的下一次时刻应与 00:00 的不同（除非正好跨在两次重置之间，但 3.5h 差异保证不同）
	if after[0].QuotaResetAt == oldResetAt {
		t.Errorf("改规则后闹钟未重算：QuotaResetAt 仍=%d（旧），期望变化", oldResetAt)
	}
	// 闹钟时刻应是 03:30
	gotT := time.Unix(after[0].QuotaResetAt, 0)
	if gotT.Hour() != 3 || gotT.Minute() != 30 {
		t.Errorf("改规则后闹钟时刻=%02d:%02d, want 03:30", gotT.Hour(), gotT.Minute())
	}
}

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
		picked, err := PickKey(10, MultiKeyModePriority, "gpt-4o", "", nil)
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
	picked, err := PickKey(11, MultiKeyModePriority, "gpt-4o", "", nil)
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
	picked, err := PickKey(12, MultiKeyModePriority, "gpt-4o", "", nil)
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

// TestQuotaState 锁定 ChannelKey.QuotaState() 的 5 态映射。
// 判定镜像 filterUsableKeys 关卡 1/3/4，但只读不改 status。
func TestQuotaState(t *testing.T) {
	cases := []struct {
		name string
		key  ChannelKey
		want string
	}{
		{
			name: "active: 启用 + 配额充足",
			key:  ChannelKey{Status: KeyStatusEnabled, DailyQuotaLimit: 50000000, DailyUsedQuota: 1000000, AvgTokensPerReq: 100000},
			want: "active",
		},
		{
			name: "low_quota: 启用 + 剩余 < 1.5×avg（软预判会跳过，实测的 key 1 场景）",
			key:  ChannelKey{Status: KeyStatusEnabled, DailyQuotaLimit: 50000000, DailyUsedQuota: 49925479, AvgTokensPerReq: 126543.4},
			want: "low_quota",
		},
		{
			name: "exhausted: 启用 + used>=limit（硬到顶但未被标 status=4）",
			key:  ChannelKey{Status: KeyStatusEnabled, DailyQuotaLimit: 50000000, DailyUsedQuota: 50000000, AvgTokensPerReq: 100000},
			want: "exhausted",
		},
		{
			name: "exhausted: status=4（配额耗尽）",
			key:  ChannelKey{Status: KeyStatusExhausted, DailyQuotaLimit: 50000000, DailyUsedQuota: 50000000},
			want: "exhausted",
		},
		{
			name: "cooling: status=3（冷却中）",
			key:  ChannelKey{Status: KeyStatusCooling},
			want: "cooling",
		},
		{
			name: "disabled: status=2（手动禁用）",
			key:  ChannelKey{Status: KeyStatusDisabled},
			want: "disabled",
		},
		{
			name: "active: limit=0（不设上限，恒 active）",
			key:  ChannelKey{Status: KeyStatusEnabled, DailyQuotaLimit: 0, DailyUsedQuota: 999999, AvgTokensPerReq: 1000},
			want: "active",
		},
		{
			name: "active: avg=0 时不触发 low_quota（无历史平均，无法预判）",
			key:  ChannelKey{Status: KeyStatusEnabled, DailyQuotaLimit: 50000000, DailyUsedQuota: 49999999, AvgTokensPerReq: 0},
			want: "active",
		},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.key.QuotaState()
			if got != tt.want {
				t.Errorf("QuotaState() = %q, want %q (status=%d used=%d limit=%d avg=%.1f)",
					got, tt.want, tt.key.Status, tt.key.DailyUsedQuota, tt.key.DailyQuotaLimit, tt.key.AvgTokensPerReq)
			}
		})
	}
}
