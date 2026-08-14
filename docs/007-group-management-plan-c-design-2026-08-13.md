# 007 - 分组管理方案C预留设计 - 2026-08-13

## 背景

当前 one-api 的分组（group）功能存在以下问题：

1. **后端硬编码**：`controller/group.go` 的 `GetGroups` 永远返回 `["default"]`，无动态查询
2. **前端无管理页面**：分组维护依赖渠道/用户编辑页的 `allowAdditions` 手动输入
3. **分组字段散落**：渠道编辑（多选）、用户编辑（单选）各自维护，无统一管理入口

用户决策：**预留方案C完整设计（分组管理页面 + 权限配置弹窗），本次不正式启用，前端注释分组代码让功能"看起来不存在"，后续一块实现代码。**

---

## 一、设计稿（已完成）

### 1.1 分组管理页 · 预留

**节点ID**：`12:129` | **位置**：x:18500, y:1200 | **尺寸**：1920×1080

**视觉标注**：琥珀虚线边框（dashPattern [8,6]），标识为预留页面。

#### 页面结构

| 区域 | 节点ID | 说明 |
|---|---|---|
| Sidebar | `12:130` | 264px 宽，导航项含"分组管理"高亮（琥珀12%底+30%边框）+ "预留"badge |
| Content | `12:178` | 1656px 宽，垂直布局，padding 32px |

#### Content 内容

**PageHeader (`12:179`)**
- 标题："分组管理"（28px ExtraBold 白色）
- 副标题："管理用户分组、渠道归属与模型权限分配"（14px 灰色）
- 预留badge："方案C预留 · 未启用"（琥珀虚线边框）
- 新建分组按钮：琥珀实底 + 白色文字

**StatsRow (`12:192`)** — 4 统计卡片

| 卡片 | 数值 | 颜色 | 标签 |
|---|---|---|---|
| Stat-Groups | 5 | 白色 | 分组总数 |
| Stat-Channels | 12 | 青色 #2DD4BF | 关联渠道 |
| Stat-Users | 48 | 白色 | 关联用户 |
| Stat-ModelPerms | 23 | 琥珀 #B86F05 | 模型权限配置 |

**GroupTable (`12:205`)** — 7 列分组列表

| 列 | 宽度 | 说明 |
|---|---|---|
| 分组名 | 160px | JetBrains Mono，default 行琥珀底 |
| 描述 | 自适应 | Noto Sans SC 灰色 |
| 渠道 | 90px | 青色 Semi Bold |
| 用户 | 90px | 白色 Semi Bold |
| 模型 | 90px | 琥珀 Semi Bold |
| 创建时间 | 120px | 灰色 |
| 操作 | 140px | "编辑 · 权限 · 删除" |

示例数据：default / vip / enterprise / test

**ReservedHint (`12:246`)** — 琥珀虚线提示框
> 此页面为方案C预留设计 · 当前未启用 · 前端代码已注释分组功能，后端仅支持 default 分组 · 启用需：①后端 GetGroups 改为动态查询 ②前端取消注释 GROUP_FEATURE_ENABLED ③新增分组管理路由

---

### 1.2 分组权限配置弹窗 · 预留

**节点ID**：`12:251` | **位置**：x:20620, y:1200 | **尺寸**：560×420

**视觉标注**：琥珀虚线边框 + 阴影效果。

#### 弹窗结构

| 区域 | 节点ID | 说明 |
|---|---|---|
| Header | `12:252` | 56px 高，标题"配置模型权限 · vip" + 关闭按钮 |
| Body | `12:259` | 搜索框 + "从上游获取"按钮 + ModelTable |
| Footer | `12:304` | "已选2个模型"统计 + 取消/保存按钮 |

#### ModelTable (`12:270`) — 4 列勾选表格

| 列 | 宽度 | 说明 |
|---|---|---|
| 选 | 44px | 勾选框（已选=琥珀实底✓，未选=空心框） |
| 模型 | 自适应 | JetBrains Mono（已选=白色，未选=浅灰） |
| 别名 | 150px | 有值=青色，无值=灰色"点击设置别名"或"—" |
| 状态 | 60px | "已配置"=青色 / "未配置"=灰色 |

示例数据：✓gpt-4o(已配置) / ✓gpt-4o-mini(已配置) / □gpt-4-turbo(未配置) / □dall-e-3(未配置)

---

### 1.3 现有页面分组字段预留标注

| 页面 | 节点ID | 改动 |
|---|---|---|
| 渠道添加向导 Step1 | `3:2701` (GroupField) | 标签→"分组（预留 · 未启用）"，opacity 0.4 灰显 |
| 编辑渠道弹窗 | `3:2424` (Field-Group) | 标签→"分组（预留）"，opacity 0.4 灰显 |

---

## 二、前端代码注释方案（方案D · 后续实现）

### 2.1 方案选择

采用**混合方案（特征开关 + 条件渲染 + 提交守卫）**：

- UI 层：`{GROUP_FEATURE_ENABLED && <Dropdown/>}` 条件渲染，分组 UI 不显示
- 逻辑层：`if (GROUP_FEATURE_ENABLED)` 守卫，避免无效 fetchGroups 请求
- 提交层：`group` 字段固定提交 `'default'`，保持后端兼容
- 表格层：分组列用 `GROUP_FEATURE_ENABLED &&` 条件渲染隐藏

**优点**：前端"看起来没分组功能"、后端兼容、启用只需改一行常量。

