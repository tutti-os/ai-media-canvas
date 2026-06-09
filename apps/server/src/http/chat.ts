import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  chatMessageCreateRequestSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import {
  type ChatService,
  ChatServiceError,
} from "../features/chat/chat-service.js";
import {
  type ChatOperations,
  createChatOperations,
} from "./chat-operations.js";

export async function registerChatRoutes(
  app: FastifyInstance,
  options: {
    localUser: AuthenticatedUser;
    chatService: ChatService;
    chatOperations?: ChatOperations;
  },
) {
  const chatOperations =
    options.chatOperations ??
    createChatOperations({
      localUser: options.localUser,
      chatService: options.chatService,
    });

  // List sessions for a canvas
  app.get<{ Params: { canvasId: string } }>(
    "/api/canvases/:canvasId/sessions",
    async (request, reply) => {
      try {
        return reply
          .code(200)
          .send(await chatOperations.listSessions(request.params.canvasId));
      } catch (error) {
        return sendChatError(error, reply);
      }
    },
  );

  // Create a new session
  app.post<{ Params: { canvasId: string } }>(
    "/api/canvases/:canvasId/sessions",
    async (request, reply) => {
      try {
        const body = request.body as { title?: string } | undefined;
        return reply
          .code(201)
          .send(
            await chatOperations.createSession(
              request.params.canvasId,
              body?.title,
            ),
          );
      } catch (error) {
        return sendChatError(error, reply);
      }
    },
  );

  // Update session title
  app.patch<{ Params: { sessionId: string } }>(
    "/api/sessions/:sessionId",
    async (request, reply) => {
      try {
        const body = request.body as { title?: string } | undefined;
        if (body?.title) {
          await options.chatService.updateSessionTitle(
            options.localUser,
            request.params.sessionId,
            body.title,
          );
        }

        return reply.code(200).send({ ok: true });
      } catch (error) {
        return sendChatError(error, reply);
      }
    },
  );

  // Delete a session
  app.delete<{ Params: { sessionId: string } }>(
    "/api/sessions/:sessionId",
    async (request, reply) => {
      try {
        await options.chatService.deleteSession(
          options.localUser,
          request.params.sessionId,
        );

        return reply.code(200).send({ ok: true });
      } catch (error) {
        return sendChatError(error, reply);
      }
    },
  );

  // List messages for a session
  app.get<{ Params: { sessionId: string } }>(
    "/api/sessions/:sessionId/messages",
    async (request, reply) => {
      try {
        const response = await chatOperations.listMessages(
          request.params.sessionId,
        );

        request.log.info(
          {
            sessionId: request.params.sessionId,
            count: response.messages.length,
          },
          "chat.listMessages OK",
        );
        return reply.code(200).send(response);
      } catch (error) {
        request.log.error(
          { sessionId: request.params.sessionId, err: error },
          "chat.listMessages FAILED",
        );
        return sendChatError(error, reply);
      }
    },
  );

  // Create a message
  app.post<{ Params: { sessionId: string } }>(
    "/api/sessions/:sessionId/messages",
    { bodyLimit: 10 * 1024 * 1024 }, // 10 MB — messages may include base64 image data from canvas selections
    async (request, reply) => {
      try {
        const input = chatMessageCreateRequestSchema.parse(request.body);
        const response = await chatOperations.createMessage(
          request.params.sessionId,
          input,
        );

        request.log.info(
          {
            sessionId: request.params.sessionId,
            role: input.role,
            messageId: response.message.id,
          },
          "chat.createMessage OK",
        );
        return reply.code(201).send(response);
      } catch (error) {
        request.log.error(
          { sessionId: request.params.sessionId, err: error },
          "chat.createMessage FAILED",
        );
        return sendChatError(error, reply);
      }
    },
  );
}

function sendChatError(error: unknown, reply: FastifyReply) {
  if (error instanceof ChatServiceError) {
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
