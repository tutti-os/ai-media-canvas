# 2026-06-11 AI Media Canvas Bug 修复记录

## 1. 删除进行中会话后生成仍落入画布

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/Qbjfr1wk6e377McWdS2cIq6WnzG
- 真实 record id: `recvm7X7X6pcSA`
- Bug 原因: 删除 chat session 只删除了会话和消息数据，没有终止该 session 关联的 agent run 和后台生成 job；异步生成任务完成后仍可能被后续轮询/恢复逻辑写回画布。日志窗口 `2026-06-10 16:22:32 +/-30min` 内出现 cancel 请求但未形成有效终态，和会话生命周期未绑定一致。
- 修复方案: 在本地 store 删除 session 前，将该 session 下 `accepted/running` 的 agent run 更新为 `canceled` 并写入 `run.canceled` 终态事件，同时取消关联的 `queued/running/failed` 后台 job；保护 job 的 succeeded/failed 写回，避免 canceled job 被晚到 worker 覆盖。
- 验证方式和结果: 新增 `apps/server/src/local/store.test.ts` 回归用例，验证删除 session 会取消 run/job 且 late success/failure 不会覆盖 canceled；`pnpm --filter @aimc/server test -- src/local/store.test.ts` 通过；`pnpm --filter @aimc/server typecheck` 通过。
- 是否已修复完: 是
- commit hash: `7b7baf8`

## 2. 显示所有元素未完整适配当前窗口

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/XQ5Pr0WKneuoJDcymRhcS8WInAd
- 真实 record id: `recvm7ZDepRVMG`
- Bug 原因: 底部缩放菜单和 Logo 菜单的“显示全部/显示画布所有元素”仅调用 `scrollToContent()` 空参数，Excalidraw 可能只滚动到内容附近，不会在 100% 缩放或大画布内容时强制重新缩放到当前 viewport。
- 修复方案: 增加共享 `fitAllCanvasElements` helper，两个入口统一调用 `scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.92, animate: true })`，明确要求 Excalidraw 按当前视口显示全部元素。
- 验证方式和结果: 新增 `apps/web/test/canvas-bottom-bar.test.tsx`，并扩展 `apps/web/test/canvas-logo-menu.test.tsx`，覆盖两个入口的 fit 参数；`pnpm --filter @aimc/web test -- --run test/canvas-bottom-bar.test.tsx test/canvas-logo-menu.test.tsx` 通过（实际运行 45 个 web 测试均通过）；`pnpm --filter @aimc/web typecheck` 通过；本地 `localhost:3000/canvas` 点击“显示全部”菜单后菜单关闭且无 console error。
- 是否已修复完: 是
- commit hash: `a1f26cf`

## 3. 进行中会话阻塞新会话发送

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/GHE3rJDOgeiatNcZtdpc1OkGn2g
- 真实 record id: `recvm81TdhBr94`
- Bug 原因: `ChatSidebar` 使用单个全局 `sendingRef` 表示发送中状态；一个 session 的 run 未结束时，新建 session 后再次发送会被 `handleSend` 直接 return，导致输入消息不出现在详情里，本地创造模板点击也看起来无反应。
- 修复方案: 将发送中状态改为按 session 维度的 in-flight set；同一 session 仍防重复提交，不同 session 可并行启动 run。`streaming` UI 状态只同步当前 active session，切换/新建会话不会被其他 session 的运行状态锁住。
- 验证方式和结果: 新增 `apps/web/test/chat-sidebar.test.tsx` 回归用例，覆盖旧 session 运行中时新 session 仍可发送；同时保留快速重复 Enter 只触发一次发送的既有保护；`pnpm --filter @aimc/web test -- --run test/chat-sidebar.test.tsx -t "allows a new session|rapid duplicate"` 通过（实际运行 45 个 web 测试均通过）；`pnpm --filter @aimc/web typecheck` 通过；本地 `localhost:3000/canvas` 无 console error。
- 是否已修复完: 是
- commit hash: `8eadc8e`

