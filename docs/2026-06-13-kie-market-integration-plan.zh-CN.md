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

## AIMC API 级验证结果

补充验证时间：2026-06-13。

验证范围改为 AIMC 对外接口，而不是 provider 直连：

- `GET /api/image-models`
- `GET /api/video-models`
- `POST /api/agent/generate-image`
- `POST /api/agent/generate-video`

启动方式：

```bash
AIMC_SERVER_PORT=4319 AIMC_DATA_ROOT=/tmp/aimc-kie-api-smoke-data AIMC_KIE_API_KEY=... node --import tsx ./src/server.ts
AIMC_SERVER_PORT=4319 AIMC_DATA_ROOT=/tmp/aimc-kie-api-smoke-data AIMC_KIE_API_KEY=... AIMC_WORKER_ID=kie-api-smoke-worker node --import tsx ./src/worker.ts
AIMC_API_BASE_URL=http://127.0.0.1:4319 pnpm --filter @aimc/server exec tsx scripts/aimc-kie-api-smoke.ts
```

模型列表接口验证结果：

- `/api/image-models` 返回 6 个 Kie 图片模型：`kie/z-image`、`kie/seedream-5-lite`、`kie/gpt-image-2`、`kie/qwen2`、`kie/nano-banana-pro`、`kie/nano-banana`
- `/api/video-models` 返回 7 个 Kie 视频模型：`kie/runway`、`kie/grok-imagine`、`kie/hailuo`、`kie/veo-3.1`、`kie/kling-2.6`、`kie/seedance-2`、`kie/happyhorse-1`

接口生成结果：

- 图片：11/11 通过 `POST /api/agent/generate-image`，本地资产表产生 11 个 `image/png`
- 视频：14/14 通过 `POST /api/agent/generate-video`，本地 job 均为 `succeeded`
- 视频本地资产表产生 15 个 `video/mp4`，其中包含 `kie/seedance-2` 文生视频复测产生的 1 个额外资产
- 首轮全量 AIMC API smoke 中 `video-seedance-2-t2v` 的客户端 `fetch` 曾瞬时失败；对应后台 job 实际成功并写入资产，随后单并发复测同一 AIMC 接口也成功，复测报告 `failures: []`

图片接口资产矩阵：

| 场景 | AIMC model id | 本地 asset id | MIME |
| --- | --- | --- | --- |
| 文生图 | `kie/z-image` | `7146fa1b-93dc-47c0-b509-e2f7681ef380` | `image/png` |
| 文生图 | `kie/seedream-5-lite` | `ea488a97-d5bf-4d13-9537-b727388e03cc` | `image/png` |
| 图生图 | `kie/seedream-5-lite` | `02a801d7-697c-4670-98ff-b9a4476a5466` | `image/png` |
| 文生图 | `kie/gpt-image-2` | `fb958dc6-2abc-432c-9eed-bb560a16d438` | `image/png` |
| 图生图 | `kie/gpt-image-2` | `d96ea1b7-44be-4dc2-91a7-eff806d7f290` | `image/png` |
| 文生图 | `kie/qwen2` | `351315ff-0b43-496d-a59f-685cc654f805` | `image/png` |
| 图生图 | `kie/qwen2` | `7729966a-87a7-4aae-8f9b-8152a03bbc2e` | `image/png` |
| 文生图 | `kie/nano-banana-pro` | `73ae7a7f-15dd-48e3-a69b-bf1c77898c4a` | `image/png` |
| 图生图 | `kie/nano-banana-pro` | `fac22d48-61d3-4cfb-899b-5f613efc8432` | `image/png` |
| 文生图 | `kie/nano-banana` | `cc852189-b999-4017-a13c-d5a893581687` | `image/png` |
| 图生图 | `kie/nano-banana` | `82f7185d-99e1-4eb1-aec7-3178d55b3783` | `image/png` |

视频接口 job/资产矩阵：

| 场景 | AIMC model id | 远端 task id | 本地 asset id | 结果 |
| --- | --- | --- | --- | --- |
| 文生视频 | `kie/runway` | `721c6615e8f09fc7a2a97f69d60b3bf2` | `2149510a-f75f-4fd9-827c-e8e3a519a113` | `succeeded` |
| 图生视频 | `kie/runway` | `ad00c488bedec698336f80f1216a9017` | `ec7129db-2dcd-44e7-b32c-b0f576a74222` | `succeeded` |
| 文生视频 | `kie/grok-imagine` | `14ba613b8a3db26ff8ea3a4c4746a258` | `0251d830-c479-4a3f-a62c-27a3e48c40f5` | `succeeded` |
| 图生视频 | `kie/grok-imagine` | `0f5f4616a20159962989271547234f54` | `50072d60-14f8-4955-ba96-ea60ee41044a` | `succeeded` |
| 文生视频 | `kie/hailuo` | `05611b7dc5d001dc515284b34d3add28` | `9ae805ec-abd9-49e0-bab9-82bcda660447` | `succeeded` |
| 图生视频 | `kie/hailuo` | `588fa997c5b305731290f6706c783efb` | `5ae3e7bc-d15c-461c-8b83-a03c1ce425d6` | `succeeded` |
| 文生视频 | `kie/veo-3.1` | `df8923c1242267171169b607e531c564` | `90004af6-6490-4aa1-baba-e952113320f7` | `succeeded` |
| 图生视频 | `kie/veo-3.1` | `9fe6f44aa5f206c1f7df599e4dbe9920` | `fb61a1b4-d737-4319-9188-6abdbc076a57` | `succeeded` |
| 文生视频 | `kie/kling-2.6` | `7ac60a5fe6b31c513996d863b10878b2` | `a32cc459-c399-41ef-9858-a0cd9ef8a6e2` | `succeeded` |
| 图生视频 | `kie/kling-2.6` | `cc757286fd9b604d6588755608684c64` | `5c017b89-8e39-4ea6-9428-f1eb03ab7688` | `succeeded` |
| 文生视频 | `kie/seedance-2` | `82a2289c4e1a0bbd976a06b05e2fd79f` | `f1b5b180-5ab2-42bc-8f42-515d00883d03` | `succeeded` |
| 图生视频 | `kie/seedance-2` | `d921ee7b5a2dc905d26783359acac74c` | `ee135c53-2829-495f-8130-9b122e42241d` | `succeeded` |
| 文生视频复测 | `kie/seedance-2` | `38ae9c26f9e1cacaa41428496e37b6ea` | `33430119-7a44-4126-98b4-4766f883579a` | `succeeded` |
| 文生视频 | `kie/happyhorse-1` | `215263101176b454844740169013cd32` | `55b03552-0d87-43a3-b82b-4e07d91bf23d` | `succeeded` |
| 图生视频 | `kie/happyhorse-1` | `c4ea8162a3856bbf80c2db28de6d22cf` | `67865b34-7d08-4603-97b4-29a017c84452` | `succeeded` |
