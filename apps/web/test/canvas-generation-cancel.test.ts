import { describe, expect, it, vi } from "vitest";

import { cancelGeneratingCanvasElementsForRun } from "../src/lib/canvas-generation-cancel";

describe("cancelGeneratingCanvasElementsForRun", () => {
  it("marks only generation elements for the canceled run as canceled", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(123456);
    const elements = [
      {
        id: "target-image",
        type: "rectangle",
        strokeColor: "#D1D5DB",
        backgroundColor: "#F3F4F6",
        version: 1,
        customData: {
          type: "image-generator",
          status: "generating",
          runId: "run-target",
          prompt: "image",
          model: "model",
          aspectRatio: "1:1",
          quality: "hd",
        },
      },
      {
        id: "target-video",
        type: "rectangle",
        version: 2,
        customData: {
          type: "video-generator",
          status: "generating",
          runId: "run-target",
          prompt: "video",
          model: "model",
          aspectRatio: "16:9",
          duration: 5,
          resolution: "720p",
        },
      },
      {
        id: "other-run",
        type: "rectangle",
        customData: {
          type: "image-generator",
          status: "generating",
          runId: "run-other",
        },
      },
    ];
    const api = {
      getSceneElements: vi.fn(() => elements),
      updateScene: vi.fn(),
    };

    const count = cancelGeneratingCanvasElementsForRun(
      api,
      "run-target",
      "Generation canceled",
    );

    expect(count).toBe(2);
    expect(api.updateScene).toHaveBeenCalledOnce();
    const scene = api.updateScene.mock.calls[0]?.[0];
    expect(scene?.captureUpdate).toBe("IMMEDIATELY");
    expect(scene?.elements).toHaveLength(3);
    expect(scene?.elements[0]).toMatchObject({
      id: "target-image",
      strokeColor: "#FCA5A5",
      backgroundColor: "#FDECEE",
      updated: 123456,
      version: 2,
      customData: {
        status: "error",
        errorMessage: "Generation canceled",
        runId: "run-target",
      },
    });
    expect(scene?.elements[1]).toMatchObject({
      id: "target-video",
      customData: {
        status: "error",
        errorMessage: "Generation canceled",
        runId: "run-target",
      },
      version: 3,
    });
    expect(scene?.elements[2]).toMatchObject({
      id: "other-run",
      customData: {
        status: "generating",
        runId: "run-other",
      },
    });
    nowSpy.mockRestore();
  });

  it("does not update the scene when no matching nodes are generating", () => {
    const api = {
      getSceneElements: vi.fn(() => [
        {
          id: "completed-image",
          customData: {
            type: "image-generator",
            status: "completed",
            runId: "run-target",
          },
        },
      ]),
      updateScene: vi.fn(),
    };

    expect(
      cancelGeneratingCanvasElementsForRun(api, "run-target", "Canceled"),
    ).toBe(0);
    expect(api.updateScene).not.toHaveBeenCalled();
  });
});
