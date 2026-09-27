/**
 * Bhoomi Auth Context — Global Session State
 *
 * Provides: current user, auth status, login/logout/refresh actions.
 * On mount, silently calls GET /api/auth/me to restore session from
 * the existing httpOnly cookie. If the token is expired, attempts a
 * silent refresh first.
 *
 * SECURITY NOTE: This context is a convenience layer only. All actual
 * authorization is enforced server-side on every API call. The client
 * simply reflects what the server returns. (§7 — §12 design system note)
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import type { AuthUser, LoginPayload, RegisterPayload, UpdateProfilePayload } from "../api/auth";
import {
  fetchCurrentUser,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  logoutAll as apiLogoutAll,
  refreshTokens,
  updateProfile as apiUpdateProfile,
  changePassword as apiChangePassword,
} from "../api/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** The currently authenticated user, or null if not logged in */
  user: AuthUser | null;
  /** True while restoring session on mount or during login/logout */
  isLoading: boolean;
  /** True once the initial session-restore attempt has completed */
  isInitialized: boolean;
  /** Derived convenience */
  isAuthenticated: boolean;

  // Actions
  login: (payload: LoginPayload) => Promise<{ error: string | null }>;
  register: (payload: RegisterPayload) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<{ error: string | null }>;
  changePassword: (payload: {
    current_password: string;
    new_password: string;
  }) => Promise<{ error: string | null }>;
  /** Optimistically update user in context after a successful API update */
  setUser: (user: AuthUser | null) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const refreshAttempted = useRef(false);

  /** On mount: restore session from existing httpOnly cookie */
  useEffect(() => {
    const restoreSession = async () => {
      setIsLoading(true);
      const res = await fetchCurrentUser();

      if (res.data) {
        setUser(res.data.user);
        setIsInitialized(true);
        setIsLoading(false);
        return;
      }
      const isExpired = res.error?.toLowerCase().includes("expired");

      // Access token may be expired — try one silent refresh
      if (res.status === 401 && isExpired && !refreshAttempted.current) {
        refreshAttempted.current = true;
        const refreshRes = await refreshTokens();
        if (!refreshRes.error) {
          const retry = await fetchCurrentUser();
          if (retry.data) setUser(retry.data.user);
        }
      }

      setIsInitialized(true);
      setIsLoading(false);
    };

    restoreSession();
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    setIsLoading(true);
    const res = await apiLogin(payload);
    if (res.data) {
      setUser(res.data.user);
    }
    setIsLoading(false);
    return { error: res.error };
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    setIsLoading(true);
    const res = await apiRegister(payload);
    setIsLoading(false);
    return { error: res.error };
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    await apiLogout();
    setUser(null);
    setIsLoading(false);
  }, []);

  const logoutAll = useCallback(async () => {
    setIsLoading(true);
    await apiLogoutAll();
    setUser(null);
    setIsLoading(false);
  }, []);

  const refreshSession = useCallback(async () => {
    const res = await refreshTokens();
    if (!res.error) {
      const me = await fetchCurrentUser();
      if (me.data) setUser(me.data.user);
    }
  }, []);

  const updateProfile = useCallback(async (payload: UpdateProfilePayload) => {
    const res = await apiUpdateProfile(payload);
    if (res.data) {
      setUser(res.data.user);
    }
    return { error: res.error };
  }, []);

  const changePassword = useCallback(
    async (payload: { current_password: string; new_password: string }) => {
      const res = await apiChangePassword(payload);
      return { error: res.error };
    },
    []
  );

  const value: AuthContextValue = {
    user,
    isLoading,
    isInitialized,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    logoutAll,
    refreshSession,
    updateProfile,
    changePassword,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
