/**
 * Bhoomi Login Screen (Prompt 10)
 *
 * § 12.2 treatment: Simple form, calm background, one primary action,
 * visible field-level validation, show/hide password, language selector,
 * accessible error messages.
 *
 * All 7 UI states per §12.4:
 *   1. Loading      — spinner on button, inputs disabled
 *   2. Empty        — clean form, ready to fill
 *   3. Success      — redirect to /dashboard after login
 *   4. Validation   — inline field errors (required, format)
 *   5. API error    — distinct banner above form with retry affordance
 *   6. Permission denied — 403/deactivated-account message
 *   7. Unavailable  — network error (status 0) shown as distinct banner
 */

import React, { useState, useId } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, AlertCircle, WifiOff, ShieldX } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { FormField } from "../../design-system";
import "./auth.scss";

// ─── Supported Languages ──────────────────────────────────────────────────────

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
  { value: "mr", label: "मराठी" },
  { value: "pa", label: "ਪੰਜਾਬੀ" },
  { value: "te", label: "తెలుగు" },
  { value: "ta", label: "தமிழ்" },
  { value: "bn", label: "বাংলা" },
];

// ─── Form State ───────────────────────────────────────────────────────────────

interface FormValues {
  identifier: string; // phone or email
  password: string;
  language: string;
}

interface FormErrors {
  identifier?: string;
  password?: string;
}

type ApiErrorType = "network" | "credentials" | "deactivated" | "server" | null;

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.identifier.trim()) {
    errors.identifier = "Phone number or email is required.";
  }
  if (!values.password) {
    errors.password = "Password is required.";
  } else if (values.password.length < 6) {
    errors.password = "Password must be at least 6 characters.";
  }
  return errors;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LoginScreen() {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormValues>({
    identifier: "",
    password: "",
    language: "en",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [apiErrorType, setApiErrorType] = useState<ApiErrorType>(null);
  const [apiErrorMessage, setApiErrorMessage] = useState("");
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({});

  const identifierId = useId();
  const passwordId = useId();

  const handleChange = (field: keyof FormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setApiErrorType(null);
    // Clear field error on change after first touch
    if (touched[field]) {
      const updated = { ...form, [field]: value };
      const newErrors = validate(updated);
      setErrors((prev) => ({ ...prev, [field]: newErrors[field as keyof FormErrors] }));
    }
  };

  const handleBlur = (field: keyof FormValues) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const newErrors = validate(form);
    setErrors((prev) => ({ ...prev, [field]: newErrors[field as keyof FormErrors] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Mark all fields as touched to surface any hidden errors
    setTouched({ identifier: true, password: true });
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setApiErrorType(null);
    setApiErrorMessage("");

    // State 1 — Loading: auth context sets isLoading=true
    const result = await login({
      identifier: form.identifier.trim(),
      password: form.password,
    });

    if (!result.error) {
      // State 3 — Success: navigate to dashboard
      navigate("/dashboard", { replace: true });
    } else {
      // Distinguish error types for §12.4 states 5/6/7
      const msg = result.error.toLowerCase();
      if (result.error.includes("Network error") || msg.includes("network")) {
        // State 7 — Unavailable / network error
        setApiErrorType("network");
        setApiErrorMessage("Cannot reach the server. Check your connection and try again.");
      } else if (msg.includes("deactivated") || msg.includes("inactive")) {
        // State 6 — Permission denied (account deactivated)
        setApiErrorType("deactivated");
        setApiErrorMessage(result.error);
      } else if (msg.includes("403") || msg.includes("forbidden")) {
        // State 6 — Permission denied
        setApiErrorType("deactivated");
        setApiErrorMessage("Your account does not have access. Contact support if you believe this is an error.");
      } else {
        // State 5 — API error (invalid credentials, server error, etc.)
        setApiErrorType("credentials");
        setApiErrorMessage(result.error || "Invalid phone/email or password. Please try again.");
      }
    }
  };

  // ── Render error banner ─────────────────────────────────────────────────────

  const renderApiError = () => {
    if (!apiErrorType) return null;

    const isNetwork = apiErrorType === "network";
    const isDeactivated = apiErrorType === "deactivated";

    return (
      <div
        className={`auth-alert ${isNetwork ? "auth-alert--info" : isDeactivated ? "auth-alert--error" : "auth-alert--error"}`}
        role="alert"
        aria-live="assertive"
      >
        <span className="auth-alert__icon" aria-hidden="true">
          {isNetwork ? <WifiOff size={16} /> : isDeactivated ? <ShieldX size={16} /> : <AlertCircle size={16} />}
        </span>
        <span className="auth-alert__text">
          {apiErrorMessage}
          {(isNetwork || apiErrorType === "server") && (
            <>
              {" "}
              <button
                type="button"
                className="auth-footer__link"
                onClick={handleSubmit as unknown as React.MouseEventHandler}
              >
                Retry
              </button>
            </>
          )}
        </span>
      </div>
    );
  };

  return (
    <main className="auth-page" aria-label="Sign in to Bhoomi">
      <div className="auth-card">
        {/* Brand Header */}
        <header className="auth-header">
          <div className="auth-header__logo" aria-label="Bhoomi">
            <span className="auth-header__leaf" aria-hidden="true">🌱</span>
            Bhoomi
          </div>
          <p className="auth-header__subtitle">Your agriculture companion</p>
        </header>

        {/* Form Body */}
        <div className="auth-body">
          {/* Language Selector — per §12.2 */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label
              htmlFor="login-language"
              style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-muted-text)", marginBottom: "4px" }}
            >
              Language / भाषा
            </label>
            <select
              id="login-language"
              className="select-field"
              value={form.language}
              onChange={(e) => handleChange("language", e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <form
            className="auth-form"
            onSubmit={handleSubmit}
            noValidate
            aria-label="Login form"
          >
            {/* State 5 / 6 / 7 — API error banner */}
            {renderApiError()}

            {/* State 4 — Validation: phone/email */}
            <FormField
              label="Phone number or email"
              id={identifierId}
              required
              error={touched.identifier ? errors.identifier : undefined}
            >
              <input
                id={identifierId}
                type="text"
                className="input-field"
                autoComplete="username"
                placeholder="Enter your phone or email"
                value={form.identifier}
                disabled={isLoading}
                onChange={(e) => handleChange("identifier", e.target.value)}
                onBlur={() => handleBlur("identifier")}
                aria-required="true"
              />
            </FormField>

            {/* Password with show/hide toggle */}
            <FormField
              label="Password"
              id={passwordId}
              required
              error={touched.password ? errors.password : undefined}
            >
              <div className="input-with-toggle">
                <input
                  id={passwordId}
                  type={showPassword ? "text" : "password"}
                  className="input-field"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={form.password}
                  disabled={isLoading}
                  onChange={(e) => handleChange("password", e.target.value)}
                  onBlur={() => handleBlur("password")}
                  aria-required="true"
                />
                {/* Show/hide toggle per §12.2 */}
                <button
                  type="button"
                  className="input-with-toggle__toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={0}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </FormField>

            {/* State 1 — Loading / State 3 — Primary action */}
            <button
              type="submit"
              id="login-submit-btn"
              className="btn btn-primary auth-submit"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="auth-spinner" aria-hidden="true" />
                  <span>Signing in…</span>
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          {/* Footer — register link */}
          <div className="auth-footer">
            <p>
              Don't have an account?{" "}
              <Link to="/register" className="auth-footer__link">
                Create account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
