# Kie Market 接入规划

日期：2026-06-13

## 目标

接入 Kie.ai 聚合平台，用于 AIMC 的图片和视频生成：

- 图片：Z-Image、Seedream 5.0 Lite、GPT Image 2、Qwen2、Nano Banana Pro、Nano Banana
- 视频：Runway、Grok Imagine、Hailuo、Veo 3.1、Kling 2.6、Seedance 2.0、HappyHorse 1.0
- 场景：文生图、图生图、文生视频、图生视频

## 文档结论

Kie 有两类 API 形态：

- Market 统一任务：`POST /api/v1/jobs/createTask`，`GET /api/v1/jobs/recordInfo?taskId=...`
- 专用视频任务：Runway 使用 `/api/v1/runway/generate` 和 `/api/v1/runway/record-detail`；Veo 使用 `/api/v1/veo/generate` 和 `/api/v1/veo/record-info`

所有任务都是异步任务。提交成功只返回 `taskId`，需要轮询任务详情直到成功或失败。

## 图片模型映射

| AIMC model id | 文生图 Kie model | 图生图 Kie model | 关键参数 |
| --- | --- | --- | --- |
| `kie/z-image` | `z-image` | 不支持 | `prompt`, `aspect_ratio`, `nsfw_checker` |
| `kie/seedream-5-lite` | `seedream/5-lite-text-to-image` | `seedream/5-lite-image-to-image` | `image_urls`, `aspect_ratio`, `quality`, `nsfw_checker` |
| `kie/gpt-image-2` | `gpt-image-2-text-to-image` | `gpt-image-2-image-to-image` | `input_urls`, `aspect_ratio` |
| `kie/qwen2` | `qwen2/text-to-image` | `qwen2/image-edit` | `image_url`, `image_size`, `output_format`, `seed` |
| `kie/nano-banana-pro` | `nano-banana-pro` | `nano-banana-pro` | `image_input`, `aspect_ratio`, `resolution`, `output_format` |
| `kie/nano-banana` | `google/nano-banana` | `google/nano-banana-edit` | `image_urls`, `aspect_ratio`, `output_format` |

## 视频模型映射

| AIMC model id | API 形态 | 文生视频 | 图生视频 | 关键参数 |
| --- | --- | --- | --- | --- |
| `kie/runway` | Runway 专用 | root payload | root payload with `imageUrl` | `duration`, `quality`, `aspectRatio` |
| `kie/grok-imagine` | Market | `grok-imagine/text-to-video` | `grok-imagine/image-to-video` | `mode`, `duration`, `resolution`, `aspect_ratio`, `image_urls` |
| `kie/hailuo` | Market | `hailuo/02-text-to-video-pro` | `hailuo/02-image-to-video-pro` | `prompt_optimizer`, `image_url`, `end_image_url` |
| `kie/veo-3.1` | Veo 专用 | `generationType: TEXT_2_VIDEO` | `generationType: FIRST_AND_LAST_FRAMES_2_VIDEO` | `model: veo3_fast`, `imageUrls`, `aspect_ratio` |
| `kie/kling-2.6` | Market | `kling-2.6/text-to-video` | `kling-2.6/image-to-video` | `sound`, `duration`, `aspect_ratio`, `image_urls` |
| `kie/seedance-2` | Market | `bytedance/seedance-2` | `bytedance/seedance-2` | `first_frame_url`, `last_frame_url`, `generate_audio`, `resolution`, `duration` |
| `kie/happyhorse-1` | Market | `happyhorse/text-to-video` | `happyhorse/image-to-video` | `image_urls`, `resolution`, `duration`, `seed` |

## 已实现范围

- 新增 Kie server env：`AIMC_KIE_API_KEY` / `KIE_API_KEY`、`AIMC_KIE_BASE_URL` / `KIE_BASE_URL`
- 新增 workspace settings 字段：`kieApiKey`、`kieBaseUrl`
- 本地 sqlite settings schema 增加 `kie_api_key`、`kie_base_url`
- 新增 `KieClient`：统一鉴权、任务创建、任务查询、Kie 错误转换、结果 URL 解析
- 新增 `KieImageProvider`：覆盖 6 个图片模型与文生图/图生图映射
- 新增 `KieVideoProvider`：覆盖 7 个视频模型与文生视频/图生视频映射，支持后台 job remote task resume
- 在 `registerAllProviders` 中按 `kieApiKey` 注册 `kie-image` 和 `kie-video`
- 在 Web 设置页新增 Kie.ai 媒体 provider 卡片与中英文 i18n

