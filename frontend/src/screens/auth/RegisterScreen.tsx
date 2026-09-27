/**
 * Bhoomi Register Screen (Prompt 10)
 *
 * §12.2 treatment: Minimal — ask only what's needed to create the account.
 * Fields: full name, phone, email, password, confirm password, user_type, language.
 * NOTE: platform_role is NEVER collected — server always defaults to 'user' (§7.6).
 *
 * All 7 UI states per §12.4:
 *   1. Loading      — spinner, inputs disabled
 *   2. Empty        — clean form
 *   3. Success      — success banner + link to login
 *   4. Validation   — inline per-field errors
 *   5. API error    — error banner (duplicate phone/email, server error)
 *   6. Perm denied  — not applicable on registration (public endpoint)
 *   7. Unavailable  — network error with distinct icon + retry
 */

import React, { useState, useId } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, AlertCircle, WifiOff, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { LANGUAGES, useLanguage } from "../../i18n/LanguageContext";
import { FormField } from "../../design-system";
import "./auth.scss";

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_TYPES = [
  { value: "", label: "Select role (optional)" },
  { value: "farmer", label: "🌾 Farmer" },
  { value: "buyer", label: "🛒 Buyer" },
  { value: "expert", label: "👨‍🔬 Agricultural Expert" },
  { value: "provider", label: "🏢 Service Provider" },
];

// ─── Validation ───────────────────────────────────────────────────────────────

interface FormValues {
  full_name: string;
  phone_number: string;
  email: string;
  password: string;
  confirm_password: string;
  user_type: string;
  preferred_language: string;
}

