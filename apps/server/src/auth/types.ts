export type AuthenticatedUser = {
  email: string;
  id: string;
  userMetadata: Record<string, unknown>;
};
