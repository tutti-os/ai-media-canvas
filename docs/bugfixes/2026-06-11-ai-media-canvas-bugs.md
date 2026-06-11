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
- 验证方式和结果: 扩展 `apps/web/test/canvas-generation-panels.test.tsx`，分别覆盖图片生成面板和视频生成面板在点击画布区域时会调用 `onClose`；`pnpm --filter @aimc/web exec vitest run test/canvas-generation-panels.test.tsx` 通过（15 个测试）。页面复验补充时发现真实 Excalidraw 画布仍会因选中态保留而把面板重新唤回，已追加在 `CanvasToolMenu` capture 阶段监听 `pointerdown` 并清空对应 selection，且给 image/video 面板增加 `data-aimc-generator-panel` 标记。新增 `apps/web/test/canvas-tool-menu-panel-close.test.tsx` 覆盖从工具栏创建图片生成面板后点击画布区域会关闭面板并清空 selection；`pnpm --filter @aimc/web exec vitest run test/canvas-tool-menu-panel-close.test.tsx test/canvas-generation-panels.test.tsx` 通过（18 个测试）；`pnpm --filter @aimc/web typecheck` 通过。真实页面 `http://127.0.0.1:3000/canvas?id=e5ba507b-e343-4b73-b9a9-e30347a97e47` 复验：点击“AI 生成图片”出现提示框，再点击画布区域后提示框从 DOM/a11y 树中消失，链路通过。`pnpm exec biome check` 在两个既有生成面板文件上仍报告旧 `any`/SVG accessibility/hook deps lint 债，新增测试文件已单独 `biome check --write` 通过。
- 是否已修复完: 是
- commit hash: `5d8ea4f`
- 页面复验补修 commit hash: `9c65938`

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
- commit hash: `ed78da9`

### 22. 自定义 Skill 附属文件路径输入失焦

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/NxA6rEBNqevbj9cg4LDc3vBXnUU
- 真实 record id: `recvmdvBgjAPOL`
- Bug 原因: 无附件，Base 描述为“添加自定义技能，添加附属文件，输入符合的单字符就无法输入了”。根因是 `CreateSkillDialog` 渲染附属文件行时使用 `key={`${index}-${file.filePath}`}`；用户每输入一个路径字符，`filePath` 改变导致 React 认为是新节点，整行输入框被卸载重建，焦点丢失，后续字符无法继续输入。
- 修复方案: 给每个附属文件行创建稳定的 UI-only `id` 并作为 React key；更新/删除仍按 index 操作，提交前把 `id` 剥离，只提交 `{ filePath, content }`，避免影响 API payload。
- 验证方式和结果: 扩展 `apps/web/test/skills-page.test.tsx`，打开添加技能弹窗、添加附属文件后连续输入 `scripts/tool.ts`，断言输入框值完整且仍保持 focus；`pnpm --filter @aimc/web exec vitest run test/skills-page.test.tsx -t "attachment file path|custom skill dialog"` 通过（2 个目标测试）；`pnpm --filter @aimc/web typecheck` 通过；`pnpm exec biome check apps/web/src/components/skills/create-skill-dialog.tsx apps/web/test/skills-page.test.tsx` 通过。
- 是否已修复完: 是
- commit hash: `0f3a0fb`

### 23. 重进旧项目后画布内容为空

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/CEs9rj4F6eaarxcDFQycJR9Snkc
- 真实 record id: `recvmdn4ln6Pnm`
- Bug 原因: 附件录屏/截图显示退出项目、新建项目后再回到上一个项目，聊天记录仍在但画布为空。结合第 8 条日志可见同类场景下服务端先保存数 MB 画布内容，随后在重进/切换后出现 `bodyBytes: 176` 的 `canvas.save OK`，说明前端在 Excalidraw 新场景尚未完成水合时把空 scene 通过 debounced autosave 覆盖到了服务端。现有空保存保护只覆盖 beforeunload/unmount flush，没有覆盖正常 debounce 保存；CanvasEditor 也没有按 canvasId remount，切换项目时可能复用旧 API/hydration 状态。
- 修复方案: 在 Canvas 页面给 `CanvasEditor` 增加 `key={canvasData.id}`，确保切换 canvas 时 editor 和 Excalidraw 实例完整重建，并显式取消旧 canvas fallback polling；在 `CanvasEditor` 的 debounced autosave 路径增加与 flush 一致的保护：如果初始加载有 live elements，而当前待保存 live elements 为 0，则跳过本次保存并清理 pending save，防止空 scene 覆盖已有内容。
- 验证方式和结果: 扩展 `apps/web/test/canvas-editor-i18n.test.tsx`，模拟初始画布已有元素、水合完成后 Excalidraw 触发空元素 `onChange`，断言不会调用 `saveCanvas`；`pnpm --filter @aimc/web exec vitest run test/canvas-editor-i18n.test.tsx` 通过（3 个测试）；`pnpm --filter @aimc/web typecheck` 通过；`pnpm exec biome check --write apps/web/src/app/canvas/page.tsx apps/web/src/components/canvas-editor.tsx apps/web/test/canvas-editor-i18n.test.tsx` 通过。
- 是否已修复完: 是
- commit hash: `f9a0090`

