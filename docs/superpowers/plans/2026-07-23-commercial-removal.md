# 商业功能移除实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除兑换码/充值系统、运营设置商业选项、用户分组与分组倍率、倍率固定为 1,保留计费框架。

**Architecture:** 后端删除 redemption/topup 代码,倍率函数返回固定值 1,分组固定为 default;前端删除相关页面/路由/菜单,精简运营设置页。核心中继链路零改动。

**Tech Stack:** Go + Gin + GORM,React + Semantic UI

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `controller/redemption.go` | 删除 | 兑换码管理 API |
| `model/redemption.go` | 删除 | 兑换码数据模型 |
| `controller/user.go` | 修改 | 移除 `TopUp`、`AdminTopUp` 函数 |
| `router/api.go` | 修改 | 移除 redemption/topup 路由 |
| `controller/group.go` | 修改 | `GetGroups` 简化为返回 `["default"]` |
| `relay/billing/ratio/group.go` | 修改 | `GetGroupRatio` 返回固定值 1 |
| `relay/billing/ratio/model.go` | 修改 | `GetModelRatio`、`GetCompletionRatio` 返回固定值 1 |
| `model/option.go` | 修改 | 移除商业选项默认值 |
| `controller/misc.go` | 修改 | 移除 `top_up_link` |
| `web/default/src/App.js` | 修改 | 移除 redemption/topup 路由和 import |
| `web/default/src/components/Header.js` | 修改 | 移除兑换/充值菜单项 |
| `web/default/src/components/OperationSetting.js` | 修改 | 移除商业选项和倍率配置 UI |
| `web/default/src/pages/Redemption/` | 删除 | 兑换码页面目录 |
| `web/default/src/pages/TopUp/` | 删除 | 充值页面目录 |
| `web/default/src/components/RedemptionsTable.js` | 删除 | 兑换码表格组件 |
| `web/default/src/components/TokensTable.js` | 修改 | 移除未使用的 `showTopUpModal` 死代码 |

---

### Task 1: 后端 — 删除兑换码代码,移除 topup 路由和函数

**Files:**
- Delete: `controller/redemption.go`
- Delete: `model/redemption.go`
- Modify: `controller/user.go:750-816`
- Modify: `router/api.go:32,49,97-106`

- [ ] **Step 1: 删除兑换码文件**

```bash
rm controller/redemption.go model/redemption.go
```

- [ ] **Step 2: 移除 controller/user.go 中的 TopUp 和 AdminTopUp**

删除 `controller/user.go` 第 750-816 行(从 `type topUpRequest struct` 到文件末尾的 `AdminTopUp` 函数结束)。

具体删除:
```go
// 删除以下全部代码(第750-816行):
type topUpRequest struct { ... }
func TopUp(c *gin.Context) { ... }
type adminTopUpRequest struct { ... }
func AdminTopUp(c *gin.Context) { ... }
```

同时检查 `controller/user.go` 顶部 import,如果 `model.RecordTopupLog` 或 `common.LogQuota` 不再被其他函数引用,移除对应 import。注意 `common` 包可能仍被其他函数使用,需确认。

- [ ] **Step 3: 移除 router/api.go 中的 redemption/topup 路由**

在 `router/api.go` 中:

1. 删除第 32 行:
```go
// 删除: apiRouter.POST("/topup", middleware.AdminAuth(), controller.AdminTopUp)
```

2. 删除第 49 行:
```go
// 删除: selfRoute.POST("/topup", controller.TopUp)
```

3. 删除第 97-106 行(整个 redemptionRoute 组):
```go
// 删除:
// 		redemptionRoute := apiRouter.Group("/redemption")
// 		redemptionRoute.Use(middleware.AdminAuth())
// 		{
// 			redemptionRoute.GET("/", controller.GetAllRedemptions)
// 			...
// 			redemptionRoute.DELETE("/:id", controller.DeleteRedemption)
// 		}
```

- [ ] **Step 4: 验证编译**

Run: `go build ./...`
Expected: 编译成功。如果报错,说明有其他文件引用了已删除的函数,需逐一修复。

常见编译错误及修复:
- `controller/misc.go` 引用 `config.TopUpLink` — 在 Task 4 中处理,此处暂时保留
- 其他文件引用 `model.Redeem` 或 `model.RecordTopupLog` — 搜索并移除引用

