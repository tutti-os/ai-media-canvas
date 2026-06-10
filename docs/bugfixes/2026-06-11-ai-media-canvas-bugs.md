# 2026-06-11 AI Media Canvas Bug 修复记录

## 1. 删除进行中会话后生成仍落入画布

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/Qbjfr1wk6e377McWdS2cIq6WnzG
- 真实 record id: `recvm7X7X6pcSA`
- Bug 原因: 删除 chat session 只删除了会话和消息数据，没有终止该 session 关联的 agent run 和后台生成 job；异步生成任务完成后仍可能被后续轮询/恢复逻辑写回画布。日志窗口 `2026-06-10 16:22:32 +/-30min` 内出现 cancel 请求但未形成有效终态，和会话生命周期未绑定一致。
- 修复方案: 在本地 store 删除 session 前，将该 session 下 `accepted/running` 的 agent run 更新为 `canceled` 并写入 `run.canceled` 终态事件，同时取消关联的 `queued/running/failed` 后台 job；保护 job 的 succeeded/failed 写回，避免 canceled job 被晚到 worker 覆盖。
- 验证方式和结果: 新增 `apps/server/src/local/store.test.ts` 回归用例，验证删除 session 会取消 run/job 且 late success/failure 不会覆盖 canceled；`pnpm --filter @aimc/server test -- src/local/store.test.ts` 通过；`pnpm --filter @aimc/server typecheck` 通过。
- 是否已修复完: 是
- commit hash: `92c01ca`