### 24. 项目会话运行中切出/缩小后重进会话中断且画布为空

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/PYtzr9AjbezqrdcSD4ScR5Ctnpd
- 真实 record id: `recvmdxv7Zs08T`
- Bug 原因: 附件截图显示缩小/切出后重进，右侧会话仍有记录但画布为空；日志包 `/tmp/nextop-lark/recvmdxv7Zs08T/nextop-logs-20260611-151834.zip` 显示多个画布在运行/重进后先有数 MB `canvas.save OK`，随后出现同一 canvas `bodyBytes: 176` 的保存，说明空 scene 被前端 autosave 覆盖。日志中还出现 `Store is required but not available in runtime` 和本地 Codex skill frontmatter 警告，前者已由此前 BYOK/workspace skill route 修复覆盖，后者来自用户本机无效 skill 文件；本条直接导致画布为空和会话读取中断感的根因是空 scene 覆盖保存。
- 修复方案: 复用第 23 条代码修复：`CanvasEditor` 按 canvasId remount，切换 canvas 时取消旧 fallback polling；debounced autosave 增加“初始有元素但当前 live elements 为 0 则跳过保存”的保护，防止窗口缩小/切出/重进期间 Excalidraw 短暂空 scene 覆盖服务端画布内容。
- 验证方式和结果: 复用第 23 条回归测试和验证命令：`pnpm --filter @aimc/web exec vitest run test/canvas-editor-i18n.test.tsx` 通过（3 个测试），其中新增用例模拟水合后空 `onChange` 并断言不调用 `saveCanvas`；`pnpm --filter @aimc/web typecheck` 通过；`pnpm exec biome check --write apps/web/src/app/canvas/page.tsx apps/web/src/components/canvas-editor.tsx apps/web/test/canvas-editor-i18n.test.tsx` 通过。
- 是否已修复完: 是
- commit hash: `4626543`

## 页面复验补充（2026-06-11）

- 覆盖记录: `CEs9rj4F6eaarxcDFQycJR9Snkc`、`HIYUrIyx4eahWLcZP4bc6osznib`、`NxA6rEBNqevbj9cg4LDc3vBXnUU`、`PYtzr9AjbezqrdcSD4ScR5Ctnpd`。
- dev 服务: 已重启 `pnpm dev`，确认 web `3000` 与 server `3001` 均重新监听，server 日志显示 `@aimc/server listening on http://127.0.0.1:3001`。
- 画布恢复链路: 通过 API 创建两个受控项目/画布 `e5ba507b-e343-4b73-b9a9-e30347a97e47` 与 `bc942fda-487e-4b43-8b58-a9a64684dce6`，各自写入 1 个矩形元素；真实打开第一个画布，切到第二个，再切回第一个，等待 autosave 防抖后回读两个 canvas，结果均保持 `liveCount: 1`，未出现空画布覆盖。
- 技能附件输入链路: 真实打开 `/skills`，进入“添加自定义技能”，点击“添加文件”，填入 `assets/demo.txt` 与 `hello attachment plus`，快照显示路径和内容完整保留，继续输入不失焦、不清空。
- 生成面板遮挡链路: 真实打开画布，点击“AI 生成图片”出现面板；初次复验发现点击画布后面板仍保留，已追加代码修复；重启 dev 后再次打开同一页面，点击“AI 生成图片”再点击画布，面板从页面快照中消失，链路通过。
- 控制台: 真实页面复验期间无应用崩溃/加载失败类错误；仅剩 Next.js `scroll-behavior: smooth` warning 与浏览器 `Permissions policy violation: unload is not allowed` 报告，均与本批修复链路无关。
- 受限说明: 图片复制/裁剪复制涉及浏览器原生右键菜单和系统剪贴板，当前 Browser 自动化无法稳定读取系统剪贴板，页面复验以真实 canvas 页面打开为前提，核心复制像素逻辑由 `apps/web/test/canvas-context-menu-extensions.test.tsx` 覆盖；生成完成后删除占位仍依赖外部生图/视频模型凭证，真实页面未消耗模型额度，核心异步竞态由 `apps/web/test/canvas-generation-panels.test.tsx` 受控 Promise 覆盖。