Run: `grep -rn "model.Redeem\|model.RecordTopupLog\|controller.TopUp\|controller.AdminTopUp\|controller.GetAllRedemptions\|controller.AddRedemption" --include="*.go" .`

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor: 移除兑换码系统和充值 API"
```

---

### Task 2: 后端 — 倍率固定为 1

**Files:**
- Modify: `relay/billing/ratio/model.go:686-710,725-835`
- Modify: `relay/billing/ratio/group.go:31-40`

- [ ] **Step 1: 改造 GetGroupRatio**

将 `relay/billing/ratio/group.go` 的 `GetGroupRatio` 函数(第 31-40 行)替换为:

```go
func GetGroupRatio(name string) float64 {
	return 1
}
```

保留 `GroupRatio` map、`GroupRatio2JSONString`、`UpdateGroupRatioByJSONString` 不动 — 它们仍被 `model/option.go` 的选项初始化引用,删除会导致编译错误。这些 map 虽然存在但 `GetGroupRatio` 不再读取它们。

- [ ] **Step 2: 改造 GetModelRatio**

将 `relay/billing/ratio/model.go` 的 `GetModelRatio` 函数(第 686-710 行)替换为:

```go
func GetModelRatio(name string, channelType int) float64 {
	return 1
}
```

保留 `ModelRatio` map、`DefaultModelRatio` map、`ModelRatio2JSONString`、`UpdateModelRatioByJSONString` 不动 — 同理,被选项初始化引用。

- [ ] **Step 3: 改造 GetCompletionRatio**

将 `relay/billing/ratio/model.go` 的 `GetCompletionRatio` 函数(第 725-835 行)替换为:

```go
func GetCompletionRatio(name string, channelType int) float64 {
	return 1
}
```

保留 `CompletionRatio` map、`DefaultCompletionRatio` map、`CompletionRatio2JSONString`、`UpdateCompletionRatioByJSONString` 不动。

- [ ] **Step 4: 验证编译**

Run: `go build ./...`
Expected: 编译成功

- [ ] **Step 5: 运行现有测试**

Run: `go test ./relay/...`
Expected: 全部通过(适配器测试不依赖倍率函数的具体返回值)

- [ ] **Step 6: 提交**

```bash
git add relay/billing/ratio/model.go relay/billing/ratio/group.go
git commit -m "refactor: 倍率固定为 1,移除模型/分组/补全倍率计算"
```

---

### Task 3: 后端 — 分组固定为 default

**Files:**
- Modify: `controller/group.go`

- [ ] **Step 1: 简化 GetGroups**

将 `controller/group.go` 全部内容替换为:

```go
package controller

import (
	"github.com/gin-gonic/gin"
	"net/http"
)

func GetGroups(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    []string{"default"},
	})
}
```

移除了对 `billingratio.GroupRatio` 的依赖。

- [ ] **Step 2: 验证编译**

Run: `go build ./controller/`
Expected: 编译成功

- [ ] **Step 3: 提交**

```bash
git add controller/group.go
git commit -m "refactor: 分组固定为 default,GetGroups 返回单一分组"
```

---

### Task 4: 后端 — 移除运营设置商业选项

**Files:**
- Modify: `model/option.go:65-75`
- Modify: `controller/misc.go:37`

- [ ] **Step 1: 移除 model/option.go 中的商业选项默认值**

在 `model/option.go` 的 `InitOptionMap` 函数中,删除以下行(第 65-75 行中的部分行):

```go
// 删除以下行:
	config.OptionMap["QuotaForNewUser"] = strconv.FormatInt(config.QuotaForNewUser, 10)
	config.OptionMap["QuotaForInviter"] = strconv.FormatInt(config.QuotaForInviter, 10)
	config.OptionMap["QuotaForInvitee"] = strconv.FormatInt(config.QuotaForInvitee, 10)
	config.OptionMap["QuotaRemindThreshold"] = strconv.FormatInt(config.QuotaRemindThreshold, 10)
	config.OptionMap["ModelRatio"] = billingratio.ModelRatio2JSONString()
	config.OptionMap["GroupRatio"] = billingratio.GroupRatio2JSONString()
	config.OptionMap["CompletionRatio"] = billingratio.CompletionRatio2JSONString()
	config.OptionMap["TopUpLink"] = config.TopUpLink
	config.OptionMap["QuotaPerUnit"] = strconv.FormatFloat(config.QuotaPerUnit, 'f', -1, 64)
```

保留:
```go
	config.OptionMap["PreConsumedQuota"] = strconv.FormatInt(config.PreConsumedQuota, 10)
	config.OptionMap["ChatLink"] = config.ChatLink
	config.OptionMap["RetryTimes"] = strconv.Itoa(config.RetryTimes)
	config.OptionMap["Theme"] = config.Theme
