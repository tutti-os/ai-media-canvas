import type { ViewerResponse } from "@aimc/shared";

import type { AuthenticatedUser } from "../../auth/types.js";

const BOOTSTRAP_FAILED_MESSAGE = "Unable to prepare local app state.";

export type ViewerService = {
  ensureViewer(user: AuthenticatedUser): Promise<ViewerResponse>;
};

export class BootstrapError extends Error {
  readonly code = "bootstrap_failed";
  readonly statusCode = 500;

  constructor() {
    super(BOOTSTRAP_FAILED_MESSAGE);
  }
}