## 追加批次（2026-06-11 晚间）

### 25. Agent 回复提供的下载链接未显示

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/UoHsrQ1LKexsntcFtokciotfncf
- 真实 record id: `recvme1Plq3qZG`
- Bug 原因: 附件截图显示 `persist_sandbox_file` 已成功上传生成文件，但聊天区“下载链接”位置只出现空白预览。根因是 local-agent 事件适配和 MCP tool gateway 只把 `generate_image` / `screenshot_canvas` 结果映射为 image artifact，`persist_sandbox_file` 返回的 `url` 没有进入 artifact；前端主聊天卡片也只对 `generate_image` 显示图片预览，导致持久化文件工具即使带有 artifact 也会落到普通工具卡片。
- 修复方案: 在 `local-agent-events` 与 `tool-gateway` 中把 `persist_sandbox_file` 的 `url` 归一为 image artifact；前端 `ToolBlockView` 对 `persist_sandbox_file` / `screenshot_canvas` 的图片 artifact 使用与生图一致的预览卡片展示，保留详情面板可查看原始输出。
- 验证方式和结果: 扩展 `apps/server/src/agent/runtime.test.ts`，覆盖 local-agent `persist_sandbox_file` tool result 会产出 image artifact；`pnpm --filter @aimc/server test -- src/agent/runtime.test.ts -t "workspace skills|persisted sandbox files"` 通过（实际运行 27 个 server 测试文件、137 个测试，全部通过）；`pnpm --filter @aimc/server typecheck` 通过；`pnpm --filter @aimc/web typecheck` 通过；`pnpm check:i18n` 通过。真实打开 `http://127.0.0.1:3000/canvas?id=e5ba507b-e343-4b73-b9a9-e30347a97e47&session=e9e2e4ab-60b2-4983-a881-1ff86236eb81`，通过本地 session API 写入一条带 `persist_sandbox_file` image artifact 的 assistant 消息，刷新页面后 DOM 显示 `AIMC persist artifact verification` 图片，`naturalWidth: 1`、`complete: true`，截图保存到 `/tmp/nextop-lark/aimc-persist-artifact-browser-verify-fixed.png`。
- 是否已修复完: 是
- commit hash: `25412a0`

### 26. 调用 Skill 会失败

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/PXVbr0z2ReNj6ucjDTEcDIgEnrg
- 真实 record id: `recvme1PLJbIXz`
- Bug 原因: 附件截图显示 local-agent 调用 `Ls` 读取 `/workspace-skills/canvas-design/SKILL.md` 时返回 `No files found`。日志中同一窗口还出现用户本机 skill frontmatter 警告和 agent 请求超时，但截图直接失败点是 workspace skill 路径被当作系统根目录下的绝对路径查找。当前应用会把 enabled workspace skills materialize 到本次 run 的工作目录 `workspace-skills/<slug>/...`，绝对 `/workspace-skills/...` 只能在 server deepagent store route 中成立，local-agent 原生 shell/file 工具不会自动映射。
- 修复方案: 在 local-agent runtime handoff prompt 中补充硬约束：workspace skill 文件已写入当前工作目录，shell/file 工具必须使用相对路径 `workspace-skills/<slug>/SKILL.md`，不得使用 `/workspace-skills/<slug>/SKILL.md`。保留既有 materialization 和 prompt 归一化逻辑，避免创建全局 `/workspace-skills` 链接污染宿主机器。
- 验证方式和结果: 扩展 `apps/server/src/agent/runtime.test.ts` 的 enabled local workspace skills 用例，断言 local-agent provider 收到的 prompt 包含相对路径约束，包含 `workspace-skills/canvas-director/SKILL.md`，且不包含 `/workspace-skills/canvas-director/SKILL.md`；`pnpm --filter @aimc/server test -- src/agent/runtime.test.ts -t "workspace skills|persisted sandbox files"` 通过（实际运行 27 个 server 测试文件、137 个测试，全部通过）；`pnpm --filter @aimc/server typecheck` 通过。真实打开本地 Canvas 页面并确认 web/server 均在线，Canvas 和聊天面板正常渲染；该链路的外部模型执行依赖本机 local-agent provider，未消耗真实模型调用，核心路径由 runtime 测试覆盖。
- 是否已修复完: 是
- commit hash: `814f8b4`

