import { describe, expect, it } from "vitest";

import { createInspectCanvasTool } from "./inspect-canvas.js";
import { createManipulateCanvasTool } from "./manipulate-canvas.js";

function createUserClientWithElements(
  elements: Array<Record<string, unknown>>,
) {
  const state = {
    content: {
      elements: structuredClone(elements),
      appState: {},
    },
  };

  return {
    getContent() {
      return state.content;
    },
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
  it("does not expose delete as a normal canvas manipulation action", async () => {
    const tool = createManipulateCanvasTool({
      createUserClient: () => createUserClientWithElements([]),
    });

    expect(tool.description).not.toContain("delete");
    expect(tool.description).toContain(
      "Do not add text, shapes, lines, buttons, or decorative labels around generated media",
    );
    expect(tool.description).toContain(
      "read real element bounds with inspect_canvas",
    );

    await expect(
      (tool.invoke as (input: unknown, config?: unknown) => Promise<string>)(
        {
          operations: [
            {
              action: "delete",
              element_id: "shape-1",
              user_confirmed: true,
            },
          ],
        },
        {
          configurable: {
            canvas_id: "canvas-1",
            access_token: "token-1",
          },
        },
      ),
    ).rejects.toThrow();
  });

  it("requires inspect_canvas before layout-changing operations", async () => {
    const layoutInspectionState = {};
    const tool = createManipulateCanvasTool({
      createUserClient: () => createUserClientWithElements([]),
      layoutInspectionState,
    });

    const result = await (
      tool.invoke as (input: unknown, config?: unknown) => Promise<string>
    )(
      {
        operations: [
          {
            action: "add_text",
            text: "产品说明",
            x: 100,
            y: 100,
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
      success: false,
      error: "layout_inspection_required",
    });
  });

  it("allows layout-changing operations after inspect_canvas in the same run", async () => {
    const layoutInspectionState = {};
    const createUserClient = () => createUserClientWithElements([]);
    const inspectTool = createInspectCanvasTool({
      createUserClient,
      layoutInspectionState,
    });
    const manipulateTool = createManipulateCanvasTool({
      createUserClient,
      layoutInspectionState,
    });
    const config = {
      configurable: {
        canvas_id: "canvas-1",
        access_token: "token-1",
      },
    };

    await (
      inspectTool.invoke as (
        input: unknown,
        config?: unknown,
      ) => Promise<string>
    )({ detail_level: "summary" }, config);
    const result = await (
      manipulateTool.invoke as (
        input: unknown,
        config?: unknown,
      ) => Promise<string>
    )(
      {
        operations: [
          {
            action: "add_text",
            element_id: null,
            text: "产品说明",
            x: 100,
            y: 100,
          },
        ],
      },
      config,
    );

    expect(JSON.parse(result)).toMatchObject({
      success: true,
      applied: 1,
    });

    const nextResult = await (
      manipulateTool.invoke as (
        input: unknown,
        config?: unknown,
      ) => Promise<string>
    )(
      {
        operations: [
          {
            action: "add_text",
            text: "第二段说明",
            x: 140,
            y: 140,
          },
        ],
      },
      config,
    );

    expect(JSON.parse(nextResult)).toMatchObject({
      success: false,
      error: "layout_inspection_required",
    });
  });

  it("rejects layout operations that introduce element overlaps", async () => {
    const layoutInspectionState = {};
    const client = createUserClientWithElements([
      {
        id: "image-1",
        type: "image",
        x: 0,
        y: 0,
        width: 200,
        height: 120,
        isDeleted: false,
      },
      {
        id: "image-2",
        type: "image",
        x: 260,
        y: 0,
        width: 200,
        height: 120,
        isDeleted: false,
      },
    ]);
    const createUserClient = () => client;
    const inspectTool = createInspectCanvasTool({
      createUserClient,
      layoutInspectionState,
    });
    const manipulateTool = createManipulateCanvasTool({
      createUserClient,
      layoutInspectionState,
    });
    const config = {
      configurable: {
        canvas_id: "canvas-1",
        access_token: "token-1",
      },
    };

    await (
      inspectTool.invoke as (
        input: unknown,
        config?: unknown,
      ) => Promise<string>
    )({ detail_level: "summary" }, config);
    const result = await (
      manipulateTool.invoke as (
        input: unknown,
        config?: unknown,
      ) => Promise<string>
    )(
      {
        operations: [
          {
            action: "move",
            element_id: "image-2",
            x: 100,
            y: 40,
          },
        ],
      },
      config,
    );

    expect(JSON.parse(result)).toMatchObject({
      success: false,
      error: "layout_overlap_detected",
      conflicts: [
        {
          movingElementId: "image-2",
          overlappingElementId: "image-1",
        },
      ],
    });
    expect(
      client.getContent().elements.find((el) => el.id === "image-2"),
    ).toMatchObject({
      x: 260,
      y: 0,
    });
  });
});
