// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  fetchWorkspaceSettings,
  fetchViewer,
  fetchProjects,
  createProject,
  updateWorkspaceSettings,
  generateImageDirect,
  generateVideoDirect,
} from "../src/lib/server-api";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("local server API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AIMC_SERVER_BASE_URL", "http://localhost:3001");
  });

  it("fetchViewer calls the local viewer endpoint and returns the viewer", async () => {
    const viewer = {
      profile: { id: "u1", email: "a@b.com", displayName: "A", avatarUrl: null },
    };
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => viewer });

    const result = await fetchViewer();
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3001/api/viewer");
    expect(result.profile.id).toBe("u1");
  });

  it("createProject sends POST without auth headers and handles 201", async () => {
    const project = {
      project: {
        id: "p1", name: "Test", slug: "test", description: null,
        primaryCanvas: { id: "c1", name: "Main Canvas", isPrimary: true },
        createdAt: "2026-03-23T00:00:00Z", updatedAt: "2026-03-23T00:00:00Z",
      },
    };
    mockFetch.mockResolvedValue({ ok: true, status: 201, json: async () => project });

    const result = await createProject({ name: "Test" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/projects",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      },
    );
    expect(result.project.id).toBe("p1");
  });

  it("fetchProjects returns the local project list", async () => {
    const list = { projects: [{ id: "p1", name: "Test", slug: "test" }] };
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => list });

    const result = await fetchProjects();
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3001/api/projects");
    expect(result.projects).toHaveLength(1);
  });

  it("createProject throws ApiApplicationError with code on 409", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: { code: "project_slug_taken", message: "Slug taken." },
      }),
    });

    await expect(createProject({ name: "Dup" })).rejects.toThrow(
      "Slug taken.",
    );
    try {
      await createProject({ name: "Dup" });
    } catch (err) {
      expect((err as any).code).toBe("project_slug_taken");
    }
  });

  it("fetchViewer surfaces server-side local API errors", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: "unauthorized", message: "Bad token." },
      }),
    });

    await expect(fetchViewer()).rejects.toThrow("Bad token.");
  });

  it("fetchProjects surfaces server-side local API errors", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: "unauthorized", message: "Bad token." },
      }),
    });

    await expect(fetchProjects()).rejects.toThrow("Bad token.");
  });

  it("fetchWorkspaceSettings reads local provider settings", async () => {
    const payload = {
      settings: {
        defaultModel: "openai:gpt-4.1",
        openAIApiKey: "sk-local-openai",
        openAIApiBase: "http://127.0.0.1:4000/v1",
        anthropicApiKey: "sk-local-anthropic",
        anthropicBaseUrl: "https://api.anthropic.com",
        agnesApiKey: "sk-local-agnes",
        agnesBaseUrl: "https://agnes.example/v1",
        agnesDefaultModel: "agnes:agnes-2.0-flash",
        googleApiKey: "",
        googleVertexProject: "",
        googleVertexLocation: "",
        googleVertexVideoLocation: "",
        replicateApiToken: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    };
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => payload });

    const result = await fetchWorkspaceSettings();
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/workspace/settings",
    );
    expect(result.settings.defaultModel).toBe("openai:gpt-4.1");
  });

  it("updateWorkspaceSettings sends the full local settings payload", async () => {
    const payload = {
      settings: {
        defaultModel: "google:gemini-2.5-flash",
        openAIApiKey: "",
        openAIApiBase: "",
        anthropicApiKey: "sk-local-anthropic",
        anthropicBaseUrl: "https://api.anthropic.com",
        agnesApiKey: "sk-local-agnes",
        agnesBaseUrl: "https://agnes.example/v1",
        agnesDefaultModel: "agnes:agnes-2.0-flash",
        googleApiKey: "google-local-key",
        googleVertexProject: "vertex-project",
        googleVertexLocation: "global",
        googleVertexVideoLocation: "us-central1",
        replicateApiToken: "replicate-local-token",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    };
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => payload });

    const result = await updateWorkspaceSettings(payload.settings);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/workspace/settings",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload.settings),
      },
    );
    expect(result.settings.googleApiKey).toBe("google-local-key");
    expect(result.settings.anthropicApiKey).toBe("sk-local-anthropic");
    expect(result.settings.agnesApiKey).toBe("sk-local-agnes");
  });

  it("generateImageDirect creates an image job and polls for the stored result", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          job: {
            id: "job-image-1",
            status: "queued",
            result: null,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          job: {
            id: "job-image-1",
            status: "succeeded",
            result: {
              signed_url: "http://localhost:3001/assets/image.png",
              asset_id: "asset-image-1",
              mime_type: "image/png",
              width: 1024,
              height: 1024,
            },
          },
        }),
      });

    const result = await generateImageDirect("生成一张海报", {
      model: "agnes-image/agnes-image-2.1-flash",
      aspectRatio: "1:1",
      quality: "hd",
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/api/jobs/image-generation",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: "生成一张海报",
          model: "agnes-image/agnes-image-2.1-flash",
          aspect_ratio: "1:1",
          quality: "hd",
        }),
      },
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/api/jobs/job-image-1",
    );
    expect(result).toEqual({
      url: "http://localhost:3001/assets/image.png",
      assetId: "asset-image-1",
      prompt: "生成一张海报",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
    });
  });

  it("generateVideoDirect creates a video job and polls for the stored result", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          job: {
            id: "job-video-1",
            status: "queued",
            result: null,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          job: {
            id: "job-video-1",
            status: "succeeded",
            result: {
              signed_url: "http://localhost:3001/assets/video.mp4",
              asset_id: "asset-video-1",
              mime_type: "video/mp4",
              width: 1280,
              height: 720,
              duration_seconds: 5,
            },
          },
        }),
      });

    const result = await generateVideoDirect("生成一段产品视频", {
      model: "agnes-video/agnes-video-v2.0",
      duration: 5,
      resolution: "720p",
      aspectRatio: "16:9",
      projectId: "project-1",
      canvasId: "canvas-1",
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/api/jobs/video-generation",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: "生成一段产品视频",
          model: "agnes-video/agnes-video-v2.0",
          duration: 5,
          resolution: "720p",
          aspect_ratio: "16:9",
          project_id: "project-1",
          canvas_id: "canvas-1",
        }),
      },
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/api/jobs/job-video-1",
    );
    expect(result).toEqual({
      url: "http://localhost:3001/assets/video.mp4",
      assetId: "asset-video-1",
      prompt: "生成一段产品视频",
      mimeType: "video/mp4",
      width: 1280,
      height: 720,
      durationSeconds: 5,
    });
  });
});
