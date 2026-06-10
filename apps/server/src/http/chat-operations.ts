import {
  type ChatMessageCreateRequest,
  messageCreateResponseSchema,
  messageListResponseSchema,
  sessionCreateResponseSchema,
  sessionListResponseSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import type { ChatService } from "../features/chat/chat-service.js";

export type ChatOperations = ReturnType<typeof createChatOperations>;

export function createChatOperations(options: {
  localUser: AuthenticatedUser;
  chatService: ChatService;
}) {
  return {
    async listSessions(canvasId: string) {
      const sessions = await options.chatService.listSessions(
        options.localUser,
        canvasId,
      );
      return sessionListResponseSchema.parse({ sessions });
    },
    async createSession(canvasId: string, title?: string) {
      const session = await options.chatService.createSession(
        options.localUser,
        canvasId,
        title,
      );
      return sessionCreateResponseSchema.parse({ session });
    },
    async listMessages(sessionId: string) {
      const messages = await options.chatService.listMessages(
        options.localUser,
        sessionId,
      );
      return messageListResponseSchema.parse({ messages });
    },
    async createMessage(sessionId: string, input: ChatMessageCreateRequest) {
      const message = await options.chatService.createMessage(
        options.localUser,
        sessionId,
        input,
      );
      return messageCreateResponseSchema.parse({ message });
    },
  };
}
