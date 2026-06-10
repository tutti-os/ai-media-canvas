import { describe, expect, it } from "vitest";

import { normalizeCanvasElementIndices } from "../src/lib/canvas-normalize";

describe("normalizeCanvasElementIndices", () => {
  it("repairs missing and duplicate Excalidraw fractional indices", () => {
    const elements: Record<string, unknown>[] = [
      { id: "one", type: "image", index: undefined },
      { id: "two", type: "image", index: "a0" },
      { id: "three", type: "rectangle", index: "a0" },
    ];

    const changed = normalizeCanvasElementIndices(elements);
    const indices = elements.map((element) => element.index);

    expect(changed).toBe(true);
    expect(indices).toEqual(["a0", "a1", "a2"]);
    expect(indices).toEqual([...indices].sort());
    expect(new Set(indices).size).toBe(indices.length);
  });
});
