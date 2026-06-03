export class ThreadServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type ThreadService = {
  resolveOwnedSessionThread(
    user: { id: string },
    sessionId: string,
  ): Promise<{ threadId: string }>;
};
