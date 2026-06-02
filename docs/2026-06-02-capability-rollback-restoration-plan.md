# AI Media Canvas 能力回退恢复与本地化改造方案

> 这份文档用于纠正当前执行路线：后续不再以 `ai-media-canvas` 当前基线继续“补骨架”，而是以原始 `Loomic` 的完整能力为恢复源，先把需要保留的产品能力按模块回退恢复，再在恢复结果上做单机本地化改造。

## 1. 这份文档解决什么问题

当前分支已经完成了一批正确的单机化工作：

- 去掉 `Supabase / Login / Register / Pricing / Credits / Payments`
- 引入 `SQLite + 本地文件存储`
- 恢复 `/home`、`/skills` 的本地页面与基础工作流
- 产品命名切换为 `AI Media Canvas`

但与此同时，也把一批原本仍然需要保留的核心能力删掉了：

- 图片生成 / 视频生成
- 长任务系统
- 后台 worker
- provider registry
- 重型 Agent runtime
- LangGraph / tool calling / WebSocket 实时运行链
- 完整 skill runtime

因此，后续目标不是继续在当前“轻量替代品”基础上渐进增强，而是：

1. 先恢复原始 `Loomic` 中仍然需要的能力
2. 再把这些能力的底层实现切换到单机版底座
3. 最后再做结构优化与命名清理

---

## 2. 为什么不是从当前仓库的 `origin/main` 整体还原

这是后续执行最重要的前提。

### 2.1 原因一：当前仓库的 `origin/main` 不是完整能力基线

当前仓库：

- 仓库：[/Users/wwcome/work/demo/ai-media-canvas](/Users/wwcome/work/demo/ai-media-canvas)

它的 `origin/main` 已经是“删减后的单机版基线”，并不包含以下完整能力：

- `apps/server/src/features/jobs/*`
- `apps/server/src/generation/*`
- `apps/server/src/worker.ts`
- `apps/server/src/agent/*`
- `apps/server/src/ws/*`
- 对应的 `http/jobs.ts`、`http/generate.ts`、`http/runs.ts`

也就是说，如果从当前仓库的 `origin/main` 做整体回退，只能回到“已经缺这些能力”的状态，不能把真正需要恢复的能力带回来。

### 2.2 原因二：当前分支里已经有一批正确的本地化成果，不能整体打掉

当前分支已经完成的这些改造应该保留：

- `SQLite` 与本地文件底座
- `/home` 与 `/skills` 的单机版路由恢复
- 产品品牌切换为 `AI Media Canvas`
- `supabase / loomic` 大部分命名与配置清理

如果直接做大范围整体回退，会把这些已经正确的工作也一起打掉，导致来回折腾。

### 2.3 正确的恢复源

真正仍然保留完整能力的恢复源是：

- 原始仓库：[/Users/wwcome/work/demo/Loomic](/Users/wwcome/work/demo/Loomic)

因此后续执行原则应改为：

> **从 `Loomic` 按模块恢复能力，而不是从 `ai-media-canvas origin/main` 整体回退。**

---

## 3. 最终改造原则

### 3.1 保留的本地版约束

以下约束不变：

- 单机本地 Web 应用
- 无登录 / 无注册 / 无账号体系
- 无支付 / 无积分 / 无订阅
- 不依赖 `Supabase`
- 核心数据使用 `SQLite`
- 资产与 skill 包使用本地文件系统

### 3.2 必须恢复的能力

以下能力仍然必须恢复回来：

- `/home` 的原始结构、视觉与关键工作流
- `/skills` 的 `已安装 / 市场 / 导入`
- 图片生成
- 视频生成
- 长任务与 job 生命周期
- 后台 worker
- provider registry
- 模型列表与模型偏好
- `agent.run / cancel / stream`
- WebSocket 实时事件
- LangGraph / tool calling
- skill package runtime

### 3.3 明确不恢复的旧云端底座

以下内容继续保持删除：

- `Supabase Auth`
- `Supabase Storage`
- `Supabase Postgres / RLS / RPC`
- `PGMQ` 本体
- `Credits / Payments / Pricing`
- `Login / Register / Auth Callback`
- Vercel / Railway 平台绑定

---

## 4. 推荐执行路线

后续不推荐继续走“在当前本地轻量实现上直接补 skeleton”的路线。

推荐路线是：

### 阶段 A：能力回退恢复

从 `Loomic` 里把需要保留的能力按模块恢复回来，优先恢复：

1. `jobs + worker + providers`
2. `models / image-models / video-models / generate / jobs` 接口
3. `agent runtime + ws + runs`
4. `skill package runtime`

### 阶段 B：本地底座替换

在恢复后的能力链路上，把底层从云端实现替换为：

- `Supabase/Postgres` -> `SQLite`
- `PGMQ` -> `SQLite` 持久化 job queue
- `Supabase Storage` -> 本地文件系统
- `workspace/viewer auth` -> 本地 profile/context

### 阶段 C：结构优化

等能力恢复并跑通后，再做：

