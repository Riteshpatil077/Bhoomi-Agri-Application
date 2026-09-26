/**
 * Bhoomi — Typed API Client
 * Thin wrapper around fetch using the VITE_API_BASE_URL env variable.
 * All requests include credentials (cookies) so JWT httpOnly cookies are sent.
 * Full typed endpoints are added per module (Prompts 3–19).
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

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
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}${path}`;
  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  try {
    const res = await fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        ...defaultHeaders,
        ...(options.headers as Record<string, string>),
      },
    });

    const contentType = res.headers.get("content-type") ?? "";
    const data: T | null = contentType.includes("application/json")
      ? await res.json()
      : null;

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
