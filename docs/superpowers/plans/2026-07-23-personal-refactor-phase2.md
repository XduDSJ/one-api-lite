# One API 个人化改造第二阶段实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 7 个子项目的 UI/UX 改造、功能精简和统计仪表盘增强

**Architecture:** 按依赖顺序实施：B（独立）→ A（独立）→ D（独立）→ E（依赖 D）→ F（依赖 D）→ G（独立）→ C（独立）。每个子项目产出可独立构建验证的软件。

**Tech Stack:** Go 1.22+ / Gin / GORM（后端），React 18 / Semantic UI React / recharts（前端）

**设计文档:** `docs/superpowers/specs/2026-07-23-personal-refactor-phase2-design.md`

**构建命令:**
```shell
# 前端
cd web/default && npm run build
# 后端（需 mingw64 + CGO）
export PATH="/c/Program1/mingw64/bin:$PATH:/c/Program Files/Go/bin"
CGO_ENABLED=1 go build -o one-api-lite.exe .
# 测试
go test ./...
```

---

## Task Group B: 令牌默认无限额度

### Task B1: 修改 EditToken.js 默认值

**Files:**
- Modify: `web/default/src/pages/Token/EditToken.js:32`

- [ ] **Step 1: 修改 unlimited_quota 默认值**

将第 32 行从:
```javascript
    unlimited_quota: false,
```
改为:
```javascript
    unlimited_quota: true,
```

- [ ] **Step 2: 前端构建验证**

Run: `cd web/default && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add web/default/src/pages/Token/EditToken.js
git commit -m "feat(token): 令牌默认无限额度"
```

---

## Task Group A: 渠道编辑页改造

### Task A1: 后端 — 新增 POST /api/channel/fetch_models 接口

**Files:**
- Modify: `controller/channel_fetch_models.go`
- Modify: `router/api.go`

- [ ] **Step 1: 新增 FetchChannelModelsByConfig 函数**

在 `controller/channel_fetch_models.go` 末尾新增:

