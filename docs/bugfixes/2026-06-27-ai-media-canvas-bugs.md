# 2026-06-27 AI Media Canvas Bugs

## 1. Agnes 视频任务创建超时后画布失败但对话仍显示运行中

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/PGS0r7H59eXndpcMY1GcWIH6n7d
- 真实 record id: `recvnDgnlKX1k6`
- Bug 原因: 日志中第一次 Agnes 视频任务 `a205d1cf-ceb0-455c-8903-77c8602b9ad9` 使用 `agnes-video/agnes-video-v2.0`、`1080p`、`6s`，创建远端任务阶段超过本地 120s 限制后被标记为 `dead_letter`，且因 `timeout` 被视为可重试，同一创建请求会被重新提交直到 3 次失败。后续 agent 降配提交的新任务仍在运行，导致画布显示前一个失败节点，而对话侧继续按后一个 job 判断为运行中。
- 修复方案: Agnes 视频 Provider 在创建远端任务时每 60s 无回包即重新发起 create，最多 3 次；若仍拿不到 `taskId`，再让后台 job 进入失败终态，不再由 job 层额外重试一整轮。远端 task 已创建后的轮询超时仍保持不可重试并可通过已持久化 remote task id 恢复。
- 验证方式和结果: 实测 `POST /v1/videos` 最小 text-to-video create 请求 75s 无 response byte 并由 curl 超时，文本接口同 key 9s 返回，确认卡点在视频 create；`pnpm --filter @aimc/server exec vitest run src/generation/providers/agnes-video.test.ts src/features/jobs/executors/generation-executors.test.ts` 通过；`pnpm exec biome check apps/server/src/generation/providers/agnes-video.ts apps/server/src/generation/providers/agnes-video.test.ts apps/server/src/features/jobs/executors/video-generation.ts apps/server/src/features/jobs/executors/generation-executors.test.ts` 通过；`pnpm --filter @aimc/server typecheck` 通过。
- 是否已修复完: 是
- commit hash: `a906c0b`
