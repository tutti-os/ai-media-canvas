export class TierGuardError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 402) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type TierGuard = {
  calculateCreditCost(
    model: string,
    capability: "image_generation" | "video_generation",
    options?: Record<string, unknown>,
  ): number;
  checkConcurrency(workspaceId: string, plan: string): Promise<void>;
  checkModelAccess(plan: string, model: string): void;
  checkResolution(plan: string, quality: string): void;
};
