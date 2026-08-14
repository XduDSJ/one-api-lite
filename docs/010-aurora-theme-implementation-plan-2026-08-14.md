# 010 — Aurora 深色主题实施计划

> 日期：2026-08-14
> 关联设计稿：Ardot 文件 `714423202423238`（Concert · 1920×1080 等 19 个顶层节点）
> 关联分支：`frontend-ui-design`
> 决策：保留 `web/default` 不动，新增 `web/aurora` 独立主题目录，跟设计稿一模一样

---

## 一、设计稿视觉规范提取

从 Ardot 设计稿的「响应式规范」「Concert 主视觉」「分组管理页」「渠道添加向导」「用户充值弹窗」5 个节点提取，全部页面统一深色主题。

### 1.1 配色

| Token | 色值 | 用途 |
|-------|------|------|
| `--aurora-bg` | `#0D0D12` | 页面底色 |
| `--aurora-sidebar` | `#0E0E14` (opacity 0.85) | 左侧边栏底色 |
| `--aurora-surface` | `#131319` | 卡片 / 弹窗 / 步骤卡片底色 |
| `--aurora-surface-2` | `#1A1A22` | 底部栏 / 表头 / 次级表面 |
| `--aurora-primary` | `#4318FF` | 主强调色（按钮 / 链接 / 聚焦） |
| `--aurora-primary-hover` | `#3A0FE0` | 主色悬停 |
| `--aurora-accent` | `#B86F05` | 次强调色（分组高亮 / Badge / 活跃指示） |
| `--aurora-text` | `#FFFFFF` | 主文字 |
| `--aurora-text-muted` | `#A1A1AB` | 辅助文字 / 导航标签 |
| `--aurora-border` | `rgba(255,255,255,0.08)` | 卡片 / 表格边框 |
| `--aurora-divider` | `rgba(255,255,255,0.06)` | 分隔线 |
| `--aurora-overlay` | `#000000` | 弹窗遮罩层 |
| `--aurora-success` | `#16A34A` | 成功状态 |
| `--aurora-danger` | `#E5484D` | 危险 / 错误 |
| `--aurora-warning` | `#F5A623` | 警告 |

### 1.2 氛围层（光晕）

页面背景叠加三个径向渐变光晕，营造纵深氛围（**绝不使用纯色平铺**）：

| 光晕 | 色值 | 透明度 | 位置 |
|------|------|--------|------|
| GlowGold | `#F5E6B2` | 0.18 | 左上区域 |
| GlowPurple | `#F59F0B` | 0.12 | 右上区域 |
| GlowCyan | `#2DD4BF` | 0.10 | 左下区域 |

CSS 实现：
```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background:
    radial-gradient(700px circle at 15% 20%, rgba(245,230,178,0.18), transparent 50%),
    radial-gradient(800px circle at 85% 15%, rgba(245,159,11,0.12), transparent 50%),
    radial-gradient(600px circle at 20% 80%, rgba(45,212,191,0.10), transparent 50%);
  pointer-events: none;
  z-index: 0;
}
```

### 1.3 字体

| 角色 | 字体 | 字重 | 字号 |
|------|------|------|------|
| 展示标题 | Noto Sans SC | ExtraBold (800) | 1.5rem (24px) |
| 小标题 | Noto Sans SC | Semi Bold (600) | 1.125rem (18px) |
| 正文 | Noto Sans SC | Regular (400) | 1rem (16px) |
| 辅助文字 | Noto Sans SC | Medium (500) | 0.875rem (14px) |
| 导航标签 | Noto Sans SC | Semi Bold (600) | 0.6875rem (11px) |
| 代码 / 数字 | Inter | Semi Bold (600) | 按场景 |

**禁止**使用 Inter 作为主字体（设计稿仅在"优化对比"卡片标题处用 Inter，其余全部 Noto Sans SC）。

### 1.4 间距系统（rem，1rem = 16px）

| Token | rem | px |
|-------|-----|----|
| `--space-1` | 0.25 | 4 |
| `--space-2` | 0.5 | 8 |
| `--space-3` | 0.75 | 12 |
| `--space-4` | 1 | 16 |
| `--space-5` | 1.5 | 24 |
| `--space-6` | 2 | 32 |
| `--space-7` | 3 | 48 |
| `--space-8` | 4 | 64 |

### 1.5 圆角与阴影

