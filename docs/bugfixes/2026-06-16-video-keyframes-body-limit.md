# 2026-06-16 Video Keyframes Body Limit

## 生成视频附上首帧和尾帧报错

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/OwQkrWFYteQcOscpzS5ccnFbnhi
- 真实 record id: `recvmGHuzfobTb`
- Bug 现象: 在 AI Media Canvas 视频生成面板选择“首尾帧”并上传首帧/尾帧后，生成节点显示“生成失败”，toast 显示 `Request failed`。
- 附件: `/tmp/feishu-bug-runner/recvmGHuzfobTb/image.png`, `/tmp/feishu-bug-runner/recvmGHuzfobTb/tutti-logs-20260616-150028.zip`
- Bug 原因: 日志中 `/api/jobs/video-generation` 返回 `413 Request body is too large`。首尾帧会以 base64 data URL 放入 `input_images` JSON payload，而视频生成 job 路由未配置 body limit，仍使用 Fastify 默认 1 MB 限制，导致请求在进入业务逻辑前被拦截。
- 修复方案: 为 `/api/jobs/video-generation` 配置 10 MB route-level `bodyLimit`，与已有 chat/canvas base64 payload 路由策略对齐；新增 HTTP 回归测试，构造大于 1 MB 的首尾帧 data URL payload，确认请求能进入 `createVideoJob`。
- 验证方式和结果: `pnpm --filter @aimc/server test -- src/http/jobs.test.ts` 通过（Vitest 实际运行 38 个 server 测试文件、230 个测试）；`pnpm --filter @aimc/server typecheck` 通过；`pnpm exec biome check apps/server/src/http/jobs.ts apps/server/src/http/jobs.test.ts` 通过。
- 是否已修复完: 是
- commit hash: `待提交后回填`
