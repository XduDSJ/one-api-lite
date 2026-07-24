package ratio

const (
	USD2RMB   = 7
	USD       = 500 // $0.002 = 1 -> $1 = 500
	MILLI_USD = 1.0 / 1000 * USD
	RMB       = USD / USD2RMB
)

// ModelRatio 计费倍率表已移除，统一返回固定值 1.0。
// 保留空 map 声明以兼容 relay/adaptor/openai/token.go 的遍历引用。
var ModelRatio = map[string]float64{}

// CompletionRatio 补全倍率表已移除，统一返回固定值 1.0。
var CompletionRatio = map[string]float64{}

// GetModelRatio 计费倍率表已移除，统一返回固定值 1.0。
func GetModelRatio(name string, channelType int) float64 {
	return 1.0
}

// GetCompletionRatio 补全倍率表已移除，统一返回固定值 1.0。
func GetCompletionRatio(name string, channelType int) float64 {
	return 1.0
}
