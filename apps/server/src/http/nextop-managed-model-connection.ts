import type { FastifyInstance } from "fastify";

import {
  applicationErrorResponseSchema,
  nextopManagedConnectionResponseSchema,
  nextopManagedGrantCreateRequestSchema,
  nextopManagedGrantResponseSchema,
} from "@aimc/shared";

import type { NextopManagedCredentialService } from "../features/nextop-managed/credential-service.js";

export async function registerNextopManagedModelConnectionRoutes(
  app: FastifyInstance,
  options: {
    nextopManagedCredentials: NextopManagedCredentialService;
  },
) {
  app.get("/api/nextop/managed-model-connection", async (_request, reply) => {
    return reply.code(200).send(
      nextopManagedConnectionResponseSchema.parse({
        connectChallenge:
          options.nextopManagedCredentials.createConnectChallenge(),
        connection: publicConnection(
          options.nextopManagedCredentials.getConnection(),
        ),
      }),
    );
  });

  app.post("/api/nextop/managed-model-connection/grant", async (request, reply) => {
    const parsed = nextopManagedGrantCreateRequestSchema.safeParse(
      request.body,
    );
    if (!parsed.success) {
      return reply.code(400).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "application_error",
            message: "Invalid Nextop Managed grant payload.",
          },
        }),
      );
    }

    try {
      const connection = await options.nextopManagedCredentials.connect(
        parsed.data,
      );
      return reply.code(200).send(
        nextopManagedGrantResponseSchema.parse({
          connection: publicConnection(connection),
        }),
      );
    } catch (error) {
      app.log.warn({ err: error }, "Nextop Managed grant exchange failed.");
      return reply.code(502).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "service_unavailable",
            message: "Unable to connect Nextop Managed models.",
          },
        }),
      );
    }
  });

  app.delete("/api/nextop/managed-model-connection", async (_request, reply) => {
    const connection = await options.nextopManagedCredentials.clearConnection();
    return reply.code(200).send(
      nextopManagedConnectionResponseSchema.parse({
        connection: publicConnection(connection),
      }),
    );
  });
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
