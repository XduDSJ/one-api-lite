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
- [x] Go 编译验证通过(`CGO_ENABLED=0 go build ./...` 无错误)
- [x] Go 测试:controller/relay/channeltype/network 全部通过
- [x] 修复 `model/main.go` 遗漏的 Redemption AutoMigrate 引用
- [x] 静态验证:fetch_models 路由已注册、/v1/models 从 ability 表查询
- [x] 静态验证:商业功能已移除(redemption/topup 路由、页面、菜单均无残留)
- [x] 修复 `model/token.go` 额度提醒邮件中的充值链接(指向已删除的 /topup)
- [x] 运行时验证:服务启动、登录、创建渠道、/v1/models 聚合、fetch_models 路由、redemption/topup 404、group=default

### 4. 模型别名功能 ✅
- [x] `EditChannel.js`: 新增 `modelAliases` 状态和别名表格 UI
- [x] `loadChannel` 反向解析 modelAliases(从 models + model_mapping)
- [x] `fetchUpstreamModels`/`addCustomModel`/`handleModelsChange` 同步 modelAliases
- [x] `submit` 从 modelAliases 生成最终 models 和 model_mapping
- [x] model_mapping 文本框设为只读,由别名表格自动生成
- [x] i18n: 添加别名相关翻译 key(中英文)
- [x] 前端构建验证通过
- [x] Oracle 代码审查 + 修复 P0-P3 全部问题
- [x] 别名输入校验(逗号禁止、重复检测)
- [x] 旧数据迁移兼容(mapping value 去重、遗漏 key 提示)
- [x] 硬编码中文 i18n 化

## 已知限制

1. **CGO/gcc 已安装**:mingw64 16.1.0 已添加到环境变量,`CGO_ENABLED=1 go build` 成功,`model` 包测试可运行
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
| `738fe98` | 改造实现记录和进度跟踪 |
| `6729cd8` | 修复 model/main.go 遗漏的 Redemption 引用 |
| `0f5d220` | Docker workflow 改造(仅推 GHCR) |
| `14c5712` | README 重写为 fork 精简版 |
| `80c775a` | dev 标签修复 |
| `ca15cc2` | i18n + BaseURL 默认值修复 |
| `baf9032` | Actions Node.js 24 升级 |
| `f523347` | BaseURL /v1 重复修复 |
| `7fd95d6` | 模型别名功能 |
| `36a8863` | 别名功能审查修复(P0-P3) |
| `8522f2b` | 移除额度提醒邮件充值链接 |
