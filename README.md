# One API Lite

> 基于 [songquanpeng/one-api](https://github.com/songquanpeng/one-api) 的个人精简分支。

通过标准的 OpenAI API 格式访问所有的大模型，开箱即用。

## 与原版的区别

本分支面向个人自用场景，做了两项改造：

### 1. 模型管理改造

- **移除硬编码模型列表**：原版在 `controller/model.go` 的 `init()` 中维护全局模型列表，本分支改为运行时从 `ability` 表查询实际已配置的模型。
- **从上游获取模型**：渠道编辑页新增「从上游获取」按钮，点击后调用上游 `/v1/models` 接口自动填充该渠道支持的模型，无需手动维护。
- `/v1/models` 接口返回的是当前实际可用的模型，而非预设列表。

### 2. 商业功能移除

移除了以下面向多用户运营的功能：

- 兑换码管理（生成、导出、充值）
- 用户充值（Top Up）
- 模型倍率 / 分组倍率 / 补全倍率（统一固定为 1）
- 用户邀请奖励、额度奖励
- 充值链接配置

保留的功能：令牌管理、渠道管理、负载均衡、多机部署、日志、用户管理。

## 部署

### Docker

镜像地址：`ghcr.io/xdudsj/one-api-lite:dev`

```shell
# 使用 SQLite
docker run --name one-api -d --restart always -p 3000:3000 -e TZ=Asia/Shanghai -v /home/ubuntu/data/one-api:/data ghcr.io/xdudsj/one-api-lite:dev

# 使用 MySQL
docker run --name one-api -d --restart always -p 3000:3000 -e SQL_DSN="root:123456@tcp(localhost:3306)/oneapi" -e TZ=Asia/Shanghai -v /home/ubuntu/data/one-api:/data ghcr.io/xdudsj/one-api-lite:dev
```

初始账号：`root` / `123456`，首次登录后请立即修改密码。

### Docker Compose

```shell
docker-compose up -d
```

### 手动构建

```shell
git clone https://github.com/XduDSJ/one-api-lite.git
cd one-api-lite

# 构建前端
cd web/default
npm install
npm run build
cd ../..

# 构建后端（SQLite 需要 CGO + C 编译器）
go build -ldflags "-s -w" -o one-api

# 运行
./one-api --port 3000 --log-dir ./logs
```

## 使用方法

1. 在「渠道」页面添加你的 API Key，点击「从上游获取」自动填充模型列表（也可手动输入）。
2. 在「令牌」页面新增访问令牌。
3. 在客户端设置 API Base 为你的部署地址（如 `http://localhost:3000/v1`），API Key 填入令牌。

## 配置

系统开箱即用，可通过环境变量或命令行参数配置。启动后用 `root` 登录做进一步配置。

### 常用环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SQL_DSN` | 数据库连接，支持 MySQL / PostgreSQL，不设则用 SQLite | - |
| `REDIS_CONN_STRING` | Redis 连接，启用后用作缓存 | - |
| `SESSION_SECRET` | 会话密钥，多机部署需一致 | 随机 |
| `MEMORY_CACHE_ENABLED` | 内存缓存 | `false` |
| `SYNC_FREQUENCY` | 缓存同步频率（秒） | `600` |
| `NODE_TYPE` | 节点类型，从服务器设为 `slave` | `master` |
| `THEME` | 前端主题 | `default` |
| `RELAY_TIMEOUT` | 中继超时（秒） | 不限制 |
| `RELAY_PROXY` | 中继代理 | - |

### 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--port` | 监听端口 | `3000` |
| `--log-dir` | 日志目录 | `./logs` |
| `--version` | 打印版本号 | - |

完整环境变量说明参见[原版文档](https://github.com/songquanpeng/one-api#环境变量)。

## 多机部署

1. 所有服务器 `SESSION_SECRET` 设置相同的值。
2. 必须设置 `SQL_DSN`，使用 MySQL，所有服务器连接同一数据库。
3. 从服务器设置 `NODE_TYPE=slave`。
4. 推荐启用 Redis 并设置 `SYNC_FREQUENCY`。

## 常见问题

**提示无可用渠道？**
检查用户分组和渠道分组设置，以及渠道的模型列表是否为空。

**报错：`数据库一致性已被破坏`？**
`ability` 表中存在指向已删除渠道的记录。删除渠道时需同步清理 `ability` 表。

**升级后数据会丢失吗？**
MySQL 不会。SQLite 需挂载 volume 持久化 `one-api.db` 文件。

## 致谢

本项目基于 [songquanpeng/one-api](https://github.com/songquanpeng/one-api)，感谢原作者的开源贡献。

## 许可证

MIT License。依据 MIT 协议，使用者需自行承担使用本项目的风险与责任。
