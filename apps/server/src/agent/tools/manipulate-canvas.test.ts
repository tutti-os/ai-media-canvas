import { describe, expect, it } from "vitest";

import { createManipulateCanvasTool } from "./manipulate-canvas.js";

function createUserClientWithElements(elements: Array<Record<string, unknown>>) {
  const state = {
    content: {
      elements: structuredClone(elements),
      appState: {},
    },
  };

  return {
    from(table: string) {
      expect(table).toBe("canvases");
      return {
        select(_columns: string) {
          return this;
        },
        eq(_column: string, _value: string) {
          return this;
        },
        async single() {
          return { data: state, error: null };
        },
        update(payload: { content: typeof state.content }) {
          state.content = payload.content;
          return {
            async eq(_column: string, _value: string) {
              return { error: null };
            },
          };
        },
      };
    },
  };
}

describe("manipulate_canvas", () => {
  it("refuses delete operations unless they were explicitly confirmed by the user", async () => {
    const tool = createManipulateCanvasTool({
      createUserClient: () =>
        createUserClientWithElements([
          {
            id: "shape-1",
            type: "rectangle",
            x: 0,
            y: 0,
            width: 160,
            height: 80,
            isDeleted: false,
          },
        ]),
    });

    const result = await (tool.invoke as (input: unknown, config?: unknown) => Promise<string>)(
      {
        operations: [
          {
            action: "delete",
            element_id: "shape-1",
          },
        ],
      },
      {
        configurable: {
          canvas_id: "canvas-1",
          access_token: "token-1",
        },
      },
    );

    expect(JSON.parse(result)).toMatchObject({
      success: true,
      applied: 0,
      errors: [
        "[skip] delete requires explicit user confirmation in the current request",
      ],
    });
  });
});
