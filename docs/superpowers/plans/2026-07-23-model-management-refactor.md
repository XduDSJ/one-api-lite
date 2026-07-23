# 模型管理改造实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除硬编码默认模型列表,改为从上游 API 获取 + 手动添加,`/v1/models` 从 ability 表聚合。

**Architecture:** 后端新增 `fetch_models` 接口请求上游 `/v1/models`;`controller/model.go` 的 `init()` 移除,改为运行时从 `ability` 表查询;前端移除"填入"按钮,新增"从上游获取"按钮。适配器零改动。

**Tech Stack:** Go + Gin + GORM(SQLite),React + Semantic UI

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `model/ability.go` | 修改 | 新增 `GetAllDistinctModels`、`GetChannelModelsMap` 查询 |
| `model/ability_test.go` | 创建 | 测试新增查询函数 |
| `controller/channel_fetch_models.go` | 创建 | `FetchChannelModels` — 请求上游 `/v1/models` |
| `controller/channel_fetch_models_test.go` | 创建 | 测试 fetch_models(mock HTTP server) |
| `controller/model.go` | 修改 | 移除 `init()`,改造 4 个函数从 ability 表查询 |
| `router/api.go` | 修改 | 新增 `fetch_models` 路由 |
| `web/default/src/pages/Channel/EditChannel.js` | 修改 | 移除填入按钮,新增从上游获取按钮 |
| `web/default/src/helpers/utils.js` | 修改 | 移除 `getChannelModels`、`loadChannelModels` |

---

### Task 1: 新增 ability 表聚合查询函数

**Files:**
- Modify: `model/ability.go`(末尾追加)
- Test: `model/ability_test.go`(创建)

- [ ] **Step 1: 编写失败测试**

创建 `model/ability_test.go`:

```go
package model

import (
	"os"
	"sort"
	"testing"
)

func TestMain(m *testing.M) {
	// 使用临时 SQLite 文件进行测试
	os.Setenv("SQL_DSN", "")
	common.SQLitePath = ":memory:"
	InitDB()
	// 插入测试数据
	channel1 := Channel{
		Id: 1, Type: 1, Status: ChannelStatusEnabled,
		Models: "gpt-4o,gpt-4o-mini", Group: "default",
	}
	channel1.Insert()
	channel2 := Channel{
		Id: 2, Type: 1, Status: ChannelStatusEnabled,
		Models: "gpt-4o,claude-3-opus", Group: "default",
	}
	channel2.Insert()
	os.Exit(m.Run())
}

func TestGetAllDistinctModels(t *testing.T) {
	models, err := GetAllDistinctModels()
	if err != nil {
		t.Fatalf("GetAllDistinctModels failed: %v", err)
	}
	expected := []string{"claude-3-opus", "gpt-4o", "gpt-4o-mini"}
	sort.Strings(models)
	if len(models) != len(expected) {
		t.Fatalf("expected %d models, got %d: %v", len(expected), len(models), models)
	}
	for i, m := range models {
		if m != expected[i] {
			t.Errorf("expected[%d]=%s, got %s", i, expected[i], m)
		}
	}
}

func TestGetChannelModelsMap(t *testing.T) {
	m, err := GetChannelModelsMap()
	if err != nil {
		t.Fatalf("GetChannelModelsMap failed: %v", err)
	}
	if len(m) != 2 {
		t.Fatalf("expected 2 channels, got %d", len(m))
	}
	if len(m[1]) != 2 {
		t.Errorf("channel 1: expected 2 models, got %d", len(m[1]))
	}
	if len(m[2]) != 2 {
		t.Errorf("channel 2: expected 2 models, got %d", len(m[2]))
	}
}
```

注意:测试文件需要 import `github.com/songquanpeng/one-api/common`。如果 `common.SQLitePath` 不可直接设置,改用 `os.Setenv("SQLITE_PATH", ":memory:")` 并确保 `model/main.go` 读取该环境变量。根据实际代码调整。

