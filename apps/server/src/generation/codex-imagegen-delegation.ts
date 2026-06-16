export type CodexImagegenDelegationSetting = "ask" | "always" | "never";

export type CodexImagegenDelegationDecision =
  | { status: "allowed"; consumesConsent: boolean }
  | { status: "blocked"; reason: "needs_confirmation" | "disabled_by_user" };

export function evaluateCodexImagegenDelegation(input: {
  callerProvider?: string;
  imageProvider: string;
  setting?: CodexImagegenDelegationSetting;
  consentBudget?: number;
}): CodexImagegenDelegationDecision {
  if (input.imageProvider !== "codex-imagegen") {
    return { status: "allowed", consumesConsent: false };
  }
  if (input.callerProvider === "codex") {
    return { status: "allowed", consumesConsent: false };
  }
  if (!input.callerProvider) {
    return { status: "allowed", consumesConsent: false };
  }
  if (input.setting === "always") {
    return { status: "allowed", consumesConsent: false };
  }
  if ((input.consentBudget ?? 0) > 0) {
    return { status: "allowed", consumesConsent: true };
  }
  if (input.setting === "never") {
    return { status: "blocked", reason: "disabled_by_user" };
  }
  return { status: "blocked", reason: "needs_confirmation" };
}