## 4. 本地模板误带上一会话画布图片

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/L8sarmMYOeE1uQcXDfucfswNnKb
- 真实 record id: `recvm85z6uFRmx`
- Bug 原因: `ChatSidebar` 在发送消息时会自动把当前选中的画布图片作为 canvas-ref attachment；本地创造模板直接复用 `handleSend`，未传入显式空附件，因此从“Logo 与品牌”切换到“分镜故事板”时，如果上一会话图片仍处于选中状态，模板消息会被错误附带该图片。
- 修复方案: 仅在本地模板入口传入空 `attachmentsOverride` 和空 `mentionsOverride`，明确表示模板发送不继承当前画布选择；保留普通聊天输入自动引用选中画布图片的行为。
- 验证方式和结果: 新增 `apps/web/test/chat-sidebar.test.tsx` 回归用例，先让画布中存在被选中的图片，再点击“分镜故事板”，断言 `startRun` 不包含 attachments；修复前该用例复现失败，修复后 `pnpm --filter @aimc/web test -- --run test/chat-sidebar.test.tsx -t "does not attach selected canvas images"` 通过（实际运行 45 个 web 测试均通过）；`pnpm --filter @aimc/web typecheck` 通过；本地 `localhost:3000/canvas` 无 console error。
- 是否已修复完: 是
- commit hash: `bde8b2e`

## 5. 上一个项目生成结果落入新项目画布

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/JTVXrcoxleJlMucBzmccovJLn72
- 真实 record id: `recvm886lykM5s`
- Bug 原因: 同一个 canvas 页面在切换到新项目后，旧项目未结束 run 的 WebSocket 监听仍可能收到 `tool.completed` 事件，并通过当前页面的 Excalidraw API 插入图片；同时旧项目已登记的生成任务 fallback 轮询也可能在新 canvas 上成功回调，导致上一个项目的生图结果显示在新项目画布。
- 修复方案: 在 `ChatSidebar` 中记录当前 `canvasId`，每个 run 事件只允许在其启动时的 canvas 仍为当前 canvas 时执行画布插入、同步和 fallback 转发；旧 canvas 的终态事件只用于结束该流。Canvas 页面在 `canvasId` 变化时取消所有已登记的 fallback 生成任务订阅，防止旧任务晚到。
- 验证方式和结果: 新增 `apps/web/test/chat-sidebar.test.tsx` 回归用例，模拟旧 canvas 启动 run、切到新 canvas 后派发旧 run 的 `tool.completed`，修复前会触发 `onImageGenerated`，修复后不触发；同时覆盖当前 canvas 的正常生成 artifact 仍会插入；`pnpm --filter @aimc/web test -- --run test/chat-sidebar.test.tsx -t "ignores generated artifacts|keeps generated artifacts"` 通过（实际运行 45 个 web 测试均通过）；`pnpm --filter @aimc/web typecheck` 通过；本地 `localhost:3000/canvas` 无 console error。
- 是否已修复完: 是
- commit hash: `14213f0`

## 6. Agnes 分镜生图画布顺序错乱

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/Ddrpr0cubeJt3ZcsRvzc5hj2nwd
- 真实 record id: `recvm88hzesMTd`
- Bug 原因: Agnes/local-agent 路径会通过 `generate_image` 提交多个后台生图 job，后端在每个 job 成功后才读取当前 canvas 并自动计算插入位置；多个分镜图并发完成时，画布插入顺序跟 job 完成顺序绑定，而不是跟工具调用/分镜创建顺序绑定，录屏缩略图中聊天先生成 `Storyboard Shot 1 - Space Launch Scene`，画布左侧却先出现另一张分镜图。
- 修复方案: 在 agent runtime 发起生图 job 时就为无显式 placement 的图片按工具调用顺序预留自动位置；预留序列读取一次当前 canvas，后续按顺序追加虚拟占位来计算下一张位置，job 完成后使用预留位置写入 canvas。显式 `placementX/placementY` 仍优先，Agnes/local-agent 与 server job 路径共用该逻辑。
- 验证方式和结果: 新增 `apps/server/src/features/canvas/canvas-element-writer.test.ts` 用例，验证连续预留位置会按请求顺序排布，而不依赖图片完成后的真实写入顺序；`pnpm --filter @aimc/server test -- src/features/canvas/canvas-element-writer.test.ts` 通过（实际运行 25 个 server 测试文件均通过）；`pnpm --filter @aimc/server typecheck` 通过。
- 是否已修复完: 是
- commit hash: `0f0c0a6`

