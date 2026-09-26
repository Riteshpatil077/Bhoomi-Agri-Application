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

export const setCsrfTokens = (token: string, refreshToken: string = "") => {
  _csrfToken = token;
  _csrfRefreshToken = refreshToken;
};

export const getCsrfToken = () => _csrfToken;
export const getCsrfRefreshToken = () => _csrfRefreshToken;

export const csrfHeaders = (): Record<string, string> =>
  _csrfToken ? { "X-CSRF-Token": _csrfToken } : {};

export const csrfRefreshHeaders = (): Record<string, string> =>
  _csrfRefreshToken ? { "X-CSRF-Token": _csrfRefreshToken } : {};

export const clearCsrfTokens = () => {
  _csrfToken = "";
  _csrfRefreshToken = "";
};
