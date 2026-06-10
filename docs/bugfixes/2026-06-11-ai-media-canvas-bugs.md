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

## 5. 上一个项目生成结果落入新项目画布

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/JTVXrcoxleJlMucBzmccovJLn72
- 真实 record id: `recvm886lykM5s`
- Bug 原因: 同一个 canvas 页面在切换到新项目后，旧项目未结束 run 的 WebSocket 监听仍可能收到 `tool.completed` 事件，并通过当前页面的 Excalidraw API 插入图片；同时旧项目已登记的生成任务 fallback 轮询也可能在新 canvas 上成功回调，导致上一个项目的生图结果显示在新项目画布。
- 修复方案: 在 `ChatSidebar` 中记录当前 `canvasId`，每个 run 事件只允许在其启动时的 canvas 仍为当前 canvas 时执行画布插入、同步和 fallback 转发；旧 canvas 的终态事件只用于结束该流。Canvas 页面在 `canvasId` 变化时取消所有已登记的 fallback 生成任务订阅，防止旧任务晚到。
- 验证方式和结果: 新增 `apps/web/test/chat-sidebar.test.tsx` 回归用例，模拟旧 canvas 启动 run、切到新 canvas 后派发旧 run 的 `tool.completed`，修复前会触发 `onImageGenerated`，修复后不触发；同时覆盖当前 canvas 的正常生成 artifact 仍会插入；`pnpm --filter @aimc/web test -- --run test/chat-sidebar.test.tsx -t "ignores generated artifacts|keeps generated artifacts"` 通过（实际运行 45 个 web 测试均通过）；`pnpm --filter @aimc/web typecheck` 通过；本地 `localhost:3000/canvas` 无 console error。
- 是否已修复完: 是
- commit hash: `TBD`

## 6. Agnes 分镜生图画布顺序错乱

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/Ddrpr0cubeJt3ZcsRvzc5hj2nwd
- 真实 record id: `recvm88hzesMTd`
- Bug 原因: Agnes/local-agent 路径会通过 `generate_image` 提交多个后台生图 job，后端在每个 job 成功后才读取当前 canvas 并自动计算插入位置；多个分镜图并发完成时，画布插入顺序跟 job 完成顺序绑定，而不是跟工具调用/分镜创建顺序绑定，录屏缩略图中聊天先生成 `Storyboard Shot 1 - Space Launch Scene`，画布左侧却先出现另一张分镜图。
- 修复方案: 在 agent runtime 发起生图 job 时就为无显式 placement 的图片按工具调用顺序预留自动位置；预留序列读取一次当前 canvas，后续按顺序追加虚拟占位来计算下一张位置，job 完成后使用预留位置写入 canvas。显式 `placementX/placementY` 仍优先，Agnes/local-agent 与 server job 路径共用该逻辑。
- 验证方式和结果: 新增 `apps/server/src/features/canvas/canvas-element-writer.test.ts` 用例，验证连续预留位置会按请求顺序排布，而不依赖图片完成后的真实写入顺序；`pnpm --filter @aimc/server test -- src/features/canvas/canvas-element-writer.test.ts` 通过（实际运行 25 个 server 测试文件均通过）；`pnpm --filter @aimc/server typecheck` 通过。
- 是否已修复完: 是
- commit hash: `TBD`

## 7. 添加自定义技能弹窗高度溢出

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/Apqqr6mLbeuE5Wc4sm7cWJUjnte
- 真实 record id: `recvm8aIDdwf0e`
- Bug 原因: `CreateSkillDialog` 的 `DialogContent` 只限制了宽度，没有限制 viewport 内最大高度；长表单直接撑高整个弹窗，导致标题区域贴近/被窗口顶栏遮挡，底部按钮也容易贴边或被挤出可视区域。
- 修复方案: 将弹窗内容改为纵向 flex 布局，设置 `max-h-[calc(100vh-6rem)]` 和 `overflow-hidden`；表单主体单独设置 `overflow-y-auto`，底部 `DialogFooter` 固定在滚动区外，保证长内容可滚动且操作按钮始终可见。
- 验证方式和结果: 新增 `apps/web/test/skills-page.test.tsx` 回归用例，验证添加技能弹窗具备最大高度、外层隐藏溢出和内部滚动区；`pnpm --filter @aimc/web test -- --run test/skills-page.test.tsx -t "custom skill dialog|creates a skill"` 通过（实际运行 45 个 web 测试文件均通过）；`pnpm --filter @aimc/web typecheck` 通过；`pnpm check:i18n` 通过；本地 `localhost:3000/skills` 打开弹窗实测在 1470x797 视口内 top=62/bottom=735，且无 console error。
- 是否已修复完: 是
- commit hash: `TBD`

## 8. 导入 Skill 未从 SKILL.md 提取名称和描述

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/K8IirYXp3ean1VcK3WEc8aRfnwc
- 真实 record id: `recvm8cp3qk5Za`
- Bug 原因: 导入面板只检测 `SKILL.md` 是否存在，没有解析文件内容来预填名称和描述；服务端兜底也只支持一级标题和 `## Description` 段落，截图中的 `SKILL.md` 使用顶部 `name:` / `description:` frontmatter，因此 UI 保持占位，导入结果也可能无法使用文件内元数据。
- 修复方案: 前端选择文件后解析 `SKILL.md` 的 loose YAML frontmatter、一级标题和 `## Description` 段落，在用户未手动编辑时自动预填名称/描述；服务端 `importSkill` 同步支持 frontmatter 兜底，并在 `SKILL.md` 无标题时用父目录名作为更合理的名称来源。
- 验证方式和结果: 新增 `apps/web/test/skills-page.test.tsx` 导入回归，模拟 `pua/SKILL.md` 含 `name: pua` 和 `description: ...`，断言导入表单自动填入名称/描述；新增 `apps/server/src/local/store.test.ts` 回归，断言服务端导入同类文件后落库名称/描述正确；`pnpm --filter @aimc/web test -- --run test/skills-page.test.tsx -t "file import"` 通过（实际运行 45 个 web 测试文件均通过）；`pnpm --filter @aimc/server test -- src/local/store.test.ts` 通过（实际运行 25 个 server 测试文件均通过）；`pnpm --filter @aimc/web typecheck`、`pnpm --filter @aimc/server typecheck`、`pnpm check:i18n` 均通过；本地 `localhost:3000/skills` 模拟选择文件后名称为 `pua`、描述正确预填且无 console error。
- 是否已修复完: 是
- commit hash: `TBD`
