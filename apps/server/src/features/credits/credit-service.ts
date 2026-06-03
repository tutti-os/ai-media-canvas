export type CreditService = {
  deductCredits(
    workspaceId: string,
    userId: string,
    amount: number,
    referenceId: string,
    description: string,
  ): Promise<string>;
  getBalance(workspaceId: string): Promise<{
    balance: number;
    dailyClaimed?: boolean;
    plan?: string;
  }>;
  getSubscription(workspaceId: string): Promise<{
    plan: string;
  }>;
};
