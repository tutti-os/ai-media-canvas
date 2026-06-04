import { describe, expect, it, vi } from "vitest";

import { ConnectionManager } from "./connection-manager.js";

function createSocket() {
  return {
    readyState: 1,
    send: vi.fn(),
  };
}

describe("ConnectionManager", () => {
  it("does not let a stale socket remove a replaced connection", () => {
    const manager = new ConnectionManager();
    const oldSocket = createSocket();
    const newSocket = createSocket();

    manager.register("conn_1", "user_1", oldSocket as any);
    manager.bindCanvas("conn_1", "canvas_1");
    manager.register("conn_1", "user_1", newSocket as any);
    manager.bindCanvas("conn_1", "canvas_1");

    manager.remove("conn_1", oldSocket as any);
    manager.sendTo("conn_1", { type: "probe" });

    expect(oldSocket.send).not.toHaveBeenCalled();
    expect(newSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: "probe" }));
  });
});
