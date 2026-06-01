# Loomic 单机版改造方案 A

> 方案定位：复制原项目副本后，在副本中做“减法改造 + 底座替换”，优先保证功能完整度、UI 保真度、迁移不漏项。

## 1. 目标

把当前 `Loomic` 改造成一个本地 Web 单机版应用，满足以下约束：

- 不需要账号
- 不需要登录
- 不需要首页营销页
- 打开后直接进入项目工作区
- 不需要付费、订阅、积分
- 不依赖 Supabase
- 数据改为 SQLite
- 文件资产改为本地文件系统
- 尽量不丢功能
- 尽量不改歪现有样式和交互

本方案明确选择：

- 不在原仓库直接动刀
- 不从零重建一个新前后端工程
- 复制 `Loomic` 为一个新目录，在副本中原地改造

## 2. 为什么选方案 A

你的核心诉求不是“架构最干净”，而是：

- 不要迁移漏功能
- 不要把样式迁移歪
- 尽量保留现在这版 Loomic 的使用体验

从代码结构看，当前项目的 UI、路由、交互、后端接口、数据模型是一起长出来的。如果从零新建：

- 很容易漏掉 `Canvas` 周边的一些配套逻辑
- 很容易漏掉 `ChatSidebar`、`BrandKit`、`Projects`、`Settings` 之间的联动
- 很容易把样式体系、状态流、细节交互拆散

而复制副本后改造的优势是：

- 页面结构、组件关系、样式体系天然保留
- 可以按阶段逐步替换依赖
- 每做一步都能跑起来验证
- 迁移时更容易发现遗漏

结论：

- 从“产品保真”角度，方案 A 成本更低
- 从“避免漏迁移”角度，方案 A 风险更低
- 从“避免 UI 走样”角度，方案 A 明显优于从零重建

## 3. 当前项目的真实依赖面

这不是一个“只把数据库换掉就能本地化”的项目。当前项目依赖的是一整套云端能力组合。

### 3.1 前端依赖

前端目前基于：

- `Next.js 15`
- `React 19`
- Excalidraw 画布工作区
- WebSocket 实时更新
- Supabase 浏览器端登录态

关键耦合文件：

- [apps/web/src/components/providers.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/components/providers.tsx)
  - 注入了 `AuthProvider` 和 `TierLimitToastProvider`
- [apps/web/src/lib/auth-context.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/lib/auth-context.tsx)
  - 登录态完全依赖 Supabase session
- [apps/web/src/lib/supabase-browser.ts](/Users/wwcome/work/demo/Loomic/apps/web/src/lib/supabase-browser.ts)
  - 浏览器端 Supabase client 入口
- [apps/web/src/lib/server-api.ts](/Users/wwcome/work/demo/Loomic/apps/web/src/lib/server-api.ts)
  - 几乎所有 API 都默认需要 bearer token
- [apps/web/src/app/page.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/app/page.tsx)
  - 当前根路由是营销首页，不是工作页
- [apps/web/src/app/canvas/page.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/app/canvas/page.tsx)
  - 当前主工作区强依赖 `useAuth()`
- [apps/web/src/app/(workspace)/layout.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/app/(workspace)/layout.tsx)
  - 未登录会跳转 `/login`

### 3.2 后端依赖

后端目前基于：

- `Fastify`
- `@fastify/websocket`
- LangGraph / LangChain runtime
- Supabase JS client
- Postgres 持久化
- PGMQ 队列

总装配入口：

- [apps/server/src/app.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/app.ts)

从这个文件可以看出，当前后端的核心依赖链是：

- `auth` 来自 Supabase
- `createUserClient` 基于 bearer token 创建用户态数据库 client
- `viewerService` 基于 Supabase profile/workspace/bootstrap RPC
- `uploadService` 基于 Supabase Storage
- `jobService` 基于 PGMQ + Postgres
- `creditService`、`tierGuard`、`paymentService` 挂在主应用里

### 3.3 数据层依赖

当前用的不只是 PostgreSQL，而是：

- Supabase Auth
- Postgres 表
- RLS
- RPC
- Storage bucket
- PGMQ

关键迁移脚本里实际用到的对象包括：

- `profiles`
- `workspaces`
- `workspace_members`
- `projects`
- `canvases`
- `asset_objects`
- `workspace_settings`
- `chat_sessions`
- `chat_messages`
- `brand_kits`
- `brand_kit_assets`
- `background_jobs`
- `agent_runs`
- `langgraph.*`
- credits/payment 相关表
- `auth.users`
- `storage.objects`
- `pgmq`

### 3.4 存储依赖

当前文件资产不是直接存在业务表里，而是拆成两层：

1. 二进制文件存在 Supabase Storage
2. 元数据记录在业务表中

关键文件：

- [apps/server/src/features/uploads/upload-service.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/uploads/upload-service.ts)
- [apps/server/src/features/canvas/canvas-service.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/canvas/canvas-service.ts)

尤其 `canvas-service` 里有一层特殊逻辑：

- 保存画布时，把 base64 文件抽到 Storage
- 在 JSON 里只保留 `oss://bucket/objectPath` 标记
- 读取画布时，再把存储文件映射回前端可用结构

这意味着单机版不能只改 `upload-service`，还要一起改 `canvas-service`。

### 3.5 异步任务依赖

当前图片/视频生成和 agent 执行不是单一路径，而是至少有三条：

1. `direct image route`
   - `/api/agent/generate-image`
   - 当前是同步直出
2. `direct video route with internal polling`
   - `/api/agent/generate-video`
   - 当前会创建 job，但请求内阻塞轮询结果
3. `job API / worker / agent submitJob`
   - `/api/jobs/*`
   - worker 轮询 PGMQ
   - agent runtime 自己也会提交 image/video job

此外：

- `code_execution` 已进入 schema
- 但当前 worker 明确说明它不走 PGMQ

关键文件：

- [apps/server/src/queue/pgmq-client.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/queue/pgmq-client.ts)
- [apps/server/src/worker.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/worker.ts)
- [apps/server/src/features/jobs/job-service.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/jobs/job-service.ts)
- [apps/server/src/http/generate.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/http/generate.ts)
- [apps/server/src/http/jobs.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/http/jobs.ts)
- [apps/server/src/agent/runtime.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/agent/runtime.ts)
- [apps/web/src/hooks/use-job-fallback-polling.ts](/Users/wwcome/work/demo/Loomic/apps/web/src/hooks/use-job-fallback-polling.ts)

### 3.6 积分与付费依赖

这一块在当前项目里是“横切能力”，不是一个孤立页面。

前端涉及：

- [apps/web/src/app/pricing/page.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/app/pricing/page.tsx)
- [apps/web/src/components/credits](/Users/wwcome/work/demo/Loomic/apps/web/src/components/credits)
- [apps/web/src/lib/credits-api.ts](/Users/wwcome/work/demo/Loomic/apps/web/src/lib/credits-api.ts)
- [apps/web/src/lib/payments-api.ts](/Users/wwcome/work/demo/Loomic/apps/web/src/lib/payments-api.ts)
- [apps/web/src/hooks/use-credits.ts](/Users/wwcome/work/demo/Loomic/apps/web/src/hooks/use-credits.ts)
- [apps/web/src/hooks/use-subscription.ts](/Users/wwcome/work/demo/Loomic/apps/web/src/hooks/use-subscription.ts)
- [apps/web/src/components/chat-sidebar.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/components/chat-sidebar.tsx)