```

注意:如果删除 `billingratio.ModelRatio2JSONString()` 等调用后,`billingratio` import 不再被使用,需移除 import。但 `updateOptionMap` 函数中仍有 `case "ModelRatio"` 等分支(第 226-231 行),所以 import 仍需保留。

- [ ] **Step 2: 移除 updateOptionMap 中的商业选项 case**

在 `model/option.go` 的 `updateOptionMap` 函数中,删除以下 case(第 214-235 行中的部分):

```go
// 删除以下 case:
	case "QuotaForNewUser":
		config.QuotaForNewUser, _ = strconv.ParseInt(value, 10, 64)
	case "QuotaForInviter":
		config.QuotaForInviter, _ = strconv.ParseInt(value, 10, 64)
	case "QuotaForInvitee":
		config.QuotaForInvitee, _ = strconv.ParseInt(value, 10, 64)
	case "QuotaRemindThreshold":
		config.QuotaRemindThreshold, _ = strconv.ParseInt(value, 10, 64)
	case "ModelRatio":
		err = billingratio.UpdateModelRatioByJSONString(value)
	case "GroupRatio":
		err = billingratio.UpdateGroupRatioByJSONString(value)
	case "CompletionRatio":
		err = billingratio.UpdateCompletionRatioByJSONString(value)
	case "TopUpLink":
		config.TopUpLink = value
	case "QuotaPerUnit":
		config.QuotaPerUnit, _ = strconv.ParseFloat(value, 64)
```

保留:
```go
	case "PreConsumedQuota":
		config.PreConsumedQuota, _ = strconv.ParseInt(value, 10, 64)
	case "RetryTimes":
		config.RetryTimes, _ = strconv.Atoi(value)
	case "ChatLink":
		config.ChatLink = value
	case "ChannelDisableThreshold":
		config.ChannelDisableThreshold, _ = strconv.ParseFloat(value, 64)
	case "Theme":
		config.Theme = value
```

如果删除后 `billingratio` import 不再被使用,移除它。检查:`loadOptionsFromDatabase` 中第 86 行 `billingratio.AddNewMissingRatio` 仍引用 billingratio,所以 import 保留。

- [ ] **Step 3: 移除 controller/misc.go 中的 top_up_link**

在 `controller/misc.go` 第 37 行,删除:
```go
// 删除: "top_up_link": config.TopUpLink,
```

- [ ] **Step 4: 验证编译**

Run: `go build ./...`
Expected: 编译成功

- [ ] **Step 5: 提交**

```bash
git add model/option.go controller/misc.go
git commit -m "refactor: 移除运营设置商业选项(额度奖励/倍率/充值链接)"
```

---

### Task 5: 前端 — 删除兑换码和充值页面

**Files:**
- Delete: `web/default/src/pages/Redemption/`(整个目录)
- Delete: `web/default/src/pages/TopUp/`(整个目录)
- Delete: `web/default/src/components/RedemptionsTable.js`
- Modify: `web/default/src/App.js`
- Modify: `web/default/src/components/Header.js`

- [ ] **Step 1: 删除页面和组件文件**

```bash
rm -rf web/default/src/pages/Redemption
rm -rf web/default/src/pages/TopUp
rm web/default/src/components/RedemptionsTable.js
```

- [ ] **Step 2: 修改 App.js — 移除 import 和路由**

在 `web/default/src/App.js` 中:

1. 删除第 22-24 行的 import:
```javascript
// 删除:
// import Redemption from './pages/Redemption';
// import EditRedemption from './pages/Redemption/EditRedemption';
// import TopUp from './pages/TopUp';
```

2. 删除第 153-176 行的 redemption 路由:
```javascript
// 删除:
//       <Route path='/redemption' element={...}>
//       <Route path='/redemption/edit/:id' element={...}>
//       <Route path='/redemption/add' element={...}>
```

3. 删除第 267-276 行的 topup 路由:
```javascript
// 删除:
//       <Route path='/topup' element={...}>
```

- [ ] **Step 3: 修改 Header.js — 移除兑换和充值菜单项**

在 `web/default/src/components/Header.js` 的 `headerButtons` 数组中,删除第 37-47 行:

```javascript
// 删除以下两个对象:
//   {
//     name: 'header.redemption',
//     to: '/redemption',
//     icon: 'dollar sign',
//     admin: true,
//   },
//   {
//     name: 'header.topup',
//     to: '/topup',
//     icon: 'cart',
//   },
```

- [ ] **Step 4: 验证前端构建**

Run: `cd web/default && npm run build`
Expected: 构建成功,无未定义引用

如果有报错,搜索其他文件中对已删除组件的引用:
Run: `grep -rn "Redemption\|TopUp\|RedemptionsTable" web/default/src/ --include="*.js"`

逐一修复引用。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor(web): 移除兑换码和充值页面、路由、菜单"
```