- 命名清理
- 目录收缩
- 内部语义本地化
- 更强测试夹具与回归用例

---

## 5. 模块级恢复清单

## 5.1 第一优先级：生成与长任务系统

### 恢复源

来自：

- [/Users/wwcome/work/demo/Loomic/apps/server/src/features/jobs](/Users/wwcome/work/demo/Loomic/apps/server/src/features/jobs)
- [/Users/wwcome/work/demo/Loomic/apps/server/src/generation](/Users/wwcome/work/demo/Loomic/apps/server/src/generation)
- [/Users/wwcome/work/demo/Loomic/apps/server/src/worker.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/worker.ts)
- [/Users/wwcome/work/demo/Loomic/apps/server/src/http/jobs.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/http/jobs.ts)
- [/Users/wwcome/work/demo/Loomic/apps/server/src/http/generate.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/http/generate.ts)

### 恢复目标

恢复这些产品能力与接口形态：

- `/api/models`
- `/api/image-models`
- `/api/video-models`
- `/api/agent/generate-image`
- `/api/agent/generate-video`
- `/api/jobs`
- `/api/jobs/:id`
- `/api/jobs/:id/cancel`
- 本地 worker 消费 job

### 恢复后立刻要替换的旧依赖

- `PgmqClient` -> 本地 `SQLite queue adapter`
- job 表读写 -> 本地 `store.ts` 或独立 DAO
- credits/tier guard -> 首版去掉，保持接口可用但不绑定计费

### 当前仓库中要对接的本地底座

- [/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/local/store.ts](/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/local/store.ts)
- [/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/config/env.ts](/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/config/env.ts)

---

## 5.2 第二优先级：重型 Agent runtime 与 WebSocket

### 恢复源

来自：

- [/Users/wwcome/work/demo/Loomic/apps/server/src/agent/runtime.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/agent/runtime.ts)
- [/Users/wwcome/work/demo/Loomic/apps/server/src/agent/deep-agent.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/agent/deep-agent.ts)
- [/Users/wwcome/work/demo/Loomic/apps/server/src/agent/tools](/Users/wwcome/work/demo/Loomic/apps/server/src/agent/tools)
- [/Users/wwcome/work/demo/Loomic/apps/server/src/agent/workspace-skills.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/agent/workspace-skills.ts)
- [/Users/wwcome/work/demo/Loomic/apps/server/src/ws](/Users/wwcome/work/demo/Loomic/apps/server/src/ws)
- [/Users/wwcome/work/demo/Loomic/apps/server/src/http/runs.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/http/runs.ts)

### 恢复目标

恢复这些能力：

- `agent.run`
- `agent.cancel`
- `canvas.resume`
- run 生命周期：`accepted / running / completed / failed`
- tool calling
- 实时事件流

### 恢复后立刻要替换的旧依赖

- `Supabase checkpointer` -> 本地持久化
- `workspace auth` -> 本地 profile/context
- 旧 skill loader -> 本地 skill 文件系统 loader

### 当前仓库中要对接的本地部分

- [/Users/wwcome/work/demo/ai-media-canvas/packages/shared/src/ws-protocol.ts](/Users/wwcome/work/demo/ai-media-canvas/packages/shared/src/ws-protocol.ts)
- [/Users/wwcome/work/demo/ai-media-canvas/apps/web/src/hooks/use-websocket.ts](/Users/wwcome/work/demo/ai-media-canvas/apps/web/src/hooks/use-websocket.ts)

---

## 5.3 第三优先级：skill package runtime

### 恢复源

来自：

- [/Users/wwcome/work/demo/Loomic/apps/server/src/agent/workspace-skills.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/agent/workspace-skills.ts)

### 恢复目标

从当前“只读取 `skillContent` 摘要”提升为：

- Agent 能读取完整 skill 包
- 包含 `SKILL.md`
- 包含 `scripts/`
- 包含 `references/`
- 包含 `assets/`

### 当前已可复用的本地成果

- [/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/http/skills.ts](/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/http/skills.ts)
- [/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/local/skill-catalog.ts](/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/local/skill-catalog.ts)
- [/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/local/store.ts](/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/local/store.ts)

---

## 6. 当前草稿代码怎么处理

当前工作树里已经有一批未提交的第一阶段草稿，它们不是最终方向，应该按下面规则处理。

### 6.1 当前草稿状态

当前脏文件包括：

- [/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/local/store.ts](/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/local/store.ts)
- [/Users/wwcome/work/demo/ai-media-canvas/packages/shared/src/http.ts](/Users/wwcome/work/demo/ai-media-canvas/packages/shared/src/http.ts)
- [/Users/wwcome/work/demo/ai-media-canvas/packages/shared/src/index.ts](/Users/wwcome/work/demo/ai-media-canvas/packages/shared/src/index.ts)
- [/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/features/jobs](/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/features/jobs)
- [/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/generation](/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/generation)
- [/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/http/jobs.ts](/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/http/jobs.ts)
- [/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/worker.ts](/Users/wwcome/work/demo/ai-media-canvas/apps/server/src/worker.ts)
- [/Users/wwcome/work/demo/ai-media-canvas/packages/shared/src/job-contracts.ts](/Users/wwcome/work/demo/ai-media-canvas/packages/shared/src/job-contracts.ts)