| Token | 值 | 用途 |
|-------|----|------|
| `--radius-lg` | 12px | 卡片 / 弹窗 / 步骤卡片 |
| `--radius-md` | 10px | 导航项 / 小卡片 |
| `--radius-sm` | 8px | 表格 / 标签 / 提示条 |
| `--radius-pill` | 999px | Badge / 药丸标签 |
| `--shadow-card-dark` | `0 16px 48px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2)` | 深色卡片浮起 |
| `--shadow-overlay` | `0 24px 64px rgba(0,0,0,0.5)` | 弹窗 |

### 1.6 布局结构

```
┌─────────────────────────────────────────────────┐
│  Sidebar (264px)  │  TopBar (72px)              │
│  ─────────────    │  ────────────────────────── │
│  Brand Logo       │  PageTitle · Actions        │
│  ─────────────    │                             │
│  NavLabel 主菜单   │                             │
│  · 仪表盘         ├─────────────────────────────┤
│  · 渠道           │                             │
│  · 令牌           │  Content Area               │
│  · 用户           │  padding: 32px              │
│  · 分组 (高亮)    │  max-width: 1440px(1920屏)  │
│  · 日志           │           1152px(1440屏)    │
│  · 设置           │           1680px(3840屏)    │
│  · 关于           │                             │
│  ─────────────    │                             │
│  UserRow 头像      │                             │
└─────────────────────────────────────────────────┘
```

- **左侧边栏**：固定 264px，深色半透明，导航项圆角 10px
- **顶部栏**：72px 高，深色半透明 (opacity 0.60)，含页面标题 + 操作按钮
- **内容区**：弹性宽，padding 32px，容器有上限
- **导航项激活态**：白色 6% 背景 + 强调色边框

### 1.7 响应式断点

| 断点 | 范围 | 容器上限 | 策略 |
|------|------|---------|------|
| 紧凑 | ≤1366px | 100% | 边栏可折叠为图标条 (64px) |
| 标准 | 1367–1919px | 1440px | 边栏 264px，内容区标准 |
| 宽屏 | 1920–2559px | 1440px | 边栏 264px，内容区居中 |
| 超宽 | ≥2560px | 1680px | 边栏 264px，内容区居中留白 |

移动端 (≤768px)：边栏转为抽屉（Drawer），点击菜单按钮展开。

---

## 二、技术方案

### 2.1 新建主题目录 `web/aurora/`

```
web/aurora/
├── package.json          # 复用 default 的依赖（react 17 + semantic-ui-react + react-i18next）
├── public/
│   ├── index.html
│   └── favicon.ico
└── src/
    ├── index.js          # 入口
    ├── index.css         # 全局基础 + 氛围光晕
    ├── aurora-theme.css  # Aurora Design Token + Semantic UI 深色覆写（核心）
    ├── App.js            # 路由 + 布局壳（Sidebar + TopBar + Content）
    ├── components/
    │   ├── Sidebar.js          # 左侧边栏（替代 Header.js 的顶部导航）
    │   ├── TopBar.js           # 顶部栏（页面标题 + 操作区）
    │   ├── Layout.js           # 布局壳组件（组合 Sidebar + TopBar + Outlet）
    │   ├── RechargeModal.js    # 充值弹窗（深色版）
    │   ├── GroupPermissionModal.js  # 权限弹窗（深色版）
    │   └── ...                 # 其他共享组件
    ├── pages/
    │   ├── Dashboard/
    │   ├── Channel/
    │   │   ├── EditChannel.js  # 3 步向导（深色版）
    │   │   └── index.js
    │   ├── Token/
    │   ├── User/
    │   ├── Group/
    │   │   └── index.js        # 分组管理页（深色版）
    │   ├── Log/
    │   ├── Setting/
    │   └── About/
    ├── locales/
    │   ├── zh/translation.json  # 复用 default 的翻译
    │   └── en/translation.json
    └── helpers/
        └── api.js              # 复用 default 的 API 封装
```

### 2.2 后端改动（3 处）

#### 改动 1：`common/config/config.go` — 注册主题

```go
var ValidThemes = map[string]bool{
    "default": true,
    "berry":   true,
    "air":     true,
    "aurora":  true,  // 新增
}
```

#### 改动 2：`Dockerfile` — 加入构建

```dockerfile
RUN npm install --prefix /web/default & \
    npm install --prefix /web/berry & \
    npm install --prefix /web/air & \
    npm install --prefix /web/aurora & \    # 新增
    wait

RUN DISABLE_ESLINT_PLUGIN='true' REACT_APP_VERSION=$(cat ./VERSION) npm run build --prefix /web/default & \
    DISABLE_ESLINT_PLUGIN='true' REACT_APP_VERSION=$(cat ./VERSION) npm run build --prefix /web/berry & \
    DISABLE_ESLINT_PLUGIN='true' REACT_APP_VERSION=$(cat ./VERSION) npm run build --prefix /web/air & \
    DISABLE_ESLINT_PLUGIN='true' REACT_APP_VERSION=$(cat ./VERSION) npm run build --prefix /web/aurora & \    # 新增
    wait
```