- [ ] **Step 2: 运行测试验证失败**

Run: `go test ./model/ -run TestGetAllDistinctModels -v`
Expected: FAIL — `GetAllDistinctModels` undefined

- [ ] **Step 3: 实现查询函数**

在 `model/ability.go` 末尾追加:

```go
// GetAllDistinctModels 返回 ability 表中所有去重的模型名
func GetAllDistinctModels() ([]string, error) {
	var models []string
	err := DB.Model(&Ability{}).Distinct("model").Pluck("model", &models).Error
	if err != nil {
		return nil, err
	}
	sort.Strings(models)
	return models, nil
}

// GetChannelModelsMap 返回 channel_id -> []model 映射
func GetChannelModelsMap() (map[int][]string, error) {
	var abilities []Ability
	err := DB.Select("channel_id, model").Find(&abilities).Error
	if err != nil {
		return nil, err
	}
	result := make(map[int][]string)
	for _, a := range abilities {
		result[a.ChannelId] = append(result[a.ChannelId], a.Model)
	}
	return result, nil
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `go test ./model/ -run TestGetAllDistinctModels -v && go test ./model/ -run TestGetChannelModelsMap -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add model/ability.go model/ability_test.go
git commit -m "feat(model): 新增 ability 表聚合查询函数 GetAllDistinctModels 和 GetChannelModelsMap"
```

---

### Task 2: 新增 fetch_models 后端接口

**Files:**
- Create: `controller/channel_fetch_models.go`
- Create: `controller/channel_fetch_models_test.go`

- [ ] **Step 1: 编写失败测试**

创建 `controller/channel_fetch_models_test.go`:

```go
package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseUpstreamModels(t *testing.T) {
	// 测试标准 OpenAI 格式响应解析
	body := `{"data": [{"id": "gpt-4o"}, {"id": "gpt-4o-mini"}, {"id": "claude-3-opus"}]}`
	models, err := parseUpstreamModels([]byte(body))
	if err != nil {
		t.Fatalf("parseUpstreamModels failed: %v", err)
	}
	if len(models) != 3 {
		t.Fatalf("expected 3 models, got %d", len(models))
	}
	expected := []string{"gpt-4o", "gpt-4o-mini", "claude-3-opus"}
	for i, m := range models {
		if m != expected[i] {
			t.Errorf("expected[%d]=%s, got %s", i, expected[i], m)
		}
	}
}

func TestParseUpstreamModels_Empty(t *testing.T) {
	body := `{"data": []}`
	models, err := parseUpstreamModels([]byte(body))
	if err != nil {
		t.Fatalf("parseUpstreamModels failed: %v", err)
	}
	if len(models) != 0 {
		t.Fatalf("expected 0 models, got %d", len(models))
	}
}

func TestParseUpstreamModels_InvalidJSON(t *testing.T) {
	body := `not json`
	_, err := parseUpstreamModels([]byte(body))
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestFetchChannelModels_MockServer(t *testing.T) {
	// 启动 mock 上游服务器
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/models", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]string{
				{"id": "gpt-4o"},
				{"id": "gpt-4o-mini"},
			},
		})
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	models, err := fetchModelsFromUpstream(server.URL+"/v1/models", "test-key")
	if err != nil {
		t.Fatalf("fetchModelsFromUpstream failed: %v", err)
	}
	if len(models) != 2 {
		t.Fatalf("expected 2 models, got %d", len(models))
	}
}