后端涉及：

- [apps/server/src/features/credits/credit-service.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/credits/credit-service.ts)
- [apps/server/src/features/credits/tier-guard.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/credits/tier-guard.ts)
- [apps/server/src/features/payments/payment-service.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/payments/payment-service.ts)
- [apps/server/src/http/credits.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/http/credits.ts)
- [apps/server/src/http/payments.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/http/payments.ts)
- [apps/server/src/http/payments-webhook.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/http/payments-webhook.ts)

这意味着：

- 单机版必须从 UI、接口、服务、模型元数据四层同时拔掉积分/支付

### 3.7 当前页面路由盘点

当前前端页面路由主要分成 3 组：

#### A. 营销与账号入口

- `/`
  - 营销首页
- `/login`
  - 登录页
- `/register`
  - 注册页
- `/auth/callback`
  - 登录回调页
- `/pricing`
  - 定价页

#### B. 工作区页面

- `/home`
  - 首页 / 发现页
- `/projects`
  - 项目列表页
- `/brand-kit`
  - 品牌资产页
- `/skills`
  - 技能页
- `/settings`
  - 设置页
- `/canvas?id=...`
  - 核心画布工作区
- `/loading-preview`
  - 新建项目后的加载过渡页

#### C. 系统页

- `/not-found`
  - 404 页面

这些页面来源于：

- [apps/web/src/app](/Users/wwcome/work/demo/Loomic/apps/web/src/app)

### 3.8 当前后端接口路由盘点

当前后端接口按能力大致分为：

#### A. 应用基础与当前用户

- `/api/health`
- `/api/viewer`
- `/api/viewer/profile`

#### B. 项目与画布

- `/api/projects`
- `/api/projects/:projectId`
- `/api/projects/:projectId/thumbnail`
- `/api/canvases/:canvasId`

#### C. 聊天、Agent 与实时通道

- `/api/agent/runs`
- `/api/agent/runs/:runId/cancel`
- `/api/ws`
- `/api/chat/*`

#### D. 生成能力

- `/api/agent/generate-image`
- `/api/agent/generate-video`
- `/api/jobs/*`
- `/api/models`
- `/api/image-models`
- `/api/video-models`

#### E. 资产与品牌

- `/api/uploads`
- `/api/brand-kits/*`
- `/api/fonts`
- `/api/image-proxy`

#### F. 技能系统

- `/api/skills/*`
- `/api/skills/marketplace/*`
- `/api/workspaces/skills*`

#### G. 设置

- `/api/workspace/settings`

#### H. 计费与积分

- `/api/credits/*`
- `/api/payments/*`
- `/api/payments/webhook`

这些接口来源于：

- [apps/server/src/http](/Users/wwcome/work/demo/Loomic/apps/server/src/http)
- [apps/server/src/ws/handler.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/ws/handler.ts)

### 3.9 当前产品功能盘点

从页面与接口结合看，当前产品已具备的能力包括：

#### A. 账号与身份

- 登录
- 注册
- 回调登录
- 个人资料

#### B. 项目系统

- 项目列表
- 创建项目
- 删除项目
- 修改项目名
- 项目缩略图

#### C. 画布系统

- Excalidraw 画布编辑
- 图层面板
- 文件面板
- 画布元素插入
- 画布保存与重开恢复

#### D. AI 聊天与 Agent

- ChatSidebar
- 会话创建 / 切换 / 删除
- Agent run
- WebSocket 实时事件
- 任务状态回推

#### E. 图片与视频生成

- 图片生成
- 视频生成
- 长任务 job 查询 / 取消
- fallback polling

#### F. 品牌资产

- Brand Kit
- Logo / Image / Color / Font 资产管理
- 字体选择与品牌素材维护

#### G. 技能系统

- 技能列表
- 技能详情
- 技能导入
- 技能安装 / 卸载 / 启用 / 禁用
- marketplace 安装
- workspace skills 注入

#### H. 文件与资源

- 通用上传
- 画布文件外置存储
- 缩略图存储
- 生成结果存储

#### I. 模型与提供商

- 模型列表
- 图像 / 视频模型列表
- 默认模型设置
- 多 provider 接入

#### J. 积分与付费

- credits
- daily claim
- tier limit
- pricing
- subscription
- checkout / cancel / change-plan

### 3.10 这份盘点对单机版的意义

这一节不是单纯“列页面”，而是给后续单机版决策用的。

它会直接帮助判断：

- 哪些页面应该保留
- 哪些页面应该删除
- 哪些页面保留外观但重写底层
- 哪些接口是单机版核心接口
- 哪些能力属于 SaaS 残留，必须下线

后续所有“保留 / 删除 / 改造”判断，都应以上面的页面和功能盘点为基础，而不是只凭感觉做减法。

## 4. 方案 A 的总原则

### 原则 1：先保留外观和交互，再替换底座

不要先“重构漂亮”。

先做：

- 页面还能打开
- 主要交互还能跑
- 样式不变形

再做：

- 去 Supabase
- 去登录态
- 去积分和支付
- 换 SQLite

### 原则 2：先做减法，再做替换

改造顺序必须是：

1. 复制副本
2. 去掉不需要的产品能力
3. 做本地替代层
4. 最后收口路由与启动方式

不能一上来就全面换 SQLite，否则问题会混在一起，不容易定位。

### 原则 3：优先保留文件路径和组件边界

为了减少样式跑偏和联动断裂：

- 前端组件尽量保留原路径
- 页面结构尽量保留原分层
- 后端路由尽量保留原 API 形状

这样可以把“底层实现替换”与“UI 行为变化”分开。

### 原则 4：先保证编译链路不断，再做模块删除

单机版改造最怕的不是“代码不优雅”，而是：

- 删了登录页但工作区还在跳 `/login`
- 删了 `credits` 目录但 `Provider/Layout/Sidebar/ChatSidebar` 还在 import
- 前端不传 token 了，但后端还没有本地身份替身

因此执行上必须遵守：

- 先加兼容替身，再删原模块
- 先清引用，再删文件
- 先打通本地身份和本地 bootstrap，再删鉴权入口

### 原则 5：品牌名与工程名分层迁移，不做无脑全局替换

如果后续准备把代码推到 `nextop-os` 组织下，那么 `Loomic` 相关命名确实值得系统性替换。

但这里不能直接做一次“全局搜索替换”，因为当前副本里的 `loomic` 分布在 2 个层级：

- 用户可见品牌层
  - 页面标题
  - Logo 组件名
  - 按钮、占位符、营销文案
  - README、截图、示例数据
- 工程标识层
  - workspace package scope：`@loomic/*`
  - 环境变量前缀：`LOOMIC_*`
  - service id：`loomic-server`
  - localStorage key：`loomic:*`
  - 默认邮箱：`local@loomic.app`
  - SQLite 文件名：`loomic.db`
  - prompt 文件名、类型名、脚本名、测试夹具