#### 改动 3：部署时设置环境变量

```yaml
# docker-compose.yml
services:
  one-api-lite:
    image: ghcr.io/xdudsj/one-api-lite:sha-xxxxxxx
    environment:
      - THEME=aurora    # 切换到 Aurora 主题
```

### 2.3 前端架构策略

**复用 vs 重写**：

| 层面 | 策略 | 原因 |
|------|------|------|
| 依赖包 | 复用 default 的 package.json | 同为 React 17 + Semantic UI React |
| API 封装 | 复用 `helpers/api.js` | 后端 API 不变 |
| i18n 翻译 | 复用 `locales/` | 文案不变 |
| 路由结构 | 复用 `App.js` 路由表 | 页面不变 |
| 布局壳 | **重写** | 顶部导航 → 左侧边栏，结构完全不同 |
| 全局样式 | **重写** | 浅色 → 深色，Semantic UI 深色覆写 |
| 页面组件 | **重写外壳，复用逻辑** | 每个页面的数据逻辑不变，但 JSX 结构和样式类名要按设计稿重写 |
| 功能组件 | **重写外壳，复用逻辑** | 充值弹窗 / 渠道向导 / 权限弹窗的逻辑不变，样式重写 |

**核心工作量在 `aurora-theme.css`**——这是 Semantic UI 的深色主题覆写层，通过 CSS 变量 + `!important` 覆写，让所有 Semantic UI 组件（Button / Form / Table / Card / Modal / Menu / Dropdown / Label / Step / Tab 等）呈现深色风格。

---

## 三、实施计划（分 4 期）

### P0：主题骨架 + 全局样式 + 布局壳（地基）

**目标**：搭建可运行的主题框架，跑通路由，侧边栏 + 顶栏 + 内容区布局可用。

**交付物**：
1. `web/aurora/` 完整目录结构（package.json / public / src 入口文件）
2. `aurora-theme.css` — Design Token 定义 + Semantic UI 深色覆写（覆盖 Button / Form / Input / Card / Menu / Table / Label / Dropdown 等核心组件）
3. `index.css` — 深色背景 + 氛围光晕 + 全局基础
4. `components/Sidebar.js` — 左侧 264px 深色边栏（Logo + 导航项 + 用户区）
5. `components/TopBar.js` — 顶部 72px 栏（页面标题 + 操作区 + 折叠按钮）
6. `components/Layout.js` — 布局壳（Sidebar + TopBar + Content Outlet）
7. `App.js` — 路由表（复用 default 路由，包裹 Layout）
8. 后端改动：`config.go` 注册 `aurora` + `Dockerfile` 加入构建
9. 本地 `npm run build` 通过，`THEME=aurora` 可启动

**验收标准**：
- 所有页面路由可达（内容可以是占位符）
- 侧边栏导航项可点击切换路由
- 深色主题 + 光晕氛围生效
- Semantic UI 组件呈现深色风格

### P1：核心管理页面（渠道 + 用户 + 令牌 + 仪表盘）

**目标**：4 个高频管理页面按设计稿还原。

**交付物**：
1. `pages/Dashboard/` — 仪表盘（统计卡片 + 图表区，深色卡片 + 光晕）
2. `pages/Channel/index.js` — 渠道列表页（深色表格 + 工具栏 + 状态标签）
3. `pages/Channel/EditChannel.js` — 渠道 3 步向导（深色步骤卡片 + 进度条 + 底部导航栏）
4. `pages/User/index.js` — 用户管理页（深色表格 + 操作列"充值"按钮）
5. `pages/Token/index.js` — 令牌管理页（深色表格 + 创建令牌弹窗）
6. `components/RechargeModal.js` — 充值弹窗（深色 Modal + 快捷金额 + 实时预览）

**验收标准**：
- 4 个页面跟设计稿视觉一致
- 所有 CRUD 功能正常（复用 default 逻辑）
- 充值弹窗功能正常
- 渠道向导 3 步流程正常

### P2：功能页面（日志 + 设置 + 分组 + 关于 + 登录注册）

**目标**：剩余页面全部还原。

