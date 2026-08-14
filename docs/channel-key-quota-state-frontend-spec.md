# 渠道密钥（channel_keys）前端重设计指令说明

> 发给前端工程师的对接说明。后端已就绪，前端可基于本文档重新设计界面。
> 仓库：one-api（React + Semantic UI React，多主题，构建产物嵌入 Go 二进制）。
> 涉及组件：`web/default/src/components/ChannelKeyList.js`（各主题对应组件同理）。

---

## 1. 背景：为什么需要重新设计

一个多 key 渠道（multi_key_mode 开启）的每把 key 有「每日配额」机制：每把 key 可设独立 `daily_quota_limit`（每日上限）和 `quota_reset_rule`（每日重置时刻，如 `00:00`）。后端按优先级选 key，并在某把 key 配额不足时自动转移到次优先级 key（故障转移）。

**之前的问题**：界面只显示 `已用 / 上限` 数字和一个绿色「启用」状态徽章。当一把 key 因「剩余配额不足以支撑下一次请求」被软性跳过（已转移到别的 key）时，它**仍显示绿色「启用」**，运维无法一眼看出它其实已经停止服务、被绕过了。例如 key 显示 `49,925,479 / 50,000,000` + 绿色「启用」，实际早已被转移、冻结数小时。

**本次后端改动**：状态接口新增一个**派生字段 `quota_state`**，它综合 `status` + 配额余量 + 平均 token，给出更准确的运行态。前端应改用 `quota_state` 驱动状态徽章，并配合配额进度条，让「已转移」「配额耗尽」「冷却中」等状态一目了然。

---

## 2. 数据接口（后端已就绪，可直接对接）

### `GET /api/channel/:id/keys/status`

返回某渠道所有启用 key 的状态摘要。响应体：

```jsonc
{
  "success": true,
  "message": "",
  "data": [
    {
      // —— 原 ChannelKey 字段（部分列举，完整字段见下表）——
      "id": 1,
      "key_value": "sk-NBnC02YX1qBV6m3QSDKpnQ",  // 前端需掩码展示
      "remark": "Test-key",
      "status": 1,            // 原始状态码，1=启用 2=手动禁用 3=冷却 4=配额耗尽
      "priority": 3,
      "daily_quota_limit": 50000000,
      "daily_used_quota": 49925479,
      "avg_tokens_per_req": 126543.4,
      "total_used_quota": 49925479,
      "total_requests": 521,
      "quota_reset_rule": "00:00",
      "cooled_until": 0,
      // —— 本次新增派生字段 ——
      "quota_state": "low_quota"   // ⭐ 状态徽章应以此为准
    }
    // ...更多 key
  ]
}
```

### `quota_state` 取值（状态徽章的唯一依据）

| `quota_state` | 含义 | 触发条件（后端逻辑，前端无需判断，只读此字段） | 建议颜色 | 建议文案 |
|---|---|---|---|---|
| `active` | 正常服务中 | status=启用 且 配额充足 | 绿色 | 启用 |
| `low_quota` | **配额不足·已转移**（重点状态） | status=启用 但 剩余配额 < 1.5×平均token → 被软性跳过，请求已转移到次优先级 key | **黄色** | **额度不足·已转移** |
| `exhausted` | 配额耗尽 | status=4（撞硬限额）或 status=启用但已用≥上限 | 橙色 | 配额耗尽 |
| `cooling` | 冷却中（自动，到期恢复） | status=3 | 黄色 | 冷却中 |
| `disabled` | 手动禁用 | status=2 | 红色 | 手动禁用 |

> **关键**：`quota_state` 比 `status` 更准。一把 `status=1`（启用）的 key，`quota_state` 可能是 `low_quota`（已被转移）或 `exhausted`（硬到顶）。**状态徽章请用 `quota_state`，不要用 `status`。**
> **兼容**：旧版后端可能不返回 `quota_state`。前端若发现该字段缺失，回退用 `status` 映射（status 1→绿/启用、2→红/手动禁用、3→黄/冷却中、4→橙/配额耗尽）。

### 完整字段参考（`data[]` 每个对象）

| 字段 | 类型 | 说明 | 前端展示建议 |
|---|---|---|---|
| `id` | int | key 主键 | — |
| `key_value` | string | 真实 API key | **必须掩码**：前4 + `****` + 后4（不足8位全掩码） |
| `remark` | string | 备注 | 直接展示 |
| `status` | int | 原始状态码 | 不单独展示，用 `quota_state` 代替 |
| `priority` | int | 优先级（大优先） | 数字展示 |
| `daily_quota_limit` | int64 | 每日配额上限；0=不设上限 | 0 显示 `∞` |
| `daily_used_quota` | int64 | 今日已用配额 | 千分位格式化 |
| `avg_tokens_per_req` | float | 平均每请求 token（EMA） | 可选展示，辅助判断 low_quota 原因 |
| `total_used_quota` | int64 | 累计已用 | 可选展示（统计列） |
| `total_requests` | int | 累计请求数 | 可选展示（统计列） |
| `quota_reset_rule` | string | 每日重置时刻 `HH:MM`；空=不重置 | 展示如 `每日 00:00`；空显示 `-` |
| `cooled_until` | int64 | 冷却到期时间戳；0=未冷却 | cooling 态可展示倒计时（可选） |
| `quota_state` | string | **派生运行态（本次新增）** | **状态徽章依据** |

