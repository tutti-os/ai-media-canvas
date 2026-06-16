# Codex Imagegen Provider 接入规划

## 目标

在 AIMC 中支持用户本机 Codex 的 `imagegen/image_gen` 生图能力，并把它抽象为 `generate_image` 的一个动态 image provider/model，而不是向 local agent 暴露第二套会绕过画布流程的生图工具。

最终形态：

- AIMC agent 仍只调用 `generate_image`。
- 服务端检测本机 Codex CLI、登录状态、`--full-auto`、系统 `imagegen` skill 是否可用。
- 用户显式启用且检测通过后，模型列表动态出现 `codex/gpt-image-2`。
- provider 内部通过 `codex exec` 调用 Codex 自带生图能力，解析 `SAVED: <path>`，再把图片读回成 AIMC 可消费的 `GeneratedImage`。

## 调研结论

### AIMC 当前链路

- `apps/server/src/agent/tools/image-generate.ts` 是 agent 侧 canonical `generate_image` 工具入口。它从 `getAvailableImageModels()` 生成模型枚举，并通过 `resolveImageProviderName()` 找到 provider。
- `apps/server/src/generation/providers/register-all.ts` 负责注册 image/video provider。OpenAI 官方图像 provider 目前只在 `OPENAI_API_KEY` 存在且 base URL 是官方 `https://api.openai.com/v1` 时注册。
- `apps/server/src/agent/local-agent-host/tool-gateway.ts` 只对 canonical `generate_image` 的输出执行“生成后自动加入画布”的逻辑。
- `apps/server/src/generation/generated-asset.ts` 支持读取 `data:` 和 HTTP(S) URL，不适合直接返回本地绝对路径。因此 Codex provider 最终应返回 data URI，或走 AIMC 现有上传/持久化链路后返回可拉取 URL。

### Codex `imagegen` skill

Codex 系统 `imagegen` skill 有两层能力：

- 默认路径：调用 Codex host 内置的 `image_gen` 工具，不需要 `OPENAI_API_KEY`，输出通常落在 `$CODEX_HOME/generated_images/...`。
- fallback CLI/API 路径：运行 skill 内的 `scripts/image_gen.py`，需要 `OPENAI_API_KEY`，可显式传模型、尺寸、质量、透明背景等参数。

对 AIMC 来说，应优先接第一条路径，因为它对应用户问题里的“使用 Codex 本身的 gpt image 2.0 能力”。但它不是普通 OpenAI API，也不是 local agent 默认可以枚举到的 MCP 工具；需要通过 Codex CLI/host 包一层。

### 参考库 `codex-image-in-cc`