## 7. 添加自定义技能弹窗高度溢出

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/Apqqr6mLbeuE5Wc4sm7cWJUjnte
- 真实 record id: `recvm8aIDdwf0e`
- Bug 原因: `CreateSkillDialog` 的 `DialogContent` 只限制了宽度，没有限制 viewport 内最大高度；长表单直接撑高整个弹窗，导致标题区域贴近/被窗口顶栏遮挡，底部按钮也容易贴边或被挤出可视区域。
- 修复方案: 将弹窗内容改为纵向 flex 布局，设置 `max-h-[calc(100vh-6rem)]` 和 `overflow-hidden`；表单主体单独设置 `overflow-y-auto`，底部 `DialogFooter` 固定在滚动区外，保证长内容可滚动且操作按钮始终可见。
- 验证方式和结果: 新增 `apps/web/test/skills-page.test.tsx` 回归用例，验证添加技能弹窗具备最大高度、外层隐藏溢出和内部滚动区；`pnpm --filter @aimc/web test -- --run test/skills-page.test.tsx -t "custom skill dialog|creates a skill"` 通过（实际运行 45 个 web 测试文件均通过）；`pnpm --filter @aimc/web typecheck` 通过；`pnpm check:i18n` 通过；本地 `localhost:3000/skills` 打开弹窗实测在 1470x797 视口内 top=62/bottom=735，且无 console error。
- 是否已修复完: 是
- commit hash: `7b24236`

## 8. 导入 Skill 未从 SKILL.md 提取名称和描述

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/K8IirYXp3ean1VcK3WEc8aRfnwc
- 真实 record id: `recvm8cp3qk5Za`
- Bug 原因: 导入面板只检测 `SKILL.md` 是否存在，没有解析文件内容来预填名称和描述；服务端兜底也只支持一级标题和 `## Description` 段落，截图中的 `SKILL.md` 使用顶部 `name:` / `description:` frontmatter，因此 UI 保持占位，导入结果也可能无法使用文件内元数据。
- 修复方案: 前端选择文件后解析 `SKILL.md` 的 loose YAML frontmatter、一级标题和 `## Description` 段落，在用户未手动编辑时自动预填名称/描述；服务端 `importSkill` 同步支持 frontmatter 兜底，并在 `SKILL.md` 无标题时用父目录名作为更合理的名称来源。
- 验证方式和结果: 新增 `apps/web/test/skills-page.test.tsx` 导入回归，模拟 `pua/SKILL.md` 含 `name: pua` 和 `description: ...`，断言导入表单自动填入名称/描述；新增 `apps/server/src/local/store.test.ts` 回归，断言服务端导入同类文件后落库名称/描述正确；`pnpm --filter @aimc/web test -- --run test/skills-page.test.tsx -t "file import"` 通过（实际运行 45 个 web 测试文件均通过）；`pnpm --filter @aimc/server test -- src/local/store.test.ts` 通过（实际运行 25 个 server 测试文件均通过）；`pnpm --filter @aimc/web typecheck`、`pnpm --filter @aimc/server typecheck`、`pnpm check:i18n` 均通过；本地 `localhost:3000/skills` 模拟选择文件后名称为 `pua`、描述正确预填且无 console error。
- 是否已修复完: 是
- commit hash: `83084b2`

