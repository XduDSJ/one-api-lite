# One API 默认主题（default）

基于 [songquanpeng/one-api](https://github.com/songquanpeng/one-api) 默认主题，由 [XduDSJ/one-api-lite](https://github.com/XduDSJ/one-api-lite) 在 `frontend-ui-design` 分支上进行了 UI 增强。

## 技术栈

| 项目 | 说明 |
|------|------|
| 框架 | React 17 + Create React App |
| UI 库 | Semantic UI React |
| 路由 | React Router 5 |
| 国际化 | react-i18next（`locales/zh/` + `locales/en/`） |
| HTTP | axios（封装在 `helpers/api.js`） |
| 状态管理 | React Hooks（无 Redux） |

## 快速开始

```shell
# 安装依赖
npm install

# 开发模式
npm start

# 生产构建（输出到 build/）
npm run build
```

如需指定后端地址，构建前设置环境变量：

```shell
REACT_APP_SERVER=http://your.domain.com npm run build
```

## 目录结构

```
src/
├── App.js                 # 路由定义 + 全局布局
├── components/
│   ├── Header.js          # 顶部导航栏
│   ├── Footer.js          # 页脚
│   ├── UsersTable.js       # 用户列表表格
│   ├── ChannelsTable.js    # 渠道列表表格
│   ├── RechargeModal.js    # ★ 用户充值弹窗（新增）
│   ├── GroupPermissionModal.js  # ★ 分组权限配置弹窗（新增）
│   └── ...
├── pages/
│   ├── Channel/
│   │   ├── EditChannel.js  # ★ 渠道编辑（3步向导重构）
│   │   └── index.js
│   ├── Group/
│   │   └── index.js        # ★ 分组管理总览页（新增）
│   ├── Dashboard/
│   ├── Log/
│   ├── Setting/
│   ├── Token/
│   ├── User/
│   └── ...
├── helpers/
│   ├── api.js             # axios 实例 + API 封装
│   ├── render.js          # renderQuota 等工具函数
│   └── ...
├── locales/
│   ├── zh/translation.json
│   └── en/translation.json
└── context/               # React Context（StatusContext 等）
```

## UI 增强（frontend-ui-design 分支）

以下为本分支相对原版的 UI 改动，按优先级分三批实现：

### P0 — 用户充值弹窗

| 文件 | 类型 | 说明 |
|------|------|------|
| `components/RechargeModal.js` | 新增 | 独立充值弹窗组件 |
| `components/UsersTable.js` | 修改 | 操作列增加"充值"按钮，集成 RechargeModal |

**功能要点：**
- 弹窗内输入充值金额，支持 4 个快捷金额按钮
- 根据系统 `display_in_currency` 设置自动切换货币/原始额度显示
- 实时预览充值后余额
- API 流程：`GET /api/user/:id` 获取当前额度 → 前端计算新额度 → `PUT /api/user/` 覆写
- 充值成功后回调更新用户列表，无需刷新页面

### P1 — 渠道编辑 3 步向导

| 文件 | 类型 | 说明 |
|------|------|------|
| `pages/Channel/EditChannel.js` | 修改 | 从单页表单重构为 3 步向导 |

**步骤划分：**
1. **Step 1 — 基本信息**：渠道名称、类型、分组、优先级、权重
2. **Step 2 — 密钥配置**：API Key、代理设置、模型重定向
3. **Step 3 — 模型选择**：可用模型列表、自定义模型

- 使用 `Step.Group` 步骤指示器，已完成步骤可点击回退
- 每步底部有"上一步/下一步/提交"导航按钮
- 表单验证在"下一步"点击时触发

### P2 — 分组管理页 + 权限配置

| 文件 | 类型 | 说明 |
|------|------|------|
| `pages/Group/index.js` | 新增 | 分组管理总览页 |
| `components/GroupPermissionModal.js` | 新增 | 分组权限配置弹窗 |
| `App.js` | 修改 | 添加 `/group` 路由 |
| `components/Header.js` | 修改 | 导航栏增加"分组"入口（仅管理员可见） |

**分组管理总览页：**
- 分页加载全部渠道和用户，聚合提取唯一分组名
- 每分组以 Card 展示：渠道数、用户数、可用模型数、活跃渠道统计
- 支持添加自定义分组名（存 localStorage `custom_groups`）
- 点击分组卡片打开权限配置弹窗

**权限配置弹窗（3 个 Tab）：**
1. **渠道列表**：显示该分组下所有渠道（ID/名称/类型/状态），支持下拉框移动到其他分组
2. **用户列表**：显示该分组下所有用户（ID/用户名/角色/额度），支持下拉框移动到其他分组
3. **可用模型**：Label 标签展示该分组所有渠道的可用模型合集

**移动 API 流程：**
- 渠道：`GET /api/channel/:id` → 修改 `group` 字段 → `PUT /api/channel/`
- 用户：`GET /api/user/:id` → 修改 `group` 字段 → `PUT /api/user/`

## 国际化

所有新增 UI 文案均通过 `react-i18next` 管理，翻译文件位于：

- `locales/zh/translation.json` — 中文
- `locales/en/translation.json` — 英文

新增的 i18n key 命名空间：
- `header.group` — 导航栏分组入口
- `group.*` — 分组管理页所有文案
- `recharge.*` — 充值弹窗文案（如有）

## 开发约定

- 编辑前确保 IDE 的 `Actions on Save` 已启用 `Optimize imports` 和 `Run Prettier`
- 表单组件统一使用 Semantic UI React 的 `Form.Input` / `Form.Dropdown` / `Form.Field`
- 弹窗统一使用 `Modal` / `Header` / `Modal.Content` / `Modal.Actions`
- API 调用通过 `helpers/api.js` 的 `API` 实例，错误处理用 `showError` / `showSuccess` / `showInfo`
- 额度显示统一使用 `renderQuota(quota, t, precision)` 函数
