# Nextop CLI Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose AI Media Canvas capabilities to the Nextop app CLI through `nextop.cli.json` and `/nextop/cli/*` HTTP handlers.

**Architecture:** The packaged app manifest will declare a CLI manifest, the package script will generate `nextop.cli.json` plus command help docs, and the Fastify server will register a small CLI adapter layer. CLI routes must not duplicate existing HTTP route business logic; shared operations should live in service/use-case helpers that are called by both normal `/api/*` routes and `/nextop/cli/*` routes.

**Tech Stack:** TypeScript, Fastify, Zod shared contracts, pnpm/turbo, Node test runner, Vitest.

---

## Source Context

Reference spec read from:

- `/Users/wwcome/work/nextop-os/nextop/services/nextopd/service/workspace/app_factory_reference/references/manifest-contract.md`
- `/Users/wwcome/work/nextop-os/nextop/services/nextopd/service/workspace/app_factory_reference/references/cli-manifest-contract.md`
- `/Users/wwcome/work/nextop-os/nextop/services/nextopd/service/workspace/app_factory_reference/references/nextop-cli-commands.md`
- `/Users/wwcome/work/nextop-os/nextop/services/nextopd/service/workspace/app_factory_reference/references/runtime-env.md`
- `/Users/wwcome/work/nextop-os/nextop/services/nextopd/service/workspace/app_factory_reference/references/validation-checklist.md`

Current AIMC surfaces already available:

- Package generation: `scripts/package-nextop-app.mjs`
- Package tests: `tests/package-nextop-app.test.mjs`
- Server composition: `apps/server/src/app.ts`
- Existing HTTP modules: `apps/server/src/http/*.ts`
- Shared schemas: `packages/shared/src/contracts.ts`, `packages/shared/src/http.ts`, `packages/shared/src/job-contracts.ts`, `packages/shared/src/skill-contracts.ts`

## Constraints From Nextop CLI Contract

- `nextop.app.json` must include:

```json
{
  "cli": {
    "manifest": "nextop.cli.json"
  }
}
```

- `nextop.cli.json` must use `schemaVersion: "nextop.app.cli.v1"`.
- `scope` and every command path segment must be lowercase letters, numbers, and hyphen only.
- Command `path` must not repeat the scope.
- Every handler must be HTTP `POST`.
- Every handler path must start with `/nextop/cli/`.
- Handler responses must be `CliCommandOutput`, for example:

```json
{
  "kind": "json",
  "value": {
    "ok": true
  }
}
```

- CLI input schemas are intentionally small: object properties can only be `string`, `boolean`, or `integer`. Complex values should be accepted as JSON strings or comma-separated strings only when needed.

## Agent Discovery Contract

Nextop currently injects a generated CLI command guide into local agent runtimes. The injected guide is built from CLI capabilities, especially command `path`, `summary`, `description`, and required input fields. `COMMANDS.md` is registered as `documentation.file` and appears in CLI help as a documentation path, but its full contents are not automatically injected into model context.

Because of that, this plan should make every command's `summary`, `description`, and required input schema self-contained enough for an agent to choose and call the command from the injected guide. `COMMANDS.md` remains useful for human help and manual inspection, but it must not be the only place that explains required sequencing or command intent.

Do not add a separate `aimc workflows` command group. Agents should discover available AIMC operations through the normal Nextop command guide and `--help` surfaces, then compose the resource commands directly.

## Capability Boundary

### P0 Commands To Expose

Use `scope: "aimc"` in `nextop.cli.json`.

| CLI command | Handler | Purpose |
| --- | --- | --- |
| `aimc status` | `/nextop/cli/status` | Return server health, app version, default runtime metadata. |
| `aimc projects list` | `/nextop/cli/projects/list` | List projects. |
| `aimc projects get --project-id <id>` | `/nextop/cli/projects/get` | Return one project. |
| `aimc projects create --name <name> [--description <text>]` | `/nextop/cli/projects/create` | Create a project. |
| `aimc canvases get --canvas-id <id>` | `/nextop/cli/canvases/get` | Return canvas content. |
| `aimc canvases save --canvas-id <id> --content-json <json>` | `/nextop/cli/canvases/save` | Save canvas content from a JSON string. |
| `aimc sessions list --canvas-id <id>` | `/nextop/cli/sessions/list` | List chat sessions for a canvas. |
| `aimc sessions create --canvas-id <id> [--title <title>]` | `/nextop/cli/sessions/create` | Create a chat session. |
| `aimc messages list --session-id <id>` | `/nextop/cli/messages/list` | List messages for a session. |
| `aimc messages create --session-id <id> --role <role> --content <text>` | `/nextop/cli/messages/create` | Append a text-only chat message. |
| `aimc agent run --session-id <id> --conversation-id <id> --prompt <text> [...]` | `/nextop/cli/agent/run` | Start an agent run. |
| `aimc agent events --run-id <id> [--cursor <n>]` | `/nextop/cli/agent/events` | Poll persisted run events. |
| `aimc agent cancel --run-id <id>` | `/nextop/cli/agent/cancel` | Cancel a run. |
| `aimc generation image --prompt <text> [...]` | `/nextop/cli/generation/image` | Queue image generation. |
| `aimc generation video --prompt <text> [...]` | `/nextop/cli/generation/video` | Queue video generation. |
| `aimc jobs list [--status <status>] [--job-type <type>]` | `/nextop/cli/jobs/list` | List background jobs. |
| `aimc jobs get --job-id <id>` | `/nextop/cli/jobs/get` | Return one job. |
| `aimc jobs cancel --job-id <id>` | `/nextop/cli/jobs/cancel` | Cancel one job. |
| `aimc models list` | `/nextop/cli/models/list` | List agent models. |
| `aimc models image` | `/nextop/cli/models/image` | List image models. |
| `aimc models video` | `/nextop/cli/models/video` | List video models. |
| `aimc skills list` | `/nextop/cli/skills/list` | List installed skills. |
| `aimc skills get --skill-id <id>` | `/nextop/cli/skills/get` | Return skill detail. |
| `aimc skills enable --skill-id <id> --enabled <bool>` | `/nextop/cli/skills/enable` | Enable or disable a skill. |
| `aimc skills install --skill-id <id>` | `/nextop/cli/skills/install` | Install a bundled catalog skill. |

### Not P0