### 27. Download image 后仍聚焦导出选项

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/QT8yr7Jf3eEhETcQkircCvrQnch
- 真实 record id: `recvm7I9WbBRFI`
- Bug 原因: 附件录屏显示点击右键菜单 `Download image` 后，系统保存弹窗打开，但 Excalidraw 原生右键菜单仍停留在背后并保留焦点。现有 `closeNativeContextMenu` 只向触发按钮派发 Escape；在浏览器触发下载/保存弹窗抢焦点的时序下，Excalidraw 菜单节点可能尚未被卸载，导致导出选项残留。
- 修复方案: 在关闭原生菜单时先 blur 当前触发元素，再派发 Escape，并同步移除当前 `.excalidraw .context-menu` 节点，确保下载流程触发前菜单已经从 DOM 中退出。
- 验证方式和结果: 真实打开本地 Canvas 页面，脚本在 `.excalidraw` 下构造原生 context menu 节点，等待 `CanvasContextMenuExtensions` 注入 `data-testid="downloadImage"`，聚焦并点击该按钮；结果 `menuStillExists: false`，`activeElementTag: "BODY"`，证明点击下载后菜单立即关闭且不再聚焦导出选项。`pnpm --filter @aimc/web typecheck` 通过；`pnpm check:i18n` 通过；页面复验期间仅有既有 Next.js smooth-scroll warning 与浏览器 unload permissions 报告，和本修复无关。
- 是否已修复完: 是
- commit hash: `3f01f5b`

## 追加批次（2026-06-12）

### 28. Codex 本地 Agent 模型报错

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/PT1arjbLMe4La6cWIdUcgPyvnwf
- 真实 record id: `recvmeNOtjEFOm`
- Bug 原因: 附件日志中出现本地 agent provider/model 相关异常；现有模型发现链路会把 AIMC 不支持的 local-agent provider 也暴露到 `/models` 和前端选择器中，用户可能选到非 Codex/Claude 的本地 provider，进而触发 Codex 会话报错或异常模型 ID。另有模型描述信息未透传，导致前端列表缺少上下文。
- 修复方案: 服务端 local-agent provider 注册和 `/models` 输出统一限制为 AIMC 支持的 `codex`、`claude`；共享模型契约补充可选 `description`，前端模型选择器展示描述并隐藏 unsupported local provider 的默认标签；设置页本地 CLI 列表复用同一支持列表。
- 验证方式和结果: `pnpm --filter @aimc/server exec vitest run src/agent/local-agent-providers.test.ts src/http/models.test.ts` 通过（12 个测试）；`pnpm --filter @aimc/web exec vitest run test/agent-model-selector.test.tsx test/settings-page.test.tsx` 通过（30 个测试）；`pnpm --filter @aimc/web typecheck`、`pnpm check:i18n` 通过。
- 是否已修复完: 是
- commit hash: `待提交后回填`

### 29. 底部工具栏未自适应

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/ZkkkrcznWeH1nIc1pvEcezT8n8f
- 真实 record id: `recvm8aY2eSkK0`
- Bug 原因: 底部辅助工具栏只设置了左偏移和最大宽度，缺少右侧约束；内部按钮行使用单行 flex 和横向 overflow，在窗口变窄或侧栏占用画布宽度时会贴边/溢出，截图中红框位置即为该自适应缺口。
- 修复方案: 辅助工具栏根节点同时设置 `left`、`right: 16` 和 `maxWidth`，使其受当前视口宽度约束；内部工具行改为 `flex-wrap` 和 `max-w-full`，在紧凑宽度下换行而不是强制水平溢出；装饰 SVG 标记为 `aria-hidden`，保持静态检查通过。
- 验证方式和结果: 扩展 `apps/web/test/canvas-bottom-bar.test.tsx`，覆盖左侧面板打开时的宽度约束和紧凑工具换行；`pnpm --filter @aimc/web exec vitest run test/canvas-bottom-bar.test.tsx test/canvas-page.test.tsx test/settings-page.test.tsx` 通过（23 个测试）；`pnpm exec biome check apps/web/src/components/canvas-bottom-bar.tsx apps/web/test/canvas-bottom-bar.test.tsx` 通过。
- 是否已修复完: 是
- commit hash: `待提交后回填`