### 6.2 哪些可以保留为参考

这些草稿里的“本地适配思路”可以保留为参考：

- `SQLite background_jobs` 的方向
- 本地 worker 轮询的方向
- 本地 provider placeholder 的方向
- shared job contracts 的本地字段兼容

### 6.3 哪些不能直接当最终实现

以下部分不应直接继续叠加成最终版：

- 只保留本地 placeholder provider 而不恢复原始 provider 抽象
- 跳过 `Loomic` 原始 `job-service / runtime / runs / ws` 直接重写另一套新契约
- 让 `/api/local-agent/respond` 继续承担真正 runtime 的角色

### 6.4 推荐处理方式

推荐策略：

1. 保留这批草稿做临时参考
2. 以 `Loomic` 原文件为主，重新按模块恢复
3. 再把草稿中“本地化适配”的部分摘进去

也就是说：

> **草稿不是最终恢复基线，只是本地适配思路的临时素材。**

---

## 7. 分阶段执行方案

## 阶段 1：生成与长任务恢复

### 目标

先把图片/视频生成与 job/worker 主链恢复回来。

### 步骤

1. 从 `Loomic` 恢复 `generation/*`
2. 从 `Loomic` 恢复 `features/jobs/*`
3. 从 `Loomic` 恢复 `worker.ts`
4. 从 `Loomic` 恢复 `http/jobs.ts` 与 `http/generate.ts`
5. 将 `PGMQ` 相关实现改接 `SQLite queue`
6. 让 `/api/models`、`/api/image-models`、`/api/video-models`、`/api/jobs/*` 真正可用

### 阶段验收

- 图片生成可提交并完成
- 视频生成可提交并完成
- 有 job 状态可查
- worker 能实际消费 job

## 阶段 2：runtime 与 WS 恢复

### 目标

恢复 `agent.run` 真实链路。

### 步骤

1. 从 `Loomic` 恢复 `agent/*`
2. 从 `Loomic` 恢复 `ws/*`
3. 从 `Loomic` 恢复 `http/runs.ts`
4. 用本地上下文替换 `Supabase auth/viewer`
5. 用本地持久化替换原 checkpointer

### 阶段验收

- `/api/ws` 可连接
- `agent.run` 返回 `accepted`
- 有 `running / completed / failed`
- 前端可收实时事件

## 阶段 3：skill runtime 恢复

### 目标

让已安装 skills 真正参与运行时。

### 步骤

1. 恢复 `workspace-skills` 思路
2. 改成本地文件/SQLite 混合存储
3. 把 skill 完整路径暴露给 agent

### 阶段验收

- 安装 skill 后 agent 行为变化可观测
- `SKILL.md / scripts / references / assets` 可被读取

## 阶段 4：结构优化

### 目标

在能力恢复完成后再做收口。

### 步骤

1. 清理兼容层
2. 继续本地化内部命名
3. 删除真正不再需要的旧云端代码

---

## 8. 自测与校验方案

## 8.1 自动化校验

每个阶段完成后至少执行：

```bash
pnpm --filter @aimc/shared build
pnpm --filter @aimc/server typecheck
pnpm --filter @aimc/web typecheck
pnpm --filter @aimc/web build
pnpm --filter @aimc/web test
pnpm --filter @aimc/server test
```

## 8.2 API 校验

### 生成与 jobs

- `GET /api/models`
- `GET /api/image-models`
- `GET /api/video-models`
- `POST /api/agent/generate-image`
- `POST /api/agent/generate-video`
- `POST /api/jobs/image-generation`
- `POST /api/jobs/video-generation`
- `GET /api/jobs/:id`
- `POST /api/jobs/:id/cancel`

### runtime / ws

- `WS /api/ws`
- `agent.run`
- `agent.cancel`
- `canvas.resume`

### skills

- `GET /api/skills`
- `GET /api/skills/catalog`
- `POST /api/skills/import`
- `PATCH /api/skills/:id`

## 8.3 浏览器手工回归

### Home

- `/` 进入 `/home`
- 首页 prompt 能带初始上下文进入 canvas
- 图片/视频模型偏好能真正影响后续运行

### Canvas / Chat

- 新建会话
- 发送消息
- 收到流式事件
- run 可取消
- 刷新后恢复

### 生成

- 图片生成后落到 canvas
- 视频生成后可见结果或可见计划产物
- 长任务状态完整

### Skills

- 本地市场可见
- 目录导入成功
- 安装/启停后 agent 行为变化

---

## 9. 一句话执行策略

后续执行必须遵循这条主线：

> **不是从 `ai-media-canvas origin/main` 整体回退，而是从 `Loomic` 按能力模块回退恢复，在保留已完成单机化成果的前提下，把恢复回来的能力逐步改接到 `SQLite + 本地文件` 底座上。**
