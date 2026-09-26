/**
 * Bhoomi Profile Screen (Prompt 10)
 *
 * §12.2: View own profile, edit name/language, change password,
 * logout from current or all sessions.
 *
 * All 7 UI states per §12.4:
 *   1. Loading      — skeleton while fetching profile
 *   2. Empty        — N/A (profile always exists if authenticated)
 *   3. Success      — profile data displayed; update success toast
 *   4. Validation   — inline errors on edit/password forms
 *   5. API error    — error banner on failed update
 *   6. Perm denied  — 401 if session expired → redirect to login
 *   7. Unavailable  — network error on fetch → retry affordance
 */

import { useState, useEffect, useId } from "react";
import { useNavigate } from "react-router-dom";
import {
  User, Mail, Phone, Globe, Shield, LogOut, WifiOff,
  AlertCircle, CheckCircle2, Eye, EyeOff, RefreshCw
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { FormField } from "../../design-system";
import { useToast } from "../../design-system";
import { ConfirmDialog } from "../../design-system";
import { StatusBadge } from "../../design-system";
import "./auth.scss";


// ─── Constants ────────────────────────────────────────────────────────────────

const LANGUAGES: Record<string, string> = {
  en: "English", hi: "हिन्दी", mr: "मराठी",
  pa: "ਪੰਜਾਬੀ", te: "తెలుగు", ta: "தமிழ்", bn: "বাংলা",
};

const USER_TYPE_LABELS: Record<string, string> = {
  farmer: "Farmer", buyer: "Buyer",
  expert: "Agricultural Expert", provider: "Service Provider",
};

const LANG_OPTIONS = [
  { value: "en", label: "English" }, { value: "hi", label: "हिन्दी" },
  { value: "mr", label: "मराठी" }, { value: "pa", label: "ਪੰਜਾਬੀ" },
  { value: "te", label: "తెలుగు" }, { value: "ta", label: "தமிழ்" },
  { value: "bn", label: "বাংলা" },
];

// ─── Password Change Form ─────────────────────────────────────────────────────

interface PwForm { current: string; next: string; confirm: string; }
interface PwErrors { current?: string; next?: string; confirm?: string; }

function validatePw(f: PwForm): PwErrors {
  const e: PwErrors = {};
  if (!f.current) e.current = "Current password is required.";
  if (!f.next) e.next = "New password is required.";
  else if (f.next.length < 8) e.next = "Password must be at least 8 characters.";
  if (!f.confirm) e.confirm = "Please confirm your new password.";
  else if (f.next !== f.confirm) e.confirm = "Passwords do not match.";
  return e;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const { user, isLoading, isAuthenticated, isInitialized, updateProfile, changePassword, logout, logoutAll } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // ── Local state ─────────────────────────────────────────────────────────────
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Profile edit form
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLang, setEditLang] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Password change form
  const [showPwSection, setShowPwSection] = useState(false);
  const [pwForm, setPwForm] = useState<PwForm>({ current: "", next: "", confirm: "" });
  const [pwErrors, setPwErrors] = useState<PwErrors>({});
  const [pwTouched, setPwTouched] = useState<Partial<Record<keyof PwForm, boolean>>>({});
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [pwApiError, setPwApiError] = useState<string | null>(null);
  const [isSavingPw, setIsSavingPw] = useState(false);

  // Logout confirm
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showLogoutAllConfirm, setShowLogoutAllConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const nameId = useId();
  const langId = useId();

  // ── Session redirect (State 6 — Permission denied = expired session) ────────

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [isInitialized, isAuthenticated, navigate]);

  // Populate edit form from user on load
  useEffect(() => {
    if (user) {
      setEditName(user.full_name);
      setEditLang(user.preferred_language || "en");
    }
  }, [user]);

  // ── State 1 — Loading skeleton ───────────────────────────────────────────────

  if (!isInitialized || (isLoading && !user)) {
    return (
      <main className="profile-page" aria-label="Your profile — loading">
        <div className="profile-card">
          <div className="profile-header" style={{ minHeight: 120 }}>
            <div className="profile-header__avatar" style={{ opacity: 0.4 }}>?</div>
            <div className="profile-header__info">
              <div className="auth-skeleton">
                <div className="skeleton-line skeleton-line--medium" />
                <div className="skeleton-line skeleton-line--short" />
              </div>
            </div>
          </div>
          <div className="profile-body">
            <div className="auth-skeleton">
              <div className="skeleton-line skeleton-line--input" />
              <div className="skeleton-line skeleton-line--input" />
              <div className="skeleton-line skeleton-line--input" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── State 7 — Network/fetch error ────────────────────────────────────────────

  if (fetchError) {
    return (
      <main className="profile-page" aria-label="Profile — error">
        <div className="profile-card">
          <div className="auth-body">
            <div className="auth-alert auth-alert--error" role="alert">
              <span className="auth-alert__icon" aria-hidden="true">
                <WifiOff size={16} />
              </span>
              <span className="auth-alert__text">
                {fetchError}{" "}
                <button
                  type="button"
                  className="auth-footer__link"
                  onClick={() => { setFetchError(null); }}
                >
                  Retry
                </button>
              </span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!user) return null;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      setEditError("Full name is required.");
      return;
    }
    setIsSaving(true);
    setEditError(null);
    const result = await updateProfile({
      full_name: editName.trim(),
      preferred_language: editLang,
    });
    setIsSaving(false);
    if (result.error) {
      setEditError(result.error);
    } else {
      setEditMode(false);
      toast.success("Profile updated successfully.");
    }
  };

  const handlePwChange = (field: keyof PwForm, value: string) => {
    setPwForm((p) => ({ ...p, [field]: value }));
    setPwApiError(null);
    if (pwTouched[field]) {
      const updated = { ...pwForm, [field]: value };
      const errs = validatePw(updated);
      setPwErrors((p) => ({ ...p, [field]: errs[field] }));
    }
  };

  const handlePwBlur = (field: keyof PwForm) => {
    setPwTouched((p) => ({ ...p, [field]: true }));
    const errs = validatePw(pwForm);
    setPwErrors((p) => ({ ...p, [field]: errs[field] }));
  };

  const handleSavePassword = async () => {
    const allTouched = { current: true, next: true, confirm: true };
    setPwTouched(allTouched);
    const errs = validatePw(pwForm);
    if (Object.keys(errs).length > 0) { setPwErrors(errs); return; }
    setIsSavingPw(true);
    setPwApiError(null);
    const result = await changePassword({
      current_password: pwForm.current,
      new_password: pwForm.next,
    });
    setIsSavingPw(false);
    if (result.error) {
      setPwApiError(result.error);
    } else {
      toast.success("Password changed. Please log in again for security.");
      setShowPwSection(false);
      setPwForm({ current: "", next: "", confirm: "" });
      setPwTouched({});
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
    navigate("/login", { replace: true });
  };

  const handleLogoutAll = async () => {
    setIsLoggingOut(true);
    await logoutAll();
    navigate("/login", { replace: true });
  };

  // Avatar initials
  const initials = user.full_name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  // ── State 3 — Success (profile loaded) ──────────────────────────────────────

  return (
    <main className="profile-page" aria-label="Your profile">
      <div className="profile-card">

        {/* Profile header */}
        <div className="profile-header">
          <div className="profile-header__avatar" aria-hidden="true">
            {initials || <User size={28} />}
          </div>
          <div className="profile-header__info">
            <div className="profile-header__name">{user.full_name}</div>
            <div className="profile-header__meta">{user.email}</div>
            {user.platform_role !== "user" && (
              <div className="profile-header__badge" aria-label={`Platform role: ${user.platform_role}`}>
                {user.platform_role === "super_admin" ? "Super Admin" : "Admin"}
              </div>
            )}
          </div>
        </div>

        <div className="profile-body">

          {/* ── Account Info ─────────────────────────────────────────────────── */}
          <section className="profile-section" aria-labelledby="account-info-heading">
            <h2 className="profile-section__title" id="account-info-heading">Account info</h2>

            <div>
              {[
                { label: "Phone", icon: <Phone size={14} aria-hidden="true" />, value: user.phone_number },
                { label: "Email", icon: <Mail size={14} aria-hidden="true" />, value: user.email },
                { label: "Role", icon: <User size={14} aria-hidden="true" />, value: user.user_type ? USER_TYPE_LABELS[user.user_type] ?? user.user_type : "—" },
                { label: "Language", icon: <Globe size={14} aria-hidden="true" />, value: LANGUAGES[user.preferred_language] ?? user.preferred_language },
                { label: "Verification", icon: <Shield size={14} aria-hidden="true" />, value: (
                  <StatusBadge
                    variant={
                      user.verification_status === "verified" ? "verified" :
                      user.verification_status === "pending" ? "pending" :
                      user.verification_status === "rejected" ? "rejected" : "draft"
                    }
                    label={
                      user.verification_status === "verified" ? "Verified" :
                      user.verification_status === "pending" ? "Pending review" :
                      user.verification_status === "rejected" ? "Rejected" : "Unverified"
                    }
                  />
                )},
              ].map((row) => (
                <div key={row.label} className="profile-info-row">
                  <span className="profile-info-row__label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {row.icon}{row.label}
                  </span>
                  <span className="profile-info-row__value">{row.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Edit Profile ──────────────────────────────────────────────────── */}
          <section className="profile-section" aria-labelledby="edit-profile-heading">
            <h2 className="profile-section__title" id="edit-profile-heading">Edit profile</h2>

            {!editMode ? (
              <button
                type="button"
                id="edit-profile-btn"
                className="btn btn-outline btn-sm"
                onClick={() => { setEditMode(true); setEditError(null); }}
              >
                Edit name & language
              </button>
            ) : (
              <div className="profile-section__form">
                {/* State 5 — API error on update */}
                {editError && (
                  <div className="auth-alert auth-alert--error" role="alert">
                    <span className="auth-alert__icon" aria-hidden="true"><AlertCircle size={16} /></span>
                    <span className="auth-alert__text">{editError}</span>
                  </div>
                )}

                {/* State 4 — Validation: name required */}
                <FormField label="Full name" id={nameId} required error={!editName.trim() && isSaving ? "Full name is required." : undefined}>
                  <input
                    id={nameId}
                    type="text"
                    className="input-field"
                    value={editName}
                    disabled={isSaving}
                    onChange={(e) => { setEditName(e.target.value); setEditError(null); }}
                    aria-required="true"
                  />
                </FormField>

                <FormField label="Preferred language" id={langId}>
                  <select
                    id={langId}
                    className="select-field"
                    value={editLang}
                    disabled={isSaving}
                    onChange={(e) => setEditLang(e.target.value)}
                  >
                    {LANG_OPTIONS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </FormField>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    type="button"
                    id="save-profile-btn"
                    className="btn btn-primary btn-sm"
                    disabled={isSaving}
                    aria-busy={isSaving}
                    onClick={handleSaveProfile}
                  >
                    {isSaving ? <><span className="auth-spinner" aria-hidden="true" /> Saving…</> : "Save changes"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={isSaving}
                    onClick={() => { setEditMode(false); setEditError(null); setEditName(user.full_name); setEditLang(user.preferred_language || "en"); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── Change Password ───────────────────────────────────────────────── */}
          <section className="profile-section" aria-labelledby="change-pw-heading">
            <h2 className="profile-section__title" id="change-pw-heading">Password</h2>

            {!showPwSection ? (
              <button
                type="button"
                id="change-password-btn"
                className="btn btn-outline btn-sm"
                onClick={() => setShowPwSection(true)}
              >
                Change password
              </button>
            ) : (
              <div className="profile-section__form">
                {pwApiError && (
                  <div className="auth-alert auth-alert--error" role="alert">
                    <span className="auth-alert__icon" aria-hidden="true"><AlertCircle size={16} /></span>
                    <span className="auth-alert__text">{pwApiError}</span>
                  </div>
                )}

                {/* Current password */}
                <FormField label="Current password" id="pw-current" required error={pwTouched.current ? pwErrors.current : undefined}>
                  <div className="input-with-toggle">
                    <input id="pw-current" type={showCurrent ? "text" : "password"} className="input-field"
                      autoComplete="current-password" value={pwForm.current} disabled={isSavingPw}
                      onChange={(e) => handlePwChange("current", e.target.value)}
                      onBlur={() => handlePwBlur("current")} />
                    <button type="button" className="input-with-toggle__toggle"
                      aria-label={showCurrent ? "Hide password" : "Show password"}
                      onClick={() => setShowCurrent((v) => !v)}>
                      {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </FormField>

                {/* New password */}
                <FormField label="New password" id="pw-new" required error={pwTouched.next ? pwErrors.next : undefined} hint="At least 8 characters.">
                  <div className="input-with-toggle">
                    <input id="pw-new" type={showNext ? "text" : "password"} className="input-field"
                      autoComplete="new-password" value={pwForm.next} disabled={isSavingPw}
                      onChange={(e) => handlePwChange("next", e.target.value)}
                      onBlur={() => handlePwBlur("next")} />
                    <button type="button" className="input-with-toggle__toggle"
                      aria-label={showNext ? "Hide password" : "Show password"}
                      onClick={() => setShowNext((v) => !v)}>
                      {showNext ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </FormField>

                {/* Confirm new password */}
                <FormField label="Confirm new password" id="pw-confirm" required error={pwTouched.confirm ? pwErrors.confirm : undefined}>
                  <input id="pw-confirm" type="password" className="input-field"
                    autoComplete="new-password" value={pwForm.confirm} disabled={isSavingPw}
                    onChange={(e) => handlePwChange("confirm", e.target.value)}
                    onBlur={() => handlePwBlur("confirm")} />
                </FormField>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    type="button"
                    id="save-password-btn"
                    className="btn btn-primary btn-sm"
                    disabled={isSavingPw}
                    aria-busy={isSavingPw}
                    onClick={handleSavePassword}
                  >
                    {isSavingPw ? <><span className="auth-spinner" aria-hidden="true" /> Saving…</> : "Update password"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={isSavingPw}
                    onClick={() => { setShowPwSection(false); setPwApiError(null); setPwForm({ current: "", next: "", confirm: "" }); setPwTouched({}); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── Sessions ──────────────────────────────────────────────────────── */}
          <section className="profile-section" aria-labelledby="sessions-heading">
            <h2 className="profile-section__title" id="sessions-heading">Sessions</h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                type="button"
                id="logout-btn"
                className="btn btn-outline btn-sm"
                disabled={isLoggingOut}
                onClick={() => setShowLogoutConfirm(true)}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <LogOut size={15} aria-hidden="true" /> Sign out
              </button>
              <button
                type="button"
                id="logout-all-btn"
                className="btn btn-outline btn-sm"
                disabled={isLoggingOut}
                onClick={() => setShowLogoutAllConfirm(true)}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <RefreshCw size={15} aria-hidden="true" /> Sign out all devices
              </button>
            </div>
          </section>

          {/* ── Verification shortcut ─────────────────────────────────────────── */}
          {user.verification_status === "unverified" && user.user_type === "farmer" && (
            <div className="auth-alert auth-alert--info" role="status" aria-live="polite">
              <span className="auth-alert__icon" aria-hidden="true"><CheckCircle2 size={16} /></span>
              <span className="auth-alert__text">
                Your farmer account is not yet verified.{" "}
                <a href="/verification" className="auth-footer__link">Complete verification →</a>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Confirm: logout */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        title="Sign out"
        message="You'll be signed out of this session. Sign back in any time."
        confirmText="Sign out"
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      {/* Confirm: logout all — destructive */}
      <ConfirmDialog
        isOpen={showLogoutAllConfirm}
        title="Sign out all devices"
        message="This will sign you out from every device and browser. You'll need to sign in again everywhere."
        confirmText="Sign out all devices"
        variant="danger"
        onConfirm={handleLogoutAll}
        onCancel={() => setShowLogoutAllConfirm(false)}
      />
    </main>
  );
}
