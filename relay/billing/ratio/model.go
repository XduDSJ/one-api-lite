package ratio

import (
	"encoding/json"
	"sync"

	"github.com/songquanpeng/one-api/common/logger"
)

const (
	USD2RMB   = 7
	USD       = 500 // $0.002 = 1 -> $1 = 500
	MILLI_USD = 1.0 / 1000 * USD
	RMB       = USD / USD2RMB
)

var modelRatioLock sync.RWMutex

// ModelRatio 计费倍率表已移除，统一返回固定值 1.0。
// 保留空 map 声明以兼容 relay/adaptor/openai/token.go 的遍历引用。
var ModelRatio = map[string]float64{}

// CompletionRatio 补全倍率表已移除，统一返回固定值 1.0。
// 保留空 map 声明以兼容序列化/反序列化函数。
var CompletionRatio = map[string]float64{}

var (
	DefaultModelRatio      map[string]float64
	DefaultCompletionRatio map[string]float64
)

func init() {
	DefaultModelRatio = make(map[string]float64)
	for k, v := range ModelRatio {
		DefaultModelRatio[k] = v
	}
	DefaultCompletionRatio = make(map[string]float64)
	for k, v := range CompletionRatio {
		DefaultCompletionRatio[k] = v
	}
}

func AddNewMissingRatio(oldRatio string) string {
	newRatio := make(map[string]float64)
	err := json.Unmarshal([]byte(oldRatio), &newRatio)
	if err != nil {
		logger.SysError("error unmarshalling old ratio: " + err.Error())
		return oldRatio
	}
	for k, v := range DefaultModelRatio {
		if _, ok := newRatio[k]; !ok {
			newRatio[k] = v
		}
	}
	jsonBytes, err := json.Marshal(newRatio)
	if err != nil {
		logger.SysError("error marshalling new ratio: " + err.Error())
		return oldRatio
	}
	return string(jsonBytes)
}

func ModelRatio2JSONString() string {
	jsonBytes, err := json.Marshal(ModelRatio)
	if err != nil {
		logger.SysError("error marshalling model ratio: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateModelRatioByJSONString(jsonStr string) error {
	modelRatioLock.Lock()
	defer modelRatioLock.Unlock()
	ModelRatio = make(map[string]float64)
	return json.Unmarshal([]byte(jsonStr), &ModelRatio)
}

// GetModelRatio 计费倍率表已移除，统一返回固定值 1.0。
func GetModelRatio(name string, channelType int) float64 {
	return 1.0
}

func CompletionRatio2JSONString() string {
	jsonBytes, err := json.Marshal(CompletionRatio)
	if err != nil {
		logger.SysError("error marshalling completion ratio: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateCompletionRatioByJSONString(jsonStr string) error {
	CompletionRatio = make(map[string]float64)
	return json.Unmarshal([]byte(jsonStr), &CompletionRatio)
}

// GetCompletionRatio 补全倍率表已移除，统一返回固定值 1.0。
func GetCompletionRatio(name string, channelType int) float64 {
	return 1.0
}