- File upload commands: current upload routes are multipart and the Nextop CLI manifest input subset does not model file inputs.
- WebSocket streaming: CLI should use `agent run` plus `agent events` polling, not direct `WS /api/ws`.
- Provider secret writes: settings can include API keys; exposing write commands would need a separate security review.
- Direct synchronous video generation: long-running provider calls should stay queued through job commands.
- Arbitrary tool gateway calls: `/api/agent-tools/*` is token-protected runtime plumbing for local agent sessions, not a general CLI surface.
- Brand kit and brand asset commands: keep this surface out of the first CLI release until the product behavior for brand operations is settled.
- Workflow helper commands: do not add `aimc workflows list/get` or similar wrapper commands in P0.

## File Structure

- Create `packages/shared/src/nextop-cli-contracts.ts`
  - Defines `CliCommandOutput`, `cliJsonOutputSchema`, `cliErrorOutputSchema`, `cliTableOutputSchema`, and helpers for parseable command responses.
- Modify `packages/shared/src/index.ts`
  - Re-export CLI contracts.
- Test `packages/shared/src/nextop-cli-contracts.test.ts`
  - Verifies the output schemas accept valid JSON/table/error responses and reject invalid shapes.
- Create `apps/server/src/http/nextop-cli-output.ts`
  - Owns only CLI response wrapping: `sendCliJson`, `sendCliError`, and `isZodError`.
- Create focused route-independent helpers only where current HTTP modules contain route-local logic that CLI also needs. Start with `apps/server/src/http/project-operations.ts` and `apps/server/src/http/canvas-operations.ts`; add job/chat/skill/model operation helpers in later tasks only when needed.
  - Existing `/api/*` routes and new `/nextop/cli/*` routes must call these helpers instead of maintaining two copies of service mapping, validation, and response shaping.
- Modify existing route modules when an operation helper is introduced, for example `apps/server/src/http/projects.ts` and `apps/server/src/http/canvases.ts`.
  - Keep their public HTTP response contracts unchanged.
- Create `apps/server/src/http/nextop-cli.ts`
  - Registers `/nextop/cli/*` Fastify POST handlers.
  - Converts Nextop CLI input bodies into existing shared operation/helper calls.
  - Wraps every success and failure in `CliCommandOutput`.
- Test `apps/server/src/http/nextop-cli.test.ts`
  - Uses Fastify injection with stub services to verify handler behavior without starting the full app.
- Modify `apps/server/src/app.ts`
  - Registers `registerNextopCliRoutes` after all services are constructed.
- Modify `scripts/package-nextop-app.mjs`
  - Adds `cli.manifest` to `createManifest`.
  - Adds generated `nextop.cli.json`.
  - Adds generated `COMMANDS.md`.
  - Adds package validation for CLI manifest shape, command handler paths, and docs file existence.
- Modify `tests/package-nextop-app.test.mjs`
  - Tests manifest CLI declaration, generated CLI manifest, generated command docs, and validation errors.

## Existing API Compatibility And No-Duplication Rule

The `/nextop/cli/*` routes are a second presentation surface, not a second implementation of AIMC behavior.

- Do not copy route-local business logic from `apps/server/src/http/*.ts` into `nextop-cli.ts`.
- If an existing HTTP route already has the needed behavior behind a service method, the CLI route may call that service method directly.
- If an existing HTTP route has meaningful route-local mapping, validation, polling, defaulting, or response shaping that the CLI needs too, extract that behavior into a route-independent helper first, update the existing `/api/*` route to call the helper, then call the same helper from `/nextop/cli/*`.
- Keep HTTP-specific concerns in the HTTP route layer: Fastify `reply`, status codes, multipart parsing, and browser-facing response schemas.
- Keep CLI-specific concerns in the CLI layer: hyphenated flag body parsing, JSON-string parsing for values such as `content-json`, and wrapping outputs as `CliCommandOutput`.
- Add tests that prove existing `/api/*` behavior is unchanged when a helper is extracted.

## Shared Command Output Contract

The first code task should introduce this shape:

```ts
import { z } from "zod";

export const cliJsonOutputSchema = z.object({
  kind: z.literal("json"),
  value: z.unknown(),
});

export const cliTableOutputSchema = z.object({
  kind: z.literal("table"),
  columns: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
    }),
  ),
  rows: z.array(z.record(z.unknown())),
});

export const cliErrorOutputSchema = z.object({
  kind: z.literal("error"),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export const cliCommandOutputSchema = z.discriminatedUnion("kind", [
  cliJsonOutputSchema,
  cliTableOutputSchema,
  cliErrorOutputSchema,
]);

export type CliCommandOutput = z.infer<typeof cliCommandOutputSchema>;
```

## CLI Manifest Generation Shape

The package script should generate a manifest with this top-level shape:

```json
{
  "schemaVersion": "nextop.app.cli.v1",
  "scope": "aimc",
  "description": "Control AI Media Canvas projects, canvases, generation jobs, agent runs, and skills.",
  "documentation": {
    "file": "COMMANDS.md"
  },
  "commands": []
}
```

Every command entry should use:

```json
{
  "path": ["projects", "list"],
  "summary": "List projects",
  "description": "List local AI Media Canvas projects.",
  "inputSchema": {
    "type": "object",
    "properties": {}
  },
  "output": {
    "defaultMode": "json",
    "json": true
  },
  "handler": {
    "kind": "http",
    "method": "POST",
    "path": "/nextop/cli/projects/list",
    "timeoutMs": 30000
  }
}
```

Use JSON output for all P0 commands. Table rendering can be added later without changing the handler contract.

## Implementation Tasks

### Task 1: Add Shared CLI Output Contracts

**Files:**

- Create: `packages/shared/src/nextop-cli-contracts.ts`
- Create: `packages/shared/src/nextop-cli-contracts.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing schema tests**

Create `packages/shared/src/nextop-cli-contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { cliCommandOutputSchema } from "./nextop-cli-contracts.js";

