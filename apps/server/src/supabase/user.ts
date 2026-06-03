import type { FastifyRequest } from "fastify";

import type { AuthenticatedUser as BaseAuthenticatedUser } from "../auth/types.js";

export type AuthenticatedUser = BaseAuthenticatedUser & {
  accessToken: string;
};

export type RequestAuthenticator = {
  authenticate(request: FastifyRequest): Promise<AuthenticatedUser | null>;
};

export type UserSupabaseClient = any;
