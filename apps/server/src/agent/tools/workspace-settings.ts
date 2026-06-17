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

export type WorkspaceSettingsToolResult = WorkspaceSettingsSnapshot;

export type ApplyWorkspaceSettingsPatch = (input: {
  patch: WorkspaceSettingsPatch;
}) => Promise<WorkspaceSettingsToolResult>;

export type ReadWorkspaceSettings = () => Promise<WorkspaceSettingsSnapshot>;

export function summarizeWorkspaceSettingsSnapshot(input: {
  callerProvider?: string;
  codexImagegenDelegation: WorkspaceSettings["codexImagegenDelegation"];
  confirmationRequired: boolean;
  consentBudget: number;
}) {
  if (input.confirmationRequired) {
    return "No image generation model is directly available for this non-Codex agent. Codex image generation can be delegated after explicit user confirmation. Ask the user whether to delegate this image generation task to Codex, offering one-time allow, always allow, or do not allow.";
  }
  if (input.codexImagegenDelegation === "never") {
    return "Codex image generation delegation is disabled for this non-Codex agent. Do not use Codex image generation unless the user changes the workspace setting.";
  }
  if (input.codexImagegenDelegation === "always") {
    return "Codex image generation delegation is already allowed for this non-Codex agent.";
  }
  if (input.consentBudget > 0) {
    return "One-time Codex image generation delegation is available for the current task.";
  }
  return "Workspace settings loaded. No additional Codex image generation confirmation is required for the current caller.";
}

export function buildWorkspaceSettingsSnapshot(input: {
  callerProvider?: string;
  codexImagegenDelegation: WorkspaceSettings["codexImagegenDelegation"];
  consentBudget: number;
  summary?: string;
}): WorkspaceSettingsSnapshot {
  const confirmationRequired =
    input.callerProvider !== undefined &&
    input.callerProvider !== "codex" &&
    input.codexImagegenDelegation === "ask" &&
    input.consentBudget <= 0;

  return {
    codexImagegen: {
      ...(input.callerProvider ? { callerProvider: input.callerProvider } : {}),
      confirmationRequired,
      consentBudget: input.consentBudget,
    },
    settings: {
      codexImagegenDelegation: input.codexImagegenDelegation,
    },
    success: true,
    summary:
      input.summary ??
      summarizeWorkspaceSettingsSnapshot({
        ...(input.callerProvider
          ? { callerProvider: input.callerProvider }
          : {}),
        codexImagegenDelegation: input.codexImagegenDelegation,
        confirmationRequired,
        consentBudget: input.consentBudget,
      }),
  };
}

export function createGetWorkspaceSettingsTool(deps: {
  readSettings: ReadWorkspaceSettings;
}) {
  return tool(async () => deps.readSettings(), {
    name: "get_workspace_settings",
    description:
      "Read the current workspace settings and runtime policy state before deciding whether another tool call is allowed. Use this before non-Codex agents call Codex image generation. If confirmation is required, explain that no image generation model is directly available for this non-Codex agent and ask whether to delegate the image task to Codex.",
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