## 9. BYOK Agnes 链路读取并使用 Skill 失败

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/RxxFrbUaYeoNsWcuSrKcRtXvnWd
- 真实 record id: `recvm8dGIaWCQA`
- Bug 原因: 复核后确认先前 `d1f6e84` 只覆盖了 generic local-agent provider 运行目录物化，未直接覆盖 BYOK Agnes 的 server deep-agent/API-provider 链路。BYOK Agnes 使用 skill 时，`/workspace-skills/...` 文件读取走 deepagents backend route；旧实现仍把该 route 指向 `StoreBackend`，而运行时未提供 LangGraph store 时会触发 `Store is required but not available in runtime`。
- 修复方案: 将运行时已加载的 workspace skill 内容传入 agent backend 创建流程；production/dev backend 为每次 run 在 sandbox 下物化 `workspace-skills/<slug>/`，并用只读 `FilesystemBackend` 暴露 `/workspace-skills/` route，替代需要 store 的 workspace skill `StoreBackend`。保留先前 local-agent 相对路径物化，覆盖 local-agent shell 和 BYOK Agnes server `read_file` 两条路径。
- 验证方式和结果: 新增 `apps/server/src/agent/backends/workspace-skills.test.ts`，断言无 store 的 backend 能读取 `/workspace-skills/canvas-director/SKILL.md` 和附属文件，且 workspace skill route 为只读；扩展 `apps/server/src/agent/runtime.test.ts`，用 `model: "agnes:agnes-2.0-flash"` 和 `runtimeKind: "server-deepagent"` 断言 Agnes server runtime 会把 enabled workspace skills 传入 backend 和 agent factory；`pnpm --filter @aimc/server exec vitest run src/agent/backends/workspace-skills.test.ts src/agent/runtime.test.ts -t "workspace skills|Agnes server backend|passes enabled local workspace skills"` 通过；`pnpm --filter @aimc/server test` 通过（26 个文件、133 个测试）；`pnpm --filter @aimc/server typecheck` 通过；`pnpm exec biome check apps/server/src/agent/backends/index.ts apps/server/src/agent/backends/prod.ts apps/server/src/agent/backends/dev.ts apps/server/src/agent/backends/workspace-skills.ts apps/server/src/agent/backends/workspace-skills.test.ts` 通过。
- 是否已修复完: 是
- commit hash: `d1f6e84` + 追加修正 `c96ee4a`

## 10. Download image 导出后菜单仍聚焦

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/QT8yr7Jf3eEhETcQkircCvrQnch
- 真实 record id: `recvm7I9WbBRFI`
- Bug 原因: 右键菜单中的 `Download image` 自定义项在 `exportToBlob`、创建下载链接并触发点击之后才调用 `closeNativeContextMenu()`；导出或浏览器下载处理期间，原生菜单仍保持打开/聚焦状态，和录屏中导出后仍停留在导出选项上的现象一致。
- 修复方案: 将菜单关闭动作提前到下载按钮点击的同步阶段，点击后立即向触发按钮派发 `Escape` 关闭 Excalidraw 原生菜单；导出 PNG 和下载链接创建继续异步执行，不改变导出内容与文件名逻辑。
- 验证方式和结果: 新增 `apps/web/test/canvas-context-menu-extensions.test.tsx` 回归，模拟 `exportToBlob` 长时间 pending，点击“下载图片”后立即断言已派发 `Escape`，并验证仍按选中图片调用导出；`pnpm --filter @aimc/web exec vitest run test/canvas-context-menu-extensions.test.tsx -t download` 通过；`pnpm --filter @aimc/web typecheck` 通过；`pnpm exec biome check apps/web/src/components/canvas-context-menu-extensions.tsx apps/web/test/canvas-context-menu-extensions.test.tsx` 通过；浏览器打开 `http://localhost:3000/canvas` 无 console error。一次通过 npm 脚本误触发的 web 全量测试中，目标文件 5 个测试通过，但无关 `test/canvas-page.test.tsx` 的视频轮询用例失败，未作为本 bug 阻塞。
- 是否已修复完: 是
- commit hash: `a7b9fa7`

