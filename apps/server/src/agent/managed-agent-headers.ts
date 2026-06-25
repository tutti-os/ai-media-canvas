import {
  MANAGED_AGENT_INVOCATION_CREDENTIAL_HEADER,
  type ManagedAgentInvocationCredentialHeaders,
  getManagedAgentInvocationCredentialFromHeaders,
} from "@tutti-os/agent-acp-kit";

export function createManagedAgentCredentialHeaders(
  headers: ManagedAgentInvocationCredentialHeaders | undefined,
): ManagedAgentInvocationCredentialHeaders | undefined {
  const credential = getManagedAgentInvocationCredentialFromHeaders(headers);
  return credential
    ? { [MANAGED_AGENT_INVOCATION_CREDENTIAL_HEADER]: credential }
    : undefined;
}
