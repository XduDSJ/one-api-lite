# one-api 个人化改造实现记录

> 编号: 001-one-api-personal-refactor-2026-07-23
> 日期: 2026-07-23

## 改造概述

对 one-api 开源项目进行两项改造:
1. **模型管理改造**:移除硬编码默认模型列表,改为从上游 API 获取 + 手动添加,`/v1/models` 从 ability 表聚合
2. **商业功能移除**:移除兑换码/充值系统、运营设置商业选项、用户分组与分组倍率,倍率固定为 1

## 设计决策

- **方案 A(渐进式改造)**:保留适配器 `constants.go` 中的 `ModelList`(避免改 40 个适配器),移除前端展示和全局列表构建
- **模型获取交互**:渠道先保存,再点"从上游获取"按钮拉取模型
- **倍率处理**:移除前端倍率配置 UI,`GetModelRatio`/`GetGroupRatio` 返回固定值 1,保留计费框架(额度扣减、消费日志)
- **/v1/models 接口**:改为从 ability 表 DISTINCT model 查询,去重返回

## 改动详情

### 模型管理改造

#### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `model/ability.go` | 修改 | 新增 `GetAllDistinctModels()`、`GetChannelModelsMap()` 查询函数 |
| `model/ability_test.go` | 新建 | 测试聚合查询函数 |
| `controller/channel_fetch_models.go` | 新建 | `FetchChannelModels` 接口,用已保存渠道的 Key+BaseURL 请求上游 `/v1/models` |
| `controller/channel_fetch_models_test.go` | 新建 | 测试 JSON 解析和 mock HTTP 请求 |
| `controller/model.go` | 修改 | 移除 `init()` 全局模型列表构建,`ListModels`/`DashboardListModels`/`ListAllModels`/`RetrieveModel` 改为从 ability 表运行时查询 |
| `router/api.go` | 修改 | channelRoute 组新增 `GET /fetch_models/:id` 路由 |

#### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `web/default/src/pages/Channel/EditChannel.js` | 修改 | 移除"填入"按钮和 `fetchModels` 函数,新增"从上游获取"按钮(`fetchUpstreamModels`),保存后可用 |
| `web/default/src/helpers/utils.js` | 修改 | 删除 `channelModels` 变量、`loadChannelModels`、`getChannelModels` 函数 |
| `web/default/src/components/ChannelsTable.js` | 修改 | 移除 `loadChannelModels` import 和调用 |

### 商业功能移除

#### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `controller/redemption.go` | 删除 | 兑换码管理 API |
| `model/redemption.go` | 删除 | 兑换码数据模型 |
| `controller/user.go` | 修改 | 移除 `TopUp`、`AdminTopUp` 函数 |
| `router/api.go` | 修改 | 移除 `/topup` 和 `/redemption` 路由组 |
| `controller/group.go` | 修改 | `GetGroups` 简化为返回 `["default"]` |
| `relay/billing/ratio/group.go` | 修改 | `GetGroupRatio` 返回固定值 1 |
| `relay/billing/ratio/model.go` | 修改 | `GetModelRatio`、`GetCompletionRatio` 返回固定值 1 |
| `model/option.go` | 修改 | 移除商业选项默认值和 updateOptionMap case |
| `controller/misc.go` | 修改 | 移除 `top_up_link` |

#### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `web/default/src/pages/Redemption/` | 删除 | 兑换码页面目录 |
| `web/default/src/pages/TopUp/` | 删除 | 充值页面目录 |
| `web/default/src/components/RedemptionsTable.js` | 删除 | 兑换码表格组件 |
| `web/default/src/App.js` | 修改 | 移除 Redemption/TopUp 路由和 import |
| `web/default/src/components/Header.js` | 修改 | 移除兑换/充值菜单项 |
| `web/default/src/components/OperationSetting.js` | 修改 | 移除额度奖励、倍率配置、充值链接等商业选项 UI |
| `web/default/src/components/TokensTable.js` | 修改 | 移除未使用的 `showTopUpModal` 死代码 |

## 保留的功能

- 计费框架:额度扣减、消费日志、令牌额度限制
- 中继核心:渠道选择、负载均衡、优先级、故障转移、自动禁用
- 适配器层:`GetModelList()` 和 `constants.go` 中的 `ModelList` 保留不动
- 倍率 map 和 JSON 序列化函数:保留(被 `model/option.go` 引用),但 `GetModelRatio`/`GetGroupRatio` 不再读取它们
- `config.DisplayInCurrencyEnabled`、`config.QuotaPerUnit` 等变量:保留(默认值安全,属于计费框架)

## 已知限制

1. **Go 编译验证未执行**:Go 未安装,代码改动已通过静态检查和前端构建验证
2. **berry/air 主题未修改**:仅修改了 default 主题
3. **残留 config 变量**:`QuotaForNewUser`/`QuotaForInviter`/`QuotaForInvitee` 默认值为 0(不赠送),`QuotaRemindThreshold` 默认 1000(低额度提醒),行为正确

## 相关文档

- 设计文档: `docs/superpowers/specs/2026-07-23-one-api-personal-refactor-design.md`
- 实现计划一: `docs/superpowers/plans/2026-07-23-model-management-refactor.md`
- 实现计划二: `docs/superpowers/plans/2026-07-23-commercial-removal.md`
