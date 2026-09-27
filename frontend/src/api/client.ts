/**
 * Bhoomi — Typed API Client
 * Thin wrapper around fetch using the VITE_API_BASE_URL env variable.
 * All requests include credentials (cookies) so JWT httpOnly cookies are sent.
 * Full typed endpoints are added per module (Prompts 3–19).
 */

// Use Vite's same-origin proxy during development so browser requests do not
// depend on cross-origin CORS/cookie behavior. Production can point this at a
// separately hosted API through VITE_API_BASE_URL.
const BASE_URL = import.meta.env.DEV
  ? "/api"
  : (import.meta.env.VITE_API_BASE_URL ?? "/api");
import {
  clearCsrfTokens,
  getCsrfRefreshToken,
  getCsrfToken,
  setCsrfTokens,
} from "./csrf";

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

/**
 * Core fetch wrapper.
 * - Always sends cookies (credentials: "include") for JWT auth (§6).
 * - Returns a structured ApiResponse — never throws; callers check .error.
 */
async function request<T>(
  path: string,
  options: RequestInit = {},
  hasRetriedAfterRefresh = false
): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}${path}`;
  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  try {
    const requestOptions: RequestInit = {
      ...options,
      credentials: "include",
      headers: {
        ...defaultHeaders,
        ...(options.headers as Record<string, string>),
      },
    };
    const res = await fetch(url, requestOptions);

    const contentType = res.headers.get("content-type") ?? "";
    const data: T | null = contentType.includes("application/json")
      ? await res.json()
      : null;

    if (res.status === 401 && !hasRetriedAfterRefresh && shouldRefreshFor(path)) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        const headers = { ...(requestOptions.headers as Record<string, string>) };
        const method = (requestOptions.method ?? "GET").toUpperCase();
        if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
          headers["X-CSRF-Token"] = getCsrfToken();
        }
        return request<T>(path, { ...requestOptions, headers }, true);
      }
    }

    if (!res.ok) {
      const message =
        (data as Record<string, string> | null)?.message ??
        (data as Record<string, string> | null)?.error ??
        `HTTP ${res.status}`;
      return { data: null, error: message, status: res.status };
    }

    return { data, error: null, status: res.status };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Network error — please try again.";
    return { data: null, error: message, status: 0 };
  }
}

let refreshInFlight: Promise<boolean> | null = null;

function shouldRefreshFor(path: string): boolean {
  return !["/auth/login", "/auth/register", "/auth/refresh"].includes(path);
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshCsrf = getCsrfRefreshToken();
      if (!refreshCsrf) return false;
      try {
        const response = await fetch(`${BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": refreshCsrf,
          },
          body: "{}",
        });
        const body = (await response.json().catch(() => null)) as
          | { csrf_token?: string; csrf_refresh_token?: string }
          | null;
        if (!response.ok || !body?.csrf_token || !body.csrf_refresh_token) {
          clearCsrfTokens();
          return false;
        }
        setCsrfTokens(body.csrf_token, body.csrf_refresh_token);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

// ─── Convenience methods ─────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string, headers?: Record<string, string>) =>
    request<T>(path, { method: "GET", headers }),

  post: <T>(path: string, body: unknown, headers?: Record<string, string>) =>
    request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers,
    }),

  patch: <T>(path: string, body: unknown, headers?: Record<string, string>) =>
    request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers,
    }),

  put: <T>(path: string, body: unknown, headers?: Record<string, string>) =>
    request<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
      headers,
    }),

  delete: <T>(path: string, headers?: Record<string, string>) =>
    request<T>(path, { method: "DELETE", headers }),
};

// ─── Health check (used by routing shell to verify API connectivity) ─────────

export async function checkHealth(): Promise<{
  alive: boolean;
  ready: boolean;
}> {
  // Health endpoints are NOT under /api prefix
  const base = BASE_URL.replace(/\/api$/, "");
  try {
    const [liveness, readiness] = await Promise.all([
      fetch(`${base}/healthz`, { credentials: "include" }),
      fetch(`${base}/readyz`, { credentials: "include" }),
    ]);
    return { alive: liveness.ok, ready: readiness.ok };
  } catch {
    return { alive: false, ready: false };
  }
}
