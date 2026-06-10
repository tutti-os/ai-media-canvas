import {
  type CanvasContent,
  canvasGetResponseSchema,
  canvasSaveResponseSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import type { CanvasService } from "../features/canvas/canvas-service.js";

export type CanvasOperations = ReturnType<typeof createCanvasOperations>;

export function createCanvasOperations(options: {
  localUser: AuthenticatedUser;
  canvasService: CanvasService;
}) {
  return {
    async getCanvas(canvasId: string) {
      const canvas = await options.canvasService.getCanvas(
        options.localUser,
        canvasId,
      );
      return canvasGetResponseSchema.parse({ canvas });
    },
    async saveCanvas(canvasId: string, content: CanvasContent) {
      await options.canvasService.saveCanvasContent(
        options.localUser,
        canvasId,
        content,
      );
      return canvasSaveResponseSchema.parse({ ok: true });
    },
  };
}