func TestFetchChannelModels_Unauthorized(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/models", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	_, err := fetchModelsFromUpstream(server.URL+"/v1/models", "bad-key")
	if err == nil {
		t.Fatal("expected error for unauthorized request")
	}
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `go test ./controller/ -run TestParseUpstreamModels -v`
Expected: FAIL — `parseUpstreamModels` undefined

- [ ] **Step 3: 实现 fetch_models 接口**

创建 `controller/channel_fetch_models.go`:

```go
package controller

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/client"
	"github.com/songquanpeng/one-api/model"
)

// upstreamModelResponse 上游 /v1/models 的响应格式
type upstreamModelResponse struct {
	Data []struct {
		Id string `json:"id"`
	} `json:"data"`
}

// parseUpstreamModels 解析上游返回的模型列表 JSON
func parseUpstreamModels(body []byte) ([]string, error) {
	var resp upstreamModelResponse
	err := json.Unmarshal(body, &resp)
	if err != nil {
		return nil, fmt.Errorf("解析模型列表失败: %w", err)
	}
	models := make([]string, 0, len(resp.Data))
	for _, m := range resp.Data {
		if m.Id != "" {
			models = append(models, m.Id)
		}
	}
	return models, nil
}

// fetchModelsFromUpstream 请求上游 /v1/models 获取模型列表
func fetchModelsFromUpstream(url, key string) ([]string, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Accept", "application/json")

	resp, err := client.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求上游失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("上游返回状态码 %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	return parseUpstreamModels(body)
}

// FetchChannelModels 用已保存渠道的 Key + BaseURL 请求上游 /v1/models
func FetchChannelModels(c *gin.Context) {
	channelId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "无效的渠道 ID",
		})
		return
	}

	// selectAll=true 以获取 Key
	channel, err := model.GetChannelById(channelId, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "获取渠道失败: " + err.Error(),
		})
		return
	}

	baseURL := channel.GetBaseURL()
	if baseURL == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "该渠道未设置 BaseURL,无法获取模型列表",
		})
		return
	}

	// 构建 /v1/models URL
	url := baseURL + "/v1/models"

	models, err := fetchModelsFromUpstream(url, channel.Key)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "获取模型失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    models,
	})
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `go test ./controller/ -run "TestParseUpstreamModels|TestFetchChannelModels" -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add controller/channel_fetch_models.go controller/channel_fetch_models_test.go
git commit -m "feat(controller): 新增 fetch_models 接口从上游获取模型列表"
```

---

### Task 3: 注册 fetch_models 路由

**Files:**
- Modify: `router/api.go:71-86`(channelRoute 组)

- [ ] **Step 1: 添加路由**

在 `router/api.go` 的 `channelRoute` 组内,在 `channelRoute.GET("/:id", controller.GetChannel)` 之后添加:

```go
			channelRoute.GET("/fetch_models/:id", controller.FetchChannelModels)
```

注意:此路由必须放在 `channelRoute.GET("/:id", ...)` 之后、不影响现有路由匹配。Gin 的路由树会正确区分 `/fetch_models/:id` 和 `/:id`。

- [ ] **Step 2: 验证编译**

Run: `go build ./router/`
Expected: 编译成功,无错误

- [ ] **Step 3: 提交**

```bash
git add router/api.go
git commit -m "feat(router): 注册 fetch_models 路由"
```

---

### Task 4: 改造 controller/model.go — 移除 init(),改为 ability 表查询

**Files:**
- Modify: `controller/model.go`(大幅改造)

- [ ] **Step 1: 移除 init() 和全局变量**

将 `controller/model.go` 的第 45-115 行(全局变量 `models`、`modelsMap`、`channelId2Models` 和 `init()` 函数)全部删除。

同时移除不再需要的 import:
- `relay "github.com/songquanpeng/one-api/relay"`
- `"github.com/songquanpeng/one-api/relay/adaptor/openai"`
- `"github.com/songquanpeng/one-api/relay/apitype"`
- `"github.com/songquanpeng/one-api/relay/channeltype"`
- `"github.com/songquanpeng/one-api/relay/meta"`

保留的 import:
- `"fmt"`
- `"github.com/gin-gonic/gin"`
- `"github.com/songquanpeng/one-api/common/ctxkey"`
- `"github.com/songquanpeng/one-api/model"`
- `"net/http"`
- `"strings"`

- [ ] **Step 2: 改造 DashboardListModels**

将 `DashboardListModels`(原 117-123 行)改为:

```go
func DashboardListModels(c *gin.Context) {
	channelId2Models, err := model.GetChannelModelsMap()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    channelId2Models,
	})
}
```

- [ ] **Step 3: 改造 ListAllModels**

将 `ListAllModels`(原 125-130 行)改为:

```go
func ListAllModels(c *gin.Context) {
	allModels, err := model.GetAllDistinctModels()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	openAIModels := make([]OpenAIModels, 0, len(allModels))
	for _, m := range allModels {
		openAIModels = append(openAIModels, OpenAIModels{
			Id:      m,
			Object:  "model",
			Created: 1626777600,
			OwnedBy: "custom",
			Root:    m,
			Parent:  nil,
		})
	}
	c.JSON(200, gin.H{
		"object": "list",
		"data":   openAIModels,
	})
}
```

- [ ] **Step 4: 改造 ListModels**

将 `ListModels`(原 132-169 行)改为:

```go
func ListModels(c *gin.Context) {
	ctx := c.Request.Context()
	var availableModels []string
	if c.GetString(ctxkey.AvailableModels) != "" {
		availableModels = strings.Split(c.GetString(ctxkey.AvailableModels), ",")
	} else {
		userId := c.GetInt(ctxkey.Id)
		userGroup, _ := model.CacheGetUserGroup(userId)
		availableModels, _ = model.CacheGetGroupModels(ctx, userGroup)
	}
	// 去重
	modelSet := make(map[string]bool)
	for _, m := range availableModels {
		modelSet[m] = true
	}
	availableOpenAIModels := make([]OpenAIModels, 0, len(modelSet))
	for modelName := range modelSet {
		availableOpenAIModels = append(availableOpenAIModels, OpenAIModels{
			Id:      modelName,
			Object:  "model",
			Created: 1626777600,
			OwnedBy: "custom",
			Root:    modelName,
			Parent:  nil,
		})
	}
	c.JSON(200, gin.H{
		"object": "list",
		"data":   availableOpenAIModels,
	})
}
```

- [ ] **Step 5: 改造 RetrieveModel**

将 `RetrieveModel`(原 171-186 行)改为从 ability 表查询:

```go
func RetrieveModel(c *gin.Context) {
	modelId := c.Param("model")
	// 从 ability 表查询该模型是否存在
	allModels, err := model.GetAllDistinctModels()
	if err != nil {
		c.JSON(200, gin.H{
			"error": relaymodel.Error{
				Message: fmt.Sprintf("Failed to query models: %s", err.Error()),
				Type:    "invalid_request_error",
				Param:   "model",
				Code:    "internal_error",
			},
		})
		return
	}
	for _, m := range allModels {
		if m == modelId {
			c.JSON(200, OpenAIModels{
				Id:      modelId,
				Object:  "model",
				Created: 1626777600,
				OwnedBy: "custom",
				Root:    modelId,
				Parent:  nil,
			})
			return
		}
	}
	c.JSON(200, gin.H{
		"error": relaymodel.Error{
			Message: fmt.Sprintf("The model '%s' does not exist", modelId),
			Type:    "invalid_request_error",
			Param:   "model",
			Code:    "model_not_found",
		},
	})
}
```

注意:保留 `relaymodel "github.com/songquanpeng/one-api/relay/model"` import,因为 `RetrieveModel` 使用 `relaymodel.Error`。

- [ ] **Step 6: 验证编译**

Run: `go build ./controller/`
Expected: 编译成功

- [ ] **Step 7: 运行现有测试**

Run: `go test ./controller/ -v`
Expected: 现有测试通过(如果有),新增测试通过

- [ ] **Step 8: 提交**

```bash
git add controller/model.go
git commit -m "refactor(controller): 移除 init() 全局模型列表,改为从 ability 表运行时查询"
```

---

### Task 5: 改造前端 EditChannel.js — 移除填入按钮,新增从上游获取按钮

**Files:**
- Modify: `web/default/src/pages/Channel/EditChannel.js`

- [ ] **Step 1: 移除 getChannelModels import 和相关 state**

第 5 行,从 import 中移除 `getChannelModels`:
```javascript
import {API, copy, showError, showInfo, showSuccess, verifyJSON,} from '../../helpers';
```

第 57-58 行,移除 `basicModels` 和 `fullModels` state:
```javascript
  // 删除: const [basicModels, setBasicModels] = useState([]);
  // 删除: const [fullModels, setFullModels] = useState([]);