### 30. 设置弹窗保存后未关闭

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/MDe6ruSc5eVcI4cq0zLcWTgXnSh
- 真实 record id: `recvm8JaDq1Uh6`
- Bug 原因: `SettingsDialog` 内部复用 `SettingsPanel` 和 `AgentSettingsSection`；保存成功后只设置成功反馈，不通知 dialog 容器关闭，因此用户点击 Save 后仍停留在弹窗内，截图中可见成功状态但弹窗未退出。
- 修复方案: 为 `SettingsPanel`/`AgentSettingsSection` 增加可选 `onSaved` 回调；dialog 场景在保存成功后调用 `onOpenChange(false)`，页面设置场景保持原有成功反馈和停留行为。
- 验证方式和结果: 新增 `apps/web/test/settings-page.test.tsx` 回归用例，打开 `SettingsDialog`、修改 OpenAI API Key、点击 Save 后断言 `onOpenChange(false)` 被调用；`pnpm --filter @aimc/web exec vitest run test/settings-page.test.tsx` 通过，包含本批组合命令共 23 个目标测试通过；`pnpm --filter @aimc/web typecheck` 通过。
- 是否已修复完: 是
- commit hash: `待提交后回填`

### 31. 项目会话运行中切出/缩小后重进会话中断

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/PYtzr9AjbezqrdcSD4ScR5Ctnpd
- 真实 record id: `recvmdxv7Zs08T`
- Bug 原因: 本记录已在第 24 条修复过空 scene 覆盖保存；本次复核日志和截图仍指向“切换/重进期间旧异步结果或旧订阅影响当前 canvas”的同类竞态风险。Canvas 页面层面的 fallback generation watch 原先没有绑定启动时 canvasId，旧项目任务晚到时仍可能在当前页面回调，造成用户感知为会话/画布状态错乱。
- 修复方案: Canvas 页面在登记 fallback generation watch 时捕获当前 canvasId；任务成功回调前再次比对当前 canvasId，不一致则忽略，不再向当前画布插入旧项目结果。该保护与此前按 canvasId remount、取消旧 polling 的修复形成双保险。
- 验证方式和结果: 新增 `apps/web/test/canvas-page.test.tsx` 回归用例，模拟旧 canvas 启动 fallback image job，切到新 canvas 后旧 job 成功，断言不会调用 `insertImageOnCanvas`；`pnpm --filter @aimc/web exec vitest run test/canvas-page.test.tsx` 通过，并随本批组合命令验证 23 个前端目标测试通过。
- 是否已修复完: 是
- commit hash: `待提交后回填`

### 32. 上一个项目生成结果仍显示到新项目画布

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/JTVXrcoxleJlMucBzmccovJLn72
- 真实 record id: `recvm886lykM5s`
- Bug 原因: 第 5 条曾处理 ChatSidebar run 事件跨 canvas 插入，但仍漏掉 Canvas 页面自己登记的 generation job fallback watch；当用户在项目 A 生图过程中切到项目 B，项目 A 的 fallback watch 成功回调仍持有当前 Excalidraw API，可能把旧图插入项目 B 画布。
- 修复方案: 与第 31 条共用修复：fallback watch 启动时记录 source canvasId，成功回调时若页面已切到其他 canvas，则直接返回，不执行图片/视频插入。
- 验证方式和结果: `apps/web/test/canvas-page.test.tsx` 新增受控旧任务晚到测试，修复前会调用 `insertImageOnCanvas`，修复后不调用；`pnpm --filter @aimc/web exec vitest run test/canvas-page.test.tsx` 通过；`pnpm --filter @aimc/web typecheck`、`pnpm check:i18n` 通过。
- 是否已修复完: 是
- commit hash: `待提交后回填`
