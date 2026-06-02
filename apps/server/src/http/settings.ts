import type { FastifyInstance } from "fastify";

import {
  applicationErrorResponseSchema,
  workspaceSettingsResponseSchema,
  workspaceSettingsUpdateRequestSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import {
  LOCAL_WORKSPACE_ID,
  type SettingsService,
} from "../features/settings/settings-service.js";

export async function registerSettingsRoutes(
  app: FastifyInstance,
  options: {
    localUser: AuthenticatedUser;
    settingsService: SettingsService;
  },
) {
  app.get("/api/workspace/settings", async (_request, reply) => {
    try {
      const settings = await options.settingsService.getWorkspaceSettings(
        options.localUser,
        LOCAL_WORKSPACE_ID,
      );
      return reply.code(200).send(
        workspaceSettingsResponseSchema.parse({ settings }),
      );
    } catch {
      return reply.code(500).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "application_error",
            message: "Unable to load local workspace settings.",
          },
        }),
      );
    }
  });

  app.put("/api/workspace/settings", async (request, reply) => {
    try {
      const payload = workspaceSettingsUpdateRequestSchema.parse(request.body);
      const settings = await options.settingsService.updateWorkspaceSettings(
        options.localUser,
        LOCAL_WORKSPACE_ID,
        payload,
      );
      return reply.code(200).send(
        workspaceSettingsResponseSchema.parse({ settings }),
      );
    } catch {
      return reply.code(500).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "application_error",
            message: "Unable to update local workspace settings.",
          },
        }),
      );
    }
  });
}