```go
// fetchModelsRequest POST 请求体
type fetchModelsRequest struct {
	BaseURL string `json:"base_url"`
	Key     string `json:"key"`
	Type    int    `json:"type"`
}

// FetchChannelModelsByConfig 接受 {base_url, key, type}，不依赖已保存渠道
func FetchChannelModelsByConfig(c *gin.Context) {
	var req fetchModelsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "请求参数无效: " + err.Error(),
		})
		return
	}

	baseURL := strings.TrimSpace(req.BaseURL)
	if baseURL == "" {
		// BaseURL 未设置时，从渠道类型默认 URL 取值
		if req.Type >= 0 && req.Type < len(channeltype.ChannelBaseURLs) {
			baseURL = channeltype.ChannelBaseURLs[req.Type]
		}
	}
	if baseURL == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "未设置 BaseURL，无法获取模型列表",
		})
		return
	}

	// 构建 /models URL，处理 baseURL 已含 /v1 的情况
	baseURL = strings.TrimSuffix(baseURL, "/")
	var url string
	if strings.HasSuffix(baseURL, "/v1") {
		url = baseURL + "/models"
	} else {
		url = baseURL + "/v1/models"
	}

	models, err := fetchModelsFromUpstream(url, req.Key)
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

- [ ] **Step 2: 注册 POST 路由**

在 `router/api.go` 的 `channelRoute` 组内，现有 `GET /fetch_models/:id` 旁边新增:

```go
channelRoute.POST("/fetch_models", controller.FetchChannelModelsByConfig)
```

- [ ] **Step 3: 后端编译验证**

Run: `CGO_ENABLED=1 go build ./...`
Expected: 编译成功

- [ ] **Step 4: 提交**

```bash
git add controller/channel_fetch_models.go router/api.go
git commit -m "feat(channel): 新增 POST /api/channel/fetch_models 接口，支持新建时获取模型"
```

### Task A2: 前端 — 改造 EditChannel.js

**Files:**
- Modify: `web/default/src/pages/Channel/EditChannel.js`

- [ ] **Step 1: 修改 fetchUpstreamModels 支持新建时 POST**

将 `fetchUpstreamModels` 函数（第 139-179 行）替换为:

```javascript
  const fetchUpstreamModels = async () => {
    setFetchingModels(true);
    try {
      let res;
      if (channelId) {
        // 已保存渠道：用 GET /fetch_models/:id
        res = await API.get(`/api/channel/fetch_models/${channelId}`);
      } else {
        // 新建渠道：用 POST /fetch_models，传 {base_url, key, type}
        if (!inputs.base_url && !inputs.key) {
          showInfo(t('channel.edit.messages.fetch_need_config'));
          return;
        }
        res = await API.post('/api/channel/fetch_models', {
          base_url: inputs.base_url,
          key: inputs.key,
          type: inputs.type,
        });
      }
      const { success, message, data } = res.data;
      if (success) {
        if (data.length === 0) {
          showInfo(t('channel.edit.messages.fetch_empty'));
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
        // 同步 modelAliases: 新模型添加空别名条目
        if (newModels.length > 0) {
          setModelAliases((prev) => [
            ...prev,
            ...newModels.map((m) => ({ original: m, alias: '' })),
          ]);
        }
        showSuccess(t('channel.edit.messages.fetch_success', { total: data.length, added: newModels.length }));
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

- [ ] **Step 2: 移除"从上游获取"按钮的 disabled 限制**

将第 570-575 行的 Button 属性从:
```javascript
                  loading={fetchingModels}
                  disabled={!isEdit || fetchingModels}
                  onClick={fetchUpstreamModels}
```
改为:
```javascript
                  loading={fetchingModels}
                  disabled={fetchingModels}
                  onClick={fetchUpstreamModels}
```

- [ ] **Step 3: 移除 model_mapping 只读文本框**

删除第 657-672 行的 model_mapping TextArea:
```javascript
                <Form.Field>
                  <Form.TextArea
                    label={`${t('channel.edit.model_mapping')}（${t('channel.edit.model_mapping_auto')}）`}
                    placeholder={t('channel.edit.model_mapping_placeholder')}
                    name='model_mapping'
                    readOnly
                    value={inputs.model_mapping}
                    style={{
                      minHeight: 150,
                      fontFamily: 'JetBrains Mono, Consolas',
                    }}
                    autoComplete='new-password'
                  />
                </Form.Field>
```

保留 `inputs.model_mapping` 状态（submit 仍需使用），仅移除 UI 展示。

- [ ] **Step 4: 移除 system_prompt 文本框**

删除第 673-686 行的 system_prompt TextArea:
```javascript
                <Form.Field>
                  <Form.TextArea
                    label={t('channel.edit.system_prompt')}
                    placeholder={t('channel.edit.system_prompt_placeholder')}
                    name='system_prompt'
                    onChange={handleInputChange}
                    value={inputs.system_prompt}
                    style={{
                      minHeight: 150,
                      fontFamily: 'JetBrains Mono, Consolas',
                    }}
                    autoComplete='new-password'
                  />
                </Form.Field>
```

同时从 `originInputs`（第 41-51 行）中移除 `system_prompt: '',`。

- [ ] **Step 5: 调整表单字段顺序 — 密钥框移到 BaseURL 下方**

当前顺序：类型→名称→分组→(类型特定字段)→模型→别名→model_mapping→system_prompt→(config)→密钥→BaseURL

目标顺序：类型→名称→分组→(类型特定字段)→BaseURL→密钥→(config)→模型→别名→(取消/提交)

将密钥输入框（第 762-792 行的 `inputs.type !== 33 && inputs.type !== 42 &&` 块）移到 BaseURL 字段之后、模型选择之前。具体操作：
1. 剪切第 762-792 行（密钥输入块）
2. 粘贴到 BaseURL 相关字段之后（第 845 行 `inputs.type === 22` 块之后）
3. 确保批量密钥 checkbox（第 808-815 行）也跟随移动

- [ ] **Step 6: 更新 MODEL_MAPPING_EXAMPLE 为通用占位符**

将第 9-13 行从:
```javascript
const MODEL_MAPPING_EXAMPLE = {
  'gpt-3.5-turbo-0301': 'gpt-3.5-turbo',
  'gpt-4-0314': 'gpt-4',
  'gpt-4-32k-0314': 'gpt-4-32k',
};
```
改为:
```javascript
const MODEL_MAPPING_EXAMPLE = {
  'model-alias': 'original-model-name',
};
```

- [ ] **Step 7: 新增 i18n key**

在 `web/default/src/locales/zh/translation.json` 和 `en/translation.json` 的 `channel.edit.messages` 下新增:
```json
"fetch_need_config": "请先填写 BaseURL 和密钥"
```

- [ ] **Step 8: 前端构建验证**

Run: `cd web/default && npm run build`
Expected: 构建成功

- [ ] **Step 9: 提交**

```bash
git add web/default/src/pages/Channel/EditChannel.js web/default/src/locales/zh/translation.json web/default/src/locales/en/translation.json
git commit -m "feat(channel): 渠道编辑页改造 — 新建时获取模型、移除 model_mapping/system_prompt UI、调整字段顺序"
```

---

## Task Group D: 移除第三方登录（含 OIDC）

### Task D1: 后端 — 删除第三方登录文件

**Files:**
- Delete: `controller/auth/github.go`
- Delete: `controller/auth/lark.go`
- Delete: `controller/auth/wechat.go`
- Delete: `controller/auth/oidc.go`
- Delete: `middleware/turnstile-check.go`

- [ ] **Step 1: 删除 5 个后端文件**

```bash
rm controller/auth/github.go controller/auth/lark.go controller/auth/wechat.go controller/auth/oidc.go middleware/turnstile-check.go
```

- [ ] **Step 2: 后端编译验证（预期失败，需修复引用）**

Run: `CGO_ENABLED=1 go build ./... 2>&1 | head -30`
Expected: 编译失败，列出引用已删除文件的错误

### Task D2: 后端 — 修复引用

**Files:**
- Modify: `router/api.go`
- Modify: `controller/auth/auth.go`（如存在 OAuth state 函数）
- Modify: `controller/user.go`
- Modify: `controller/misc.go`
- Modify: `middleware/auth.go`
- Modify: `model/user.go`
- Modify: `model/option.go`

- [ ] **Step 1: 搜索所有残留引用**

Run: `grep -rn "github_oauth\|lark\|wechat\|oidc\|turnstile\|Turnstile\|GitHubOAuth\|LarkOAuth\|WeChatOAuth\|OIDC" --include="*.go" controller/ middleware/ model/ router/ common/`
记录所有引用位置。

- [ ] **Step 2: 清理 router/api.go**

移除以下路由注册：
- OAuth 回调路由（`/api/oauth/github`、`/api/oauth/lark`、`/api/oauth/wechat`、`/api/oauth/oidc` 等）
- OAuth state 路由（`/api/oauth/state`）
- Turnstile 相关路由

- [ ] **Step 3: 清理 controller/misc.go 的 GetStatus**

在 `GetStatus` 函数中移除以下字段返回：
- `github_oauth`
- `wechat_login`
- `turnstile_check`
- `lark_client_id`
- `oidc_*`（所有 OIDC 相关字段）
- `github_client_id`

- [ ] **Step 4: 清理 model/option.go**

移除以下选项的默认值定义和初始化：
- `GitHubClientSecret`、`GitHubClientId`
- `LarkClientId`、`LarkClientSecret`
- `WeChatServerAddress`、`WeChatAccountQRCodeUrl`
- `OidcClientId`、`OidcClientSecret`、`OidcWellKnown`、`OidcAuthorizationEndpoint`、`OidcTokenEndpoint`、`OidcUserinfoEndpoint`
- `TurnstileSiteKey`、`TurnstileSecretKey`
- `TurnstileCheckEnabled`

- [ ] **Step 5: 清理 model/user.go**

从 `User` 结构体中移除字段:
```go
GitHubId string `json:"github_id" gorm:"column:github_id;index"`
WeChatId string `json:"wechat_id" gorm:"column:wechat_id;index"`
LarkId   string `json:"lark_id" gorm:"column:lark_id;index"`
OidcId   string `json:"oidc_id" gorm:"column:oidc_id;index"`
```

搜索所有引用这些字段的代码并清理（如 `setupLogin`、`BindByOAuth` 等）。

- [ ] **Step 6: 清理 middleware/auth.go**

移除 Turnstile 校验调用（如 `turnstile-check.go` 中间件的引用）。

- [ ] **Step 7: 清理 controller/user.go**

移除第三方绑定函数（如 `BindByOAuth`、`BindByGitHub` 等）。

- [ ] **Step 8: 清理 controller/auth/auth.go**

移除 OAuth state 生成/验证函数（`GenerateOAuthCode`、`CheckOAuthCode` 等）。如果整个文件都是 OAuth 相关则删除文件。

- [ ] **Step 9: 后端编译验证**

Run: `CGO_ENABLED=1 go build ./...`
Expected: 编译成功

- [ ] **Step 10: 提交**

```bash
git add -A
git commit -m "refactor(auth): 移除第三方登录（GitHub/飞书/微信/OIDC）和 Turnstile 人机验证"
```

### Task D3: 前端 — 删除第三方登录组件

**Files:**
- Delete: `web/default/src/components/GitHubOAuth.js`
- Delete: `web/default/src/components/LarkOAuth.js`

- [ ] **Step 1: 删除前端组件**

```bash
rm web/default/src/components/GitHubOAuth.js web/default/src/components/LarkOAuth.js
```

### Task D4: 前端 — 修改登录/注册页和工具函数

**Files:**
- Modify: `web/default/src/pages/Login/index.js`
- Modify: `web/default/src/pages/Register/index.js`
- Modify: `web/default/src/components/utils.js`

- [ ] **Step 1: 清理 Login/index.js**

移除 `GitHubOAuth`、`LarkOAuth` 组件的 import 和使用。
移除 Turnstile 相关代码（如 `Turnstile` 组件 import 和渲染）。

- [ ] **Step 2: 清理 Register/index.js**

移除 Turnstile 组件和第三方注册入口。

- [ ] **Step 3: 清理 utils.js**

移除 `getOAuthState`、`getGitHubClientId`、`getLarkClientId`、`onGitHubOAuthClicked`、`onLarkOAuthClicked` 等函数。

- [ ] **Step 4: 前端构建验证**

Run: `cd web/default && npm run build`
Expected: 构建成功（如有残留引用则修复）

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor(web): 移除第三方登录前端组件和 Turnstile"
```

---

## Task Group E: 设置页合并精简

> **依赖:** Task Group D 必须先完成（设置页需移除第三方登录配置 UI）

### Task E1: 重写 SystemSetting.js 合并所有系统设置

**Files:**
- Create: `web/default/src/components/SystemSetting.js`（重写）
- Delete: `web/default/src/components/OperationSetting.js`
- Delete: `web/default/src/components/OtherSetting.js`

- [ ] **Step 1: 读取现有三个设置组件内容**

读取以下文件，提取需要保留的配置项：
- `web/default/src/components/SystemSetting.js`（原系统设置）
- `web/default/src/components/OperationSetting.js`（运营设置）
- `web/default/src/components/OtherSetting.js`（其他设置）

- [ ] **Step 2: 重写 SystemSetting.js**

新建 `SystemSetting.js`，分 7 区块组织：
1. **通用**：系统名称、Logo、服务器地址、页脚
2. **登录注册**：邮箱验证开关、注册开关（不含第三方登录配置）
3. **邮件**：SMTP 服务器、端口、账号、密码、发件人
4. **运营**：预扣额度、重试次数、Token 估算、令牌额度显示
5. **渠道监控**：自动禁用/启用渠道、渠道禁用阈值
6. **日志**：消费日志开关、日志清理
7. **内容**：首页内容、关于内容（不含"检查更新"）

每个区块用 `<Header as='h3'>` 分隔，复用现有表单组件模式。

- [ ] **Step 3: 删除旧设置组件**

```bash
rm web/default/src/components/OperationSetting.js web/default/src/components/OtherSetting.js
```

### Task E2: 改造设置页入口为 2 Tab

**Files:**
- Modify: `web/default/src/pages/Setting/index.js`

- [ ] **Step 1: 修改 Tab 结构**

将 4 Tab（个人设置/运营设置/其他设置/系统设置）改为 2 Tab：
1. **个人设置**（原有，用户个人偏好）
2. **系统设置**（合并后的 SystemSetting.js，仅管理员可见）

移除 `OperationSetting` 和 `OtherSetting` 的 import 和 Tab 引用。

- [ ] **Step 2: 前端构建验证**

Run: `cd web/default && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "refactor(setting): 设置页 4 Tab 合并为 2 Tab，合并运营/其他设置到系统设置"
```

---

## Task Group F: 品牌文案更新

> **依赖:** Task Group D 必须先完成（首页需移除 OAuth 状态显示）

### Task F1: 更新品牌文案和链接

**Files:**
- Modify: `common/config/config.go:15`
- Modify: `web/default/src/pages/About/index.js:43-44`
- Modify: `web/default/src/pages/Home/index.js:136,207-271`
- Modify: `web/default/src/locales/zh/translation.json`
- Modify: `web/default/src/locales/en/translation.json`

- [ ] **Step 1: 更新后端 SystemName 默认值**

`common/config/config.go` 第 15 行:
```go
var SystemName = "One API"
```
改为:
```go
var SystemName = "One API Lite"
```

- [ ] **Step 2: 更新关于页仓库链接**

`web/default/src/pages/About/index.js` 第 43-44 行:
```javascript
              <a href='https://github.com/songquanpeng/one-api'>
                https://github.com/songquanpeng/one-api
              </a>
```
改为:
```javascript
              <a href='https://github.com/XduDSJ/one-api-lite'>
                https://github.com/XduDSJ/one-api-lite
              </a>
```

- [ ] **Step 3: 更新首页源码链接**

`web/default/src/pages/Home/index.js` 第 136 行:
```javascript
                            href='https://github.com/songquanpeng/one-api'
```
改为:
```javascript
                            href='https://github.com/XduDSJ/one-api-lite'
```

- [ ] **Step 4: 删除首页 OAuth/WeChat/Turnstile 状态显示**

删除 `web/default/src/pages/Home/index.js` 第 207-271 行（GitHub OAuth、WeChat、Turnstile 状态显示块），只保留邮箱验证状态（第 176-199 行）。

- [ ] **Step 5: 更新 i18n 文案**

在 `zh/translation.json` 和 `en/translation.json` 中:
- 更新 `about.description`、`about.repository` 为 one-api-lite 描述
- 更新 `home.welcome.description` 为 one-api-lite 欢迎文案
- 更新 `home.system_status.info.source_link` 文案
- 删除 `home.system_status.config.github_oauth`、`wechat_login`、`turnstile` 相关 key

- [ ] **Step 6: 前端构建验证**

Run: `cd web/default && npm run build`
Expected: 构建成功

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat(branding): 更新品牌文案为 One API Lite，移除原仓库链接和 OAuth 状态显示"
```

---

## Task Group G: 硬编码模型精简 + 简化计费

### Task G1: 后端 — 删除计费比率表

**Files:**
- Modify: `relay/billing/ratio/model.go`
- Modify: `relay/billing/ratio/image.go`

- [ ] **Step 1: 精简 model.go**

删除 `modelRatio` 和 `completionRatio` map（约 622 行硬编码定价表）。
将 `GetModelRatio` 和 `GetCompletionRatio` 改为返回固定值 1.0:

```go
func GetModelRatio(name string) float64 {
	return 1.0
}

func GetCompletionRatio(name string) float64 {
	return 1.0
}
```

保留 `ModelRatio` 和 `CompletionRatio` 变量声明（如被 `model/option.go` 引用），但清空其内容。或者如果 `model/option.go` 不再引用它们，则完全删除。

- [ ] **Step 2: 精简 image.go**

将图片倍率函数改为返回固定值:

```go
func GetImageRatio(modelName string) float64 {
	return 1.0
}
```

删除图片倍率 map。

- [ ] **Step 3: 后端编译验证**

Run: `CGO_ENABLED=1 go build ./...`
Expected: 编译成功（如有引用被删除的 map 则修复）

- [ ] **Step 4: 提交**

```bash
git add relay/billing/ratio/model.go relay/billing/ratio/image.go
git commit -m "refactor(billing): 删除计费比率表，倍率固定为 1"
```

### Task G2: 后端 — 清空适配器模型列表

**Files:**
- Modify: `relay/adaptor/*/constants.go`（32 个适配器）

- [ ] **Step 1: 批量清空 ModelList**

对每个适配器的 `constants.go`，将 `ModelList` 改为空数组:

```go
var ModelList = []string{}
```

用 ast-grep 或 sed 批量处理:
```bash
# 先搜索所有 constants.go 中的 ModelList 定义
grep -rn "var ModelList" relay/adaptor/*/constants.go
```

逐个修改（或用脚本批量替换）。

- [ ] **Step 2: 修改渠道测试默认模型**

`controller/channel-test.go` 第 39 行，将硬编码的 `gpt-3.5-turbo` 改为取渠道第一个模型:

```go
// 原: testModel := "gpt-3.5-turbo"
// 改为:
models := strings.Split(channel.Models, ",")
if len(models) == 0 || models[0] == "" {
    c.JSON(http.StatusOK, gin.H{"success": false, "message": "该渠道未配置模型"})
    return
}
testModel := models[0]
```

- [ ] **Step 3: 后端编译验证**

Run: `CGO_ENABLED=1 go build ./...`
Expected: 编译成功

- [ ] **Step 4: 后端测试验证**

Run: `go test ./...`
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor(adaptor): 清空适配器硬编码模型列表，渠道测试改用渠道首个模型"
```

### Task G3: 前端 — 精简硬编码模型示例

**Files:**
- Modify: `web/default/src/locales/zh/translation.json`
- Modify: `web/default/src/locales/en/translation.json`

- [ ] **Step 1: 更新翻译文件中的模型名说明**

搜索翻译文件中包含具体模型名（如 `gpt-3.5`、`gpt-4`）的说明文本，改为通用描述。

- [ ] **Step 2: 前端构建验证**

Run: `cd web/default && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add web/default/src/locales/zh/translation.json web/default/src/locales/en/translation.json
git commit -m "refactor(web): 精简翻译文件中的硬编码模型名说明"
```

---

## Task Group C: 总览统计分析仪表盘

### Task C1: 后端 — 新增全局统计查询函数

**Files:**
- Modify: `model/log.go`
- Modify: `model/user.go`
- Modify: `model/channel.go`
- Modify: `model/token.go`

- [ ] **Step 1: 新增全局日志统计函数**

在 `model/log.go` 末尾新增:

```go
// LogDailyStat 全局每日统计
type LogDailyStat struct {
	Day          string `gorm:"column:day"`
	RequestCount int    `gorm:"column:request_count"`
	Quota        int    `gorm:"column:quota"`
	PromptTokens int    `gorm:"column:prompt_tokens"`
	CompletionTokens int `gorm:"column:completion_tokens"`
}

// LogModelStat 按模型统计
type LogModelStat struct {
	ModelName    string `gorm:"column:model_name"`
	RequestCount int    `gorm:"column:request_count"`
	Quota        int    `gorm:"column:quota"`
	PromptTokens int    `gorm:"column:prompt_tokens"`
	CompletionTokens int `gorm:"column:completion_tokens"`
}

// LogChannelStat 按渠道统计
type LogChannelStat struct {
	ChannelId    int    `gorm:"column:channel_id"`
	RequestCount int    `gorm:"column:request_count"`
	Quota        int    `gorm:"column:quota"`
	PromptTokens int    `gorm:"column:prompt_tokens"`
	CompletionTokens int `gorm:"column:completion_tokens"`
}

func SearchLogsByDayAll(start, end int) (stats []*LogDailyStat, err error) {
	groupSelect := "DATE_FORMAT(FROM_UNIXTIME(created_at), '%Y-%m-%d') as day"
	if common.UsingPostgreSQL {
		groupSelect = "TO_CHAR(date_trunc('day', to_timestamp(created_at)), 'YYYY-MM-DD') as day"
	}
	if common.UsingSQLite {
		groupSelect = "strftime('%Y-%m-%d', datetime(created_at, 'unixepoch')) as day"
	}
	err = LOG_DB.Raw(`
		SELECT `+groupSelect+`,
		count(1) as request_count,
		sum(quota) as quota,
		sum(prompt_tokens) as prompt_tokens,
		sum(completion_tokens) as completion_tokens
		FROM logs
		WHERE type=2
		AND created_at BETWEEN ? AND ?
		GROUP BY day
		ORDER BY day
	`, start, end).Scan(&stats).Error
	return stats, err
}

func SearchLogsByModelAll(start, end int) (stats []*LogModelStat, err error) {
	err = LOG_DB.Raw(`
		SELECT model_name,
		count(1) as request_count,
		sum(quota) as quota,
		sum(prompt_tokens) as prompt_tokens,
		sum(completion_tokens) as completion_tokens
		FROM logs
		WHERE type=2
		AND created_at BETWEEN ? AND ?
		GROUP BY model_name
		ORDER BY request_count DESC
	`, start, end).Scan(&stats).Error
	return stats, err
}

func SearchLogsByChannelAll(start, end int) (stats []*LogChannelStat, err error) {
	err = LOG_DB.Raw(`
		SELECT channel_id,
		count(1) as request_count,
		sum(quota) as quota,
		sum(prompt_tokens) as prompt_tokens,
		sum(completion_tokens) as completion_tokens
		FROM logs
		WHERE type=2
		AND created_at BETWEEN ? AND ?
		GROUP BY channel_id
		ORDER BY request_count DESC
	`, start, end).Scan(&stats).Error
	return stats, err
}
```

- [ ] **Step 2: 新增计数查询函数**

在 `model/user.go` 新增:
```go
func GetUserCount() (int64, error) {
	var count int64
	err := DB.Model(&User{}).Where("status != ?", UserStatusDeleted).Count(&count).Error
	return count, err
}
```

在 `model/channel.go` 新增:
```go
func GetChannelCount() (int64, int64, error) {
	var total int64
	var enabled int64
	err := DB.Model(&Channel{}).Count(&total).Error
	if err != nil {
		return 0, 0, err
	}
	err = DB.Model(&Channel{}).Where("status = ?", ChannelStatusEnabled).Count(&enabled).Error
	return total, enabled, err
}
```

在 `model/token.go` 新增:
```go
func GetTokenCount() (int64, error) {
	var count int64
	err := DB.Model(&Token{}).Count(&count).Error
	return count, err
}
```

- [ ] **Step 3: 后端编译验证**

Run: `CGO_ENABLED=1 go build ./...`
Expected: 编译成功

- [ ] **Step 4: 提交**

```bash
git add model/log.go model/user.go model/channel.go model/token.go
git commit -m "feat(model): 新增全局统计查询函数（每日/模型/渠道聚合 + 计数）"
```

### Task C2: 后端 — 新增总览仪表盘接口

**Files:**
- Create: `controller/dashboard.go`
- Modify: `router/api.go`

- [ ] **Step 1: 新增 GetOverviewDashboard 控制器**

创建 `controller/dashboard.go`:

```go
package controller

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
)

type overviewResponse struct {
	Summary            summaryData            `json:"summary"`
	DailyTrend         []*model.LogDailyStat  `json:"daily_trend"`
	ModelDistribution  []*model.LogModelStat  `json:"model_distribution"`
	ChannelDistribution []*model.LogChannelStat `json:"channel_distribution"`
}

type summaryData struct {
	TotalRequests    int64 `json:"total_requests"`
	TotalTokens      int64 `json:"total_tokens"`
	TotalUsers       int64 `json:"total_users"`
	TotalChannels    int64 `json:"total_channels"`
	EnabledChannels  int64 `json:"enabled_channels"`
	TotalTokenCount  int64 `json:"total_token_count"`
}

func GetOverviewDashboard(c *gin.Context) {
	now := time.Now()
	startOfDay := now.Truncate(24 * time.Hour).AddDate(0, 0, -6).Unix()
	endOfDay := now.Truncate(24 * time.Hour).Add(24*time.Hour - time.Second).Unix()

	dailyTrend, err := model.SearchLogsByDayAll(int(startOfDay), int(endOfDay))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取趋势数据失败: " + err.Error()})
		return
	}

	modelDist, err := model.SearchLogsByModelAll(int(startOfDay), int(endOfDay))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取模型分布失败: " + err.Error()})
		return
	}

	channelDist, err := model.SearchLogsByChannelAll(int(startOfDay), int(endOfDay))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取渠道分布失败: " + err.Error()})
		return
	}

	userCount, err := model.GetUserCount()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取用户数失败: " + err.Error()})
		return
	}

	totalChannels, enabledChannels, err := model.GetChannelCount()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取渠道数失败: " + err.Error()})
		return
	}

	tokenCount, err := model.GetTokenCount()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取令牌数失败: " + err.Error()})
		return
	}

	// 汇总
	var totalRequests int64
	var totalTokens int64
	for _, d := range dailyTrend {
		totalRequests += int64(d.RequestCount)
		totalTokens += int64(d.PromptTokens + d.CompletionTokens)
	}

	resp := overviewResponse{
		Summary: summaryData{
			TotalRequests:   totalRequests,
			TotalTokens:     totalTokens,
			TotalUsers:      userCount,
			TotalChannels:   totalChannels,
			EnabledChannels: enabledChannels,
			TotalTokenCount: tokenCount,
		},
		DailyTrend:         dailyTrend,
		ModelDistribution:  modelDist,
		ChannelDistribution: channelDist,
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    resp,
	})
}
```

- [ ] **Step 2: 注册路由**

在 `router/api.go` 的管理员路由组中新增:
```go
apiRouter.GET("/dashboard/overview", middleware.AdminAuth(), controller.GetOverviewDashboard)
```

- [ ] **Step 3: 后端编译验证**

Run: `CGO_ENABLED=1 go build ./...`
Expected: 编译成功

- [ ] **Step 4: 提交**

```bash
git add controller/dashboard.go router/api.go
git commit -m "feat(dashboard): 新增 GET /api/dashboard/overview 管理员全局总览接口"
```

### Task C3: 前端 — 改造 Dashboard 页面

**Files:**
- Modify: `web/default/src/pages/Dashboard/index.js`
- Modify: `web/default/src/locales/zh/translation.json`
- Modify: `web/default/src/locales/en/translation.json`

- [ ] **Step 1: 新增管理员总览视图**

在 `Dashboard/index.js` 中:
1. 新增 `isAdmin` 判断（从 UserContext 获取 role）
2. 新增 `overviewData` 状态和 `fetchOverviewData` 函数（调用 `/api/dashboard/overview`）
3. 管理员视图渲染:
   - 6 个汇总卡片（总请求/总 token/总用户/渠道总数/启用渠道/令牌数）
   - 2 个折线图（全局每日请求数、每日 token 数）
   - 1 个柱状图（模型分布 top 10，按 token 排序）
   - 1 个柱状图（渠道分布 top 10，按请求数排序）
4. 普通用户视图保持现有 3 折线图 + 1 堆叠柱状图

管理员视图汇总卡片示例:
```javascript
<Grid columns={3} stackable>
  <Grid.Column>
    <Card fluid className='chart-card'>
      <Card.Content>
        <Card.Header>{t('dashboard.overview.total_requests')}</Card.Header>
        <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#4318FF' }}>
          {overviewData.summary.total_requests}
        </div>
      </Card.Content>
    </Card>
  </Grid.Column>
  {/* ... 其余 5 个卡片 */}
