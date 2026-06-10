# 2026-06-11 AI Media Canvas Bug 修复记录

## 1. 删除进行中会话后生成仍落入画布

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/Qbjfr1wk6e377McWdS2cIq6WnzG
- 真实 record id: `recvm7X7X6pcSA`
- Bug 原因: 删除 chat session 只删除了会话和消息数据，没有终止该 session 关联的 agent run 和后台生成 job；异步生成任务完成后仍可能被后续轮询/恢复逻辑写回画布。日志窗口 `2026-06-10 16:22:32 +/-30min` 内出现 cancel 请求但未形成有效终态，和会话生命周期未绑定一致。
- 修复方案: 在本地 store 删除 session 前，将该 session 下 `accepted/running` 的 agent run 更新为 `canceled` 并写入 `run.canceled` 终态事件，同时取消关联的 `queued/running/failed` 后台 job；保护 job 的 succeeded/failed 写回，避免 canceled job 被晚到 worker 覆盖。
- 验证方式和结果: 新增 `apps/server/src/local/store.test.ts` 回归用例，验证删除 session 会取消 run/job 且 late success/failure 不会覆盖 canceled；`pnpm --filter @aimc/server test -- src/local/store.test.ts` 通过；`pnpm --filter @aimc/server typecheck` 通过。
- 是否已修复完: 是
- commit hash: `92c01ca`

## 2. 显示所有元素未完整适配当前窗口

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/XQ5Pr0WKneuoJDcymRhcS8WInAd
- 真实 record id: `recvm7ZDepRVMG`
- Bug 原因: 底部缩放菜单和 Logo 菜单的“显示全部/显示画布所有元素”仅调用 `scrollToContent()` 空参数，Excalidraw 可能只滚动到内容附近，不会在 100% 缩放或大画布内容时强制重新缩放到当前 viewport。
- 修复方案: 增加共享 `fitAllCanvasElements` helper，两个入口统一调用 `scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.92, animate: true })`，明确要求 Excalidraw 按当前视口显示全部元素。
- 验证方式和结果: 新增 `apps/web/test/canvas-bottom-bar.test.tsx`，并扩展 `apps/web/test/canvas-logo-menu.test.tsx`，覆盖两个入口的 fit 参数；`pnpm --filter @aimc/web test -- --run test/canvas-bottom-bar.test.tsx test/canvas-logo-menu.test.tsx` 通过（实际运行 45 个 web 测试均通过）；`pnpm --filter @aimc/web typecheck` 通过；本地 `localhost:3000/canvas` 点击“显示全部”菜单后菜单关闭且无 console error。
- 是否已修复完: 是
- commit hash: `TBD`

## 3. 进行中会话阻塞新会话发送

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/GHE3rJDOgeiatNcZtdpc1OkGn2g
- 真实 record id: `recvm81TdhBr94`
- Bug 原因: `ChatSidebar` 使用单个全局 `sendingRef` 表示发送中状态；一个 session 的 run 未结束时，新建 session 后再次发送会被 `handleSend` 直接 return，导致输入消息不出现在详情里，本地创造模板点击也看起来无反应。
- 修复方案: 将发送中状态改为按 session 维度的 in-flight set；同一 session 仍防重复提交，不同 session 可并行启动 run。`streaming` UI 状态只同步当前 active session，切换/新建会话不会被其他 session 的运行状态锁住。
- 验证方式和结果: 新增 `apps/web/test/chat-sidebar.test.tsx` 回归用例，覆盖旧 session 运行中时新 session 仍可发送；同时保留快速重复 Enter 只触发一次发送的既有保护；`pnpm --filter @aimc/web test -- --run test/chat-sidebar.test.tsx -t "allows a new session|rapid duplicate"` 通过（实际运行 45 个 web 测试均通过）；`pnpm --filter @aimc/web typecheck` 通过；本地 `localhost:3000/canvas` 无 console error。
- 是否已修复完: 是
- commit hash: `TBD`

## 4. 本地模板误带上一会话画布图片

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/L8sarmMYOeE1uQcXDfucfswNnKb
- 真实 record id: `recvm85z6uFRmx`
- Bug 原因: `ChatSidebar` 在发送消息时会自动把当前选中的画布图片作为 canvas-ref attachment；本地创造模板直接复用 `handleSend`，未传入显式空附件，因此从“Logo 与品牌”切换到“分镜故事板”时，如果上一会话图片仍处于选中状态，模板消息会被错误附带该图片。
- 修复方案: 仅在本地模板入口传入空 `attachmentsOverride` 和空 `mentionsOverride`，明确表示模板发送不继承当前画布选择；保留普通聊天输入自动引用选中画布图片的行为。
- 验证方式和结果: 新增 `apps/web/test/chat-sidebar.test.tsx` 回归用例，先让画布中存在被选中的图片，再点击“分镜故事板”，断言 `startRun` 不包含 attachments；修复前该用例复现失败，修复后 `pnpm --filter @aimc/web test -- --run test/chat-sidebar.test.tsx -t "does not attach selected canvas images"` 通过（实际运行 45 个 web 测试均通过）；`pnpm --filter @aimc/web typecheck` 通过；本地 `localhost:3000/canvas` 无 console error。
- 是否已修复完: 是
- commit hash: `TBD`
