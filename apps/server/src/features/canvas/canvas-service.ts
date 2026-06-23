import type { CanvasContent, CanvasDetail } from "@aimc/shared";

import type { AuthenticatedUser } from "../../auth/types.js";

export class CanvasServiceError extends Error {
  readonly statusCode: number;
  readonly code: "canvas_not_found" | "canvas_conflict" | "canvas_save_failed";

  constructor(
    code: "canvas_not_found" | "canvas_conflict" | "canvas_save_failed",
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type CanvasService = {
  getCanvas(user: AuthenticatedUser, canvasId: string): Promise<CanvasDetail>;
  saveCanvasContent(
    user: AuthenticatedUser,
    canvasId: string,
    content: CanvasContent,
    options?: { baseRevision?: number },
  ): Promise<{ revision: number }>;
};