## 11. 导入 Skill 详情右上角来源标识拥挤

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/DRbfrKELCeSAjecppercbdb3nAc
- 真实 record id: `recvm8cSdG1Wtk`
- Bug 原因: 导入 skill 的详情弹窗把长标题和“自定义”来源胶囊放在同一个无右侧预留空间的 `DialogTitle` flex 行内；标题换行后会把来源胶囊推到右上角，和 shadcn 默认关闭按钮视觉上挤在一起，截图中红箭头指向的就是这个拥挤区域。
- 修复方案: 重构详情标题行布局：标题文本使用 `min-w-0 flex-1 break-words` 作为可换行主区域，来源胶囊使用 `shrink-0` 固定在右侧，并给标题行增加 `pr-12` 为关闭按钮预留空间，避免来源标识和关闭按钮重叠或贴得过近。
- 验证方式和结果: 新增 `apps/web/test/skills-page.test.tsx` 回归，模拟导入 skill 长标题并打开详情弹窗，断言标题文本、标题行和来源胶囊具备防挤压布局类；`pnpm --filter @aimc/web exec vitest run test/skills-page.test.tsx -t "imported skill detail"` 通过；`pnpm --filter @aimc/web typecheck` 通过；`pnpm exec biome check apps/web/src/components/skills/skill-detail-dialog.tsx apps/web/test/skills-page.test.tsx` 通过；浏览器打开 `http://localhost:3000/skills` 无 console error。
- 是否已修复完: 是
- commit hash: `8f7f2ff`

## 12. Skill 详情中去掉删除入口

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/UuZ1roNmTerywUcmNtHcH8TDn2g
- 真实 record id: `recvm8iz9B2On5`
- Bug 原因: 自定义/导入 skill 详情弹窗底部同时展示“删除”确认区和“卸载”按钮；截图中左侧红框标出删除确认区，右侧红框标出卸载按钮。当前产品交互只需要在详情里保留卸载，删除入口会造成用户误解和高风险操作暴露。
- 修复方案: 从 `SkillDetailDialog` 移除用户 skill 的删除确认状态、删除按钮、`onDelete` prop 和页面传入；保留安装/卸载主操作。顺手修正被触碰页面的 import 排序和装饰 SVG `aria-hidden`，保证静态检查通过。
- 验证方式和结果: 新增 `apps/web/test/skills-page.test.tsx` 回归，模拟导入 skill 打开详情，断言不存在“删除”按钮和“确认删除?”文案，同时“卸载”按钮仍存在；`pnpm --filter @aimc/web exec vitest run test/skills-page.test.tsx -t "delete controls"` 通过；`pnpm --filter @aimc/web typecheck`、`pnpm check:i18n`、`pnpm exec biome check apps/web/src/app/(workspace)/skills/page.tsx apps/web/src/components/skills/skill-detail-dialog.tsx apps/web/test/skills-page.test.tsx` 均通过；浏览器打开 `http://localhost:3000/skills` 无 console error。
- 是否已修复完: 是
- commit hash: `dd03d89`

## 追加批次（2026-06-11）

### 13. 对齐底部工具栏

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/INFTrrNwpeMScLcPuIZcvSwUnDf
- 真实 record id: `recvm7TJA3lTB8`
- Bug 原因: 附件截图显示画布左下角辅助工具条和中间主工具条底部基线不一致；代码中 `CanvasBottomBar` 使用 `bottom-4`，而主工具条使用 `bottom-5`，导致两个底部工具条相差 4px。
- 修复方案: 将辅助工具条根节点改为 `bottom-5`，与主工具条共用同一底部偏移；增加回归测试断言该组件使用 `bottom-5`。
- 验证方式和结果: `pnpm --filter @aimc/web test -- canvas-bottom-bar.test.tsx` 通过（Vitest 实际运行 45 个 web 测试文件、177 个测试，全部通过）；浏览器刷新 `http://127.0.0.1:3000/canvas` 后 DOM 几何显示主工具条和辅助工具条 bottom 均为 `20px`。控制台仍有既有 WebSocket 401/重连错误，和本次 UI 对齐无关。
- 是否已修复完: 是
- commit hash: `a228b95`

