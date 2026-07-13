import { describe, expect, it, vi } from "vitest";

import { createModelDiscoverySingleFlight } from "./model-discovery-single-flight.js";

describe("model discovery single-flight", () => {
  it("joins identical requests and removes settled entries", async () => {
    const flights = createModelDiscoverySingleFlight();
    const operation = vi.fn(async () => ["models"]);
    const input = {
      workspaceId: "room-1",
      refresh: false,
      credential: "secret",
    };
    const [first, second] = await Promise.all([
      flights.run(input, operation),
      flights.run(input, operation),
    ]);
    expect(first).toEqual(["models"]);
    expect(second).toEqual(["models"]);
    expect(operation).toHaveBeenCalledTimes(1);
    await flights.run(input, operation);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("separates refresh, rooms, and credentials", async () => {
    const flights = createModelDiscoverySingleFlight();
    const operation = vi.fn(async () => "ok");
    await Promise.all([
      flights.run(
        { workspaceId: "room-1", refresh: false, credential: "a" },
        operation,
      ),
      flights.run(
        { workspaceId: "room-1", refresh: true, credential: "a" },
        operation,
      ),
      flights.run(
        { workspaceId: "room-2", refresh: false, credential: "a" },
        operation,
      ),
      flights.run(
        { workspaceId: "room-1", refresh: false, credential: "b" },
        operation,
      ),
    ]);
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it("removes rejected entries so retry can succeed", async () => {
    const flights = createModelDiscoverySingleFlight();
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce("ok");
    const input = { workspaceId: "room-1", refresh: false };
    await expect(flights.run(input, operation)).rejects.toThrow("failed");
    await expect(flights.run(input, operation)).resolves.toBe("ok");
  });
});