</Grid>
```

- [ ] **Step 2: 新增 i18n key**

在 `zh/translation.json` 和 `en/translation.json` 的 `dashboard` 下新增 `overview` 区块:
```json
"overview": {
  "total_requests": "总请求数",
  "total_tokens": "总 Token 数",
  "total_users": "用户总数",
  "total_channels": "渠道总数",
  "enabled_channels": "启用渠道",
  "total_token_count": "令牌总数",
  "model_distribution": "模型分布 (Top 10)",
  "channel_distribution": "渠道分布 (Top 10)",
  "daily_requests": "每日请求数",
  "daily_tokens": "每日 Token 数"
}
```

- [ ] **Step 3: 前端构建验证**

Run: `cd web/default && npm run build`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add web/default/src/pages/Dashboard/index.js web/default/src/locales/zh/translation.json web/default/src/locales/en/translation.json
git commit -m "feat(dashboard): 管理员全局总览仪表盘 — 汇总卡片 + 趋势图 + 模型/渠道分布"
```

---

## 集成验证

### Task V1: 全量构建与测试

- [ ] **Step 1: 前端构建**

Run: `cd web/default && npm run build`
Expected: 构建成功

- [ ] **Step 2: 后端编译**

Run: `CGO_ENABLED=1 go build -o one-api-lite.exe .`
Expected: 编译成功

