import { afterEach, describe, expect, it } from "vitest";

import { ConnectionManager } from "../../ws/connection-manager.js";
import { createScreenshotCanvasTool } from "./screenshot-canvas.js";

type FakeSocket = {
  readyState: number;
  sent: string[];
  send: (payload: string) => void;
};

function createFakeSocket(): FakeSocket {
  const sent: string[] = [];
  return {
    readyState: 1,
    sent,
    send(payload: string) {
      sent.push(payload);
    },
  };
}

const managers: ConnectionManager[] = [];

afterEach(() => {
  for (const manager of managers.splice(0)) {
    manager.dispose();
  }
});

describe("screenshot_canvas", () => {
  it("routes the RPC to the connection bound to the current canvas", async () => {
    const connectionManager = new ConnectionManager();
    managers.push(connectionManager);

    const otherCanvasSocket = createFakeSocket();
    connectionManager.register("conn-a", "user-1", otherCanvasSocket as any);
    connectionManager.bindCanvas("conn-a", "canvas-a");

    const currentCanvasSocket = createFakeSocket();
    connectionManager.register("conn-b", "user-1", currentCanvasSocket as any);
    connectionManager.bindCanvas("conn-b", "canvas-b");

    const tool = createScreenshotCanvasTool({ connectionManager });
    const resultPromise = (tool.func as (
      input: { mode: "full"; max_dimension: number },
      runManager?: unknown,
      config?: { configurable: { canvas_id: string; connection_id?: string; user_id: string } },
    ) => Promise<string>)(
      { mode: "full", max_dimension: 1024 },
      undefined,
      {
        configurable: {
          canvas_id: "canvas-b",
          user_id: "user-1",
        },
      },
    );

    expect(otherCanvasSocket.sent).toHaveLength(0);
    expect(currentCanvasSocket.sent).toHaveLength(1);

    const request = JSON.parse(currentCanvasSocket.sent[0]) as {
      id: string;
      method: string;
      params: Record<string, unknown>;
      type: string;
    };

    expect(request.type).toBe("rpc.request");
    expect(request.method).toBe("canvas.screenshot");
    expect(request.params).toMatchObject({
      mode: "full",
      max_dimension: 1024,
    });

    connectionManager.handleRpcResponse("conn-b", {
      type: "rpc.response",
      id: request.id,
      result: {
        url: "data:image/png;base64,abc",
        width: 1320,
        height: 1960,
      },
    });

    await expect(resultPromise).resolves.toBe(
      JSON.stringify({
        summary: "Canvas screenshot captured (1320x1960, mode: full)",
        width: 1320,
        height: 1960,
      }),
    );
  });

  it("prefers the run's exact connection when the same canvas is open in multiple tabs", async () => {
    const connectionManager = new ConnectionManager();
    managers.push(connectionManager);

    const firstTabSocket = createFakeSocket();
    connectionManager.register("conn-a", "user-1", firstTabSocket as any);
    connectionManager.bindCanvas("conn-a", "canvas-shared");

    const secondTabSocket = createFakeSocket();
    connectionManager.register("conn-b", "user-1", secondTabSocket as any);
    connectionManager.bindCanvas("conn-b", "canvas-shared");

    const tool = createScreenshotCanvasTool({ connectionManager });
    const resultPromise = (tool.func as (
      input: { mode: "full"; max_dimension: number },
      runManager?: unknown,
      config?: { configurable: { canvas_id: string; connection_id: string; user_id: string } },
    ) => Promise<string>)(
      { mode: "full", max_dimension: 1024 },
      undefined,
      {
        configurable: {
          canvas_id: "canvas-shared",
          connection_id: "conn-b",
          user_id: "user-1",
        },
      },
    );

    expect(firstTabSocket.sent).toHaveLength(0);
    expect(secondTabSocket.sent).toHaveLength(1);

    const request = JSON.parse(secondTabSocket.sent[0]) as { id: string };

    connectionManager.handleRpcResponse("conn-b", {
      type: "rpc.response",
      id: request.id,
      result: {
        url: "data:image/png;base64,abc",
        width: 800,
        height: 600,
      },
    });

    await expect(resultPromise).resolves.toBe(
      JSON.stringify({
        summary: "Canvas screenshot captured (800x600, mode: full)",
        width: 800,
        height: 600,
      }),
    );
  });
});
