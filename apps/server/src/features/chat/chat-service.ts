import type {
  ChatMessage,
  ChatMessageCreateRequest,
  ChatSessionSummary,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../../auth/types.js";

export class ChatServiceError extends Error {
  readonly statusCode: number;
  readonly code: "canvas_not_found" | "chat_error" | "session_not_found";

  constructor(
    code: "canvas_not_found" | "chat_error" | "session_not_found",
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type ChatService = {
  listSessions(
    user: AuthenticatedUser,
    canvasId: string,
  ): Promise<ChatSessionSummary[]>;
  createSession(
    user: AuthenticatedUser,
    canvasId: string,
    title?: string,
  ): Promise<ChatSessionSummary>;
  updateSessionTitle(
    user: AuthenticatedUser,
    sessionId: string,
    title: string,
  ): Promise<void>;
  deleteSession(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<void>;
  listMessages(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<ChatMessage[]>;
  createMessage(
    user: AuthenticatedUser,
    sessionId: string,
    input: ChatMessageCreateRequest,
  ): Promise<ChatMessage>;
  updateMessage(
    user: AuthenticatedUser,
    messageId: string,
    input: ChatMessageCreateRequest,
  ): Promise<ChatMessage>;
};