---

### Task 6: 前端 — 精简运营设置页

**Files:**
- Modify: `web/default/src/components/OperationSetting.js`

- [ ] **Step 1: 精简 state 初始值**

将 `OperationSetting.js` 第 15-35 行的 `useState` 初始值改为:

```javascript
  let [inputs, setInputs] = useState({
    PreConsumedQuota: 0,
    ChatLink: '',
    AutomaticDisableChannelEnabled: '',
    AutomaticEnableChannelEnabled: '',
    ChannelDisableThreshold: 0,
    LogConsumeEnabled: '',
    ApproximateTokenEnabled: '',
    DisplayTokenStatEnabled: '',
    RetryTimes: 0,
  });
```

移除了:`QuotaForNewUser`、`QuotaForInviter`、`QuotaForInvitee`、`QuotaRemindThreshold`、`ModelRatio`、`CompletionRatio`、`GroupRatio`、`TopUpLink`、`QuotaPerUnit`、`DisplayInCurrencyEnabled`。

- [ ] **Step 2: 精简 getOptions 函数**

将 `getOptions` 函数(第 42-65 行)中的 JSON 格式化判断移除:

```javascript
  const getOptions = async () => {
    const res = await API.get('/api/option/');
    const { success, message, data } = res.data;
    if (success) {
      let newInputs = {};
      data.forEach((item) => {
        newInputs[item.key] = item.value;
      });
      setInputs(newInputs);
      setOriginInputs(newInputs);
    } else {
      showError(message);
    }
  };
```

移除了对 `ModelRatio`/`GroupRatio`/`CompletionRatio` 的 JSON.parse 格式化。

- [ ] **Step 3: 精简 submitConfig 函数**

将 `submitConfig` 函数(第 97-169 行)改为:

```javascript
  const submitConfig = async (group) => {
    switch (group) {
      case 'monitor':
        if (
          originInputs['ChannelDisableThreshold'] !==
          inputs.ChannelDisableThreshold
        ) {
          await updateOption(
            'ChannelDisableThreshold',
            inputs.ChannelDisableThreshold
          );
        }
        break;
      case 'quota':
        if (originInputs['PreConsumedQuota'] !== inputs.PreConsumedQuota) {
          await updateOption('PreConsumedQuota', inputs.PreConsumedQuota);
        }
        break;
      case 'general':
        if (originInputs['ChatLink'] !== inputs.ChatLink) {
          await updateOption('ChatLink', inputs.ChatLink);
        }
        if (originInputs['RetryTimes'] !== inputs.RetryTimes) {
          await updateOption('RetryTimes', inputs.RetryTimes);
        }
        break;
    }
  };
```

移除了 `case 'ratio'` 整个分支,以及 `quota` 中的 `QuotaForNewUser`/`QuotaForInvitee`/`QuotaForInviter`,`general` 中的 `TopUpLink`/`QuotaPerUnit`。

- [ ] **Step 4: 精简 JSX — 移除额度奖励区块**

删除第 189-243 行(从 `<Header as='h3'>{t('setting.operation.quota.title')}</Header>` 到对应的 `<Form.Button>` 和 `<Divider />`):

```javascript
// 删除整个额度奖励区块:
//           <Header as='h3'>{t('setting.operation.quota.title')}</Header>
//           <Form.Group widths='equal'> ... </Form.Group>
//           <Form.Button onClick={() => { submitConfig('quota').then(); }}>
//           <Divider />
```

替换为仅保留 PreConsumedQuota:

```javascript
          <Header as='h3'>{t('setting.operation.quota.title')}</Header>
          <Form.Group widths='equal'>
            <Form.Input
              label={t('setting.operation.quota.pre_consume')}
              name='PreConsumedQuota'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.PreConsumedQuota}
              type='number'
              min='0'
              placeholder={t('setting.operation.quota.pre_consume_placeholder')}
            />
          </Form.Group>
          <Form.Button
            onClick={() => {
              submitConfig('quota').then();
            }}
          >
            {t('setting.operation.quota.buttons.save')}
          </Form.Button>
          <Divider />
```

