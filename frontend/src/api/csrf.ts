/**
 * CSRF Token Store — Bhoomi Frontend (§6)
 *
 * The backend issues a double-submit CSRF token in the login response body.
 * We store it in memory here (not localStorage — avoids XSS persistence risk)
 * and inject it as `X-CSRF-Token` on every mutating request.
 *
 * If the page is refreshed, the auth cookie still works but the CSRF token
 * is lost. The app will attempt a silent token refresh on mount which re-issues
 * new tokens.
 */

let _csrfToken = "";
let _csrfRefreshToken = "";

function cookieValue(name: string): string {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  const item = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : "";
}

export const setCsrfTokens = (token: string, refreshToken: string = "") => {
  _csrfToken = token;
  _csrfRefreshToken = refreshToken;
};

export const getCsrfToken = () => _csrfToken || cookieValue("csrf_access_token");
export const getCsrfRefreshToken = () => _csrfRefreshToken || cookieValue("csrf_refresh_token");

export const csrfHeaders = (): Record<string, string> =>
  getCsrfToken() ? { "X-CSRF-Token": getCsrfToken() } : {};

export const csrfRefreshHeaders = (): Record<string, string> =>
  getCsrfRefreshToken() ? { "X-CSRF-Token": getCsrfRefreshToken() } : {};

export const clearCsrfTokens = () => {
  _csrfToken = "";
  _csrfRefreshToken = "";
};