参考库 [KingGyuSuh/codex-image-in-cc](https://github.com/KingGyuSuh/codex-image-in-cc) 的关键做法：

- 它不自己实现生图模型，也不直接调用 OpenAI Images API。
- Claude Code 插件命令把用户请求转成 `codex exec --full-auto ...`。
- prompt 要求 Codex 使用自带 `imagegen` skill，并把最终文件保存到 workspace。
- 脚本解析 Codex 输出里的 `SAVED: <path>` 作为最终结果。
- `status` 命令检查 Node 版本、Codex CLI 版本、`codex login status`、`codex exec --full-auto --help`、以及 `$CODEX_HOME/skills/.system/imagegen/SKILL.md`。

AIMC 可以复用这种“外层 wrapper + `SAVED:` 约定”的桥接模式，但不应把 `/codex-image:*` 或 `image_gen` 直接暴露给 AIMC agent。

## 设计决策

1. `generate_image` 仍是唯一给 AIMC agent 使用的生图工具。
2. Codex Imagegen 作为 image provider/model 注册，例如 `codex/gpt-image-2`。
3. 只有“用户显式启用 + 本机能力检测通过”时才动态注册该模型。
4. MVP 先支持 text-to-image；image edit 放到后续阶段，因为 Codex CLI 的 `--image` 输入、画布素材导出、本地临时文件映射都需要更完整的安全边界。
5. provider 不读取或要求 `OPENAI_API_KEY`，依赖用户本机 `codex login` 状态。
6. provider 运行 `codex exec` 时使用临时工作目录，并要求 Codex 把最终图片保存到该目录内，再验证路径边界。
7. provider 返回 `data:image/png;base64,...`，兼容现有 `loadGeneratedAsset()` 和画布插入流程。

## 能力检测模型

新增 capability detector，输出稳定状态对象：

```ts
export type CodexImagegenUnavailableReason =
  | 'disabled'
  | 'codex_not_found'
  | 'codex_version_too_old'
  | 'codex_not_logged_in'
  | 'full_auto_unavailable'
  | 'imagegen_skill_missing'
  | 'probe_failed';

export interface CodexImagegenCapability {
  ready: boolean;
  reasons: CodexImagegenUnavailableReason[];
  codexPath?: string;
  codexVersion?: string;
  codexHome?: string;
  checkedAt: string;
}
```

检测项：

- `codex --version` 可执行，版本不低于参考库建议的 `0.124.0`。
- `codex login status` 显示已登录。
- `codex exec --full-auto --help` 可用。
- `$CODEX_HOME/skills/.system/imagegen/SKILL.md` 存在；没有显式 `CODEX_HOME` 时检查默认 `~/.codex`。
- 检测结果缓存短时间，例如 30 秒，避免 `/api/image-models` 或工具 schema 构建时频繁 spawn Codex。
- 用户点击“测试”时可以执行一次 canary；普通模型枚举不应自动真实生图。

## 文件改动范围

预计新增或修改：

```text
apps/server/src/generation/providers/codex-imagegen-capability.ts
apps/server/src/generation/providers/codex-imagegen.ts
apps/server/src/generation/providers/codex-imagegen.test.ts
apps/server/src/generation/providers/codex-imagegen-capability.test.ts
apps/server/src/generation/providers/register-all.ts
apps/server/src/config/env.ts
packages/shared/src/contracts.ts
apps/server/src/features/settings/settings-service.ts
apps/server/src/http/settings.ts
```

MVP 默认启用 Codex Imagegen 的 capability detection，不在设置页新增 Codex Imagegen 开关。只有显式设置 `AIMC_CODEX_IMAGEGEN_ENABLED=false` 时关闭。

## 实施步骤

### 1. 增加环境变量

目标：让 Codex Imagegen 默认随本机 Codex 能力可用而出现，同时保留环境变量作为部署侧禁用入口。

- [ ] 在 server env 中新增 `AIMC_CODEX_IMAGEGEN_ENABLED`、`AIMC_CODEX_IMAGEGEN_TIMEOUT_MS`、`AIMC_CODEX_HOME`。
- [ ] `AIMC_CODEX_IMAGEGEN_ENABLED` 默认 true，显式 false/off/0/no 时关闭。
- [ ] 不在 workspace settings contract 中新增 Codex Imagegen 开关。

验证：

- [ ] 单元测试覆盖默认开启、env 显式关闭。
- [ ] 显式关闭或 capability 不 ready 时 `getAvailableImageModels()` 不出现 `codex/gpt-image-2`。

### 2. 实现 Codex Imagegen 能力检测

目标：在注册 provider 前知道本机 Codex 是否足够可用。

- [ ] 新增 `codex-imagegen-capability.ts`。
- [ ] 使用 `execFileSync` 或可注入 runner 执行短命令，所有命令设置小超时。
- [ ] 解析 `codex --version`，低于最低版本时返回 `codex_version_too_old`。
- [ ] 执行 `codex login status`，失败或未登录时返回 `codex_not_logged_in`。
- [ ] 执行 `codex exec --full-auto --help`，失败时返回 `full_auto_unavailable`。
- [ ] 检查 `imagegen/SKILL.md` 是否存在。
- [ ] 添加 TTL cache，cache key 至少包含 `codexBin`、`codexHome`、enabled flag。

验证：

- [ ] fake runner 测试 `codex_not_found`。
- [ ] fake runner 测试版本过低。
- [ ] fake runner 测试未登录。
- [ ] fake filesystem 测试 skill 缺失。
- [ ] 全部通过时 `ready: true` 且 `reasons: []`。

### 3. 实现 `CodexImagegenProvider`

目标：把 Codex CLI 桥接成 AIMC 的 `ImageProvider`。

- [ ] 新增 `codex-imagegen.ts`，实现现有 `ImageProvider` 接口。
- [ ] provider 元数据使用 `name: 'codex-imagegen'`，模型使用 `codex/gpt-image-2`。
- [ ] `generateImage(params)` 创建临时 run directory，例如系统 tmp 下的 `aimc-codex-imagegen-*`。
- [ ] 构造 Codex prompt，要求使用系统 `imagegen` skill、生成单张图片、保存到 run directory 下固定路径、最后输出 `SAVED: <absolute path>`。
- [ ] 使用 argv 调用，不使用 shell 拼接：

```text
codex exec --full-auto --skip-git-repo-check -C <runDir> -- <instruction>
```

- [ ] 捕获 stdout/stderr，超时后 kill 进程并返回清晰错误。
- [ ] 解析最后一个 `SAVED:` 路径。
- [ ] 将相对路径 resolve 到 run directory。
- [ ] 验证最终文件必须在 run directory 内。
- [ ] 读取图片 bytes，返回 `data:image/png;base64,...`。
- [ ] dimensions 先用请求的 aspect ratio 推导值；若后续已有图片尺寸读取工具，再替换为真实尺寸。

验证：

- [ ] 测试生成命令 argv 正确。
- [ ] 测试 prompt 包含用户 prompt、aspect ratio、quality、output path。
- [ ] 测试可解析 `SAVED: /tmp/.../result.png`。
- [ ] 测试没有 `SAVED:` 时失败。
- [ ] 测试 `SAVED:` 指向 run directory 外部时失败。
- [ ] 测试成功时返回 data URI 和 `mimeType: 'image/png'`。
- [ ] 测试超时错误。

### 4. 动态注册 provider 与模型枚举

目标：让 `generate_image` 工具 schema 自动出现或隐藏 Codex 模型。

- [ ] 在 `register-all.ts` 中读取 Codex Imagegen enable flag。
- [ ] enable flag 为 true 时调用 capability detector。
- [ ] capability ready 时注册 `new CodexImagegenProvider(...)`。
- [ ] capability 不 ready 时不注册，并记录 debug log/reason。
- [ ] 确认 `getAvailableImageModels()` 可以包含 `codex/gpt-image-2`。
- [ ] 确认 `createImageGenerateTool()` 的 `model` enum 自动包含该模型。

验证：

- [ ] enabled + ready 时模型列表出现 `codex/gpt-image-2`。
- [ ] disabled 时模型列表不出现。
- [ ] enabled + not ready 时模型列表不出现，并可查看 reason。
- [ ] local agent prompt 无需新增第二个工具，仍建议使用 `generate_image`。

### 5. 增加状态 API

目标：让调用方能知道为什么 Codex Imagegen 不可用。

- [ ] 在 settings 或 media provider API 中返回 Codex Imagegen capability 状态。

验证：

- [ ] endpoint 可返回 disabled、ready、not logged in、skill missing 等状态。
- [ ] 响应不把内部 stack trace 暴露给用户。

### 6. 端到端验证

目标：确认 local agent 到画布的完整链路可用。

- [ ] 本机执行 `codex login status`，确认登录。
- [ ] 确认未设置 `AIMC_CODEX_IMAGEGEN_ENABLED=false`。
- [ ] 打开 AIMC，检查 image model list 出现 `codex/gpt-image-2`。
- [ ] 让 local agent 执行一次生成请求，并选择 Codex 模型。
- [ ] 确认 `generate_image` 工具返回成功。
- [ ] 确认图片被 `tool-gateway.ts` 的现有逻辑加入画布。
- [ ] 确认不会出现独立 `image_gen` 工具，也不会产生只存在于 `$CODEX_HOME/generated_images` 但画布不可见的结果。

建议验证命令：

```text
pnpm --filter @ai-media-canvas/server test -- codex-imagegen
pnpm typecheck
```

## 风险与边界

- Codex 内置 `image_gen` 不是稳定公开 API，CLI 输出格式也不是强契约。必须通过 prompt 强制 `SAVED:`，并把解析逻辑写得保守。
- Codex 生图会消耗用户 Codex 侧额度。默认启用 capability detection；如果部署侧不希望暴露该能力，需要设置 `AIMC_CODEX_IMAGEGEN_ENABLED=false`。
- 真实生图速度可能较慢，server provider timeout 默认建议 5 分钟。
- Codex CLI 可能依赖当前用户登录态；服务进程运行用户必须与登录 Codex 的用户一致。
- 如果未来 Codex CLI 提供正式可枚举 tool 或 MCP 接口，可以把 provider 内部实现替换掉，外部仍保持 `generate_image` 模型不变。

## 后续扩展

- 支持 image edit：把画布选中图片导出为临时本地文件，并在 Codex CLI 调用中传 `--image <path>`。
- 支持多张输出：解析多个 `SAVED:` 行，并把多个 `GeneratedImage` 返回给 AIMC。
- 支持透明背景：根据 Codex skill 规则优先使用内置 chroma-key 工作流；需要原生透明时再走 API fallback，并要求用户确认 API key。
- 支持 canary 生图：在状态 API 中提供一次性测试，但不在普通模型枚举中自动执行。
