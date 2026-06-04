import type { AgentRunParams, ProviderLaunchPlan } from "../../core/provider-plugin.js";

export function buildClaudeLaunchPlan(
  params: AgentRunParams<"local-agent", "claude">,
  executablePath = "claude",
): ProviderLaunchPlan {
  const args = ["-p", "--output-format", "stream-json", "--verbose"];
  if (params.model && params.model !== "default") {
    args.push("--model", params.model);
  }
  for (const dir of params.extraAllowedDirs ?? []) {
    if (dir) args.push("--add-dir", dir);
  }
  args.push("--permission-mode", "bypassPermissions");
  return {
    args,
    command: executablePath,
    cwd: params.cwd,
    ...(params.env ? { env: params.env } : {}),
    prompt: params.prompt,
    promptInput: "stdin",
  };
}