基于当前 `Loomic-standalone` 副本扫描，残留量级大致是：

- `@loomic/`：126 处
- `LOOMIC_`：23 处
- `loomic-server`：4 处
- `loomic:`：7 处
- `Loomic / loomic / LOOMIC`：364 处

这说明命名迁移必须作为单独工作流处理，而不是顺手改几处 UI 文案。

### 4.1 推荐的命名策略

结合当前产品形态，这个项目更像“本地 AI 创作工作台 / 创意工作室”，而不只是一个纯画布。因为它除了 canvas，还有：

- projects
- chat agent
- brand kit
- skills
- settings
- 本地资产管理

所以如果要往 `nextop-os` 靠，又不想把名字收得过窄，我更推荐优先考虑：

1. `Nextop Studio`
2. `Nextop Canvas Studio`
3. `Nextop Creative Studio`

其中最推荐的是：

- 对外产品名：`Nextop Studio`

原因：

- 比 `Nextop Canvas` 更宽，能覆盖 brand kit / skills / project workspace
- 比 `Nextop Creative Studio` 更短，适合仓库、包名、标题和 Logo
- 和 `nextop-os` 组织名称有明确关联，但不会显得像“组织名直接硬贴到产品页”

### 4.2 推荐的命名映射

建议把命名拆成 6 个面向来统一：

- GitHub 仓库名
  - 推荐：`nextop-studio`
- 本地目录名
  - 推荐：`NextopStudio` 或 `nextop-studio`
- 对外产品名
  - 推荐：`Nextop Studio`
- workspace 包作用域
  - 推荐：`@nextop/*`
- 环境变量前缀
  - 推荐：`NEXTOP_*`
- 服务标识与本地数据 key
  - 推荐：`nextop-studio-server`
  - 推荐：`nextop:*`

更具体的落地映射建议：

- `Loomic` -> `Nextop Studio`
- `loomic` -> `nextop-studio` 或 `nextop`
- `@loomic/shared` -> `@nextop/shared`
- `@loomic/web` -> `@nextop/web`
- `@loomic/server` -> `@nextop/server`
- `LOOMIC_SERVER_PORT` -> `NEXTOP_SERVER_PORT`
- `LOOMIC_WEB_ORIGIN` -> `NEXTOP_WEB_ORIGIN`
- `LOOMIC_AGENT_MODEL` -> `NEXTOP_AGENT_MODEL`
- `loomic-server` -> `nextop-studio-server`
- `loomic:agent-model` -> `nextop:agent-model`
- `local@loomic.app` -> `local@nextop.app`
- `loomic.db` -> `nextop-studio.db`

### 4.3 哪些命名应该优先改

优先级建议如下：

1. 用户可见品牌名
   - 页面标题、侧边栏标题、登录壳、loading、placeholder、帮助文案、README
2. 仓库和应用元信息
   - 根 `package.json` 名称、`apps/web/src/app/layout.tsx` metadata、Open Graph 文案、截图 alt 文案
3. 工程标识
   - package scope、环境变量、service id、localStorage key、db 文件名
4. 内部类型名和文件名
   - `LoomicLogo`、`createLoomicDeepAgent`、`loomic-main.ts`
5. 历史研究文档和截图素材
   - 这一层可以放到最后统一收尾

原因是：

- 第 1 层最影响开源观感
- 第 2 层最影响首屏认知和仓库观感
- 第 3 层改动面最大，应该在功能链路基本稳定后再做
- 第 4 层主要影响代码可读性和后续维护

### 4.4 哪些命名暂时不要急着改

如果还在功能迁移中，以下内容不建议最早阶段就动：

- import scope 全量替换
- 环境变量前缀全量替换
- agent prompt 文件名和工厂函数名全量替换
- 大批测试夹具、示例 SVG、历史迁移 SQL 文件名

这些会制造大量无业务价值的 diff，干扰真正的单机化改造。

更稳妥的顺序是：

1. 先定最终品牌名和 slug
2. 先改用户可见文案和仓库元信息
3. 单机化改造跑稳
4. 再统一做一轮工程命名迁移
5. 最后在首次公开 push 前做一次全仓扫描，确保没有明显 `Loomic` 残留

### 4.5 当前代码里最值得纳入命名迁移首批清单的文件

这些文件中的 `Loomic` 对开源仓库观感影响最大，建议第一批纳入：