describe("nextop CLI output contracts", () => {
  it("accepts json outputs", () => {
    expect(
      cliCommandOutputSchema.parse({
        kind: "json",
        value: { ok: true },
      }),
    ).toEqual({
      kind: "json",
      value: { ok: true },
    });
  });

  it("accepts table outputs", () => {
    expect(
      cliCommandOutputSchema.parse({
        kind: "table",
        columns: [{ key: "id", label: "ID" }],
        rows: [{ id: "project_1" }],
      }),
    ).toEqual({
      kind: "table",
      columns: [{ key: "id", label: "ID" }],
      rows: [{ id: "project_1" }],
    });
  });

  it("accepts error outputs", () => {
    expect(
      cliCommandOutputSchema.parse({
        kind: "error",
        error: {
          code: "project_not_found",
          message: "Project not found.",
        },
      }),
    ).toEqual({
      kind: "error",
      error: {
        code: "project_not_found",
        message: "Project not found.",
      },
    });
  });

  it("rejects non-cli output shapes", () => {
    expect(() =>
      cliCommandOutputSchema.parse({
        ok: true,
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @aimc/shared test
```

Expected: FAIL because `packages/shared/src/nextop-cli-contracts.ts` does not exist.

- [ ] **Step 3: Add the minimal shared contract**

Create `packages/shared/src/nextop-cli-contracts.ts` using the code from `Shared Command Output Contract`.

- [ ] **Step 4: Export the contract**

Append this export to `packages/shared/src/index.ts`:

```ts
export * from "./nextop-cli-contracts.js";
```

- [ ] **Step 5: Run the shared package tests**

Run:

```bash
pnpm --filter @aimc/shared test
```

Expected: PASS.

### Task 2: Generate CLI Manifest And Command Docs In The Nextop Package

**Files:**

- Modify: `scripts/package-nextop-app.mjs`
- Modify: `tests/package-nextop-app.test.mjs`

- [ ] **Step 1: Add failing package tests**

Extend `tests/package-nextop-app.test.mjs` imports:

```js
import {
  createCliManifest,
  createManifest,
  renderAgentsGuide,
  renderBootstrap,
  renderCommandsGuide,
  createWebBuildEnv,
  assertNoSymlinks,
  validatePackageRoot,
} from "../scripts/package-nextop-app.mjs";
```

Update the expected manifest in `createManifest returns the Nextop package manifest contract` with:

```js
    cli: {
      manifest: "nextop.cli.json",
    },
```

Add tests:

```js
test("createCliManifest returns the Nextop CLI manifest contract", () => {
  const manifest = createCliManifest();

  assert.equal(manifest.schemaVersion, "nextop.app.cli.v1");
  assert.equal(manifest.scope, "aimc");
  assert.deepEqual(manifest.documentation, { file: "COMMANDS.md" });
  assert.ok(manifest.commands.length >= 20);

  for (const command of manifest.commands) {
    assert.ok(command.path.length >= 1);
    for (const segment of command.path) {
      assert.match(segment, /^[a-z0-9-]+$/);
      assert.notEqual(segment, manifest.scope);
    }
    assert.equal(command.handler.kind, "http");
    assert.equal(command.handler.method, "POST");
    assert.match(command.handler.path, /^\/nextop\/cli\//);
    assert.equal(command.handler.path, `/nextop/cli/${command.path.join("/")}`);
    assert.equal(command.output.defaultMode, "json");
    assert.equal(command.output.json, true);
  }
});

test("createCliManifest carries agent-discoverable command guidance", () => {
  const manifest = createCliManifest();
  const command = (path) =>
    manifest.commands.find((item) => item.path.join(" ") === path);

  const agentRun = command("agent run");
  assert.ok(agentRun);
  assert.deepEqual(agentRun.inputSchema.required, [
    "conversation-id",
    "prompt",
    "session-id",
  ]);
  assert.match(agentRun.description, /returns runId/i);
  assert.match(agentRun.description, /agent events/i);

  const agentEvents = command("agent events");
  assert.ok(agentEvents);
  assert.deepEqual(agentEvents.inputSchema.required, ["run-id"]);
  assert.match(agentEvents.description, /nextCursor/i);

  const canvasSave = command("canvases save");
  assert.ok(canvasSave);
  assert.deepEqual(canvasSave.inputSchema.required, [
    "canvas-id",
    "content-json",
  ]);
  assert.match(canvasSave.description, /complete canvas content JSON string/i);

  const imageGeneration = command("generation image");
  assert.ok(imageGeneration);
  assert.deepEqual(imageGeneration.inputSchema.required, ["prompt"]);
  assert.match(imageGeneration.description, /queues/i);
  assert.match(imageGeneration.description, /jobs get/i);

  const messageCreate = command("messages create");
  assert.ok(messageCreate);
  assert.deepEqual(messageCreate.inputSchema.required, [
    "content",
    "role",
    "session-id",
  ]);
  assert.match(messageCreate.description, /role must be user or assistant/i);
});

test("renderCommandsGuide documents the public CLI commands", () => {
  const guide = renderCommandsGuide();

  assert.match(guide, /# AI Media Canvas CLI Commands/);
  assert.match(guide, /aimc projects/);
  assert.match(guide, /aimc generation image/);
  assert.match(guide, /aimc agent run/);
});
```

In `validatePackageRoot requires the files Nextop imports`, after writing `nextop.app.json`, `AGENTS.md`, and `bootstrap.sh`, add:

```js
  await assert.rejects(
    validatePackageRoot(packageRoot),
    /Missing required package file: nextop\.cli\.json/,
  );

  await writeFile(
    path.join(packageRoot, "nextop.cli.json"),
    `${JSON.stringify(createCliManifest())}\n`,
  );

  await assert.rejects(
    validatePackageRoot(packageRoot),
    /Missing CLI documentation file: COMMANDS\.md/,
  );

  await writeFile(path.join(packageRoot, "COMMANDS.md"), renderCommandsGuide());
```

- [ ] **Step 2: Run package tests to verify failure**

Run:

```bash
pnpm run test:workspace
```

Expected: FAIL because `createCliManifest` and `renderCommandsGuide` do not exist.

- [ ] **Step 3: Add CLI package generation**

In `scripts/package-nextop-app.mjs`, add `nextop.cli.json` and `COMMANDS.md` to `REQUIRED_PACKAGE_FILES`:

```js
const REQUIRED_PACKAGE_FILES = [
  "nextop.app.json",
  "nextop.cli.json",
  "COMMANDS.md",
  "AGENTS.md",
  "bootstrap.sh",
  "server/server.js",
  "server/worker.js",
  "server/tools-mcp.js",
];
```

Add `cli` to `createManifest`:

```js
    cli: {
      manifest: "nextop.cli.json",
    },
```

Add a command helper:

```js
function createJsonCommand({ path, summary, description, properties = {}, required = [], timeoutMs = 30000 }) {
  const route = `/nextop/cli/${path.join("/")}`;
  return {
    path,
    summary,
    description,
    inputSchema: {
      type: "object",
      properties,
      ...(required.length ? { required } : {}),
    },
    output: {
      defaultMode: "json",
      json: true,
    },
    handler: {
      kind: "http",
      method: "POST",
      path: route,
      timeoutMs,
    },
  };
}
```

Add `createCliManifest` with the P0 command list from `Capability Boundary`, using manifest property keys such as `"project-id"`, `"canvas-id"`, `"session-id"`, `"content-json"`, `"job-id"`, `"job-type"`, `"runtime-kind"`, and `"runtime-provider"` because they map cleanly to CLI flags.

Each command description must be useful from the injected agent command guide alone. Do not rely on `COMMANDS.md` for model-visible sequencing. Include concrete follow-up hints in descriptions where the command is part of an asynchronous chain:

- `agent run`: starts an async run, returns `runId`, and should be followed with `aimc agent events --run-id <runId>`.
- `agent events`: polls run events and returns `nextCursor`; pass that cursor back as `--cursor`.
- `canvases save`: requires `content-json` to be a complete canvas content JSON string.
- `generation image` and `generation video`: queue background jobs, return `jobId`, and should be inspected with `aimc jobs get --job-id <jobId>`.
- `messages create`: `role` must be `user` or `assistant`.

Add `renderCommandsGuide()`:

```js
export function renderCommandsGuide() {
  return `# AI Media Canvas CLI Commands

The app exposes the \`aimc\` scope through Nextop's workspace app CLI.
All commands return JSON.

## Common

- \`aimc status\`: show app health and version.
- \`aimc models list\`: list agent models.
- \`aimc models image\`: list image generation models.
- \`aimc models video\`: list video generation models.

## Projects And Canvases

- \`aimc projects list\`: list projects.
- \`aimc projects get --project-id <id>\`: show one project.
- \`aimc projects create --name <name> [--description <text>]\`: create a project.
- \`aimc canvases get --canvas-id <id>\`: show a canvas.
- \`aimc canvases save --canvas-id <id> --content-json <json>\`: save canvas content.

## Chat And Agents

- \`aimc sessions list --canvas-id <id>\`: list sessions.
- \`aimc sessions create --canvas-id <id> [--title <title>]\`: create a session.
- \`aimc messages list --session-id <id>\`: list messages.
- \`aimc messages create --session-id <id> --role <user|assistant> --content <text>\`: append a text message.
- \`aimc agent run --session-id <id> --conversation-id <id> --prompt <text>\`: start an agent run.
- \`aimc agent events --run-id <id> [--cursor <n>]\`: poll run events.
- \`aimc agent cancel --run-id <id>\`: cancel a run.

## Generation Jobs

- \`aimc generation image --prompt <text>\`: queue image generation.
- \`aimc generation video --prompt <text>\`: queue video generation.
- \`aimc jobs list [--status <status>] [--job-type <type>]\`: list jobs.
- \`aimc jobs get --job-id <id>\`: show one job.
- \`aimc jobs cancel --job-id <id>\`: cancel one job.

## Skills

- \`aimc skills list\`: list installed skills.
- \`aimc skills get --skill-id <id>\`: show skill detail.
- \`aimc skills enable --skill-id <id> --enabled <true|false>\`: enable or disable a skill.
- \`aimc skills install --skill-id <id>\`: install a bundled skill.
`;
}
```

In `writePackageFiles(version)`, write the new files:

```js
  await writeFile(
    path.join(packageRoot, "nextop.cli.json"),
    `${JSON.stringify(createCliManifest(), null, 2)}\n`,
  );
  await writeFile(path.join(packageRoot, "COMMANDS.md"), renderCommandsGuide());
```

- [ ] **Step 4: Validate CLI manifest in package validation**

In `validatePackageRoot(root)`, after parsing `manifest`, add:

```js
  if (manifest.cli?.manifest) {
    const cliManifestPath = path.join(root, manifest.cli.manifest);
    let cliManifest;
    try {
      cliManifest = JSON.parse(await readFile(cliManifestPath, "utf8"));
    } catch {
      throw new Error(`Missing or invalid CLI manifest file: ${manifest.cli.manifest}`);
    }
    if (cliManifest.schemaVersion !== "nextop.app.cli.v1") {
      throw new Error("nextop.cli.json must use schemaVersion nextop.app.cli.v1.");
    }
    if (!/^[a-z0-9-]+$/.test(cliManifest.scope ?? "")) {
      throw new Error("nextop.cli.json scope must be lowercase letters, numbers, and hyphen.");
    }
    if (cliManifest.documentation?.file) {
      try {
        await access(path.join(root, cliManifest.documentation.file));
      } catch {
        throw new Error(`Missing CLI documentation file: ${cliManifest.documentation.file}`);
      }
    }
    for (const command of cliManifest.commands ?? []) {
      for (const segment of command.path ?? []) {
        if (!/^[a-z0-9-]+$/.test(segment) || segment === cliManifest.scope) {
          throw new Error(`Invalid CLI command path segment: ${segment}`);
        }
      }
      if (command.handler?.kind !== "http") {
        throw new Error("CLI command handlers must use kind=http.");
      }
      if (command.handler?.method !== "POST") {
        throw new Error("CLI command handlers must use method=POST.");
      }
      if (!String(command.handler?.path ?? "").startsWith("/nextop/cli/")) {
        throw new Error("CLI command handler paths must start with /nextop/cli/.");
      }
      const expectedHandlerPath = `/nextop/cli/${(command.path ?? []).join("/")}`;
      if (command.handler.path !== expectedHandlerPath) {
        throw new Error(
          `CLI command handler path ${command.handler.path} must match command path ${expectedHandlerPath}.`,
        );
      }
    }
  }
```

- [ ] **Step 5: Run package tests**

Run:

```bash
pnpm run test:workspace
```

Expected: PASS.

### Task 3: Add CLI Output Helpers And The First Shared Operations

**Files:**

- Create: `apps/server/src/http/nextop-cli-output.ts`
- Create: `apps/server/src/http/project-operations.ts`
- Create: `apps/server/src/http/canvas-operations.ts`
- Modify: `apps/server/src/http/projects.ts`
- Modify: `apps/server/src/http/canvases.ts`
- Create: `apps/server/src/http/nextop-cli.ts`
- Create: `apps/server/src/http/nextop-cli.test.ts`
- Test existing project/canvas route tests if present; otherwise keep the existing server test suite as the compatibility guard.

- [ ] **Step 1: Write route tests for shared operation reuse**

Create `apps/server/src/http/nextop-cli.test.ts`:

```ts
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { registerNextopCliRoutes } from "./nextop-cli.js";
import type { ProjectOperations } from "./project-operations.js";

function createOptions() {
  const projectOperations: ProjectOperations = {
    listProjects: vi.fn(async () => ({ projects: [{ id: "project_1", name: "Demo" }] })),
    getProject: vi.fn(async () => ({ project: { id: "project_1", name: "Demo" } })),
    createProject: vi.fn(async () => ({ project: { id: "project_2", name: "New" } })),
  };
  return {
    env: { appVersion: "1.2.3" },
    localUser: { id: "user_1", email: "local@example.com" },
    projectOperations,
    canvasOperations: {
      getCanvas: vi.fn(async () => ({ canvas: { id: "canvas_1", content: { elements: [], appState: {}, files: {} } } })),
      saveCanvas: vi.fn(async () => ({ ok: true })),
    },
    chatService: {
      listSessions: vi.fn(async () => [{ id: "session_1", title: "Chat" }]),
      createSession: vi.fn(async () => ({ id: "session_2", title: "New chat" })),
      listMessages: vi.fn(async () => []),
      createMessage: vi.fn(async () => ({ id: "message_1", role: "user", content: "hello" })),
    },
    jobService: {
      createJob: vi.fn(async () => ({ id: "job_1", status: "queued" })),
      listJobs: vi.fn(async () => []),
      getJob: vi.fn(async () => ({ id: "job_1", status: "queued" })),
      cancelJob: vi.fn(async () => ({ id: "job_1", status: "canceled" })),
    },
    skillService: {
      listInstalledSkills: vi.fn(async () => []),
      getSkillDetail: vi.fn(async () => ({ id: "skill_1", name: "Skill" })),
      toggleSkill: vi.fn(async () => ({ id: "skill_1", enabled: true })),
      installCatalogSkill: vi.fn(async () => ({ id: "skill_1", installed: true })),
    },
    modelLists: {
      listAgentModels: vi.fn(async () => []),
      listImageModels: vi.fn(async () => []),
      listVideoModels: vi.fn(async () => []),
    },
    agentRuns: {
      createRun: vi.fn(() => ({ runId: "run_1", sessionId: "session_1", conversationId: "conversation_1", status: "accepted" })),
      cancelRun: vi.fn(() => ({ runId: "run_1", status: "canceling" })),
    },
    runEvents: {
      listEvents: vi.fn(() => ({ done: false, events: [], nextCursor: 0 })),
    },
  };
}

describe("registerNextopCliRoutes", () => {
  it("wraps status output in CliCommandOutput", async () => {
    const app = Fastify();
    await registerNextopCliRoutes(app, createOptions() as never);

    const response = await app.inject({
      method: "POST",
      url: "/nextop/cli/status",
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      kind: "json",
      value: {
        ok: true,
        service: "ai-media-canvas-server",
        version: "1.2.3",
      },
    });
  });

  it("creates a project through the project service", async () => {
    const options = createOptions();
    const app = Fastify();
    await registerNextopCliRoutes(app, options as never);

    const response = await app.inject({
      method: "POST",
      url: "/nextop/cli/projects/create",
      payload: { name: "New", description: "Plan" },
    });

    expect(response.statusCode).toBe(200);
    expect(options.projectOperations.createProject).toHaveBeenCalledWith(
      options.localUser,
      { name: "New", description: "Plan" },
    );
    expect(response.json()).toEqual({
      kind: "json",
      value: { project: { id: "project_2", name: "New" } },
    });
  });

  it("returns CLI errors instead of raw application errors", async () => {
    const options = createOptions();
    options.projectOperations.getProject.mockRejectedValueOnce(new Error("boom"));
    const app = Fastify();
    await registerNextopCliRoutes(app, options as never);

    const response = await app.inject({
      method: "POST",
      url: "/nextop/cli/projects/get",
      payload: { "project-id": "missing" },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      kind: "error",
      error: {
        code: "application_error",
        message: "boom",
      },
    });
  });
});
```

- [ ] **Step 2: Run server tests to verify failure**

Run:

```bash
pnpm --filter @aimc/server test -- src/http/nextop-cli.test.ts
```

Expected: FAIL because `apps/server/src/http/nextop-cli.ts` does not exist.

- [ ] **Step 3: Add CLI response helpers**

Create `apps/server/src/http/nextop-cli-output.ts`:

```ts
import type { FastifyReply } from "fastify";

import { cliCommandOutputSchema } from "@aimc/shared";

export function sendCliJson(reply: FastifyReply, value: unknown, statusCode = 200) {
  return reply.code(statusCode).send(
    cliCommandOutputSchema.parse({
      kind: "json",
      value,
    }),
  );
}

export function sendCliError(reply: FastifyReply, error: unknown, statusCode = 500) {
  const message = error instanceof Error ? error.message : "Command failed.";
  return reply.code(statusCode).send(
    cliCommandOutputSchema.parse({
      kind: "error",
      error: {
        code: "application_error",
        message,
      },
    }),
  );
}

export function isZodError(error: unknown): error is { issues: unknown[]; name: string } {
  return (
    error instanceof Error &&
    error.name === "ZodError" &&
    "issues" in error &&
    Array.isArray(error.issues)
  );
}
```

- [ ] **Step 4: Extract project operations and update existing project routes**

Create `apps/server/src/http/project-operations.ts`:

```ts
import {
  projectCreateRequestSchema,
  projectCreateResponseSchema,
  projectDetailResponseSchema,
  projectListResponseSchema,
  projectUpdateRequestSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import type { ProjectService } from "../features/projects/project-service.js";

export type ProjectOperations = ReturnType<typeof createProjectOperations>;

export function createProjectOperations(options: {
  localUser: AuthenticatedUser;
  projectService: ProjectService;
}) {
  return {
    async listProjects(user = options.localUser) {
      const projects = await options.projectService.listProjects(user);
      return projectListResponseSchema.parse({ projects });
    },
    async getProject(user: AuthenticatedUser, projectId: string) {
      const project = await options.projectService.getProject(user, projectId);
      return projectDetailResponseSchema.parse({
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
          description: project.description,
          brandKitId: project.brand_kit_id,
          createdAt: project.created_at,
          updatedAt: project.updated_at,
        },
      });
    },
    async createProject(user: AuthenticatedUser, input: unknown) {
      const payload = projectCreateRequestSchema.parse(input);
      const project = await options.projectService.createProject(user, payload);
      return projectCreateResponseSchema.parse({ project });
    },
    async updateProject(user: AuthenticatedUser, projectId: string, input: unknown) {
      const payload = projectUpdateRequestSchema.parse(input);
      await options.projectService.updateProject(user, projectId, payload);
    },
    async archiveProject(user: AuthenticatedUser, projectId: string) {
      await options.projectService.archiveProject(user, projectId);
    },
  };
}
```

Modify `apps/server/src/http/projects.ts` so each handler calls `createProjectOperations(options)` instead of reimplementing the service-to-response mapping. Preserve current status codes and error handling.

- [ ] **Step 5: Extract canvas operations and update existing canvas routes**

Create `apps/server/src/http/canvas-operations.ts`:

```ts
import {
  canvasGetResponseSchema,
  canvasSaveRequestSchema,
  canvasSaveResponseSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import type { CanvasService } from "../features/canvas/canvas-service.js";

export type CanvasOperations = ReturnType<typeof createCanvasOperations>;

export function createCanvasOperations(options: {
  localUser: AuthenticatedUser;
  canvasService: CanvasService;
}) {
  return {
    async getCanvas(user: AuthenticatedUser, canvasId: string) {
      const canvas = await options.canvasService.getCanvas(user, canvasId);
      return canvasGetResponseSchema.parse({ canvas });
    },
    async saveCanvas(user: AuthenticatedUser, canvasId: string, input: unknown) {
      const payload = canvasSaveRequestSchema.parse(input);
      await options.canvasService.saveCanvasContent(user, canvasId, payload.content);
      return canvasSaveResponseSchema.parse({ ok: true });
    },
  };
}
```

Modify `apps/server/src/http/canvases.ts` so GET and PUT routes call `createCanvasOperations(options)`. Preserve the existing body limit, logging, status code, and error mapping.

- [ ] **Step 6: Implement the initial CLI adapter using shared operations**

Create `apps/server/src/http/nextop-cli.ts` with:

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { canvasContentSchema } from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import type { CanvasOperations } from "./canvas-operations.js";
import { isZodError, sendCliError, sendCliJson } from "./nextop-cli-output.js";
import type { ProjectOperations } from "./project-operations.js";

type CliOptions = {
  env: { appVersion?: string };
  localUser: AuthenticatedUser;
  projectOperations: ProjectOperations;
  canvasOperations: CanvasOperations;
  chatService: Record<string, unknown>;
  jobService: Record<string, unknown>;
  skillService: Record<string, unknown>;
  modelLists: {
    listAgentModels(): Promise<unknown>;
    listImageModels(): Promise<unknown>;
    listVideoModels(): Promise<unknown>;
  };
  agentRuns: {
    createRun(input: unknown, context?: unknown): unknown;
    cancelRun(runId: string): unknown;
  };
  runEvents: {
    listEvents(runId: string, cursor: number): unknown;
  };
};

const projectIdBodySchema = z.object({
  "project-id": z.string().min(1),
});

const canvasGetBodySchema = z.object({
  "canvas-id": z.string().min(1),
});

const canvasSaveBodySchema = z.object({
  "canvas-id": z.string().min(1),
  "content-json": z.string().min(1),
});

function parseJsonString(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    throw new Error("Expected valid JSON string.");
  }
}

export async function registerNextopCliRoutes(app: FastifyInstance, options: CliOptions) {
  app.post("/nextop/cli/status", async (_request, reply) => {
    return sendCliJson(reply, {
      ok: true,
      service: "ai-media-canvas-server",
      version: options.env.appVersion ?? "0.0.0",
    });
  });

  app.post("/nextop/cli/projects/list", async (_request, reply) => {
    try {
      const result = await options.projectOperations.listProjects(options.localUser);
      return sendCliJson(reply, result);
    } catch (error) {
      return sendCliError(reply, error);
    }
  });

  app.post("/nextop/cli/projects/get", async (request, reply) => {
    try {
      const body = projectIdBodySchema.parse(request.body);
      const result = await options.projectOperations.getProject(
        options.localUser,
        body["project-id"],
      );
      return sendCliJson(reply, result);
    } catch (error) {
      return sendCliError(reply, error, isZodError(error) ? 400 : 500);
    }
  });

  app.post("/nextop/cli/projects/create", async (request, reply) => {
    try {
      const result = await options.projectOperations.createProject(options.localUser, request.body);
      return sendCliJson(reply, result);
    } catch (error) {
      return sendCliError(reply, error, isZodError(error) ? 400 : 500);
    }
  });

  app.post("/nextop/cli/canvases/get", async (request, reply) => {
    try {
      const body = canvasGetBodySchema.parse(request.body);
      const result = await options.canvasOperations.getCanvas(
        options.localUser,
        body["canvas-id"],
      );
      return sendCliJson(reply, result);
    } catch (error) {
      return sendCliError(reply, error, isZodError(error) ? 400 : 500);
    }
  });

  app.post("/nextop/cli/canvases/save", async (request, reply) => {
    try {
      const body = canvasSaveBodySchema.parse(request.body);
      const content = canvasContentSchema.parse(parseJsonString(body["content-json"]));
      const result = await options.canvasOperations.saveCanvas(
        options.localUser,
        body["canvas-id"],
        { content },
      );
      return sendCliJson(reply, result);
    } catch (error) {
      return sendCliError(reply, error, isZodError(error) ? 400 : 500);
    }
  });
}
```

This step intentionally implements only the first route slice. Later tasks extend the same pattern: extract shared operation helpers when the CLI needs logic currently embedded in `/api/*` routes, then call those helpers from the CLI adapter.

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm --filter @aimc/server test -- src/http/nextop-cli.test.ts
pnpm --filter @aimc/server test -- src/http/models.test.ts
```

Expected: PASS for the initial route slice and unchanged existing HTTP behavior covered by the selected tests.

### Task 4: Implement Remaining CLI Command Handlers

**Files:**

- Modify: `apps/server/src/http/nextop-cli.ts`
- Modify: `apps/server/src/http/nextop-cli.test.ts`

- [ ] **Step 1: Add tests for job, agent, skill, and model commands**

Add tests in `apps/server/src/http/nextop-cli.test.ts`:

```ts
it("queues image generation jobs", async () => {
  const options = createOptions();
  const app = Fastify();
  await registerNextopCliRoutes(app, options as never);

  const response = await app.inject({
    method: "POST",
    url: "/nextop/cli/generation/image",
    payload: { prompt: "A product poster", model: "test-model", "project-id": "project_1" },
  });

  expect(response.statusCode).toBe(200);
  expect(options.jobService.createJob).toHaveBeenCalled();
  expect(response.json()).toEqual({
    kind: "json",
    value: { job: { id: "job_1", status: "queued" } },
  });
});

it("starts agent runs", async () => {
  const options = createOptions();
  const app = Fastify();
  await registerNextopCliRoutes(app, options as never);

  const response = await app.inject({
    method: "POST",
    url: "/nextop/cli/agent/run",
    payload: {
      "session-id": "session_1",
      "conversation-id": "conversation_1",
      prompt: "Improve this canvas",
      "canvas-id": "canvas_1",
      model: "test-agent",
    },
  });

  expect(response.statusCode).toBe(200);
  expect(options.agentRuns.createRun).toHaveBeenCalled();
  expect(response.json()).toEqual({
    kind: "json",
    value: {
      run: {
        runId: "run_1",
        sessionId: "session_1",
        conversationId: "conversation_1",
        status: "accepted",
      },
    },
  });
});

it("lists installed skills", async () => {
  const options = createOptions();
  const app = Fastify();
  await registerNextopCliRoutes(app, options as never);

  const response = await app.inject({
    method: "POST",
    url: "/nextop/cli/skills/list",
    payload: {},
  });

  expect(response.statusCode).toBe(200);
  expect(options.skillService.listInstalledSkills).toHaveBeenCalledWith(options.localUser);
  expect(response.json()).toEqual({
    kind: "json",
    value: { skills: [] },
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
pnpm --filter @aimc/server test -- src/http/nextop-cli.test.ts
```

Expected: FAIL because the new routes are not implemented.

- [ ] **Step 3: Extend `CliOptions` to real service method shapes**

Replace broad `Record<string, unknown>` service types with the methods used by the P0 command list. Keep the types local in `nextop-cli.ts` unless they are reused elsewhere.

- [ ] **Step 4: Add body schemas for every P0 command**

Use lowercase hyphenated CLI keys:

```ts
const sessionIdBodySchema = z.object({ "session-id": z.string().min(1) });
const runIdBodySchema = z.object({ "run-id": z.string().min(1) });
const jobIdBodySchema = z.object({ "job-id": z.string().min(1) });
const skillIdBodySchema = z.object({ "skill-id": z.string().min(1) });
```

For optional comma-separated image inputs:

```ts
function parseCsv(input: string | undefined) {
  return input
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
```

For integer flags:

```ts
const optionalIntegerSchema = z.number().int().optional();
```

- [ ] **Step 5: Add job operation helpers and handlers**

Implement:

- `/nextop/cli/generation/image`
- `/nextop/cli/generation/video`
- `/nextop/cli/jobs/list`
- `/nextop/cli/jobs/get`
- `/nextop/cli/jobs/cancel`

If the current job HTTP route has route-local payload mapping that the CLI needs, extract a small `apps/server/src/http/job-operations.ts` helper first. Update `apps/server/src/http/jobs.ts` to call that helper, then call the same helper from `nextop-cli.ts`. The CLI route may still own hyphenated flag parsing such as `project-id` to `project_id`, but job creation defaults, filters, and response parsing must not be duplicated from the existing HTTP route.

- [ ] **Step 6: Add agent operation helpers and handlers**

Implement:

- `/nextop/cli/agent/run`
- `/nextop/cli/agent/events`
- `/nextop/cli/agent/cancel`

If run creation or event polling logic is currently embedded in `apps/server/src/app.ts`, extract a route-independent helper before adding CLI handlers. The CLI handler should only map hyphenated CLI body keys into the shared run input, then delegate. Map CLI body keys into `runCreateRequestSchema` fields:

```ts
{
  sessionId: body["session-id"],
  conversationId: body["conversation-id"],
  prompt: body.prompt,
  canvasId: body["canvas-id"],
  model: body.model,
  runtimeKind: body["runtime-kind"],
  runtimeProvider: body["runtime-provider"]
}
```

Return `{ run }` for run creation, `{ done, events, nextCursor }` for polling, and `{ run }` for cancel.

- [ ] **Step 7: Add chat, models, and skills handlers**

Implement routes listed in `P0 Commands To Expose`. Keep each handler as a thin adapter over existing services or newly extracted operation helpers. Do not copy route-local logic out of existing `/api/*` modules. If a handler needs the same mapping or defaulting as an existing route, extract it first and update both surfaces.

```ts
app.post("/nextop/cli/skills/list", async (_request, reply) => {
  try {
    const skills = await options.skillService.listInstalledSkills(options.localUser);
    return sendCliJson(reply, { skills });
  } catch (error) {
    return sendCliError(reply, error);
  }
});
```

- [ ] **Step 8: Run focused server tests**

Run:

```bash
pnpm --filter @aimc/server test -- src/http/nextop-cli.test.ts
```

Expected: PASS.

### Task 5: Wire CLI Routes Into The App Runtime

**Files:**

- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/http/nextop-cli.test.ts`

- [ ] **Step 1: Add an app-level smoke test**

If `apps/server/src/app.ts` already has an app factory test helper, use it. If not, keep this as a route-module smoke test and verify registration in `app.ts` through TypeScript.

Add this assertion to an existing app construction test or a new lightweight test:

```ts
const response = await app.inject({
  method: "POST",
  url: "/nextop/cli/status",
  payload: {},
});
expect(response.statusCode).toBe(200);
expect(response.json().kind).toBe("json");
```

- [ ] **Step 2: Import the route module**

In `apps/server/src/app.ts`, add:

```ts
import { registerNextopCliRoutes } from "./http/nextop-cli.js";
import { createCanvasOperations } from "./http/canvas-operations.js";
import { createProjectOperations } from "./http/project-operations.js";
```

- [ ] **Step 3: Register routes after service construction**

After existing API route registration, add:

```ts
  void registerNextopCliRoutes(app, {
    env,
    localUser,
    projectOperations: createProjectOperations({ localUser, projectService }),
    canvasOperations: createCanvasOperations({ localUser, canvasService }),
    chatService,
    jobService,
    skillService,
    modelLists: {
      listAgentModels: async () => {
        throw new Error("Model list adapter must call the existing model registry.");
      },
      listImageModels: async () => {
        throw new Error("Image model list adapter must call the existing image model registry.");
      },
      listVideoModels: async () => {
        throw new Error("Video model list adapter must call the existing video model registry.");
      },
    },
    agentRuns,
    runEvents: {
      listEvents: (runId, cursor) => {
        const run = store.getAgentRun(runId);
        if (!run) {
          throw new Error("Run not found.");
        }
        const events = store.listAgentRunEvents(runId, cursor);
        return {
          done:
            run.status === "completed" ||
            run.status === "failed" ||
            run.status === "canceled",
          events: events.map((entry) => ({
            event: entry.event,
            eventId: entry.eventId,
            seq: entry.seq,
          })),
          nextCursor: events.at(-1)?.seq ?? cursor,
        };
      },
    },
  });
```

Replace the three throwing model adapters with extracted functions from the current model routes during implementation. Do not leave throwing adapters in the final code.

- [ ] **Step 4: Run typecheck to catch app wiring mismatches**

Run:

```bash
pnpm --filter @aimc/server typecheck
```

Expected: PASS.

### Task 6: Extract Model List Logic For Reuse

**Files:**

- Modify: `apps/server/src/http/models.ts`
- Modify: `apps/server/src/http/image-models.ts`
- Modify: `apps/server/src/http/video-models.ts`
- Modify: `apps/server/src/http/nextop-cli.ts`
- Modify: related tests in `apps/server/src/http/models.test.ts` and `apps/server/src/http/nextop-cli.test.ts`

- [ ] **Step 1: Locate current list logic**

Read:

```bash
sed -n '1,340p' apps/server/src/http/models.ts
sed -n '1,120p' apps/server/src/http/image-models.ts
sed -n '1,120p' apps/server/src/http/video-models.ts
```

- [ ] **Step 2: Extract route-independent list functions**

Add exported functions that return the same payloads used by the existing GET routes. Keep existing GET routes behavior unchanged.

Example function shape:

```ts
export async function listAgentModelsForHttp(env: ServerEnv, settingsService?: SettingsService) {
  return modelListResponseSchema.parse({
    models: await resolveAgentModels(env, settingsService),
  });
}
```

Use the actual internal model resolver names present in the file; do not duplicate registry rules in `nextop-cli.ts`.

- [ ] **Step 3: Use extracted functions in CLI routes**

Update the app wiring so `modelLists` calls the extracted functions:

```ts
modelLists: {
  listAgentModels: () => listAgentModelsForHttp(env, settingsService),
  listImageModels: () => listImageModelsForHttp(env, settingsService),
  listVideoModels: () => listVideoModelsForHttp(env, settingsService),
}
```

- [ ] **Step 4: Run model and CLI tests**

Run:

```bash
pnpm --filter @aimc/server test -- src/http/models.test.ts src/http/nextop-cli.test.ts
```

Expected: PASS.

### Task 7: Package Validation And End-To-End Checks

**Files:**

- Modify only files touched by earlier tasks if validation finds a bug.

- [ ] **Step 1: Run full workspace tests**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint and i18n check**

Run:

```bash
pnpm run lint
```

Expected: PASS. This change should not add web UI copy, but `lint` includes `check:i18n`, so it remains the safe final check.

- [ ] **Step 4: Build the Nextop package**

Run:

```bash
pnpm run package:nextop
```

Expected: PASS and prints a zip path under `build/nextop-app/`.

- [ ] **Step 5: Inspect generated package files**

Run:

```bash
node -e 'const fs=require("fs"); const app=JSON.parse(fs.readFileSync("build/nextop-app/package/nextop.app.json","utf8")); const cli=JSON.parse(fs.readFileSync("build/nextop-app/package/nextop.cli.json","utf8")); console.log(app.cli); console.log(cli.scope, cli.commands.length);'
```

Expected output:

```text
{ manifest: 'nextop.cli.json' }
aimc 25
```

The command count can be higher if additional P0 commands are added, but it must not be lower than the P0 command list in this plan.

## Success Criteria

- A new worktree branch contains the implementation.
- `nextop.app.json` declares `cli.manifest`.
- `nextop.cli.json` exists in generated packages and passes validation.
- `COMMANDS.md` exists in generated packages and documents every P0 command.
- Command summaries, descriptions, and required input schemas carry enough context for Nextop's injected agent command guide; `COMMANDS.md` is not required for the model to understand the command list.
- Every manifest command maps to a `POST /nextop/cli/*` server route.
- Every route returns a `CliCommandOutput` shape for success and failure.
- CLI route handlers do not copy route-local `/api/*` business logic; shared behavior is either called through existing services or extracted into route-independent helpers used by both surfaces.
- Existing `/api/*` route behavior remains unchanged after helper extraction, with focused compatibility tests run for every touched HTTP module.
- No P0 command depends on WebSocket, multipart file upload, or app-runtime-only tool tokens.
- No P0 command introduces a workflow helper surface such as `aimc workflows`.
- `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, and `pnpm run package:nextop` pass.

## Open Decisions Before Implementation

- Whether `aimc project-delete` should be included in P0. It is supported by the app, but destructive commands may deserve a later confirmation strategy.
- Whether `aimc canvases save --content-json` is ergonomic enough, or whether Nextop CLI should first support file inputs before this command is exposed.
- Whether CLI errors should always return HTTP 200 with `kind: "error"` or preserve HTTP status codes. This plan preserves HTTP status codes while still wrapping the body.
- Whether command output should eventually use table mode for list commands. This plan keeps JSON-only output for predictable composition.

## Self-Review

- Spec coverage: manifest, CLI manifest, handler path rules, runtime package generation, validation, and command output shape are covered.
- Red-flag scan: no task uses open-ended filler steps; model extraction calls out a concrete verification path and forbids leaving throwing adapters.
- Type consistency: command flag names use lowercase hyphenated CLI keys in both manifest and route plans; internal service calls map them to existing camelCase or snake_case schemas.
