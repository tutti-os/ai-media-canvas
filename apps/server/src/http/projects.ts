import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  projectCreateRequestSchema,
  projectCreateResponseSchema,
  projectDetailResponseSchema,
  projectListResponseSchema,
  projectUpdateRequestSchema,
} from "@aimc/shared";

import {
  ProjectServiceError,
  type ProjectService,
} from "../features/projects/project-service.js";
import type { AuthenticatedUser } from "../auth/types.js";

export async function registerProjectRoutes(
  app: FastifyInstance,
  options: {
    localUser: AuthenticatedUser;
    projectService: ProjectService;
  },
) {
  app.get("/api/projects/:projectId", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const project = await options.projectService.getProject(options.localUser, projectId);
      return reply.code(200).send(
        projectDetailResponseSchema.parse({
          project: {
            id: project.id,
            name: project.name,
            slug: project.slug,
            description: project.description,
            brandKitId: project.brand_kit_id,
            createdAt: project.created_at,
            updatedAt: project.updated_at,
          },
        }),
      );
    } catch (error) {
      return sendProjectError(error, reply, "project_query_failed");
    }
  });

  app.get("/api/projects", async (request, reply) => {
    try {
      const projects = await options.projectService.listProjects(options.localUser);
      return reply.code(200).send(projectListResponseSchema.parse({ projects }));
    } catch (error) {
      return sendProjectError(error, reply, "project_query_failed");
    }
  });

  app.delete("/api/projects/:projectId", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      await options.projectService.archiveProject(options.localUser, projectId);
      return reply.code(204).send();
    } catch (error) {
      return sendProjectError(error, reply, "application_error");
    }
  });

  app.post("/api/projects", async (request, reply) => {
    try {
      const payload = projectCreateRequestSchema.parse(request.body);
      const project = await options.projectService.createProject(options.localUser, payload);

      return reply.code(201).send(
        projectCreateResponseSchema.parse({
          project,
        }),
      );
    } catch (error) {
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

      return sendProjectError(error, reply, "project_create_failed");
    }
  });

  app.patch("/api/projects/:projectId", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const payload = projectUpdateRequestSchema.parse(request.body);
      await options.projectService.updateProject(options.localUser, projectId, payload);

      return reply.code(204).send();
    } catch (error) {
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

      return sendProjectError(error, reply, "project_update_failed");
    }
  });

  app.put<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/thumbnail",
    { bodyLimit: 2 * 1024 * 1024 }, // 2 MB for thumbnails
    async (request, reply) => {
      try {
        const file = await request.file();
        if (!file) {
          return reply.code(400).send(
            applicationErrorResponseSchema.parse({
              error: {
                code: "upload_failed",
                message: "No file uploaded.",
              },
            }),
          );
        }

        const buffer = await file.toBuffer();
        const mimeType = file.mimetype || "image/webp";

        const result = await options.projectService.saveThumbnail(
          options.localUser,
          request.params.projectId,
          buffer,
          mimeType,
        );

        return reply.code(200).send(result);
      } catch (error) {
        request.log.error({ err: error }, "thumbnail upload error");
        return sendProjectError(error, reply, "project_create_failed");
      }
    },
  );
}

function sendProjectError(
  error: unknown,
  reply: FastifyReply,
  fallbackCode:
    | "application_error"
    | "project_create_failed"
    | "project_query_failed"
    | "project_update_failed",
) {
  if (error instanceof ProjectServiceError) {
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
        code: fallbackCode,
        message:
          fallbackCode === "project_query_failed"
            ? "Unable to load projects."
            : fallbackCode === "project_update_failed"
              ? "Unable to update project."
              : "Unable to create project.",
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
