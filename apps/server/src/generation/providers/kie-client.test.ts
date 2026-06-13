import { afterEach, describe, expect, it, vi } from "vitest";

import {
  KieClient,
  getFirstKieMarketResultUrl,
  getFirstKieRunwayResultUrl,
  getFirstKieVeoResultUrl,
} from "./kie-client.js";

describe("KieClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates Market tasks with bearer auth and JSON payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          msg: "success",
          data: { taskId: "task_market_1" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new KieClient("test-key", {
      apiBase: "https://kie.example",
    });
    const taskId = await client.createMarketTask({
      model: "google/nano-banana",
      input: { prompt: "red mug" },
    });

    expect(taskId).toBe("task_market_1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://kie.example/api/v1/jobs/createTask",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          model: "google/nano-banana",
          input: { prompt: "red mug" },
        }),
      }),
    );
  });

  it("throws a GenerationError for Kie API failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 402, msg: "no credits" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const client = new KieClient("test-key");

    await expect(
      client.createMarketTask({
        model: "z-image",
        input: { prompt: "red mug" },
      }),
    ).rejects.toMatchObject({
      provider: "kie",
      code: "api_error",
      message: expect.stringContaining("no credits"),
    });
  });

  it("keeps network failure details for diagnostics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        Object.assign(new TypeError("fetch failed"), {
          cause: Object.assign(new Error("socket closed"), {
            code: "UND_ERR_SOCKET",
          }),
        }),
      ),
    );

    const client = new KieClient("test-key");

    await expect(
      client.createMarketTask({
        model: "z-image",
        input: { prompt: "red mug" },
      }),
    ).rejects.toMatchObject({
      provider: "kie",
      code: "network_error",
      message: expect.stringContaining("UND_ERR_SOCKET"),
    });
  });

  it("parses Market resultJson media URLs", () => {
    expect(
      getFirstKieMarketResultUrl({
        taskId: "task_1",
        state: "success",
        resultJson: JSON.stringify({
          resultUrls: ["https://cdn.example/image.png"],
        }),
      }),
    ).toBe("https://cdn.example/image.png");
  });

  it("parses Runway generated video URLs", () => {
    expect(
      getFirstKieRunwayResultUrl({
        taskId: "runway_1",
        state: "success",
        videoInfo: {
          videoUrl: "https://cdn.example/runway.mp4",
          imageUrl: "https://cdn.example/runway.png",
        },
      }),
    ).toBe("https://cdn.example/runway.mp4");
  });

  it("parses Veo generated video URLs", () => {
    expect(
      getFirstKieVeoResultUrl({
        taskId: "veo_1",
        successFlag: 1,
        response: {
          resultUrls: ["https://cdn.example/veo.mp4"],
        },
      }),
    ).toBe("https://cdn.example/veo.mp4");
  });
});
