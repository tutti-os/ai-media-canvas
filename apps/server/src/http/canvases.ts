import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  canvasSaveRequestSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import {
  type CanvasService,
  CanvasServiceError,
} from "../features/canvas/canvas-service.js";
import {
  type CanvasOperations,
  createCanvasOperations,
} from "./canvas-operations.js";

export async function registerCanvasRoutes(
  app: FastifyInstance,
  options: {
    localUser: AuthenticatedUser;
    canvasService: CanvasService;
    canvasOperations?: CanvasOperations;
  },
) {
  const canvasOperations =
    options.canvasOperations ??
    createCanvasOperations({
      localUser: options.localUser,
      canvasService: options.canvasService,
    });

  app.get<{ Params: { canvasId: string } }>(
    "/api/canvases/:canvasId",
    async (request, reply) => {
      try {
        return reply
          .code(200)
          .send(await canvasOperations.getCanvas(request.params.canvasId));
      } catch (error) {
        return sendCanvasError(error, reply);
      }
    },
  );

  app.put<{ Params: { canvasId: string } }>(
    "/api/canvases/:canvasId",
    { bodyLimit: 50 * 1024 * 1024 }, // 50 MB — canvas content includes base64 image data
    async (request, reply) => {
      try {
        const payload = canvasSaveRequestSchema.parse(request.body);
        const response = await canvasOperations.saveCanvas(
          request.params.canvasId,
          payload.content,
          payload.baseRevision === undefined
            ? {}
            : { baseRevision: payload.baseRevision },
        );
        const bodySize = JSON.stringify(request.body).length;
        request.log.info(
          { canvasId: request.params.canvasId, bodyBytes: bodySize },
          "canvas.save OK",
        );
        return reply.code(200).send(response);
      } catch (error) {
        request.log.error(
          { canvasId: request.params.canvasId, err: error },
          "canvas.save FAILED",
        );
        return sendCanvasError(error, reply);
      }
    },
  );
}

function sendCanvasError(error: unknown, reply: FastifyReply) {
  if (error instanceof CanvasServiceError) {
    return reply.code(error.statusCode).send(
      applicationErrorResponseSchema.parse({
        error: {
          code: error.code,
          message: error.message,
        },
      }),
    );
  }

  if (isZodError(error)) {
    return reply.code(400).send(
      applicationErrorResponseSchema.parse({
        error: {
          code: "application_error",
          message: "Invalid request body.",
        },
      }),
    );
  }

  return reply.code(500).send(
    applicationErrorResponseSchema.parse({
      error: {
        code: "application_error",
        message: "Internal server error.",
      },
    }),
  );
}

function isZodError(
  error: unknown,
): error is { issues: unknown[]; name: string } {
  return (
    error instanceof Error &&
    error.name === "ZodError" &&
    "issues" in error &&
    Array.isArray(error.issues)
  );
}
