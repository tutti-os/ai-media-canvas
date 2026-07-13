import type { FastifyInstance } from "fastify";

import {
  applicationErrorResponseSchema,
  tuttiManagedConnectionResponseSchema,
  tuttiManagedGrantCreateRequestSchema,
  tuttiManagedGrantResponseSchema,
} from "@aimc/shared";

import type { TuttiManagedCredentialService } from "../features/tutti-managed/credential-service.js";
import { TuttiManagedModelCliUnsupportedError } from "../features/tutti-managed/tutti-cli-client.js";

export async function registerTuttiManagedModelConnectionRoutes(
  app: FastifyInstance,
  options: {
    tuttiManagedCredentials: TuttiManagedCredentialService;
  },
) {
  const routes = ["/api/tutti/managed-model-connection"];

  for (const route of routes) {
    app.get(route, async (_request, reply) => {
      return reply.code(200).send(
        tuttiManagedConnectionResponseSchema.parse({
          connectChallenge:
            options.tuttiManagedCredentials.createConnectChallenge(),
          connection: publicConnection(
            options.tuttiManagedCredentials.getConnection(),
          ),
        }),
      );
    });

    app.post(`${route}/grant`, async (request, reply) => {
      const parsed = tuttiManagedGrantCreateRequestSchema.safeParse(
        request.body,
      );
      if (!parsed.success) {
        return reply.code(400).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "application_error",
              message: "Invalid Tutti Managed grant payload.",
            },
          }),
        );
      }

      try {
        const connection = await options.tuttiManagedCredentials.connect(
          parsed.data,
        );
        return reply.code(200).send(
          tuttiManagedGrantResponseSchema.parse({
            connection: publicConnection(connection),
          }),
        );
      } catch (error) {
        app.log.warn(
          { errorType: error instanceof Error ? error.name : "UnknownError" },
          "Tutti Managed grant exchange failed.",
        );
        if (error instanceof TuttiManagedModelCliUnsupportedError) {
          return reply.code(426).send(
            applicationErrorResponseSchema.parse({
              error: {
                code: "service_unavailable",
                message: error.message,
              },
            }),
          );
        }
        return reply.code(502).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "service_unavailable",
              message: "Unable to connect Tutti Managed models.",
            },
          }),
        );
      }
    });

    app.delete(route, async (_request, reply) => {
      const connection =
        await options.tuttiManagedCredentials.clearConnection();
      return reply.code(200).send(
        tuttiManagedConnectionResponseSchema.parse({
          connection: publicConnection(connection),
        }),
      );
    });
  }
}

function publicConnection(connection: {
  connected: boolean;
  expiresAt?: string | undefined;
  models: unknown[];
  providers: unknown[];
}) {
  return {
    connected: connection.connected,
    ...(connection.expiresAt ? { expiresAt: connection.expiresAt } : {}),
    models: connection.models,
    providers: connection.providers,
  };
}
