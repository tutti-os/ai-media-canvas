import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  skillCreateRequestSchema,
  skillDetailResponseSchema,
  skillImportRequestSchema,
  skillListResponseSchema,
  skillToggleRequestSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import {
  SkillServiceError,
  type SkillService,
} from "../features/skills/skill-service.js";

export async function registerSkillRoutes(
  app: FastifyInstance,
  options: {
    localUser: AuthenticatedUser;
    skillService: SkillService;
  },
) {
  app.get("/api/skills", async (_request, reply) => {
    try {
      const skills = await options.skillService.listInstalledSkills(options.localUser);
      return reply.code(200).send(skillListResponseSchema.parse({ skills }));
    } catch (error) {
      return sendSkillError(error, reply, "skill_query_failed");
    }
  });

  app.get("/api/skills/catalog", async (_request, reply) => {
    try {
      const skills = await options.skillService.listCatalogSkills(options.localUser);
      return reply.code(200).send(skillListResponseSchema.parse({ skills }));
    } catch (error) {
      return sendSkillError(error, reply, "skill_query_failed");
    }
  });

  app.get("/api/skills/:skillId", async (request, reply) => {
    try {
      const { skillId } = request.params as { skillId: string };
      const skill = await options.skillService.getSkillDetail(options.localUser, skillId);
      return reply.code(200).send(skillDetailResponseSchema.parse({ skill }));
    } catch (error) {
      return sendSkillError(error, reply, "skill_query_failed");
    }
  });

  app.post("/api/skills", async (request, reply) => {
    try {
      const payload = skillCreateRequestSchema.parse(request.body);
      const skill = await options.skillService.createSkill(options.localUser, payload);
      return reply.code(201).send(skillDetailResponseSchema.parse({ skill }));
    } catch (error) {
      if (isZodError(error)) {
        return sendValidationError(reply);
      }
      return sendSkillError(error, reply, "skill_create_failed");
    }
  });

  app.post("/api/skills/import", async (request, reply) => {
    try {
      const payload = skillImportRequestSchema.parse(request.body);
      const skill = await options.skillService.importSkill(options.localUser, payload);
      return reply.code(201).send(skillDetailResponseSchema.parse({ skill }));
    } catch (error) {
      if (isZodError(error)) {
        return sendValidationError(reply);
      }
      return sendSkillError(error, reply, "skill_import_failed");
    }
  });

  app.post("/api/skills/catalog/:skillId/install", async (request, reply) => {
    try {
      const { skillId } = request.params as { skillId: string };
      const skill = await options.skillService.installCatalogSkill(options.localUser, skillId);
      return reply.code(200).send(skillDetailResponseSchema.parse({ skill }));
    } catch (error) {
      return sendSkillError(error, reply, "skill_install_failed");
    }
  });

  app.patch("/api/skills/:skillId", async (request, reply) => {
    try {
      const payload = skillToggleRequestSchema.parse(request.body);
      const { skillId } = request.params as { skillId: string };
      const skill = await options.skillService.toggleSkill(options.localUser, skillId, payload);
      return reply.code(200).send(skillDetailResponseSchema.parse({ skill }));
    } catch (error) {
      if (isZodError(error)) {
        return sendValidationError(reply);
      }
      return sendSkillError(error, reply, "skill_toggle_failed");
    }
  });

  app.delete("/api/skills/:skillId", async (request, reply) => {
    try {
      const { skillId } = request.params as { skillId: string };
      await options.skillService.uninstallSkill(options.localUser, skillId);
      return reply.code(204).send();
    } catch (error) {
      return sendSkillError(error, reply, "skill_uninstall_failed");
    }
  });
}

function sendValidationError(reply: FastifyReply) {
  return reply.code(400).send(
    applicationErrorResponseSchema.parse({
      error: {
        code: "application_error",
        message: "Invalid request body.",
      },
    }),
  );
}

function sendSkillError(
  error: unknown,
  reply: FastifyReply,
  fallbackCode:
    | "skill_create_failed"
    | "skill_import_failed"
    | "skill_install_failed"
    | "skill_query_failed"
    | "skill_toggle_failed"
    | "skill_uninstall_failed",
) {
  if (error instanceof SkillServiceError) {
    return reply.code(error.statusCode).send(
      applicationErrorResponseSchema.parse({
        error: {
          code: error.code,
          message: error.message,
        },
      }),
    );
  }

  const fallbackMessages: Record<typeof fallbackCode, string> = {
    skill_create_failed: "Unable to create local skill.",
    skill_import_failed: "Unable to import local skill.",
    skill_install_failed: "Unable to install bundled skill.",
    skill_query_failed: "Unable to load local skills.",
    skill_toggle_failed: "Unable to update local skill state.",
    skill_uninstall_failed: "Unable to uninstall local skill.",
  };

  return reply.code(500).send(
    applicationErrorResponseSchema.parse({
      error: {
        code: fallbackCode,
        message: fallbackMessages[fallbackCode],
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