### 14. Copy Image 空白/非图片选区导出过大

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/QeQorOardelvMjcFb0icFcDanbf
- 真实 record id: `recvm7VrLhF6K3`
- Bug 原因: 附件截图显示在画布右键菜单中点击 `Copy image` 会触发大范围 PNG 导出，导致复制整个画布变慢甚至短暂卡住。代码里只隐藏了 Excalidraw 的 `copyAsPng` 项，但仍保留了原生 `copy` 项在无图片选区/非纯图片选区下的 `Copy image` 行；自定义图片复制路径还把未 await 的导出 Promise 直接传给 `ClipboardItem`，错误和耗时反馈都滞后。
- 修复方案: 在同步原生菜单时识别 `data-testid="copy"` 且原始标签为 `Copy image` 的菜单项；只有当前选区存在且全部是图片元素时才保留并替换为自定义复制，否则直接隐藏，避免空白处或混合选区触发全画布导出。自定义复制先 await `exportToBlob` 得到 PNG Blob，再写入剪贴板。
- 验证方式和结果: 扩展 `apps/web/test/canvas-context-menu-extensions.test.tsx`，覆盖无图片选区隐藏原生 `Copy image`，以及图片选区自定义复制不触发原生复制；`pnpm --filter @aimc/web exec vitest run test/canvas-context-menu-extensions.test.tsx` 通过（6 个测试）；`pnpm --filter @aimc/web typecheck` 通过。本地整页复验时当前 canvas 数据加载失败，无法完成真实右键交互；此前页面已有 WebSocket/API 401 重连问题，和本组件修复无关。
- 是否已修复完: 是
- commit hash: `4f0d48d`

### 15. 已生成文件下载缺少成功提示

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/BLuqrwS3ze8tvmcshxecKE14nbe
- 真实 record id: `recvm7WeLMXd82`
- Bug 原因: 附件视频显示用户在左侧“已生成文件列表”点击下载图标后没有任何成功反馈；代码中 `CanvasFilesPanel` 的下载处理只创建 `<a>` 并调用 `click()`，没有成功 toast，也没有缺失 dataURL 或浏览器点击失败时的错误提示。
- 修复方案: 将生成文件下载流程接入 `useToast`：下载链接挂载到 `document.body` 后触发点击并移除，成功后显示本地化成功提示；无 dataURL 或点击异常时显示本地化失败提示并写入 console warning。新增中英文 i18n key，并重新生成 i18n 类型定义。
- 验证方式和结果: 新增 `apps/web/test/canvas-files-panel.test.tsx`，模拟生成图片文件下载，断言 anchor click 被触发且出现 `Downloaded Generated image` 成功 toast；`pnpm --filter @aimc/web exec vitest run test/canvas-files-panel.test.tsx` 通过；`pnpm check:i18n` 通过；`pnpm --filter @aimc/web typecheck` 通过。本地整页复验时当前 canvas 数据加载失败，无法完成真实左侧文件列表交互；此前页面已有 WebSocket/API 401 重连问题，和本组件修复无关。
- 是否已修复完: 是
- commit hash: `3b46c98`

### 16. 底部工具栏未自适应

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/ZkkkrcznWeH1nIc1pvEcezT8n8f
- 真实 record id: `recvm8aY2eSkK0`
- Bug 原因: 附件截图显示底部工具条在桌面窗口和右侧面板占位下贴边/缺少自适应。代码中辅助底栏在左侧面板打开时使用固定 `left: 296`，没有根据当前 canvas 可用宽度收敛；主工具条也缺少最大宽度、横向溢出和按钮 `shrink-0` 保护，窄画布下容易被压缩或溢出。
- 修复方案: 辅助底栏改用 `max(16px, min(296px, calc(100% - 227px)))` 约束 left，并设置 `maxWidth: calc(100% - 32px)` 与横向滚动保护；主工具条增加 `max-w-[calc(100%_-_32px)]`、`overflow-x-auto`，按钮和分隔线固定不收缩，保证可用宽度不足时仍能完整访问工具。
- 验证方式和结果: 扩展 `apps/web/test/canvas-bottom-bar.test.tsx`，断言辅助底栏在左侧面板打开时使用可用宽度约束和最大宽度；`pnpm --filter @aimc/web exec vitest run test/canvas-bottom-bar.test.tsx` 通过（3 个测试）；`pnpm --filter @aimc/web typecheck` 通过。本地整页复验时当前 canvas 数据加载失败，点击“重试”后仍无法挂载画布，无法完成真实视口截图；该加载失败和本条布局修复无关。
- 是否已修复完: 是
- commit hash: `d4c6d1d`

