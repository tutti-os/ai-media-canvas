import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  assetSignedUrlResponseSchema,
  managedFileAssetCreateRequestSchema,
  uploadResponseSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import {
  type UploadService,
  UploadServiceError,
} from "../features/uploads/upload-service.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export async function registerUploadRoutes(
  app: FastifyInstance,
  options: {
    localUser: AuthenticatedUser;
    uploadService: UploadService;
  },
) {
  // Upload a file
  app.post("/api/uploads", async (request, reply) => {
    try {
      const file = await request.file();
      if (!file) {
        return reply.code(400).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "upload_failed",
              message: "No file provided.",
            },
          }),
        );
      }

      const mimeType = file.mimetype;
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return reply.code(400).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "upload_failed",
              message: `Unsupported file type: ${mimeType}. Allowed: ${[...ALLOWED_MIME_TYPES].join(", ")}`,
            },
          }),
        );
      }

      const fileBuffer = await file.toBuffer();

      // Extract projectId from fields if provided
      const projectId =
        typeof file.fields.projectId === "object" &&
        file.fields.projectId !== null &&
        "value" in file.fields.projectId
          ? String(file.fields.projectId.value)
          : undefined;

      const result = await options.uploadService.uploadFile(options.localUser, {
        bucket: "project-assets",
        fileName: file.filename,
        fileBuffer,
        mimeType,
        ...(projectId ? { projectId } : {}),
      });

      return reply.code(201).send(uploadResponseSchema.parse(result));
    } catch (error) {
      return sendUploadError(error, reply);
    }
  });

  // Create an app asset record for a file already uploaded through the Tutti
  // workspace file bridge.
  app.post("/api/uploads/managed-file", async (request, reply) => {
    const parsed = managedFileAssetCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "upload_failed",
            message: "Invalid managed file asset metadata.",
          },
        }),
      );
    }

    try {
      const result = await options.uploadService.createManagedFileAsset(
        options.localUser,
        {
          bucket: "project-assets",
          file: parsed.data.file,
          ...(parsed.data.projectId
            ? { projectId: parsed.data.projectId }
            : {}),
        },
      );

      return reply.code(201).send(uploadResponseSchema.parse(result));
    } catch (error) {
      return sendUploadError(error, reply);
    }
  });

  // Get signed URL for an asset
  app.get<{ Params: { assetId: string } }>(
    "/api/uploads/:assetId/url",
    async (request, reply) => {
      try {
        const url = await options.uploadService.getAssetUrl(
          options.localUser,
          request.params.assetId,
        );

        return reply
          .code(200)
          .send(assetSignedUrlResponseSchema.parse({ url }));
      } catch (error) {
        return sendUploadError(error, reply);
      }
    },
  );

  // Delete an asset
  app.delete<{ Params: { assetId: string } }>(
    "/api/uploads/:assetId",
    async (request, reply) => {
      try {
        await options.uploadService.deleteAsset(
          options.localUser,
          request.params.assetId,
        );

        return reply.code(200).send({ ok: true });
      } catch (error) {
        return sendUploadError(error, reply);
      }
    },
  );
}

function sendUploadError(error: unknown, reply: FastifyReply) {
  if (error instanceof UploadServiceError) {
    return reply.code(error.statusCode).send(
      applicationErrorResponseSchema.parse({
        error: {
          code: error.code,
          message: error.message,
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