## 验证计划

自动化验证：

- `pnpm --filter @aimc/shared exec vitest run src/contracts.test.ts`
- `pnpm --filter @aimc/server exec vitest run src/config/env.test.ts src/features/settings/settings-service.test.ts src/local/store.test.ts src/generation/providers/register-all.test.ts src/generation/providers/kie-client.test.ts src/generation/providers/kie-image.test.ts src/generation/providers/kie-video.test.ts`
- `pnpm --filter @aimc/web exec vitest run test/settings-page.test.tsx test/server-api.test.ts test/image-model-preference.test.tsx`
- `pnpm check:i18n`
- `pnpm typecheck`

真实接口 smoke：

- 图片：每个图片模型至少跑文生图；除 `kie/z-image` 外跑图生图
- 视频：每个视频模型跑文生视频和图生视频
- 每个任务记录：提交 payload、taskId、最终状态、结果 URL 是否存在
- Kie API Key 只通过环境变量传入，不写入仓库文件

## 待确认事项

- 真实 smoke 需要有效 Kie API Key，并会消耗 Kie credits
- 部分视频模型实际完成时间较长，smoke 轮询超时建议设置为 30 分钟
- 如果某个模型在真实接口返回参数校验错误，以 Kie 返回的错误为准调整映射

## 真实接口验证结果

验证时间：2026-06-13。

验证命令：

```bash
pnpm --filter @aimc/server exec tsx scripts/kie-smoke.ts
```

Kie API Key 通过进程环境变量传入，未写入仓库文件。早期专用视频接口有 3 次瞬时 `fetch failed`，后续单独重试同场景均成功，最终成功矩阵如下：

| 场景 | 任务 ID | 最终状态 |
| --- | --- | --- |
| `image-z-image-t2i` | `64722bc4c541db000629f33df8f8d7f6` | `success` |
| `image-seedream-5-lite-t2i` | `dce066f522c80a96202a79b6f16db2a5` | `success` |
| `image-seedream-5-lite-i2i` | `7b26e5ff9d895f63fc3d76aa1a3dfed5` | `success` |
| `image-gpt-image-2-t2i` | `e96349c9811c8552893f3f2ac9e81ad3` | `success` |
| `image-gpt-image-2-i2i` | `b849545c251274693bc1faee55b12ca9` | `success` |
| `image-qwen2-t2i` | `3b80ad0506de094af97a5af66558ac0e` | `success` |
| `image-qwen2-i2i` | `ff9e3a25f8698e4c86b90ce071875a80` | `success` |
| `image-nano-banana-pro-t2i` | `77e6f488158629fb1b0e069bb1ec6fc1` | `success` |
| `image-nano-banana-pro-i2i` | `47a00f501693b5b946a17917be3b5b50` | `success` |
| `image-nano-banana-t2i` | `c33e084c8642b44e55929f043a7d67d2` | `success` |
| `image-nano-banana-i2i` | `df1a363e617512a67c668d2765790c64` | `success` |
| `video-runway-t2v` | `8e466c4a0ce492c1fea7bc833f204c20` | `success` |
| `video-runway-i2v` | `1644d92b3889156896834d92fc11ae64` | `success` |
| `video-grok-imagine-t2v` | `b7eab96159b3103e3b8a0ba39356ceb2` | `success` |
| `video-grok-imagine-i2v` | `06f1846bd368250faa19511f55ed0a9d` | `success` |
| `video-hailuo-t2v` | `738e824563b5d15dddba512cba95ae60` | `success` |
| `video-hailuo-i2v` | `4d92bc90348d4f4e1f4213c538c2e462` | `success` |
| `video-veo-3-1-t2v` | `33679fb162f8dfe08b50207da5b79263` | `1` |
| `video-veo-3-1-i2v` | `65a3f11d0282df6f1b7d12614024adc8` | `1` |
| `video-kling-2-6-t2v` | `06e149ea610f14cbbd05019f65fb7f24` | `success` |
| `video-kling-2-6-i2v` | `a774ffde705414d0779b413356580ff8` | `success` |
| `video-seedance-2-t2v` | `3a5fbdf228973087ad3eca3e43c97d24` | `success` |
| `video-seedance-2-i2v` | `3f3e5eb39c8c562a8fbe7a43d9602268` | `success` |
| `video-happyhorse-1-t2v` | `dffeb63f98f463e92b9d088956f0adcf` | `success` |
| `video-happyhorse-1-i2v` | `a0faa5040fe609058f08c510dc385853` | `success` |
