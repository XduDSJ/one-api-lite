# AGENTS.md

One API：以标准 OpenAI API 格式聚合多家大模型的后端网关。Go + Gin + GORM，前端为 React（多主题，构建产物嵌入二进制）。

## 构建与运行

**关键陷阱：`main.go` 使用 `//go:embed web/build/*`，若 `web/build/` 不存在，`go build` 直接失败。** 必须先构建前端再构建后端。

```shell
# 1. 前端（每个主题各构建一次，产物输出到 web/build/<theme>）
cd web/default && npm install && npm run build && cd ../..
# 仅当改了 berry / air 主题时才需重复执行，默认主题已足够跑通后端

# 2. 后端（SQLite 驱动需要 CGO + C 编译器，Windows 需 mingw）
go build -ldflags "-s -w" -o one-api

# 3. 运行（默认端口 3000，初始账号 root / 123456）
./one-api --port 3000 --log-dir ./logs
```

- 仓库无 Makefile，所有命令手动执行。
- Docker 构建见 `Dockerfile`：并行构建三个主题，再以 `CGO_ENABLED=1` 编译 Go，版本号通过 `-X 'github.com/songquanpeng/one-api/common.Version=$(cat VERSION)'` 注入。
- 环境变量经 `godotenv` 自动从 `.env` 加载，模板见 `.env.example`。

## 测试与校验

```shell
go test ./...                                  # 全量
go test ./relay/...                            # 单包
go test -run TestName ./relay/                 # 单测
```

- CI（`.github/workflows/ci.yml`）用 Go ^1.22，而 `go.mod` 声明 `go 1.20`——本地用 1.22+ 更稳妥。
- CI 仅做 `go test` + commitlint，**无 lint / typecheck 步骤**。
- 测试文件很少（`relay/adaptor_test.go`、`relay/channeltype/url_test.go`、`common/image/`、`common/network/` 等），多数包无测试。
- commitlint 由 `wagoid/commitlint-github-action` 强制 conventional commits 规范（仓库内无自定义配置，用默认规则）。

## 架构要点

请求中继是核心，路径：`/v1/*` → `middleware.Distribute`（选渠道）→ `controller.Relay` → `relayHelper`（按 relaymode 分发）→ `relay/controller/{text,image,audio,proxy}.go` → `relay.GetAdaptor(apiType)` → 具体适配器请求上游。

| 目录 | 职责 |
|------|------|
| `main.go` | 入口；初始化 DB/Redis/缓存/i18n，装配 Gin |
| `router/` | API / Dashboard / Relay / Web 路由注册 |
| `relay/` | **核心**。`adaptor/<provider>/` 每个上游一个目录；`adaptor.go` 的 `GetAdaptor` 是分发开关；`apitype`/`channeltype`/`relaymode`/`billing`/`meta` 为配套定义 |
| `controller/` | 管理 API（渠道、令牌、用户、计费、日志等） |
| `model/` | GORM 模型与 DB 初始化；启动时自动建表迁移 |
| `middleware/` | Gin 中间件（鉴权、限流、Distribute 选渠道等） |
| `common/` | 配置、日志、i18n、HTTP client、Redis、工具 |
| `web/` | 前端，每个子目录一个主题 |

### 新增上游供应商

需同步改动多处，遗漏任一处都会导致适配器不生效：
1. `relay/adaptor/<provider>/` 新建适配器，实现 `relay/adaptor/interface.go`；
2. `relay/adaptor.go` 的 `GetAdaptor` switch 增加分支；
3. `relay/apitype` 增加类型常量；
4. `relay/channeltype` 增加渠道类型（影响前端选项与默认 base URL）。

### 新增前端主题

需在**三处**同步注册：`common/config/config.go` 的 `ValidThemes`、`web/THEMES`、主题 `package.json` 的 `build` 脚本（产物须落到 `web/build/<theme>`）。详见 `web/README.md`。

## 数据库

- 默认 SQLite（`one-api.db`）；设 `SQL_DSN` 切换 MySQL / PostgreSQL，程序自动建表。
- `ability` 表维护「渠道 ↔ 支持模型」映射。**删除 `channel` 记录后必须同步清理 `ability` 中对应行**，否则触发「数据库一致性已被破坏」（README 常见问题 #9）。
- 启用 `MEMORY_CACHE_ENABLED` 或 Redis 后，配置走定期同步（`SYNC_FREQUENCY`，默认 600s），存在数据滞后。

## 易踩的坑

- **勿全局启用 gzip 中间件**：`main.go` 中已注释说明会破坏 SSE 流式响应，保持现状。
- `web/build/` 被 `.gitignore` 忽略，clone 后不存在，必须先跑前端构建才能编译后端。
- `*.db`、`data/`、`logs/` 均被忽略，本地运行产物不入库。
- 多机部署：所有节点 `SESSION_SECRET` 必须一致，从节点设 `NODE_TYPE=slave`，须用 MySQL（非 SQLite）+ 同一数据库。
