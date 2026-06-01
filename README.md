# AI Media Canvas

AI Media Canvas 是一个本地优先的单机版 Web 应用。

它提供：

- 项目与画布管理
- 本地聊天会话
- Brand Kit 管理
- 本地文件存储
- SQLite 数据持久化
- 单服务启动后直接访问根路径

它不再包含：

- 账号体系
- 登录注册
- 订阅、积分、支付
- 第三方 BaaS
- Worker 队列

## 本地启动

1. 安装依赖

```bash
pnpm install
```

2. 构建前端静态产物

```bash
pnpm --filter @aimc/web build
```

3. 启动服务端

```bash
pnpm --filter @aimc/server dev:server
```

启动后访问：

- `http://127.0.0.1:3001/`

服务端会直接托管 `apps/web/out` 下的前端构建产物，并继续提供 `/api/*` 与 `/local-assets/*`。

## 主要环境变量

```env
AIMC_SERVER_PORT=3001
AIMC_WEB_ORIGIN=http://localhost:3000
AIMC_SERVER_BASE_URL=http://localhost:3001
AIMC_WEB_DIST=
```

## 数据目录

- SQLite：`local-data/ai-media-canvas.db`
- 本地资源：`local-data/assets/`

## 工作区包名

- `@aimc/server`
- `@aimc/web`
- `@aimc/shared`