- [ ] **Step 5: 精简 JSX — 移除倍率配置区块**

删除第 244-284 行(从 `<Header as='h3'>{t('setting.operation.ratio.title')}</Header>` 到对应的 `<Form.Button>` 和 `<Divider />`):

```javascript
// 删除整个倍率配置区块:
//           <Header as='h3'>{t('setting.operation.ratio.title')}</Header>
//           ... ModelRatio / CompletionRatio / GroupRatio TextArea ...
//           <Form.Button onClick={() => { submitConfig('ratio').then(); }}>
//           <Divider />
```

- [ ] **Step 6: 精简 JSX — 移除 monitor 区块中的 QuotaRemindThreshold**

在 monitor 区块(第 314-362 行)中,删除 `QuotaRemindThreshold` 输入框(第 329-340 行):

```javascript
// 删除:
//             <Form.Input
//               label={t('setting.operation.monitor.quota_reminder')}
//               name='QuotaRemindThreshold'
//               ...
//             />
```

将 `Form.Group widths={3}` 改为 `widths={2}`(因为只剩 `ChannelDisableThreshold` 一个输入框,改为 `widths='equal'` 或 `widths={1}`)。

- [ ] **Step 7: 精简 JSX — 移除 general 区块中的商业选项**

在 general 区块(第 364-439 行)中:

1. 删除 `TopUpLink` 输入框(第 367-377 行)
2. 删除 `QuotaPerUnit` 输入框(第 387-398 行)
3. 删除 `DisplayInCurrencyEnabled` 复选框(第 414-419 行)

保留 `ChatLink`、`RetryTimes`、`DisplayTokenStatEnabled`、`ApproximateTokenEnabled`。

将 `Form.Group widths={4}` 改为 `widths='equal'`(因为只剩 `ChatLink` 和 `RetryTimes` 两个输入框)。

- [ ] **Step 8: 移除未使用的 import**

如果 `verifyJSON` 不再被使用(已移除 `submitConfig` 中的 JSON 校验),从 import 中移除:

```javascript
import {
  API,
  showError,
  showSuccess,
  timestamp2string,
} from '../helpers';
```

- [ ] **Step 9: 验证前端构建**

Run: `cd web/default && npm run build`
Expected: 构建成功

- [ ] **Step 10: 提交**

```bash
git add web/default/src/components/OperationSetting.js
git commit -m "refactor(web): 精简运营设置页,移除商业选项和倍率配置"
```

---

### Task 7: 前端 — 清理死代码

**Files:**
- Modify: `web/default/src/components/TokensTable.js:87`

- [ ] **Step 1: 移除未使用的 showTopUpModal state**

在 `web/default/src/components/TokensTable.js` 第 87 行,删除:

```javascript
// 删除: const [showTopUpModal, setShowTopUpModal] = useState(false);
```

此 state 声明后从未被读取或设置(死代码)。

- [ ] **Step 2: 验证前端构建**

Run: `cd web/default && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add web/default/src/components/TokensTable.js
git commit -m "refactor(web): 移除 TokensTable 中未使用的 showTopUpModal 死代码"
```

---

### Task 8: 集成验证

- [ ] **Step 1: 后端全量编译**

Run: `go build ./...`
Expected: 编译成功

- [ ] **Step 2: 后端全量测试**

Run: `go test ./...`
Expected: 全部通过

- [ ] **Step 3: 前端构建**

Run: `cd web/default && npm run build`
Expected: 构建成功

- [ ] **Step 4: 手动验证 — 商业功能已移除**

1. 启动后端: `go build -o one-api && ./one-api --port 3000`
2. 登录管理后台
3. 确认菜单中无"兑换"和"充值"项
4. 直接访问 `/redemption` 和 `/topup` → 返回 404
5. 运营设置页无额度奖励、倍率配置、充值链接选项
6. 技术选项(重试次数、自动禁用渠道等)正常

- [ ] **Step 5: 手动验证 — 中继计费正常**

1. 发送一个测试请求(如 `gpt-4o`)
2. 确认响应正常
3. 查看消费日志,确认额度按 token 数 1:1 扣减

- [ ] **Step 6: 手动验证 — 分组和倍率**

1. `curl -H "Authorization: Bearer <admin-token>" http://localhost:3000/api/group/`
   Expected: `{"success":true,"data":["default"]}`
2. 新用户注册 → 分组为 default,无邀请奖励

- [ ] **Step 7: 提交最终状态**

```bash
git add -A
git commit -m "test: 商业功能移除集成验证通过"
```