---

## 3. 前端设计要求

### 3.1 状态徽章（核心改动）

用 `quota_state` 驱动，颜色 + 文案如下。**重点突出 `low_quota`（黄色「额度不足·已转移」）**——这是本次改动要解决的主要痛点。

```
active     → 🟢 启用
low_quota  → 🟡 额度不足·已转移     ← 之前会误显示成绿色「启用」，现在必须黄色
exhausted  → 🟠 配额耗尽
cooling    → 🟡 冷却中
disabled   → 🔴 手动禁用
```

兼容旧后端（无 `quota_state`）的回退映射见上节。

### 3.2 配额列（今日配额）

展示「**已用** X / Y」+ 细进度条 + 百分比，明确是「已用」而非「剩余」（避免把 `49925479 / 50000000` 读成「剩余」误以为快用完）：

```
已用 49,925,479 / 50,000,000
▰▰▰▰▰▰▰▰▰▰▰▰▰▰░░ 99.85%
```

- `daily_quota_limit === 0` → 显示 `∞`（不设上限）
- 数字千分位格式化（`Number(n).toLocaleString()`）
- 进度条封顶 100% 显示，但百分比文字按真实值（可超 100%）
- 进度条颜色可与 `quota_state` 联动：active 绿、low_quota 黄、exhausted 橙（可选增强）

### 3.3 列建议（可按设计师审美调整）

| 列 | 内容 |
|---|---|
| 密钥 | 掩码后的 key_value + remark（如 `sk-N****KpnQ · Test-key`） |
| 状态 | quota_state 徽章（§3.1） |
| 优先级 | priority 数字 |
| 今日配额 | 已用/上限 + 进度条 + 百分比（§3.2） |
| 重置规则 | `quota_reset_rule` → `每日 00:00`；空 → `-` |
| 累计统计 | `total_requests` 次 / `total_used_quota`（可选，放折叠区或副行） |
| 操作 | 非 active 态显示「启用」按钮（调 `POST /api/channel/:id/key/:keyId/enable`） |

### 3.4 交互

- 「启用」按钮：仅当 `quota_state !== 'active'` 时显示（被禁用/冷却/耗尽/转移的 key 可手动启用/重置）。点击调 `POST /api/channel/:id/key/:keyId/enable`，成功后刷新列表。
- 列表数据通过 `GET /api/channel/:id/keys/status` 拉取；建议支持手动刷新或定时轮询（30s），因为状态会随请求实时变化。
- `key_value` 永远掩码展示，不要明文显示完整 key。

### 3.5 多主题同步

one-api 有三个主题：`web/default`、`web/berry`、`web/air`。**三个主题的对应组件都要同步改**（`ChannelKeyList` 或等价组件）。构建命令见各主题 `package.json` 的 `build` 脚本，产物须落到 `web/build/<theme>`。

---

## 4. 典型场景对照（验收用）

| 场景 | 期望显示 |
|---|---|
| key 正常服务，已用 100万/5000万 | 🟢启用 + 已用 1,000,000 / 50,000,000 · 2.00% |
| key 剩余不足被转移，已用 49,925,479/5000万 | 🟡**额度不足·已转移** + 已用 49,925,479 / 50,000,000 · 99.85% |
| key 撞硬限额 | 🟠配额耗尽 + 已用 50,000,000 / 50,000,000 · 100.00% |
| key 冷却中 | 🟡冷却中 + 配额格照常 |
| key 手动禁用 | 🔴手动禁用 + 配额格照常 + 「启用」按钮可见 |
| key 不设上限 | 🟢启用 + ∞ |

---

## 5. 当前临时实现（参考，可替换）

后端本次已在 `web/default/src/components/ChannelKeyList.js` 做了最小可用实现（Semantic UI `Label` + `Progress`），前端工程师可在此基础上重新设计，或完全替换。关键代码位置：
- 状态徽章：`renderQuotaState(state, status, t)` 函数 + `QUOTA_STATE_META` 映射
- 配额单元格：`fmtNum` / `quotaPct` + `<Progress>` 组件
- 掩码：`maskKey(keyValue)`

后端字段已就绪，前端可立即对接。无需等后端再改。