### 17. 拷贝再复制出来的图片缩小

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/EoSprWT0IeyXqxcS931cpq6HnFd
- 真实 record id: `recvmdoFSAJfLR`
- Bug 原因: 附件截图显示复制后的图片尺寸明显小于原图。根因是自定义 `Copy image` 路径使用 Excalidraw `exportToBlob` 按画布显示尺寸重新渲染选区，复制的是缩放后的画布元素，而不是图片文件本身的原始像素数据。
- 修复方案: 对单张未裁剪图片，复制路径直接读取 Excalidraw file 的 `dataURL` 并写入剪贴板，避免经过画布显示尺寸重采样；无文件数据或多选时保留原有导出兜底。
- 验证方式和结果: 扩展 `apps/web/test/canvas-context-menu-extensions.test.tsx`，断言单张图片复制会从原始 file `dataURL` 生成 PNG Blob，且不调用 `exportToBlob`；`pnpm --filter @aimc/web test -- canvas-context-menu-extensions.test.tsx` 通过（实际运行 46 个 web 测试文件、182 个测试，全部通过）；`pnpm exec biome check --write apps/web/src/components/canvas-context-menu-extensions.tsx apps/web/test/canvas-context-menu-extensions.test.tsx` 通过。
- 是否已修复完: 是
- commit hash: `1182077`

### 18. 生成窗口遮挡视频/画布交互

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/HIYUrIyx4eahWLcZP4bc6osznib
- 真实 record id: `recvmdoNhmBEF5`
- Bug 原因: 附件截图显示右侧生成图片/视频浮窗停留在画布上方时，用户回到画布拖动视频窗口会被浮窗遮挡。代码中图片和视频生成面板只在外部点击时关闭下拉菜单/参数弹层，浮窗本身仍保持固定 `z-[100]` 覆盖画布区域，导致后续拖拽无法直接作用到被覆盖的画布元素。
- 修复方案: 图片生成面板和视频生成面板监听到面板外 `mousedown` 时，同步关闭自身；用户点击或拖回画布时，浮窗会先退出，后续画布交互不再被固定浮层拦截。
- 验证方式和结果: 扩展 `apps/web/test/canvas-generation-panels.test.tsx`，分别覆盖图片生成面板和视频生成面板在点击画布区域时会调用 `onClose`；`pnpm --filter @aimc/web exec vitest run test/canvas-generation-panels.test.tsx` 通过（15 个测试）。`pnpm exec biome check --write apps/web/src/components/canvas/image-generator-panel.tsx apps/web/src/components/canvas/video-generator-panel.tsx apps/web/test/canvas-generation-panels.test.tsx` 已执行并完成格式化，但该命令仍报告两个生成面板文件中既有的 `any`/旧 SVG accessibility 等 lint 问题，和本次修复无关。
- 是否已修复完: 是
- commit hash: `5d8ea4f`

### 19. 删除生成窗口后结果仍插入画布

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/Brzxra80te0JXhcKkHJc52P9nBe
- 真实 record id: `recvmdpoN3qjOG`
- Bug 原因: 附件录屏显示用户在图片生成过程中删除生成窗口后，异步生成结果完成时仍会被插入画布。代码中图片/视频生成面板只检查请求是否被 abort；如果用户删除的是画布上的生成占位元素，React 面板和请求可能仍存活，结果返回后会直接 `addFiles`/`updateScene`，把已删除占位重新替换成真实结果。
- 修复方案: 图片生成完成并下载 dataURL 后、写入文件前，先读取当前 scene 并确认原生成元素仍存在且未 `isDeleted`；视频生成完成后、导入 Excalidraw 转换器前执行同样检查。若占位已被删除，直接退出，不再写入文件、不再替换 scene。
- 验证方式和结果: 扩展 `apps/web/test/canvas-generation-panels.test.tsx`，用受控 Promise 分别模拟图片/视频生成请求挂起，随后让当前 scene 中的生成元素为 `isDeleted: true`，再 resolve 请求，断言不会再调用图片 `addFiles` 或结果 `updateScene`；`pnpm --filter @aimc/web exec vitest run test/canvas-generation-panels.test.tsx` 通过（17 个测试）。`pnpm --filter @aimc/web typecheck` 初次执行时暴露上一条图片复制路径的 TypeScript 收窄问题，已转入裁剪复制链路一起修复并复验。
- 是否已修复完: 是
- commit hash: `9d6ee32`