interface FormErrors {
  full_name?: string;
  phone_number?: string;
  email?: string;
  password?: string;
  confirm_password?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{8,15}$/;

function validate(values: FormValues, t: (text: string) => string): FormErrors {
  const e: FormErrors = {};

  if (!values.full_name.trim()) {
    e.full_name = t("Full name is required.");
  } else if (values.full_name.trim().length < 2) {
    e.full_name = t("Full name must be at least 2 characters.");
  }

  if (!values.phone_number.trim()) {
    e.phone_number = t("Phone number is required.");
  } else if (!PHONE_RE.test(values.phone_number.trim())) {
    e.phone_number = t("Enter a valid phone number (8–15 digits).");
  }

  if (!values.email.trim()) {
    e.email = t("Email address is required.");
  } else if (!EMAIL_RE.test(values.email.trim())) {
    e.email = t("Enter a valid email address.");
  }

  if (!values.password) {
    e.password = t("Password is required.");
  } else if (values.password.length < 8) {
    e.password = t("Password must be at least 8 characters.");
  }

  if (!values.confirm_password) {
    e.confirm_password = t("Please confirm your password.");
  } else if (values.password !== values.confirm_password) {
    e.confirm_password = t("Passwords do not match.");
  }

  return e;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RegisterScreen() {
  const { register, isLoading } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  const [form, setForm] = useState<FormValues>({
    full_name: "",
    phone_number: "",
    email: "",
    password: "",
    confirm_password: "",
    user_type: "",
    preferred_language: language,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Unique IDs for accessibility
  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();

  const handleChange = (field: keyof FormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "preferred_language") setLanguage(value);
    setApiError(null);
    setIsNetworkError(false);
    if (touched[field]) {
      const updated = { ...form, [field]: value };
      const newErrors = validate(updated, t);
      setErrors((prev) => ({ ...prev, [field]: newErrors[field as keyof FormErrors] }));
    }
    // Revalidate confirm_password when password changes
    if (field === "password" && touched.confirm_password) {
      setErrors((prev) => ({
        ...prev,
        confirm_password:
          form.confirm_password && value !== form.confirm_password
            ? t("Passwords do not match.")
            : undefined,
      }));
    }
  };

  const handleBlur = (field: keyof FormValues) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const newErrors = validate(form, t);
    setErrors((prev) => ({ ...prev, [field]: newErrors[field as keyof FormErrors] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Trigger all field errors
    const allTouched = Object.fromEntries(
      Object.keys(form).map((k) => [k, true])
    ) as Record<keyof FormValues, boolean>;
    setTouched(allTouched);

    const validationErrors = validate(form, t);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setApiError(null);
    setIsNetworkError(false);

    const result = await register({
      full_name: form.full_name.trim(),
      phone_number: form.phone_number.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      user_type: form.user_type ? (form.user_type as "farmer" | "buyer" | "expert" | "provider") : undefined,
      preferred_language: form.preferred_language,
      // platform_role intentionally omitted — server enforces 'user' (§7.6)
    });

    if (!result.error) {
      // State 3 — Success
      setIsSuccess(true);
    } else {
      const msg = result.error.toLowerCase();
      if (msg.includes("network error") || msg.includes("network")) {
        // State 7 — Network unavailable
        setIsNetworkError(true);
        setApiError(t("Cannot reach the server. Please check your connection and try again."));
      } else {
        // State 5 — API error (duplicate, server issue)
        setApiError(result.error);
      }
    }
  };

  // ── State 3 — Success screen ──────────────────────────────────────────────

  if (isSuccess) {
    return (
      <main className="auth-page" aria-label={t("Account created!")}>
        <div className="auth-card">
          <header className="auth-header">
            <div className="auth-header__logo">
              <span className="auth-header__leaf" aria-hidden="true">🌱</span>
              Bhoomi
            </div>
          </header>
          <div className="auth-body" style={{ textAlign: "center", paddingTop: "2rem", paddingBottom: "2rem" }}>
            <div style={{ color: "var(--color-success)", marginBottom: "1rem" }}>
              <CheckCircle2 size={48} aria-hidden="true" />
            </div>
            <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>{t("Account created!")}</h1>
            <p style={{ color: "var(--color-muted-text)", marginBottom: "1.5rem", fontSize: "0.9375rem" }}>
              {t("Welcome to Bhoomi. Sign in to get started.")}
            </p>
            <Link to="/login" className="btn btn-primary auth-submit">
              {t("Sign in now")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
      <main className="auth-page" aria-label={t("Create your account")}>
      <div className="auth-card" style={{ maxWidth: "480px" }}>
        {/* Brand header */}
        <header className="auth-header">
          <div className="auth-header__logo">
            <span className="auth-header__leaf" aria-hidden="true">🌱</span>
            Bhoomi
          </div>
          <p className="auth-header__subtitle">{t("Create your account")}</p>
        </header>

        <div className="auth-body">
          {/* Language selector */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label
              htmlFor="reg-language"
              style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-muted-text)", marginBottom: "4px" }}
            >
              {t("Language / भाषा")}
            </label>
            <select
              id="reg-language"
              className="select-field"
              value={language}
              onChange={(e) => { handleChange("preferred_language", e.target.value); setErrors({}); setTouched({}); }}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate aria-label="Registration form">

            {/* State 5 / 7 — API / network error banner */}
            {apiError && (
              <div
                className="auth-alert auth-alert--error"
                role="alert"
                aria-live="assertive"
              >
                <span className="auth-alert__icon" aria-hidden="true">
                  {isNetworkError ? <WifiOff size={16} /> : <AlertCircle size={16} />}
                </span>
                <span className="auth-alert__text">
                  {apiError}
                  {isNetworkError && (
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
            )}

            {/* Full name */}
            <FormField label={t("Full name")} id={nameId} required error={touched.full_name ? errors.full_name : undefined}>
              <input
                id={nameId}
                type="text"
                className="input-field"
                autoComplete="name"
                placeholder={t("Your full name")}
                value={form.full_name}
                disabled={isLoading}
                onChange={(e) => handleChange("full_name", e.target.value)}
                onBlur={() => handleBlur("full_name")}
                aria-required="true"
              />
            </FormField>

            {/* Phone */}
            <FormField
              label={t("Phone number")}
              id={phoneId}
              required
              error={touched.phone_number ? errors.phone_number : undefined}
              hint={t("Used to log in. Enter with country code (e.g. +91).")}
            >
              <input
                id={phoneId}
                type="tel"
                className="input-field"
                autoComplete="tel"
                placeholder="+91 9876543210"
                value={form.phone_number}
                disabled={isLoading}
                onChange={(e) => handleChange("phone_number", e.target.value)}
                onBlur={() => handleBlur("phone_number")}
                aria-required="true"
              />
            </FormField>

            {/* Email */}
            <FormField label={t("Email address")} id={emailId} required error={touched.email ? errors.email : undefined}>
              <input
                id={emailId}
                type="email"
                className="input-field"
                autoComplete="email"
                placeholder="you@example.com"
                value={form.email}
                disabled={isLoading}
                onChange={(e) => handleChange("email", e.target.value)}
                onBlur={() => handleBlur("email")}
                aria-required="true"
              />
            </FormField>

            {/* Role / user_type (optional) */}
            <FormField label={t("I am a…")} id="reg-user-type" hint={t("Optional — you can set this later.")}>
              <select
                id="reg-user-type"
                className="select-field"
                value={form.user_type}
                disabled={isLoading}
                onChange={(e) => handleChange("user_type", e.target.value)}
              >
                {USER_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{t(option.label)}</option>
                ))}
              </select>
            </FormField>

            {/* Password */}
            <FormField label={t("Password")} id={passwordId} required error={touched.password ? errors.password : undefined} hint={t("At least 8 characters.")}>
              <div className="input-with-toggle">
                <input
                  id={passwordId}
                  type={showPassword ? "text" : "password"}
                  className="input-field"
                  autoComplete="new-password"
                  placeholder={t("Create a password")}
                  value={form.password}
                  disabled={isLoading}
                  onChange={(e) => handleChange("password", e.target.value)}
                  onBlur={() => handleBlur("password")}
                  aria-required="true"
                />
                <button
                  type="button"
                  className="input-with-toggle__toggle"
                  aria-label={showPassword ? t("Hide password") : t("Show password")}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </FormField>

            {/* Confirm password */}
            <FormField label={t("Confirm password")} id={confirmId} required error={touched.confirm_password ? errors.confirm_password : undefined}>
              <div className="input-with-toggle">
                <input
                  id={confirmId}
                  type={showConfirm ? "text" : "password"}
                  className="input-field"
                  autoComplete="new-password"
                  placeholder={t("Repeat your password")}
                  value={form.confirm_password}
                  disabled={isLoading}
                  onChange={(e) => handleChange("confirm_password", e.target.value)}
                  onBlur={() => handleBlur("confirm_password")}
                  aria-required="true"
                />
                <button
                  type="button"
                  className="input-with-toggle__toggle"
                  aria-label={showConfirm ? t("Hide password") : t("Show password")}
                  onClick={() => setShowConfirm((v) => !v)}
                >
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </FormField>

            {/* State 1 — Loading / Submit */}
            <button
              type="submit"
              id="register-submit-btn"
              className="btn btn-primary auth-submit"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="auth-spinner" aria-hidden="true" />
                  <span>{t("Creating account…")}</span>
                </>
              ) : (
                t("Create account")
              )}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              {t("Already have an account?")}{" "}
              <Link to="/login" className="auth-footer__link">{t("Sign in")}</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
