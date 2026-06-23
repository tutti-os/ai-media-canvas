import type { BackgroundJob } from "@aimc/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../auth/types.js";
import { loadServerEnv } from "../config/env.js";
import {
  clearProviders,
  registerImageProvider,
} from "../generation/providers/registry.js";
import { createJobOperations } from "./job-operations.js";

const localUser: AuthenticatedUser = {
  email: "local@example.com",
  id: "local-user",
  userMetadata: {},
};

describe("createJobOperations", () => {
  afterEach(() => {
    clearProviders();
  });

  it("stores the current registered image model when a job omits model", async () => {
    const createJob = vi.fn(async (_user, input) => {
      return {
        id: "job-1",
        workspace_id: input.workspaceId,
        project_id: input.projectId ?? null,
        canvas_id: input.canvasId ?? null,
        session_id: input.sessionId ?? null,
        thread_id: input.threadId ?? null,
        queue_name: "image_generation_jobs",
        job_type: input.jobType,
        status: "queued",
        payload: input.payload,
        result: null,
        error_code: null,
        error_message: null,
        attempt_count: 0,
        max_attempts: 3,
        created_by: localUser.id,
        created_at: "2026-06-10T00:00:00.000Z",
        updated_at: "2026-06-10T00:00:00.000Z",
        started_at: null,
        completed_at: null,
        failed_at: null,
        canceled_at: null,
        remote_provider: null,
        remote_task_id: null,
        remote_status: null,
        remote_updated_at: null,
      } satisfies BackgroundJob;
    });
    const operations = createJobOperations({
      env: loadServerEnv({ agnesApiKey: "test-key" }),
      jobService: { createJob } as never,
      localUser,
    });

    await operations.createImageJob({ prompt: "blue icon" });

    expect(createJob).toHaveBeenCalledWith(
      localUser,
      expect.objectContaining({
        payload: expect.objectContaining({
          model: "codex/gpt-image-2",
        }),
      }),
    );
  });

  it("stores Codex image delegation metadata on proxied image jobs", async () => {
    registerImageProvider({
      name: "codex-imagegen",
      models: [
        {
          id: "codex/gpt-image-2",
          displayName: "GPT Image 2",
          description: "Codex image generation",
        },
      ],
      async generate() {
        throw new Error("not used");
      },
    });
    const createJob = vi.fn(async (_user, input) => {
      return {
        id: "job-1",
        workspace_id: input.workspaceId,
        project_id: input.projectId ?? null,
        canvas_id: input.canvasId ?? null,
        session_id: input.sessionId ?? null,
        thread_id: input.threadId ?? null,
        queue_name: "image_generation_jobs",
        job_type: input.jobType,
        status: "queued",
        payload: input.payload,
        result: null,
        error_code: null,
        error_message: null,
        attempt_count: 0,
        max_attempts: 3,
        created_by: localUser.id,
        created_at: "2026-06-10T00:00:00.000Z",
        updated_at: "2026-06-10T00:00:00.000Z",
        started_at: null,
        completed_at: null,
        failed_at: null,
        canceled_at: null,
        remote_provider: null,
        remote_task_id: null,
        remote_status: null,
        remote_updated_at: null,
      } satisfies BackgroundJob;
    });
    const operations = createJobOperations({
      env: loadServerEnv({ codexImagegenEnabled: true }),
      jobService: { createJob } as never,
      localUser,
    });

    await operations.createImageJob({
      prompt: "poster",
      model: "codex/gpt-image-2",
      caller_provider: "claude",
      codex_imagegen_consent: "allow-once",
      codex_imagegen_delegation_allowed: true,
    });

    expect(createJob).toHaveBeenCalledWith(
      localUser,
      expect.objectContaining({
        payload: expect.objectContaining({
          caller_provider: "claude",
          codex_imagegen_consent: "allow-once",
          codex_imagegen_delegation_allowed: true,
        }),
      }),
    );
  });

  it("rejects proxied Codex image jobs from non-Codex callers without consent", async () => {
    registerImageProvider({
      name: "codex-imagegen",
      models: [
        {
          id: "codex/gpt-image-2",
          displayName: "GPT Image 2",
          description: "Codex image generation",
        },
      ],
      async generate() {
        throw new Error("not used");
      },
    });
    const createJob = vi.fn();
    const operations = createJobOperations({
      env: loadServerEnv({ codexImagegenEnabled: true }),
      jobService: { createJob } as never,
      localUser,
    });

    await expect(
      operations.createImageJob({
        prompt: "poster",
        model: "codex/gpt-image-2",
        caller_provider: "claude",
      }),
    ).rejects.toMatchObject({
      code: "codex_imagegen_confirmation_required",
      statusCode: 409,
    });
    expect(createJob).not.toHaveBeenCalled();
  });

  it("persists allowed delegation metadata when workspace setting is always", async () => {
    registerImageProvider({
      name: "codex-imagegen",
      models: [
        {
          id: "codex/gpt-image-2",
          displayName: "GPT Image 2",
          description: "Codex image generation",
        },
      ],
      async generate() {
        throw new Error("not used");
      },
    });
    const createJob = vi.fn(async (_user, input) => {
      return {
        id: "job-1",
        workspace_id: input.workspaceId,
        project_id: input.projectId ?? null,
        canvas_id: input.canvasId ?? null,
        session_id: input.sessionId ?? null,
        thread_id: input.threadId ?? null,
        queue_name: "image_generation_jobs",
        job_type: input.jobType,
        status: "queued",
        payload: input.payload,
        result: null,
        error_code: null,
        error_message: null,
        attempt_count: 0,
        max_attempts: 3,
        created_by: localUser.id,
        created_at: "2026-06-10T00:00:00.000Z",
        updated_at: "2026-06-10T00:00:00.000Z",
        started_at: null,
        completed_at: null,
        failed_at: null,
        canceled_at: null,
        remote_provider: null,
        remote_task_id: null,
        remote_status: null,
        remote_updated_at: null,
      } satisfies BackgroundJob;
    });
    const operations = createJobOperations({
      env: loadServerEnv({ codexImagegenEnabled: true }),
      jobService: { createJob } as never,
      localUser,
      settingsService: {
        getWorkspaceSettings: vi.fn(async () => ({
          codexImagegenDelegation: "always",
        })),
        getEffectiveServerEnv: vi.fn(async () =>
          loadServerEnv({ codexImagegenEnabled: true }),
        ),
      } as never,
    });

    await operations.createImageJob({
      prompt: "poster",
      model: "codex/gpt-image-2",
      caller_provider: "claude",
    });

    expect(createJob).toHaveBeenCalledWith(
      localUser,
      expect.objectContaining({
        payload: expect.objectContaining({
          caller_provider: "claude",
          codex_imagegen_delegation_allowed: true,
        }),
      }),
    );
  });
});
