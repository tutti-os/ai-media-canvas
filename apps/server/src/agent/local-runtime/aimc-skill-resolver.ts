import type { UserDataClient } from "../../auth/request.js";
import { loadWorkspaceSkills } from "../workspace-skills.js";

export async function resolveAimcWorkspaceSkills(input: {
  canvasId?: string;
  createUserClient?: (accessToken: string) => unknown;
  accessToken?: string;
}) {
  if (!input.canvasId || !input.accessToken || !input.createUserClient) {
    return [];
  }

  const client = input.createUserClient(input.accessToken) as UserDataClient;
  return loadWorkspaceSkills(client, input.canvasId);
}