### 20. 裁剪图片复制后出现白色边框

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/FEqMrC60yeqQqAceW2ecWZZrnXg
- 真实 record id: `recvmdpUaAovou`
- Bug 原因: 附件截图显示裁剪后的图片复制再粘贴时带出白色边框。根因和图片复制缩小同源：原复制路径会通过 Excalidraw 画布导出选区，裁剪图会带上元素显示尺寸和画布背景，而不是只复制原始图片的裁剪矩形像素。
- 修复方案: 对单张带 `crop` 的图片，读取原始 file `dataURL`，创建与 crop 宽高相同的透明 canvas，先 `clearRect` 再只把 crop 区域绘制到 `(0,0)`，最后把该透明 PNG 写入剪贴板；同时补上 `selectedElements[0]` 的类型收窄，保证严格 TypeScript 检查通过。
- 验证方式和结果: `apps/web/test/canvas-context-menu-extensions.test.tsx` 已覆盖裁剪复制路径，断言 canvas 尺寸等于 crop 宽高、先清透明背景、`drawImage` 只绘制 crop 矩形，并且不再调用 Excalidraw `exportToBlob`；`pnpm --filter @aimc/web exec vitest run test/canvas-context-menu-extensions.test.tsx` 通过（8 个测试）；`pnpm --filter @aimc/web typecheck` 通过；`pnpm exec biome check apps/web/src/components/canvas-context-menu-extensions.tsx apps/web/test/canvas-context-menu-extensions.test.tsx` 通过。
- 是否已修复完: 是
- commit hash: `ea8ca5a`

### 21. 新建会话分镜故事版工具调用失败

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/XKJbrJLe6eve2ecEpCjcIM1bnYf
- 真实 record id: `recvmdrieXsrCP`
- Bug 原因: 附件截图显示“搜索项目”工具卡失败；日志包 `/tmp/nextop-lark/recvmdrieXsrCP/nextop-logs-20260611-145507.zip` 在 AI Media Canvas runtime 中显示新会话工具流实际被 schema 异常打断：`manipulate_canvas` 收到 `add_text` 操作时携带 `element_id: null`，被 `z.string().optional()` 拒绝；随后 `generate_image` 在缺少 `prompt/title` 时也被必填 schema 拒绝。这类模型生成的 null/缺省字段会变成工具调用异常，UI 上表现为工具卡失败。
- 修复方案: `manipulate_canvas.element_id` 允许 `null`，由具体 action 逻辑继续决定是否需要目标元素；`generate_image` 的 `title/prompt` 允许缺省或 `null`，运行时先从 `prompt/title` 互相兜底归一化，若仍没有 prompt，则返回可读的结构化 `missing_prompt` 错误，而不是抛 zod schema 异常打断整轮 agent。
- 验证方式和结果: 扩展 `apps/server/src/agent/tools/manipulate-canvas.test.ts`，覆盖经过 `inspect_canvas` 后 `add_text` 携带 `element_id: null` 仍可正常应用；扩展 `apps/server/src/agent/local-agent-host/tool-gateway.test.ts`，覆盖 `generate_image` 缺 prompt 时返回 `isError: true` 和可读 `missing_prompt` 摘要而不是抛异常；`pnpm --filter @aimc/server exec vitest run src/agent/tools/manipulate-canvas.test.ts src/agent/local-agent-host/tool-gateway.test.ts` 通过（9 个测试）；`pnpm --filter @aimc/server typecheck` 通过；`pnpm exec biome check apps/server/src/agent/tools/image-generate.ts apps/server/src/agent/tools/manipulate-canvas.test.ts apps/server/src/agent/local-agent-host/tool-gateway.test.ts` 通过。对 `manipulate-canvas.ts` 全文件执行 Biome 时仍会命中该文件既有非空断言/模板字符串 lint 债，未纳入本次范围。
- 是否已修复完: 是
- commit hash: `待提交后回填`
