import { createContext, useContext } from "react";

export type AuthUser = {
  id: string;
  loginName: string;
  name: string;
  workingSiteId: string;
};

export type AuthSession = {
  user: AuthUser;
  appParameterBooleans: Record<string, boolean>;
  refresh: () => Promise<void>;
};

export const AuthSessionContext = createContext<AuthSession | null>(null);

export function useAuth(): AuthSession {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an authenticated route");
  }
  return ctx;
}
