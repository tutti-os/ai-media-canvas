import type { FastifyReply } from "fastify";

import { cliCommandOutputSchema } from "@aimc/shared";

export function sendCliJson(
  reply: FastifyReply,
  value: unknown,
  statusCode = 200,
) {
  return reply.code(statusCode).send(
    cliCommandOutputSchema.parse({
      kind: "json",
      value,
    }),
  );
}

export function sendCliError(
  reply: FastifyReply,
  error: { code: string; message: string },
  statusCode = 500,
) {
  return reply.code(statusCode).send(
    cliCommandOutputSchema.parse({
      kind: "error",
      error,
    }),
  );
}

export function isZodError(
  error: unknown,
): error is { issues: unknown[]; name: string } {
  return (
    error instanceof Error &&
    error.name === "ZodError" &&
    "issues" in error &&
    Array.isArray(error.issues)
  );
}