- `package.json`
- `.env.example`
- `README.md`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/components/app-sidebar.tsx`
- `apps/web/src/components/auth/auth-shell.tsx`
- `apps/web/src/components/loading-screen.tsx`
- `apps/web/src/components/icons/loomic-logo.tsx`
- `apps/web/src/components/landing/*`
- `apps/web/src/components/home-prompt.tsx`
- `apps/web/src/components/chat-sidebar.tsx`
- `apps/server/src/http/health.ts`
- `apps/server/src/config/env.ts`
- `apps/server/src/local/store.ts`
- `packages/shared/package.json`
- `packages/config/package.json`
- `packages/ui/package.json`
- `scripts/validate-foundation-app.mjs`

结论：

- 可以改，而且建议改
- 但建议改成“Nextop 导向的统一命名体系”，不是只把 `Loomic` 文案抹掉
- 最推荐的目标名是 `Nextop Studio`
- 最推荐的执行方式是：先改外显品牌，再改工程标识，最后在公开发布前做全仓清理

## 5. 建议的新目录策略

推荐直接复制：

- `/Users/wwcome/work/demo/Loomic`

到：

- `/Users/wwcome/work/demo/Loomic-standalone`

然后在副本中改造。

不建议一开始就删太多目录。建议先按下列策略管理：

### 5.1 直接保留的部分

- `apps/web/src/components/canvas/*`
- `apps/web/src/components/brand-kit/*`
- `apps/web/src/components/ui/*`
- `apps/web/src/app/globals.css`
- `apps/web/src/lib/canvas-*`
- `apps/server/src/generation/*`
- `packages/shared/*` 中与项目、画布、聊天、生成直接相关的类型

### 5.2 首批改造但不删的部分

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/canvas/page.tsx`
- `apps/web/src/app/(workspace)/*`
- `apps/web/src/components/app-sidebar.tsx`
- `apps/web/src/components/chat-sidebar.tsx`
- `apps/web/src/components/providers.tsx`
- `apps/web/src/lib/server-api.ts`
- `apps/web/src/hooks/use-websocket.ts`
- `apps/web/src/hooks/use-job-fallback-polling.ts`
- `apps/web/src/lib/home-discovery-library.ts`
- `apps/web/src/lib/home-example-library.ts`
- `apps/server/src/app.ts`
- `apps/server/src/http/*`
- `apps/server/src/features/projects/*`
- `apps/server/src/features/canvas/*`
- `apps/server/src/features/chat/*`
- `apps/server/src/features/settings/*`
- `apps/server/src/features/uploads/*`

### 5.3 明确要删除或禁用的部分

这些内容不是“开局直接删除”，而是要在替代入口落地并且引用清理完成后再删除：

- `apps/web/src/app/login/*`
- `apps/web/src/app/register/*`
- `apps/web/src/app/auth/callback/*`
- `apps/web/src/app/pricing/*`
- `apps/web/src/components/login-form.tsx`
- `apps/web/src/components/register-form.tsx`
- `apps/web/src/components/billing-section.tsx`
- `apps/web/src/components/credits/*`
- `apps/web/src/lib/credits-api.ts`
- `apps/web/src/lib/payments-api.ts`
- `apps/web/src/hooks/use-credits.ts`
- `apps/web/src/hooks/use-subscription.ts`
- `apps/server/src/features/credits/*`
- `apps/server/src/features/payments/*`
- `apps/server/src/http/credits.ts`
- `apps/server/src/http/payments.ts`
- `apps/server/src/http/payments-webhook.ts`

其中有几类需要特别注意“先替换、后删除”：

- `components/credits/*`
  - 不能直接删目录；要先移除 `TierLimitToastProvider`、`CreditHeaderButton`、`CreditBalance`、`CreditInsufficientDialog`、`claimDailyCredits` 等入口引用
- `login/register/auth/callback`
  - 不能先删页面；要等工作区、canvas、sidebar 不再跳 `/login` 后再删
- `pricing/billing`
  - 要先去掉页面入口、按钮、文案和 `LemonSqueezy` script，再删实现文件

## 6. 单机版目标架构

### 6.1 前端形态

仍然保留：

- `Next.js` 前端
- 浏览器访问本地地址

但产品入口改成：

- 打开 `/`
- 自动进入最近项目
- 没有项目就自动创建默认项目并进入

建议最终路由：

- `/`
  - 重定向到 `/project/[projectId]`
- `/project/[projectId]`
  - 主工作区页面
- `/settings`
  - 本地设置页

为了降低改动量，第一阶段也可以先保留 `/canvas?id=...`，只是把 `/` 自动跳转到某个默认 canvas。

更稳的分两步做法：

1. 第一阶段保留 `/canvas?id=...`
2. 第二阶段再升级到 `/project/[projectId]`

这里需要明确一个执行约束：

- 在重写 URL 协议之前，不迁移 `session` / `prompt` 这类 URL 行为

原因是当前 `canvas/page.tsx` 依赖：

- `id`
- `session`
- `prompt`

并且会主动改写回 `/canvas?id=...&session=...`。如果过早切换到 `/project/[projectId]`，聊天会话切换、深链恢复、初始 prompt 自动发送都会一起受影响。

### 6.1.1 前端 IA 决策

当前工作区 IA 不是单页，而是：

- `/home`
- `/projects`
- `/brand-kit`
- `/skills`
- `/settings`

对应的导航写死在：

- [apps/web/src/components/app-sidebar.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/components/app-sidebar.tsx)

因此方案执行前必须先做一个产品决策：

1. 保留多页面工作区
   - `home/projects/brand-kit/skills/settings` 继续存在，只是去云化
2. 收缩为单工作区
   - 只保留项目页和设置页，其余入口并入项目页或下线

建议：

- 第一版先保留 `projects / brand-kit / settings`
- `home` 和 `skills` 作为可选保留项单独决策

原因：

- `home` 页面不仅依赖登录态，还依赖 Supabase seed 内容
- `skills` 页面不仅依赖登录态，还依赖 workspace 安装态、技能市场和 workspace skills
- 如果没有先做 IA 决策，`AppSidebar` 不能被当作“直接复用”

### 6.2 后端形态

仍然保留：

- `Fastify`
- 当前 HTTP 路由组织方式
- WebSocket（默认保留）

但替换为：

- 无鉴权 API
- 本地单用户上下文
- SQLite repository
- 本地文件服务

这里也需要明确：

- 如果保留 agent 实时流、`canvas.sync`、`screenshot_canvas`、长任务状态推送，则 WebSocket 不是可选项
- 只有在明确降级这些能力时，才可以考虑移除 WebSocket

### 6.3 数据存储

本地数据目录建议：

- `data/app.db`
- `data/assets/projects/...`
- `data/assets/uploads/...`
- `data/assets/brand-kits/...`
- `data/assets/screenshots/...`

### 6.4 身份模型

单机版不再有：

- user 登录
- workspace 成员关系
- 角色
- bearer token

建议保留一个极简“本地主人”概念，仅作为内部统一数据归属：

- `local_profile`
- `local_workspace`

但这两个概念只用于内部组织，不再暴露出多租户语义。

### 6.5 最终成品态约束

这一点需要明确写死，避免迁移过程中的兼容措施被误解成最终方案。

单机版最终成品态应该满足：

- 没有 login 页面
- 没有 register 页面
- 没有 auth callback 页面
- 没有 sign out 按钮
- 没有 bearer token
- 没有 WebSocket `token` 查询参数
- 没有 email 不可修改这类账号语义
- 没有 billing / usage / subscription 语义

也就是说：

- `LocalRequestAuthenticator`
- 固定本地 `AuthenticatedUser`
- `LocalViewerService`

这些是迁移阶段的过渡兼容层，不是最终产品形态。  
最终目标仍然是“单机本地应用，无登录、无 auth 感知”。

最终运行时还应满足：

- 不再依赖 `@supabase/supabase-js`
- 不再保留浏览器端 Supabase client 入口
- 不再要求任何 Supabase-style user 字段作为业务前提
- `supabase/*` 命名只允许短期存在于迁移兼容层，收尾阶段应替换为中性本地命名

### 6.5.1 最终去 auth 收尾

这是一个必须单独验收的收尾阶段，不能因为“本地已经能跑”就跳过。

最终必须清零的内容：

- `RequestAuthenticator` 作为请求入口的设计
- `AuthenticatedUser.accessToken`
- `AuthenticatedUser.email`
- `AuthenticatedUser.userMetadata`
- HTTP/WS 的 `Unauthorized` 语义
- WebSocket `4001` / auth rejected 重连心智
- `RunCreateRequest` 中的 `accessToken`
- WS command payload 中的 token
- `agentRuns.createRun(...)` 从客户端接收 token 的路径

最终前端也必须满足：

- 不允许 `session?.access_token` 判空短路
- 不允许 `ApiAuthError` 作为常规 UI 控制流
- 不允许任何 `/login` 跳转
- 项目创建、删除、polling、WS 建连都必须是无登录前提的本地请求

### 6.6 设置页与个人资料语义收缩

当前设置页仍然带有明显 SaaS 账号语义：

- `Profile`
- `Email`
- `Billing`
- `Usage`

相关文件：

- [apps/web/src/app/(workspace)/settings/page.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/app/(workspace)/settings/page.tsx)
- [apps/web/src/components/profile-section.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/components/profile-section.tsx)
- [apps/web/src/components/settings-layout.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/components/settings-layout.tsx)

单机版最终应改造成更贴近本地工具的设置结构，例如：

- `General`
- `Agent`
- `Assets`
- `Advanced`

至少需要去掉：

- Email 展示
- `Email cannot be changed`
- Billing
- Usage
- Subscription

并把 `Profile` 改成更中性的：

- `Display`
- 或 `Local Profile`

### 6.7 最终单机语义白名单

为了避免“底座本地化了，产品语言还是 SaaS/云端”，最终对外语义需要收口。

最终产品允许的名词：

- `app`
- `local`
- `project`
- `canvas`
- `asset`
- `brand kit`
- `skill set`
- `settings`

只允许短期存在于迁移兼容层的名词：

- `workspace`
- `viewer`
- `member`
- `user profile`
- `workspace settings`
- `installed_by`
- `created_by`
- `billing`
- `subscription`

### 6.7.1 迁移兼容名 -> 最终产品名

- `viewer` -> `app bootstrap`
- `workspace settings` -> `local settings`
- `profile` -> `display` 或 `local profile`
- `workspace skills` -> `app skills` 或 `project skill set`
- `created_by / installed_by` -> 本地隐式归属，不对外暴露

### 6.8 联网能力分层

单机版不等于“绝对不能联网”，但联网能力必须被降级为明确的增强能力，而不是默认产品基础设施。

默认本地核心能力：

- 本地项目
- 本地画布
- 本地聊天
- 本地 Brand Kit
- 本地文件资产

可选联网增强能力：

- 模型提供商调用
- Google Fonts 发现/预览
- npm marketplace / URL import
- 远程社区 seed 内容

规则：

- 首版验收只覆盖本地核心能力
- 联网增强能力若保留，必须在文档、设置和空状态中明确标注

## 7. 需要替换的核心模块

## 7.1 Auth 层替换

当前状态：

- `Providers` 注入 `AuthProvider`
- 页面和 hooks 到处 `useAuth()`
- API 层默认带 token

目标状态：

- 后端先提供本地身份替身
- 前端再逐步删除 `AuthProvider`
- 删除 `supabase-browser`
- 删除所有 bearer token 依赖
- 用本地 `AppBootstrap` 替代登录态初始化

建议替代方式：

- 先新增后端本地身份替身：
  - `LocalRequestAuthenticator`
  - 固定本地 `AuthenticatedUser`
  - `LocalViewerService`
- 让现有路由先继续拿到“像当前用户一样”的上下文
- 把 [apps/web/src/components/providers.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/components/providers.tsx) 改成只保留主题和 toast
- 新增 `LocalAppProvider`
  - 负责加载 `/api/app/bootstrap`
  - 提供：
    - 当前默认项目
    - 本地设置
    - 本地 profile

第一阶段建议先做兼容型 `LocalAppProvider/useAppContext`，尽量保留现有调用形状，再逐步去掉 `user/session/accessToken`。

受影响的主要前端文件：

- [apps/web/src/lib/auth-context.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/lib/auth-context.tsx)
- [apps/web/src/components/providers.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/components/providers.tsx)
- [apps/web/src/app/canvas/page.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/app/canvas/page.tsx)
- [apps/web/src/app/(workspace)/layout.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/app/(workspace)/layout.tsx)
- [apps/web/src/app/(workspace)/home/page.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/app/(workspace)/home/page.tsx)
- [apps/web/src/app/(workspace)/projects/page.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/app/(workspace)/projects/page.tsx)
- [apps/web/src/app/(workspace)/settings/page.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/app/(workspace)/settings/page.tsx)
- [apps/web/src/app/(workspace)/skills/page.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/app/(workspace)/skills/page.tsx)
- [apps/web/src/components/app-sidebar.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/components/app-sidebar.tsx)
- [apps/web/src/components/chat-sidebar.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/components/chat-sidebar.tsx)
- [apps/web/src/components/profile-section.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/components/profile-section.tsx)
- [apps/web/src/components/settings-layout.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/components/settings-layout.tsx)
- [apps/web/src/components/brand-kit/brand-kit-page.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/components/brand-kit/brand-kit-page.tsx)
- [apps/web/src/hooks/use-create-project.ts](/Users/wwcome/work/demo/Loomic/apps/web/src/hooks/use-create-project.ts)
- [apps/web/src/hooks/use-delete-project.ts](/Users/wwcome/work/demo/Loomic/apps/web/src/hooks/use-delete-project.ts)
- [apps/web/src/hooks/use-websocket.ts](/Users/wwcome/work/demo/Loomic/apps/web/src/hooks/use-websocket.ts)
- [apps/web/src/hooks/use-job-fallback-polling.ts](/Users/wwcome/work/demo/Loomic/apps/web/src/hooks/use-job-fallback-polling.ts)

受影响的主要后端文件：

- [apps/server/src/supabase/user.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/supabase/user.ts)
- [apps/server/src/http/viewer.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/http/viewer.ts)
- [apps/server/src/features/bootstrap/ensure-user-foundation.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/bootstrap/ensure-user-foundation.ts)
- [apps/server/src/app.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/app.ts)

顺序上必须遵守：

1. 先做后端本地 auth shim
2. 再让前端减少 token 传递
3. 最后再删 `/login`、`register`、`auth/callback`

还要补一个最终收尾动作：

4. 删除 `signOut` 相关 UI 和逻辑
   - `AppSidebar`
   - `useCreateProject`
   - `useDeleteProject`
   - 其他 `ApiAuthError -> signOut -> /login` 分支

## 7.2 数据访问层替换

当前状态：

- `createUserClient(accessToken)` 深入所有 service
- 所有 service 默认在 Supabase 表上读写

目标状态：

- 引入 SQLite repository 层
- service 继续存在，但底层不再依赖 Supabase client
- 尽量保留当前服务接口和关键字段语义，先做兼容替换，再做结构收缩

建议做法：

新增一组本地 repository：

- `apps/server/src/db/sqlite.ts`
- `apps/server/src/db/migrations/*`
- `apps/server/src/repositories/projects-repo.ts`
- `apps/server/src/repositories/canvases-repo.ts`
- `apps/server/src/repositories/chat-repo.ts`
- `apps/server/src/repositories/settings-repo.ts`
- `apps/server/src/repositories/assets-repo.ts`
- `apps/server/src/repositories/jobs-repo.ts`
- `apps/server/src/repositories/brand-kits-repo.ts`
- `apps/server/src/repositories/skills-repo.ts`（仅在保留 skills 能力时）
- `apps/server/src/repositories/agent-runs-repo.ts`（仅在保留可恢复 agent 时）

然后逐步重写以下 service 的实现，而不是一次性推翻路由层：

- [apps/server/src/features/projects/project-service.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/projects/project-service.ts)
- [apps/server/src/features/canvas/canvas-service.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/canvas/canvas-service.ts)
- [apps/server/src/features/chat/chat-service.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/chat/chat-service.ts)
- [apps/server/src/features/settings/settings-service.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/settings/settings-service.ts)

这里不要简单追求“最小新表”，而要优先满足“最小兼容语义”。

至少需要保留或等价实现：

- `create_project_with_canvas`
  - 也就是“创建项目时原子创建 primary canvas”
- `bootstrap_viewer`
  - 也就是“确保首次进入时本地 profile/workspace/default project 可用”
- `chat_sessions.thread_id`
- `chat_messages.content_blocks`
- `projects.thumbnail_path`
- `brand_kit_assets`

如果最终不保留 `skills` / `marketplace`：

- `skills`
- `skill_files`
- `workspace_skills`

可以不进入第一版 SQLite 兼容表设计。

## 7.3 Storage 层替换

当前状态：

- `upload-service` 写 Supabase Storage
- `canvas-service` 里有 `oss://` 标记协议

目标状态：

- 文件写入本地磁盘
- 元数据写入 SQLite
- 前端仍然能拿到稳定 URL

建议做法：

新增：

- `apps/server/src/storage/local-file-storage.ts`

职责：

- 保存文件到 `data/assets/...`
- 返回本地访问路径
- 删除文件
- 读取文件 metadata

并同时重写：

- [apps/server/src/features/uploads/upload-service.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/uploads/upload-service.ts)
- [apps/server/src/features/canvas/canvas-service.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/canvas/canvas-service.ts)
- [apps/server/src/features/projects/project-service.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/projects/project-service.ts)
- [apps/server/src/features/brand-kit/brand-kit-service.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/brand-kit/brand-kit-service.ts)
- [apps/server/src/features/jobs/executors/image-generation.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/jobs/executors/image-generation.ts)
- [apps/server/src/features/jobs/executors/video-generation.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/jobs/executors/video-generation.ts)
- [apps/server/src/agent/runtime.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/agent/runtime.ts) 中的图片持久化路径

这里要特别注意：

- 不能保留 Supabase 专属的 `oss://bucket/objectPath`
- 建议改成单机版自己的标记，例如：
  - `local://projects/<projectId>/...`
- 不建议直接把本地 URL 写进 `dataURL`
- 更稳的做法是保留一层 marker/resolver 协议，或者延续当前 `storageUrl` 输出契约

还需要明确：

- 当前并非所有资产都统一走 `asset_objects`
- `projects.thumbnail_path`
- `canvas content oss://`
- `brand_kit_assets.file_url`

这三类都各有自己的元数据路径，迁移时必须分别处理

此外 Brand Kit 这条线还要特别注意：

- 当前 `brand_kits` 以 `user_id` 归属
- 当前文件 URL 会走 signed URL

单机版里应改为：

- 本地 profile / 本地 workspace 归属
- 本地静态资源 URL 或本地 resolver

## 7.4 队列 / Worker 替换

当前状态：

- 当前不是单一路径，而是至少有三条生成链路

1. direct image route
   - `/api/agent/generate-image`
   - 当前是同步直出
2. direct video route with internal polling
   - `/api/agent/generate-video`
   - 当前会创建 job，但请求内阻塞轮询结果
3. job API / worker / agent submitJob
   - `/api/jobs/*`
   - worker 轮询 PGMQ
   - agent runtime 自己也会提交 image/video job

另外：

- `code_execution` 已进 schema
- 但当前 worker 明确说明它不走 PGMQ

单机版有两种路线：

### 路线 A1：先同步执行

适合先把单机版跑起来。

做法：

- 图片生成直接在接口内同步执行
- 成功后直接写入结果
- 前端保留 loading 体验

优点：

- 实现最简单
- 最不容易漏逻辑

缺点：

- 视频生成会比较慢

### 路线 A2：保留 job 概念，但改成本地 job runner

做法：

- `background_jobs` 仍然保留，但存 SQLite
- 同进程起一个 `job-runner`
- 不再使用 PGMQ
- 用轮询 SQLite 或内存队列消费

优点：

- 更接近现有产品行为
- 前端状态逻辑复用度高

缺点：

- 复杂度更高

建议：

- 第一版先走 A1
- 第二版如果视频生成、长任务需求强，再升级到 A2
- 但在立项时必须先决定 standalone 第一版究竟保留哪几条生成链路，不能默认“一起保留”

受影响文件：

- [apps/server/src/queue/pgmq-client.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/queue/pgmq-client.ts)
- [apps/server/src/worker.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/worker.ts)
- [apps/server/src/features/jobs/job-service.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/features/jobs/job-service.ts)
- [apps/server/src/http/generate.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/http/generate.ts)
- [apps/server/src/http/jobs.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/http/jobs.ts)
- [apps/server/src/agent/runtime.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/agent/runtime.ts)

### 7.4.1 实时链路与 token 契约

当前前端实时链路依赖：

- `useWebSocket(getToken)`
- `useJobFallbackPolling`
- WebSocket URL 上的 token 查询参数

因此“去 auth”不只是改页面和 API，还要同步替换：

- WebSocket 建连方式
- job fallback polling 的 token 获取方式
- `canvas.sync`、长任务状态、自动插回画布等实时体验

最终成品态里，WebSocket 应改成：

- 无 token 参数
- 基于本地应用上下文直接建立连接
- 或者完全由本地进程信任本地请求

## 7.5 积分/支付层移除

目标非常明确：

- 单机版不需要 credits
- 单机版不需要 pricing
- 单机版不需要 LemonSqueezy

但要注意，这不是“删几个页面”。

还要同步处理：

- 模型列表上的 `creditCost`
- `ChatSidebar` 中的不足积分分支
- 顶部 `CreditHeaderButton`
- `AppSidebar` 里的积分入口
- `TierLimitToastProvider`
- 后端 image/video model routes 中的 tier/plan 限制

这是单机版里非常容易漏的区域。

执行顺序上应该是：

1. 先替换所有 credits 入口
2. 再删除 credits/payments 模块文件

至少要先清掉这些入口位点：

- `TierLimitToastProvider`
- `CreditHeaderButton`
- `CreditBalance`
- `CreditInsufficientDialog`
- `claimDailyCredits`

## 7.6 Home / Skills / Marketplace 的本地化决策

这三块不是简单页面，而是带有明显云端内容和多用户语义。

### Home

当前 `home` 依赖：

- Supabase seed 内容
- 发现页案例库
- 示例内容库

相关文件：

- [apps/web/src/app/(workspace)/home/page.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/app/(workspace)/home/page.tsx)
- [apps/web/src/lib/home-discovery-library.ts](/Users/wwcome/work/demo/Loomic/apps/web/src/lib/home-discovery-library.ts)
- [apps/web/src/lib/home-example-library.ts](/Users/wwcome/work/demo/Loomic/apps/web/src/lib/home-example-library.ts)

单机版需要三选一：

1. 直接下线 `home`
2. 改成本地静态 seed 数据
3. 保留远程内容源，但明确它不再依赖 Supabase

这里还需要补一条：

- 如果保留 `home`，必须决定它最终是“本地启动页/示例页”还是“联网增强页”

若定位为本地启动页，应去掉：

- `authorName`
- `authorAvatarUrl`
- `viewCount`
- `likeCount`
- 外链案例库语义

并补一个本地临时附件目录，替代当前“未建项目先传 general bucket”的流程。

### Skills

当前 `skills` 依赖：

- `skills`
- `skill_files`
- `workspace_skills`
- workspace 安装态
- agent workspace skills 注入

相关文件：

- [apps/web/src/app/(workspace)/skills/page.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/app/(workspace)/skills/page.tsx)
- [apps/server/src/http/skills.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/http/skills.ts)
- [apps/server/src/http/skills-marketplace.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/http/skills-marketplace.ts)
- [apps/server/src/agent/workspace-skills.ts](/Users/wwcome/work/demo/Loomic/apps/server/src/agent/workspace-skills.ts)

单机版需要明确：

1. 保留 skills，但改成本地技能库
2. 只保留本地导入，不保留 marketplace
3. 整体下线 skills

还需要写清楚最终模型二选一：

1. 应用级技能库
2. 项目级技能集

并明确这些旧语义是否全部下线：

- `workspace_skills`
- `created_by`
- `当前 workspace 自动安装`
- `public catalog`

### Marketplace

当前 marketplace 还涉及外部网络：

- npm registry
- 外部 skill 安装

这和“单机本地版”并不冲突，但它不是本地核心能力。建议默认策略：

- 第一版不作为核心验收项
- 如果保留，则单独定义为“联网增强能力”

## 7.7 Brand Kit / Fonts 的本地化决策

Brand Kit 这条线不仅涉及本地存储，还涉及在线字体发现与预览。

当前残留包括：

- Google Fonts API
- 在线字体预览
- `source: "google_fonts"` 元数据
- storage bucket / signed URL
- `user_id` 归属

因此必须先做字体策略决策，只能三选一：

1. 内置离线字体包
2. 本地字体文件导入
3. 手工录入字体名

如果保留 Google Fonts 发现与预览：

- 必须标成可选联网增强能力
- 不能作为默认本地能力

## 7.8 Agent 持久化决策

这部分不能默认略过，需要在方案层先做选择。

当前代码里，agent 相关能力真实依赖：

- `chat_sessions.thread_id`
- `agent_runs`
- `langgraph.checkpoints`
- `langgraph.checkpoint_blobs`
- `langgraph.checkpoint_writes`
- `langgraph.store`
- `skills / workspace_skills / skill_files`（如果保留 workspace skill 注入）

因此单机版有两个明确方向：

### 方向 A：保留可恢复 agent

需要迁移或等价实现：

- `chat_sessions.thread_id`
- `agent_runs`
- LangGraph checkpoint/store 相关表或本地持久化替代
- workspace skills / skill files
- run metadata 持久化

适合：

- 你希望保留现在 agent 对话可恢复、跨会话延续、workspace skill 注入等能力

### 方向 B：明确降级为非持久化 agent

需要同步删改：

- thread resume
- run metadata 持久化
- persisted thread 依赖
- workspace skills 注入能力或其验收目标

适合：

- 你优先追求更快落地单机版
- 可以接受 agent 上下文持久化能力收缩

建议：

- 在正式开工前先做这个决策
- 不要默认“以后再补”，否则会在 chat/runs/skills 三条线同时埋雷

## 7.9 配置与环境变量收缩

单机版最终不应再要求：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `SUPABASE_PROJECT_ID`
- `LEMONSQUEEZY_*`

仍可能保留的配置：

- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `GOOGLE_VERTEX_*`
- `REPLICATE_API_TOKEN`
- `GOOGLE_FONTS_API_KEY`（仅在保留在线字体发现时）

因此后续还需要清理：

- 前端环境变量读取
- `next.config`
- `server env` 结构
- `.env.example` / 启动说明

## 8. 迁移阶段计划

## 阶段 0：复制副本并冻结基线

目标：

- 复制 `Loomic` 到 `Loomic-standalone`
- 在副本中跑通现有开发环境
- 确认复制后的 UI 和交互与原项目一致
- 确定最终对外名称、仓库 slug、package scope、环境变量前缀映射表

输出：

- 一个与原项目视觉一致的可运行副本
- 一份命名映射表，明确：
  - 产品名
  - 仓库名
  - package scope
  - env prefix
  - service id
  - local data key prefix

注意：

- 这一阶段不做业务删改
- 不急着做全仓 rename
- 只做复制、验证和命名决策冻结

## 阶段 1：先改入口和营销层，不删登录链路

目标：

- 去掉根首页营销漏斗
- 去掉 pricing 展示入口
- 保留 `login/register/auth-callback` 占位，直到 auth shim 和工作区跳转完成替换
- 先把最显眼的对外 `Loomic` 品牌文案替换掉

具体动作：

- 改 [apps/web/src/app/page.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/app/page.tsx)
  - 从营销首页改为跳转逻辑
- 停用或隐藏：
  - `pricing`
  - landing sections
- 从 [apps/web/src/app/layout.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/app/layout.tsx) 去掉 LemonSqueezy script
- 改首批品牌外显点：
  - `metadata.title`
  - sidebar title
  - auth shell
  - loading 文案
  - placeholder / helper 文案
  - README 标题与截图 alt

阶段结果：

- 页面入口开始贴近单机版目标
- 用户第一眼看到的品牌已经切到新名称
- 但此时 `login` 链路还保留占位，避免工作区死跳转

## 阶段 2：先补后端本地身份替身

目标：

- 在不改动主要路由形状的前提下，让后端先脱离真实 Supabase 登录态

具体动作：

- 新增 `LocalRequestAuthenticator`
- 固定本地 `AuthenticatedUser`
- 新增 `LocalViewerService`
- 让现有 `auth.authenticate()` 仍然返回可用上下文
- 让 `viewer`、`projects`、`generate`、`jobs`、`settings` 等路由先继续工作

阶段结果：

- 后端可以接受“没有真实 token 的本地请求”
- 为前端去 token 和删 `/login` 链路创造条件

## 阶段 3：替换前端应用上下文

目标：

- 去掉 Supabase 登录态
- 去掉 `useAuth()`
- 引入本地 bootstrap 上下文

具体动作：

- 改造 [apps/web/src/components/providers.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/components/providers.tsx)
- 删除 [apps/web/src/lib/auth-context.tsx](/Users/wwcome/work/demo/Loomic/apps/web/src/lib/auth-context.tsx) 的使用
- 新增本地 `app-context`
- 改造 [apps/web/src/lib/server-api.ts](/Users/wwcome/work/demo/Loomic/apps/web/src/lib/server-api.ts)
  - 去掉 token 参数
- 改造 `AppSidebar`、`ChatSidebar`、`useWebSocket`、`useJobFallbackPolling`
- 改造 `useCreateProject`、`useDeleteProject`
- 收缩设置页中的账号语义
- 移除工作区内所有 `/login` 跳转
- 到这一阶段末尾再删除 `login/register/auth-callback`

阶段结果：

- 前端不再依赖 session
- 主要页面可以在单机模式下读取本地 bootstrap 数据

## 阶段 4：建立 SQLite 底座

目标：

- 新建本地 SQLite 数据层
- 建立最小兼容表结构，而不是只追求最小张数

建议首批兼容表：

- `app_profile`
- `workspaces`（或等价单行本地 workspace）
- `projects`
- `canvases`
- `chat_sessions`
  - 必须保留 `thread_id`
- `chat_messages`
  - 必须保留 `content_blocks`
- `workspace_settings`
- `asset_objects`
- `brand_kits`
- `brand_kit_assets`
- `background_jobs`
- `agent_runs`（仅在保留可恢复 agent 时）

另外必须保留等价事务语义：

- `bootstrap_viewer`
- `create_project + primary canvas`

阶段结果：

- 后端具备完全脱离 Supabase 的本地存储能力

## 阶段 5：优先迁移核心业务链路

优先顺序建议：

1. projects
2. canvases
3. chat
4. settings
5. uploads
6. brand kit

原因：

- 这是单机版的核心工作流
- 先保工作流，再保边缘功能

阶段结果：

- 单机版可以创建项目、进入画布、保存画布、保留聊天记录

## 阶段 6：本地文件存储替代

目标：

- 图片、缩略图、上传文件走本地磁盘

关键注意点：

- `project thumbnail`
- `canvas files`
- `brand kit assets`
- `generated image/video assets`
- `agent runtime persistImage`

阶段结果：

- 所有资产在重启后仍能访问

## 阶段 7：生成能力落地

第一版建议：

- 保留现有 provider 适配器
- 先做同步图片生成
- 视频生成如复杂，可先延后或保留实验态
- 明确 standalone 第一版到底保留：
  - `direct image route`
  - `direct video route`
  - `job API / worker / agent submitJob`
  - 哪几条链路

阶段结果：

- 单机版核心 AI 工作流能跑通

## 阶段 8：清除 monetization / cloud 残留

需要清掉：

- credits API
- payments API
- 价格文案
- model credit badge
- insufficient credits dialog
- subscription settings
- watermark free-tier 逻辑

阶段结果：

- 产品语义彻底转为本地单用户工具

## 阶段 9：整理路由与启动体验

最终目标：

- 启动即进入工作区
- 自动打开最近项目
- 无登录页、无首页、无付费入口

阶段结果：

- 用户体验从“云端 SaaS”转为“本地创作工具”

## 阶段 10：最终去 auth / 去云端语义收尾

目标：

- 删除所有迁移兼容层残留
- 确保最终产品不再暴露 auth / viewer / workspace / Supabase 语义
- 完成工程层命名迁移，确保公开仓库不再残留明显 `Loomic` 标识

具体动作：

- 删除 `LocalRequestAuthenticator`、`LocalViewerService` 等过渡兼容层
- 删除 `RequestAuthenticator` 作为请求入口的设计
- 删除 `AuthenticatedUser.accessToken/email/userMetadata` 的运行时依赖
- 删除 WS `Unauthorized / 4001 / token retry` 语义
- 删除 `viewer`、`workspace settings`、`profile` 这类仅用于兼容的对外命名
- 把最终接口和前端文案统一收口到 `app/local/project/settings/asset/skill set`
- 统一替换工程命名：
  - `@loomic/*` -> `@nextop/*`
  - `LOOMIC_*` -> `NEXTOP_*`
  - `loomic-server` -> `nextop-studio-server`
  - `loomic:*` -> `nextop:*`
  - `local@loomic.app` -> `local@nextop.app`
  - `loomic.db` -> `nextop-studio.db`
- 做最终全仓扫描，确认没有显眼残留：
  - `Loomic`
  - `@loomic/`
  - `LOOMIC_`
  - `loomic-server`
  - `loomic:`

阶段结果：

- 成品态真正变成“无 login、无 auth 感知、无 Supabase 心智”的单机本地应用
- 成品态也完成了对外品牌与工程标识的统一切换

## 9. 为避免漏迁移，建议的验证策略

单机版最怕的不是报错，而是“静默漏功能”。

建议按功能清单逐项验收，而不是只看页面能不能打开。

### 9.1 核心功能验收清单

- 能启动前后端
- 打开后直接进入项目
- 第一次启动能自动创建默认项目
- 项目列表可用
- 项目名可编辑
- 画布可保存并重开恢复
- 聊天会话可创建、切换、保留
- 图片可生成并插入画布
- 上传图片可持久化
- 缩略图可保存
- 设置可保存
- 重启应用后数据仍在
- WebSocket 实时事件正常
  - 如果保留 agent 实时流 / `canvas.sync` / 长任务状态推送
- job fallback polling 正常
  - 如果保留长任务或 worker 路径

### 9.1.1 分支能力验收清单

如果保留 `home`：

- 首页 seed 内容不再依赖 Supabase
- 示例内容缺失时有本地兜底

如果保留 `skills`：

- 技能列表、安装态、启用态不再依赖 workspace 云表
- skills mention / workspace skills 行为和产品决策一致

如果下线 `skills`：

- `AppSidebar` 不再保留 `/skills`
- `ChatSidebar` 不再依赖 workspace skills 注入
- 相关路由、接口、文案、空状态全部同步移除

如果保留可恢复 agent：

- 关闭并重开应用后，session/thread 可以恢复
- agent 继续对话时能接上历史上下文
- `agent_runs` 和 checkpoint/store 替代层可用

如果降级为非持久化 agent：

- 相关 UI、提示文案、验收目标同步收缩
- 不再保留“可恢复线程”的暗示

最终去 auth 收尾验收：

- 不再存在 `session?.access_token` 判空控制流
- 不再存在 `ApiAuthError -> signOut -> /login`
- 不再存在 WS `token` 查询参数
- 不再存在 `RunCreateRequest.accessToken`
- 不再存在 `auth.authenticate()` 作为最终请求入口
- 不再存在 `viewer.workspace.id` 作为前端必需语义

### 9.2 样式保真验收清单

- `Canvas` 布局不变形
- `ChatSidebar` 宽度/层级/动画正常
- `AppSidebar` 结构不乱
- `BrandKit` 页面样式正常
- `Projects` / `Settings` 页面视觉一致

### 9.3 不应再出现的内容

- 登录页
- 注册页
- pricing 文案
- credits 文案
- subscription 文案
- LemonSqueezy 相关脚本和类型
- Supabase 环境变量依赖
- `/login` 强制跳转
- WebSocket / polling 对 bearer token 的硬依赖
- Sign out 按钮
- Email 不可修改提示
- Billing / Usage 选项卡

## 10. 这一方案的推荐落地顺序

如果要把风险压到最低，推荐实际执行顺序是：

1. 复制项目副本
2. 先改入口和营销层，但保留登录占位链路
3. 先补后端本地 auth shim
4. 再去前端 auth 上下文、token 传递和 `/login` 跳转
5. 建 SQLite 最小兼容底座
6. 迁移 `project / canvas / chat / settings`
7. 改本地文件存储
8. 明确并改造生成链路
9. 清理积分/支付残留
10. 收口路由为“直接进入项目页”
11. 根据产品决策决定是否保留 `home / skills / 可恢复 agent`
12. 做最终去 auth / 去云端语义收尾

这个顺序的好处是：

- 每一步都能看见进展
- 每一步都能单独验证
- 不容易把 UI 和底座问题混在一起

## 11. 最终建议

对于你的诉求，最佳路线不是：

- 在原仓库直接硬改
- 也不是从零新建一个完全不同的项目

而是：

- 复制 `Loomic` 为 `Loomic-standalone`
- 原地保留 UI 和路由骨架
- 分阶段拔掉云能力
- 用 SQLite 和本地文件系统替换底座

这条路线最符合三个目标：

- 功能不容易漏
- 样式不容易歪
- 开发路径最稳

## 12. 下一步建议

下一份文档建议继续细化成：

1. 文件级迁移清单
2. SQLite 表结构设计
3. 每个阶段具体要改哪些文件
4. 第一批直接可以开工的改造任务

如果继续往下做，建议下一步直接写：

- `Loomic-standalone/阶段任务拆解.md`

把阶段 1 到阶段 3 细成可执行任务。
