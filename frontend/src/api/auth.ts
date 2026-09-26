/**
 * Bhoomi Auth API — Typed calls to the auth blueprint (Prompt 3 backend).
 *
 * JWT auth uses httpOnly cookies — the browser sends them automatically.
 * All mutating calls include the CSRF double-submit token header (§6).
 * The CSRF token is stored in the in-memory csrf.ts store after login.
 */

import { api } from "./client";
import {
  setCsrfTokens,
  clearCsrfTokens,
  csrfHeaders,
  csrfRefreshHeaders,
} from "./csrf";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserType = "farmer" | "buyer" | "expert" | "provider" | null;
export type PlatformRole = "user" | "admin" | "super_admin";
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";

export interface AuthUser {
  id: string;
  full_name: string;
  phone_number: string;
  email: string;
  user_type: UserType;
  platform_role: PlatformRole;
  preferred_language: string;
  is_phone_verified: boolean;
  verification_status: VerificationStatus;
  is_active: boolean;
  created_at: string;
}

export interface LoginPayload {
  identifier: string; // phone or email
  password: string;
}

export interface RegisterPayload {
  full_name: string;
  phone_number: string;
  email: string;
  password: string;
  user_type?: UserType;
  preferred_language?: string;
  // NOTE: platform_role is never sent — backend always defaults to 'user' (§7.6)
}

export interface UpdateProfilePayload {
  full_name?: string;
  preferred_language?: string;
  // platform_role intentionally excluded — server silently ignores it anyway (§7.6)
}

interface LoginResponse {
  user: AuthUser;
  csrf_token: string;
  csrf_refresh_token: string;
}

interface RegisterResponse {
  user: AuthUser;
  message: string;
}

// ─── API Calls ────────────────────────────────────────────────────────────────

/**
 * Fetch current authenticated user from the server.
 * Called on app mount to restore session from existing httpOnly cookie.
 */
export async function fetchCurrentUser() {
  return api.get<AuthUser>("/auth/me");
}

/**
 * Log in with phone/email + password.
 * On success, stores CSRF tokens and the server sets httpOnly JWT cookies.
 */
export async function login(payload: LoginPayload) {
  const res = await api.post<LoginResponse>("/auth/login", payload);
  if (res.data) {
    setCsrfTokens(res.data.csrf_token, res.data.csrf_refresh_token);
  }
  return res;
}

/**
 * Register a new account.
 * `platform_role` is never sent; backend enforces it as 'user' (§7.6).
 */
export async function register(payload: RegisterPayload) {
  return api.post<RegisterResponse>("/auth/register", payload);
}

/**
 * Rotate refresh token — called silently when access token expires.
 * Uses the CSRF refresh token header (§6 double-submit on the refresh endpoint).
 */
export async function refreshTokens() {
  const res = await api.post<{ csrf_token: string; csrf_refresh_token: string }>(
    "/auth/refresh",
    {},
    csrfRefreshHeaders()
  );
  if (res.data) {
    setCsrfTokens(res.data.csrf_token, res.data.csrf_refresh_token);
  }
  return res;
}

/**
 * Logout from the current session.
 * Backend revokes this session's refresh token and clears cookies.
 */
export async function logout() {
  const res = await api.post<{ message: string }>("/auth/logout", {}, csrfHeaders());
  clearCsrfTokens();
  return res;
}

/**
 * Logout from all devices.
 * Revokes the entire token family.
 */
export async function logoutAll() {
  const res = await api.post<{ message: string }>("/auth/logout-all", {}, csrfHeaders());
  clearCsrfTokens();
  return res;
}

/**
 * Update own profile (full_name, preferred_language).
 * Does NOT accept platform_role — would be silently ignored server-side anyway (§7.6).
 */
export async function updateProfile(payload: UpdateProfilePayload) {
  return api.patch<AuthUser>("/auth/me", payload, csrfHeaders());
}

/**
 * Change password.
 */
export async function changePassword(payload: {
  current_password: string;
  new_password: string;
}) {
  return api.post<{ message: string }>("/auth/change-password", payload, csrfHeaders());
}