**交付物**：
1. `pages/Log/` — 日志审计页（深色表格 + 筛选栏）
2. `pages/Setting/` — 系统设置页（深色表单 + Tab 切换）
3. `pages/Group/index.js` — 分组管理页（深色卡片 + 统计行 + 分组表格）
4. `components/GroupPermissionModal.js` — 权限配置弹窗（深色 Modal + 3 Tab）
5. `pages/About/` — 关于页（深色卡片）
6. `pages/Login/` + `pages/Register/` + `pages/Reset/` — 认证页（深色居中卡片 + 光晕）
7. `components/Sidebar.js` — 响应式：移动端抽屉模式

**验收标准**：
- 所有页面跟设计稿视觉一致
- 分组管理 + 权限弹窗功能正常
- 响应式：≤768px 边栏转抽屉
- 认证页深色风格

### P3：交互细节打磨 + 无障碍 + 性能

**目标**：交付前的质量保障。

**交付物**：
1. 交互态规范落实（悬停 / 聚焦 / 激活 / 禁用态，按设计稿「交互态规范」节点）
2. 键盘可达性（Tab 焦点链 / Esc 关弹窗 / Enter 提交）
3. `prefers-reduced-motion` 适配（关闭光晕动画 / 过渡）
4. 深色模式对比度检查（文字 ≥ 4.5:1，UI ≥ 3:1）
5. 代码分割优化（React.lazy 路由级懒加载）
6. i18n 补全（新增的 aurora 专属文案）
7. Docker 构建 + 部署验证

**验收标准**：
- Lighthouse 无障碍评分 ≥ 90
- LCP < 2.5s / CLS < 0.1
- `THEME=aurora` 容器启动正常
- 全部页面功能 + 视觉跟设计稿一致

---

## 四、工作量估算

| 期 | 内容 | 文件数 | 估算工时 |
|----|------|--------|---------|
| P0 | 骨架 + 全局样式 + 布局壳 | ~8 | 6-8h |
| P1 | 4 核心页面 + 充值弹窗 | ~6 | 8-10h |
| P2 | 7 功能页面 + 权限弹窗 + 响应式 | ~10 | 8-10h |
| P3 | 交互打磨 + 无障碍 + 性能 | ~5 | 4-6h |
| **合计** | | **~29** | **26-34h** |

---

## 五、风险与注意事项

### 5.1 Semantic UI 深色覆写复杂度

Semantic UI React 没有官方深色模式，需要通过 CSS `!important` 逐组件覆写。涉及组件多（Button / Form / Input / Table / Card / Modal / Menu / Dropdown / Label / Step / Tab / Pagination / Checkbox / Message / Segment / Grid / Divider / Icon / Flag / Search），工作量集中在 `aurora-theme.css`。

**应对**：P0 阶段先覆写核心 10 个组件，P1/P2 按页面需要补覆写剩余组件。

### 5.2 Docker 构建时间增加

新增一个主题的 `npm install` + `npm run build`，构建时间预计增加 2-3 分钟。

**应对**：Dockerfile 并行构建已优化，影响可控。

### 5.3 镜像体积增加

`go:embed` 会把 `web/build/aurora/` 也嵌入二进制，镜像体积增加约 10-15MB（前端压缩产物）。

**应对**：可接受。如需优化，可在 Dockerfile 里只构建 `THEME` 对应的主题（但会丧失运行时切换能力）。

### 5.4 设计稿与实现的像素级差异

设计稿是 1920×1080 固定画布，实现是响应式。部分设计稿中的固定尺寸（如边栏 264px）在大屏可保持，但在小屏需要折叠。

**应对**：按设计稿「响应式规范」节点的断点策略实现，≤1366 边栏折叠为 64px 图标条，≤768 转为抽屉。

### 5.5 不改动 default 主题

`web/default` 目录完全不动，已有的 P0/P1/P2 功能代码（RechargeModal / EditChannel 向导 / Group 管理）保留在 default 中。Aurora 主题会重新实现这些组件的**外壳**（JSX + 样式），但**复用其业务逻辑**（API 调用 / 状态管理 / 数据处理）。

---

## 六、执行路径

```
P0 骨架 → 本地 build 验证 → 提交
  ↓
P1 核心页面 → 本地 build 验证 → 提交
  ↓
P2 功能页面 → 本地 build 验证 → 提交
  ↓
P3 打磨 → Docker 构建 → 部署验证 → 推送 GitHub
  ↓
THEME=aurora 切换 → 线上验证
```

每期完成后提交一次，不跨期堆积。P3 完成后触发 GitHub Actions 构建 Docker 镜像，部署时设 `THEME=aurora`。