### 2.2 新增文件

`web/default/src/constants/featureFlags.js`
```js
// 分组管理功能开关（方案C预留）
// 启用步骤：
// 1. 后端 controller/group.go GetGroups 改为动态查询
// 2. 将下方常量改为 true
// 3. App.js 新增 /group 路由，Header.js 新增导航项
export const GROUP_FEATURE_ENABLED = false;
```

### 2.3 需改动文件清单

| 文件 | 行号 | 改动要点 |
|---|---|---|
| `helpers/render.js` | L12-38 | `renderGroup` 函数加 `if (!GROUP_FEATURE_ENABLED) return null;` |
| `pages/Channel/EditChannel.js` | L49,54 | state 初值保留，但加守卫 |
| | L103-106 | 回显拆分逻辑加 `if (GROUP_FEATURE_ENABLED)` 守卫 |
| | L232-240 | `fetchGroups` 加 `if (!GROUP_FEATURE_ENABLED) return;` |
| | L282 | useEffect 中的 `fetchGroups()` 调用加守卫 |
| | L368 | 提交时 `group` 固定 `'default'`：`localInputs.group = GROUP_FEATURE_ENABLED ? localInputs.groups.join(',') : 'default'` |
| | L478-494 | Dropdown UI 用 `{GROUP_FEATURE_ENABLED && (...)}` 包裹 |
| `components/ChannelsTable.js` | L16 | import 保留（renderGroup 加了 null 守卫，安全） |
| | L530,533 | 排序列+表头用 `{GROUP_FEATURE_ENABLED && (...)}` 包裹 |
| | L604 | 单元格用 `{GROUP_FEATURE_ENABLED && renderGroup(...)}` |
| `pages/User/EditUser.js` | L21,23 | state 初值保留 |
| | L37-46 | `fetchGroups` 加守卫 |
| | L74 | useEffect 调用加守卫 |
| | L134-151 | Dropdown UI 条件渲染 |
| `components/UsersTable.js` | L17,211,214,266 | 同 ChannelsTable，条件渲染分组列 |

### 2.4 不需改动的文件

- `AddUser.js` — 无 group 字段
- `EditToken.js` — 无 group 字段
- `LogsTable.js` — 无 group 列
- `SystemSetting.js` — 仅 `Form.Group` 布局组件，非分组业务
- `App.js` — 当前无 /group 路由（启用时才加）
- `Header.js` — 当前无分组导航项（启用时才加）

---

## 三、后端改动需求（启用时）

### 3.1 GetGroups 动态查询

`controller/group.go` 当前硬编码：
```go
func GetGroups(c *gin.Context) {
    c.JSON(200, gin.H{"data": []string{"default"}})
}
```

改为动态查询：
```go
func GetGroups(c *gin.Context) {
    groups, err := model.GetAllGroups()
    if err != nil {
        c.JSON(200, gin.H{"data": []string{"default"}})
        return
    }
    c.JSON(200, gin.H{"data": groups})
}
```

`model/channel.go` 新增：
```go
func GetAllGroups() ([]string, error) {
    var groupStrs []string
    err := DB.Model(&Channel{}).Distinct("group").Pluck("group", &groupStrs).Error
    // 拆分逗号分隔的多分组，去重
    ...
}
```

### 3.2 分组管理 API（新增）

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/group/` | GET | 获取所有分组列表（动态查询） |
| `/api/group/` | POST | 创建分组 |
| `/api/group/:name` | PUT | 更新分组（名称、描述） |
| `/api/group/:name` | DELETE | 删除分组（需检查关联渠道/用户） |
| `/api/group/:name/models` | GET | 获取分组的模型权限配置 |
| `/api/group/:name/models` | PUT | 更新分组的模型权限配置 |

### 3.3 数据模型扩展

当前 `abilities` 表已有 `group` 字段，无需新建表。分组权限配置实质是管理 `abilities` 表中 `group=X` 的记录集合。

可选：新增 `groups` 表存储分组元数据（名称、描述、创建时间）：
```sql
CREATE TABLE groups (
    name VARCHAR(32) PRIMARY KEY,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 四、后续启用步骤

| 步骤 | 说明 | 涉及文件 |
|---|---|---|
| 1 | 后端 GetGroups 改为动态查询 | `controller/group.go`, `model/channel.go` |
| 2 | 后端新增分组管理 CRUD API | `controller/group.go`, `router/main.go` |
| 3 | 前端 `GROUP_FEATURE_ENABLED` 改为 `true` | `constants/featureFlags.js` |
| 4 | 前端新增分组管理页面组件 | `pages/Group/GroupManagement.js` |
| 5 | 前端新增 `/group` 路由 | `App.js` |
| 6 | 前端 Header 新增"分组管理"导航项 | `Header.js` |
| 7 | 设计稿已就绪，无需修改 | — |

---

## 五、设计稿节点ID速查

| 设计稿 | 节点ID |
|---|---|
| 分组管理页（顶层） | `12:129` |
| 分组管理页 Sidebar | `12:130` |
| 分组管理页 Content | `12:178` |
| 分组管理页 GroupTable | `12:205` |
| 分组权限配置弹窗（顶层） | `12:251` |
| 弹窗 ModelTable | `12:270` |
| 渠道向导 Step1 GroupField | `3:2701`（已灰显） |
| 编辑弹窗 Field-Group | `3:2424`（已灰显） |
