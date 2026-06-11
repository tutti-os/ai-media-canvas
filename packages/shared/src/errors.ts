import { z } from "zod";

export const errorCodeValues = [
  "invalid_request",
  "run_not_found",
  "run_conflict",
  "run_failed",
  "repeated_canvas_layout_failures",
  "tool_failed",
] as const;

export const errorCodeSchema = z.enum(errorCodeValues);

export const aimcErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type AimcErrorCode = z.infer<typeof errorCodeSchema>;
export type AimcError = z.infer<typeof aimcErrorSchema>;