- [ ] **Step 3: 后端测试**

Run: `go test ./...`
Expected: 全部通过

- [ ] **Step 4: 运行时验证**

启动服务，验证:
- [ ] 登录页无第三方登录按钮
- [ ] 注册页无 Turnstile
- [ ] 设置页 2 Tab
- [ ] 新建令牌默认无限额度
- [ ] 新建渠道可未保存时获取模型
- [ ] 渠道编辑页无 model_mapping/system_prompt 文本框
- [ ] 首页/关于页链接指向 XduDSJ/one-api-lite
- [ ] 管理员 Dashboard 显示全局总览
- [ ] 普通用户 Dashboard 显示个人统计

- [ ] **Step 5: 提交验证结果**

```bash
git add docs/
git commit -m "docs: 第二阶段改造完成，更新进度文档"
```

---

## Self-Review

### Spec coverage
- B（令牌默认无限额度）→ Task B1 ✅
- A1（fetch URL 改 /models）→ Task A1 已在现有代码中处理（baseURL+/v1→/models 逻辑已存在）✅
- A2（POST /api/channel/fetch_models）→ Task A1 ✅
- A3（移除 model_mapping 只读框）→ Task A2 Step 3 ✅
- A4（移除 system_prompt）→ Task A2 Step 4 ✅
- A5（密钥框位置）→ Task A2 Step 5 ✅
- D（删 7 文件改 12 文件）→ Task D1-D4 ✅
- E（4 Tab→2 Tab）→ Task E1-E2 ✅
- F（品牌文案）→ Task F1 ✅
- G（简化计费 + 清空模型列表 + 精简前端）→ Task G1-G3 ✅
- C（总览仪表盘）→ Task C1-C3 ✅

### Placeholder scan
- Task D2 Step 2-8 描述了要做什么但未给出完整代码 — 因为需要根据实际搜索结果决定具体改动，这是合理的（删除操作无法预先写出完整代码）
- Task E1 Step 2 描述了区块结构但未给出完整 JSX — 因为需要从现有三个组件提取内容，完整代码取决于现有组件内容
- Task C3 Step 1 给出了示例代码但未完整 — 因为完整的管理员视图代码很长，工程师需根据现有 Dashboard 结构和 recharts 组件模式实现

### Type consistency
- `LogDailyStat`/`LogModelStat`/`LogChannelStat` 在 model 层和 controller 层使用一致 ✅
- `GetUserCount`/`GetChannelCount`/`GetTokenCount` 函数签名一致 ✅
- `overviewResponse`/`summaryData` 结构体在 controller 中定义和使用一致 ✅
