import { z } from "zod";

export const cliJsonOutputSchema = z.object({
  kind: z.literal("json"),
  value: z.unknown(),
});

export const cliTableOutputSchema = z.object({
  kind: z.literal("table"),
  columns: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
    }),
  ),
  rows: z.array(z.record(z.unknown())),
});

export const cliErrorOutputSchema = z.object({
  kind: z.literal("error"),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export const cliCommandOutputSchema = z.discriminatedUnion("kind", [
  cliJsonOutputSchema,
  cliTableOutputSchema,
  cliErrorOutputSchema,
]);

export type CliJsonOutput = z.infer<typeof cliJsonOutputSchema>;
export type CliTableOutput = z.infer<typeof cliTableOutputSchema>;
export type CliErrorOutput = z.infer<typeof cliErrorOutputSchema>;
export type CliCommandOutput = z.infer<typeof cliCommandOutputSchema>;
