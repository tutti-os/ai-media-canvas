"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

type LocalUser = {
  id: string;
  email: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  aud: "local";
  created_at: string;
};

type LocalSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: "bearer";
  user: LocalUser;
};

export const LOCAL_ACCESS_TOKEN = "local-dev-token";

interface AuthContextValue {
  user: LocalUser | null;
  session: LocalSession | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const localUser = {
  id: "local-user",
  email: "local@aimc.app",
  app_metadata: {},
  user_metadata: { mode: "local" },
  aud: "local",
  created_at: new Date(0).toISOString(),
} satisfies LocalUser;

const localSession = {
  access_token: LOCAL_ACCESS_TOKEN,
  refresh_token: "local-dev-refresh-token",
  expires_in: 60 * 60 * 24 * 365,
  expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  token_type: "bearer",
  user: localUser,
} satisfies LocalSession;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session] = useState<LocalSession | null>(localSession);
  const [user] = useState<LocalUser | null>(localUser);

  async function signOut() {
    // Standalone build has no remote auth state to clear.
  }

  return (
    <AuthContext.Provider value={{ user, session, loading: false, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within the local session provider");
  }
  return ctx;
}
