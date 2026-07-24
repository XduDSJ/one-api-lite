package ratio

// 图片尺寸校验已放开：空 map 使所有尺寸通过校验，由上游自行拒绝不支持的尺寸。
// 图片成本比率因此固定为 1.0（dall-e-3 hd 除外），与"倍率统一为 1"的设计一致。
var ImageSizeRatios = map[string]map[string]float64{}

var ImageGenerationAmounts = map[string][2]int{
	"dall-e-2":                  {1, 10},
	"dall-e-3":                  {1, 1}, // OpenAI allows n=1 currently.
	"ali-stable-diffusion-xl":   {1, 4}, // Ali
	"ali-stable-diffusion-v1.5": {1, 4}, // Ali
	"wanx-v1":                   {1, 4}, // Ali
	"cogview-3":                 {1, 1},
	"step-1x-medium":            {1, 1},
}

var ImagePromptLengthLimitations = map[string]int{
	"dall-e-2":                  1000,
	"dall-e-3":                  4000,
	"ali-stable-diffusion-xl":   4000,
	"ali-stable-diffusion-v1.5": 4000,
	"wanx-v1":                   4000,
	"cogview-3":                 833,
	"step-1x-medium":            4000,
}

var ImageOriginModelName = map[string]string{
	"ali-stable-diffusion-xl":   "stable-diffusion-xl",
	"ali-stable-diffusion-v1.5": "stable-diffusion-v1.5",
}
