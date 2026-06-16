import { tool } from "langchain";
import { z } from "zod";

import type { WorkspaceSettings } from "@aimc/shared";

export type WorkspaceSettingsPatch = {
  codexImagegenDelegation?:
    | Exclude<WorkspaceSettings["codexImagegenDelegation"], "ask">
    | "allow-once"
    | "deny";
};

export type WorkspaceSettingsSnapshot = {
  codexImagegen?: {
    callerProvider?: string;
    confirmationRequired: boolean;
    consentBudget: number;
  };
  settings: Pick<WorkspaceSettings, "codexImagegenDelegation">;
  success: true;
  summary: string;
};

export type WorkspaceSettingsToolResult = {
  codexImagegenConsentBudget?: number;
  patch: WorkspaceSettingsPatch;
  settings?: Pick<WorkspaceSettings, "codexImagegenDelegation">;
  success: true;
  summary: string;
};

export type ApplyWorkspaceSettingsPatch = (input: {
  patch: WorkspaceSettingsPatch;
}) => Promise<WorkspaceSettingsToolResult>;

export type ReadWorkspaceSettings = () => Promise<WorkspaceSettingsSnapshot>;

export function createGetWorkspaceSettingsTool(deps: {
  readSettings: ReadWorkspaceSettings;
}) {
  return tool(async () => deps.readSettings(), {
    name: "get_workspace_settings",
    description:
      "Read the current workspace settings and runtime policy state before deciding whether another tool call is allowed. Use this before non-Codex agents call Codex image generation so you can ask the user proactively instead of waiting for generate_image to fail.",
    schema: z.object({}),
  });
}

export function createUpdateWorkspaceSettingsTool(deps: {
  applyPatch: ApplyWorkspaceSettingsPatch;
}) {
  return tool(
    async (input: { patch: WorkspaceSettingsPatch }) => deps.applyPatch(input),
    {
      name: "update_workspace_settings",
      description:
        "Apply a narrow, structured workspace settings patch after the user explicitly approves a settings change. Currently supported field is codexImagegenDelegation. Values always and never are durable workspace settings; values allow-once and deny apply to the current task only. Do not use this tool to infer consent; ask the user first, then write the structured result.",
      schema: z.object({
        patch: z
          .object({
            codexImagegenDelegation: z
              .enum(["allow-once", "deny", "always", "never"])
              .optional()
              .describe(
                "Non-Codex agent delegation decision for Codex image generation. Use allow-once or deny for the current task only; use always or never for durable workspace behavior.",
              ),
          })
          .refine(
            (patch) => patch.codexImagegenDelegation !== undefined,
            "At least one supported workspace setting must be provided.",
          )
          .describe("Workspace settings patch."),
      }),
    },
  );
}
