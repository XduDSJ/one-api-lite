# Aurora 设计稿 1:1 全量重构计划

**执行原则**：直接读取设计稿节点树（不通过截图），严格按每个元素的精确数值还原，不简化、不省略、不主观调整。

## 设计稿全局规范（从所有页面共享结构提取）

### 布局壳（所有内页共享）
```
Page: 1920×1080, bg=#0D0D12 (rgb 0.051/0.051/0.071)
├── GlowGold: 700×700, radial-gradient, gold@0.18→0, x:-200 y:400, cornerRadius:999
├── GlowPurple: 800×800, radial-gradient, gold@0.12→0, x:1400 y:-100, cornerRadius:999
├── GlowCyan: 600×600, radial-gradient, cyan@0.10→0, x:800 y:600, cornerRadius:999
├── Sidebar: 264×1080, bg=rgba(14,14,20,0.85), stroke=rgba(255,255,255,0.06)
│   ├── Brand: x:16 y:24, LogoMark 38×38 + BrandText
│   ├── NavLabel: "主菜单" 11px SemiBold #A1A1AA, x:16 y:82
│   ├── NavItem-Active: bg=rgba(255,255,255,0.06), Icon 30×30 cornerRadius:9 bg=rgba(255,255,255,0.08), Label 14.5px Medium #FFFFFF
│   ├── NavItem-Default: Icon bg=rgba(255,255,255,0.05), Label 14.5px Medium #A1A1AA
│   ├── NavItems: 仪表盘/渠道/令牌/用户/日志/设置/关于, itemSpacing:4, each 52px高
│   ├── Spacer: flex-grow:1
│   ├── Divider: 232×1, bg=rgba(255,255,255,0.06)
│   └── UserRow: Avatar 38×38 cornerRadius:19 bg=rgba(255,255,255,0.08), Name 14px Medium #E2E8F0, Role 11.5px Regular #52525B
└── Content: 1656×1080
    ├── TopBar: 1656×72, bg=rgba(14,14,20,0.6), stroke=rgba(255,255,255,0.06)
    │   ├── LeftGroup: x:40, PageTitle 22px Bold #FFFFFF, Breadcrumb 12.5px Regular #52525B
    │   └── RightGroup: x:1186, SearchBox 280×37 cornerRadius:10, NotifBtn/ThemeBtn/HeaderAvatar 38×38 cornerRadius:10
    └── Body: 1656×1008
        └── Container: x:108 y:32, 1440px, itemSpacing:24
```

### 精确颜色值
| Token | RGB | Hex | 用途 |
|---|---|---|---|
| bg | 0.051/0.051/0.071 | #0D0D12 | 页面背景 |
| surface | 0.075/0.075/0.098 | #131319 | 卡片背景 |
| surface-2 | 0.102/0.102/0.133 | #1A1A22 | 弹窗/header背景 |
| border | rgba(255,255,255,0.07) | — | 边框 |
| divider | rgba(255,255,255,0.06) | — | 分隔线 |
| text | 1/1/1 | #FFFFFF | 主文字 |
| text-muted | 0.631/0.631/0.667 | #A1A1AA | 次要文字 |
| text-dim | 0.478/0.478/0.478 | #7A7A7A | 暗淡文字 |
| accent | 0.722/0.435/0.02 | #B86F05 | 金色强调 |
| cyan | 0.176/0.831/0.749 | #2DD4BF | 青色 |
| red | 0.937/0.267/0.267 | #EF4444 | 红色 |
| success | 0.176/0.831/0.749 | #2DD4BF | 成功 |

### 字体规范
| 用途 | 字号 | 字重 | 字体 |
|---|---|---|---|
| 页面标题 | 22px | Bold | Noto Sans SC |
| 卡片标题 | 16px | Semi Bold | Noto Sans SC |
| Section标题 | 13px | Medium | Noto Sans SC |
| 表头 | 12px | Medium | Noto Sans SC |
| 正文 | 13px | Regular | Noto Sans SC |
| 次要文字 | 12px | Regular | Noto Sans SC |
| 导航项 | 14.5px | Medium | Noto Sans SC |
| 面包屑 | 12.5px | Regular | Noto Sans SC |
| 代码/密钥 | 12px | Regular | JetBrains Mono |

## 重构页面清单（19项，按执行顺序）

| # | 设计稿ID | 页面 | 当前文件 | 优先级 |
|---|---|---|---|---|
| 1 | 3:446/3:447 | 布局壳(Sidebar+TopBar) | Sidebar.js/TopBar.js/Layout.js | P0 |
| 2 | 3:442 | 仪表盘Concert | Dashboard/index.js | P0 |
| 3 | 3:648 | 渠道管理页 | ChannelsTable.js | P0 |
| 4 | 3:2379 | 渠道编辑弹窗 | EditChannel.js | P0 |
| 5 | 19:167 | 多Key配置表单 | EditChannel.js(密钥section) | P0 |
| 6 | 12:543 | 登录页 | LoginForm.js | P0 |
| 7 | 3:1004 | 渠道详情页 | ChannelDetail(新建) | P1 |
| 8 | 3:1404 | 令牌管理页 | TokensTable.js | P1 |
| 9 | 3:1630 | 用户管理页 | UsersTable.js | P1 |
| 10 | 3:1856 | 日志审计页 | LogsTable.js | P1 |
| 11 | 3:2082 | 系统设置页 | SystemSetting.js | P1 |
| 12 | 3:2660 | 渠道添加向导 | ChannelWizard(新建) | P1 |
| 13 | 12:578 | 注册页 | RegisterForm.js | P2 |
| 14 | 17:1 | 密码重置页 | PasswordResetForm.js | P2 |
| 15 | 12:129 | 分组管理页 | Group/index.js | P2 |
| 16 | 12:251 | 分组权限弹窗 | GroupPermissionModal.js | P2 |
| 17 | 19:1 | 关于页 | About/index.js | P2 |
| 18 | 22:94 | 用户充值弹窗 | RechargeModal.js | P3 |
| 19 | 3:2369 | 交互态规范 | AuroraState.js | P3 |
