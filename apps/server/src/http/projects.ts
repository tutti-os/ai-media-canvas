import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  projectCreateRequestSchema,
  projectUpdateRequestSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import {
  type ProjectService,
  ProjectServiceError,
} from "../features/projects/project-service.js";
import {
  type ProjectOperations,
  createProjectOperations,
} from "./project-operations.js";

export async function registerProjectRoutes(
  app: FastifyInstance,
  options: {
    localUser: AuthenticatedUser;
    projectService: ProjectService;
    projectOperations?: ProjectOperations;
  },
) {
  const projectOperations =
    options.projectOperations ??
    createProjectOperations({
      localUser: options.localUser,
      projectService: options.projectService,
    });

  app.get("/api/projects/:projectId", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      return reply
        .code(200)
        .send(await projectOperations.getProject(projectId));
    } catch (error) {
      return sendProjectError(error, reply, "project_query_failed");
    }
  });

  app.get("/api/projects", async (request, reply) => {
    try {
      return reply.code(200).send(await projectOperations.listProjects());
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
      return reply
        .code(201)
        .send(await projectOperations.createProject(payload));
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
      await options.projectService.updateProject(
        options.localUser,
        projectId,
        payload,
      );

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
