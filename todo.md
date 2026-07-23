# one-api 个人化改造进度

## 任务列表

### 1. 模型管理改造 ✅
- [x] 探索项目上下文,收集代码细节
- [x] 编写设计文档 (`docs/superpowers/specs/2026-07-23-one-api-personal-refactor-design.md`)
- [x] 编写实现计划 (`docs/superpowers/plans/2026-07-23-model-management-refactor.md`)
- [x] Task 1: 新增 ability 表聚合查询函数 `GetAllDistinctModels`、`GetChannelModelsMap`
- [x] Task 2: 新增 `FetchChannelModels` 接口,请求上游 `/v1/models`
- [x] Task 3: 注册 `GET /api/channel/fetch_models/:id` 路由
- [x] Task 4: 改造 `controller/model.go`,移除 `init()` 全局列表,改为从 ability 表运行时查询
- [x] Task 5: 改造 `EditChannel.js`,移除填入按钮,新增"从上游获取"按钮
- [x] Task 6: 移除 `utils.js` 中的 `getChannelModels`/`loadChannelModels`
- [x] 前端构建验证通过

### 2. 商业功能移除 ✅
- [x] 编写实现计划 (`docs/superpowers/plans/2026-07-23-commercial-removal.md`)
- [x] Task 1: 删除兑换码系统 (`controller/redemption.go`、`model/redemption.go`),移除 topup 路由和函数
- [x] Task 2: 倍率固定为 1 (`GetModelRatio`、`GetCompletionRatio`、`GetGroupRatio`)
- [x] Task 3: 分组固定为 default (`GetGroups` 返回 `["default"]`)
- [x] Task 4: 移除运营设置商业选项 (`model/option.go`、`controller/misc.go`)
- [x] Task 5: 删除前端兑换/充值页面、路由、菜单
- [x] Task 6: 精简运营设置页,移除商业选项和倍率配置 UI
- [x] Task 7: 清理 `TokensTable.js` 死代码
- [x] 前端构建验证通过

### 3. 集成验证 ✅
- [x] router/api.go 合并两个计划的改动
- [x] 前端构建验证通过
- [x] 静态检查:无残留引用(兑换码/充值/模型加载相关)
- [ ] Go 编译验证(Go 未安装,待环境就绪后执行 `go build ./...`)
- [ ] Go 测试验证(待环境就绪后执行 `go test ./...`)
- [ ] 手动验证:新建渠道 → 从上游获取模型 → /v1/models 接口
- [ ] 手动验证:商业功能已移除(无兑换/充值入口)

## 已知限制

1. **Go 未安装**:无法运行 `go build`/`go test`,代码改动已通过静态检查和前端构建验证
2. **残留引用**:`config.DisplayInCurrencyEnabled`、`config.QuotaPerUnit`、`config.QuotaForNewUser` 等变量仍保留在 `common/config/config.go` 中,默认值安全(无除零、无额度赠送),属于设计文档中"保留计费框架"的范围
3. **berry/air 主题未修改**:仅修改了 default 主题,其他主题如有相同商业功能需单独处理

## 提交记录

| 提交 | 说明 |
|------|------|
| `9cafaea` | 设计文档 |
| `003c5b6` | 两个实现计划 |
| `ab0569a` | ability 表聚合查询函数 |
| `e489e09` | fetch_models 接口 |
| `10d4709` | controller/model.go 改造 |
| `d2d33a5` | EditChannel.js 从上游获取按钮 |
| `73aa175` | 移除 getChannelModels/loadChannelModels |
| `6334cf2` | 移除兑换码系统和充值 API |
| `456dd9c` | 倍率固定为 1 |
| `951e734` | 分组固定为 default |
| `28b1d5b` | 移除运营设置商业选项 |
| `64f3c6e` | 移除兑换/充值前端页面 |
| `7639f6e` | 精简运营设置页 |
| `5bf3341` | 清理 TokensTable 死代码 |
| `97d2bcd` | 注册 fetch_models 路由 |
