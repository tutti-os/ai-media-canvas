# 2026-06-15 OpenAI Image Provider Gating

## Feishu Records

### 1. Selected-image follow-up generation fails

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/U7xBrhT70eDQJHcF5h0cIbEYn7g
- 真实 record id: `recvmv8YAwsJqz`
- Bug 现象: 选中图片后追加指令修改没有响应，截图中多个生成节点失败并显示 `Failed to get response`。
- 附件: `/tmp/feishu-bug-runner/recvmv8YAwsJqz/tutti-logs-20260614-153509.zip`, `/tmp/feishu-bug-runner/recvmv8YAwsJqz/image.png`

### 2. Superhero comic prompt template cannot generate

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/L2TvrawAXe4M7YcXzgAc6rOenLh
- 真实 record id: `recvmvb1ILHaCY`
- Bug 现象: 推荐指令里的“视觉概念-超级英雄漫画”prompt 不完整，导致无法生成。
- 附件: `/tmp/feishu-bug-runner/recvmvb1ILHaCY/image-1.png`, `/tmp/feishu-bug-runner/recvmvb1ILHaCY/image-2.png`

### 3. GPT Image 401

- Bug 链接: https://ccn53rwonxso.feishu.cn/record/UphPrpXefemE9GcNhwbcflONnld
- 真实 record id: `recvmuJ4lfLK3o`
- Bug 现象: 生图过程中 `Gpt Image 1.5` 卡片失败，截图显示 `401 Incorrect API key provided`；同一会话中 Agnes Image 2.1 Flash 可继续生成，说明失败集中在 OpenAI official 图片 provider 的凭证/endpoint 判断。
- 附件: `/tmp/feishu-bug-runner/recvmuJ4lfLK3o/tutti-logs-20260614-135107.zip`, `/tmp/feishu-bug-runner/recvmuJ4lfLK3o/image.png`

## Cause

`registerAllProviders` 只检查 `openAIApiKey` 就注册 `OpenAIImageProvider`，没有区分 `openAIApiBase` 是否为 OpenAI 官方 endpoint。当用户配置 DeepSeek/OpenRouter/其他 OpenAI-compatible provider 的 key/base URL 时，服务端仍会把官方 `gpt-image-*` 模型暴露到图片模型列表和 agent 工具 schema，最终用兼容网关 key 调 OpenAI official image API，出现 401 或生成失败。

前端 `hasConfiguredImageProvider` 也只检查 `openAIApiKey`，会把非官方 OpenAI-compatible 配置误判为可用图片 provider。

## Fix

- 新增 `isOfficialOpenAIImageBaseURL()`，仅允许空 base URL（SDK 默认 OpenAI official）或 `https://api.openai.com/v1` 注册 `OpenAIImageProvider`。
- `registerAllProviders` 在非官方 `openAIApiBase` 下不再注册官方 `gpt-image-*` 图片模型。
- 前端媒体 provider 配置判断同步要求 OpenAI official endpoint，避免 OpenAI-compatible gateway 被当作可用官方生图 provider。
- 新增 server/web 回归测试覆盖官方 endpoint、空 endpoint 和非官方 OpenAI-compatible gateway。

## Verification

- `pnpm --filter @aimc/shared build`: passed
- `pnpm --filter @aimc/server exec vitest run src/generation/providers/register-all.test.ts src/http/models.test.ts`: passed
- `pnpm --filter @aimc/server typecheck`: passed
- `pnpm --filter @aimc/web exec vitest run test/media-provider-configuration.test.ts test/chat-input.test.tsx test/image-model-preference.test.tsx`: passed
- `pnpm --filter @aimc/web typecheck`: passed
- `pnpm check:i18n`: passed
- `pnpm exec biome check apps/server/src/generation/providers/openai-image.ts apps/server/src/generation/providers/register-all.ts apps/server/src/generation/providers/register-all.test.ts apps/web/src/lib/media-provider-configuration.ts apps/web/test/media-provider-configuration.test.ts`: passed after formatting

## Status

- Fixed: yes
- Commit: `d94a25a`