```

新增 `fetchingModels` state(在 `customModel` state 之后):
```javascript
  const [fetchingModels, setFetchingModels] = useState(false);
```

- [ ] **Step 2: 移除 handleInputChange 中的渠道类型切换逻辑**

第 68-77 行,将 `handleInputChange` 改为:
```javascript
  const handleInputChange = (e, { name, value }) => {
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  };
```
移除了 `if (name === 'type')` 块(不再根据渠道类型自动加载模型)。

- [ ] **Step 3: 移除 loadChannel 中的 setBasicModels**

第 108 行,移除:
```javascript
      setBasicModels(getChannelModels(data.type));
```

- [ ] **Step 4: 移除 fetchModels 函数,新增 fetchUpstreamModels 函数**

第 115-128 行,将 `fetchModels` 函数替换为:
```javascript
  const fetchUpstreamModels = async () => {
    if (!channelId) {
      showInfo('请先保存渠道后再从上游获取模型');
      return;
    }
    setFetchingModels(true);
    try {
      let res = await API.get(`/api/channel/fetch_models/${channelId}`);
      const { success, message, data } = res.data;
      if (success) {
        if (data.length === 0) {
          showInfo('上游未返回任何模型,请检查 Key 和 BaseURL');
          return;
        }
        // 合并到当前已选模型(去重)
        let existingModels = new Set(inputs.models);
        let newModels = [];
        data.forEach((model) => {
          if (!existingModels.has(model)) {
            newModels.push(model);
          }
        });
        let allModels = [...inputs.models, ...newModels];
        handleInputChange(null, { name: 'models', value: allModels });
        // 更新下拉选项
        let newOptions = newModels.map((m) => ({
          key: m,
          text: m,
          value: m,
        }));
        setModelOptions((modelOptions) => [...modelOptions, ...newOptions]);
        showSuccess(`获取到 ${data.length} 个模型,新增 ${newModels.length} 个`);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setFetchingModels(false);
    }
  };
```

- [ ] **Step 5: 移除 useEffect 中的 fetchModels 和 getChannelModels 调用**

第 159-168 行,将 `useEffect` 改为:
```javascript
  useEffect(() => {
    if (isEdit) {
      loadChannel().then();
    }
    fetchGroups().then();
  }, []);
```
移除了 `fetchModels().then()` 和 `else` 块中的 `getChannelModels` 调用。

- [ ] **Step 6: 移除 originModelOptions state 和相关 useEffect**

第 54 行,移除:
```javascript
  // 删除: const [originModelOptions, setOriginModelOptions] = useState([]);
```

第 145-157 行,将 `useEffect` 改为(移除对 `originModelOptions` 的依赖):
```javascript
  useEffect(() => {
    let localModelOptions = [];
    inputs.models.forEach((model) => {
      if (!localModelOptions.find((option) => option.key === model)) {
        localModelOptions.push({
          key: model,
          text: model,
          value: model,
        });
      }
    });
    setModelOptions(localModelOptions);
  }, [inputs.models]);
```

- [ ] **Step 7: 替换按钮区域**

第 438-489 行,将整个按钮区域替换为:
```javascript
            {inputs.type !== 43 && (
              <div style={{ lineHeight: '40px', marginBottom: '12px' }}>
                <Button
                  type={'button'}
                  loading={fetchingModels}
                  disabled={!isEdit || fetchingModels}
                  onClick={fetchUpstreamModels}
                >
                  {t('channel.edit.buttons.fetch_upstream') || '从上游获取'}
                </Button>
                <Button
                  type={'button'}
                  onClick={() => {
                    handleInputChange(null, { name: 'models', value: [] });
                  }}
                >
                  {t('channel.edit.buttons.clear')}
                </Button>
                <Input
                  action={
                    <Button type={'button'} onClick={addCustomModel}>
                      {t('channel.edit.buttons.add_custom')}
                    </Button>
                  }
                  placeholder={t('channel.edit.buttons.custom_placeholder')}
                  value={customModel}
                  onChange={(e, { value }) => {
                    setCustomModel(value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addCustomModel();
                      e.preventDefault();
                    }
                  }}
                />
              </div>
            )}
```

关键变化:
- 移除了"填入相关模型"按钮(原 `basicModels`)
- 移除了"填入所有模型"按钮(原 `fullModels`)
- 新增"从上游获取"按钮,`disabled={!isEdit || fetchingModels}` — 新建渠道未保存时禁用
- 保留了"清空"按钮和"自定义模型"输入

- [ ] **Step 8: 验证前端构建**

Run: `cd web/default && npm run build`
Expected: 构建成功

- [ ] **Step 9: 提交**

```bash
git add web/default/src/pages/Channel/EditChannel.js
git commit -m "feat(web): 移除填入模型按钮,新增从上游获取按钮"
```

---

### Task 6: 改造前端 utils.js — 移除 getChannelModels

**Files:**
- Modify: `web/default/src/helpers/utils.js:193-217`

- [ ] **Step 1: 移除 channelModels 相关代码**

删除第 193-217 行(`channelModels` 变量、`loadChannelModels` 函数、`getChannelModels` 函数):

```javascript
// 删除以下全部代码:
// let channelModels = undefined;
// export async function loadChannelModels() { ... }
// export function getChannelModels(type) { ... }
```

- [ ] **Step 2: 检查其他文件对 loadChannelModels 的引用**

搜索项目中对 `loadChannelModels` 和 `getChannelModels` 的引用,逐一移除:

Run: `grep -r "loadChannelModels\|getChannelModels" web/default/src/ --include="*.js"`

预期引用位置:
- `EditChannel.js` — 已在 Task 5 中移除
- 可能还有 `App.js` 或其他初始化文件中调用 `loadChannelModels`

对于每个引用,移除 import 和调用。

- [ ] **Step 3: 验证前端构建**

Run: `cd web/default && npm run build`
Expected: 构建成功,无未定义引用

- [ ] **Step 4: 提交**

```bash
git add web/default/src/helpers/utils.js
git commit -m "refactor(web): 移除 getChannelModels 和 loadChannelModels"
```

---

### Task 7: 集成验证

- [ ] **Step 1: 后端全量编译**

Run: `go build ./...`
Expected: 编译成功

- [ ] **Step 2: 后端全量测试**

Run: `go test ./...`
Expected: 全部通过

- [ ] **Step 3: 前端构建**

Run: `cd web/default && npm run build`
Expected: 构建成功

- [ ] **Step 4: 手动验证 — 新建渠道流程**

1. 启动后端: `go build -o one-api && ./one-api --port 3000`
2. 登录管理后台
3. 新建渠道 → 填入名称、Key、BaseURL → 手动添加一个占位模型 → 保存
4. 编辑该渠道 → 点"从上游获取" → 确认模型列表回填
5. 保存 → 确认 ability 表写入

- [ ] **Step 5: 手动验证 — /v1/models 接口**

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/v1/models
```
Expected: 返回的模型列表 = ability 表 DISTINCT model

- [ ] **Step 6: 手动验证 — 中继请求**

用返回的模型列表中的任一模型发送中继请求,确认正常响应。

- [ ] **Step 7: 提交最终状态**

```bash
git add -A
git commit -m "test: 模型管理改造集成验证通过"
```
