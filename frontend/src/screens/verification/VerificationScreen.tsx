/**
 * Bhoomi Farmer Verification Screen (Prompt 11)
 *
 * Implements the 3-step verification flow per §12.2 and §5:
 *   Step 1: Purpose & Privacy (plain-language retention note per §5)
 *   Step 2: Photos (Selfie + Land photo upload via presigned S3 URLs)
 *   Step 3: Review & Submit (Summary review + confirmation checkbox)
 *
 * Status View:
 *   - Pending Review: informative waiting card with estimated turnaround and retention reminder
 *   - Verified: congratulations card with verified farmer badge and quick links
 *   - Rejected: clear rejection feedback with reviewer's reason and option to re-apply
 *
 * All 7 UI states per §12.4 explicitly implemented:
 *   1. Loading      — skeleton on initial status fetch; spinners on upload & submit
 *   2. Empty        — clean onboarding for unverified farmer with "Begin Verification" CTA
 *   3. Success      — application submission confirmation + Verified state card
 *   4. Validation   — format check (JPEG/PNG/WebP), size limit (<= 10MB), required fields, terms
 *   5. API error    — server/upload failures with dedicated Retry affordances (§12.4)
 *   6. Perm denied  — honest notice if non-farmer account (403)
 *   7. Unavailable  — 503/storage exception handling with retry button
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  ShieldAlert,
  Camera,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  WifiOff,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Trash2,
  Lock,
  FileCheck,
  Sparkles,
  RefreshCw,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import {
  AppShell,
  StatusBadge,
  useToast,
} from "../../design-system";
import {
  fetchVerificationStatus,
  requestUploadUrl,
  uploadToPresignedUrl,
  submitVerification,
  type VerificationApplication,
  type VerificationStatus,
  type PhotoType,
} from "../../api/verification";

import "./verification.scss";

// ─── Constants & Limits (§5) ──────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per §5
const MAX_FILE_SIZE_LABEL = "10 MB";

interface UploadedPhotoState {
  file: File | null;
  previewUrl: string | null;
  objectKey: string | null;
  status: "idle" | "requesting_url" | "uploading" | "uploaded" | "error";
  error: string | null;
}

export function VerificationScreen() {
  const { user, setUser, logout } = useAuth();
  const { toast } = useToast();

  // ── Component State ─────────────────────────────────────────────────────────

  // Top-level status from server
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [serverUnavailable, setServerUnavailable] = useState<boolean>(false);
  const [currentStatus, setCurrentStatus] = useState<VerificationStatus>("unverified");
  const [application, setApplication] = useState<VerificationApplication | null>(null);

  // Stepper state: 1 = Purpose & Privacy, 2 = Photos, 3 = Review
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Photos state
  const [selfieState, setSelfieState] = useState<UploadedPhotoState>({
    file: null,
    previewUrl: null,
    objectKey: null,
    status: "idle",
    error: null,
  });

  const [landState, setLandState] = useState<UploadedPhotoState>({
    file: null,
    previewUrl: null,
    objectKey: null,
    status: "idle",
    error: null,
  });

  // Validation & Review state
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Hidden file inputs
  const selfieInputRef = useRef<HTMLInputElement | null>(null);
  const landInputRef = useRef<HTMLInputElement | null>(null);

  // ── Load Verification Status on Mount ───────────────────────────────────────

  const loadStatus = async () => {
    setInitialLoading(true);
    setFetchError(null);
    setServerUnavailable(false);

    const res = await fetchVerificationStatus();

    setInitialLoading(false);

    if (res.error) {
      if (res.status === 503) {
        setServerUnavailable(true);
      } else {
        setFetchError(res.error);
      }
      return;
    }

    if (res.data) {
      setCurrentStatus(res.data.verification_status);
      setApplication(res.data.application);

      // If user is already verified or pending, stay on status view
      // If user is unverified or rejected, they can access the stepper
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  // Cleanup object URLs when component unmounts to prevent memory leaks
  useEffect(() => {
    return () => {
      if (selfieState.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(selfieState.previewUrl);
      }
      if (landState.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(landState.previewUrl);
      }
    };
  }, [selfieState.previewUrl, landState.previewUrl]);

  // ── Photo Upload Pipeline (§5) ──────────────────────────────────────────────

  const handlePhotoSelect = async (
    photoType: PhotoType,
    file: File
  ) => {
    // 1. Client-side Validation (§12.4 State 4)
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      const err = "Invalid file type. Please upload a JPEG, PNG, or WebP image.";
      updatePhotoState(photoType, {
        status: "error",
        error: err,
      });
      toast.error(err);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const err = `File exceeds the maximum allowed size of ${MAX_FILE_SIZE_LABEL}.`;
      updatePhotoState(photoType, {
        status: "error",
        error: err,
      });
      toast.error(err);
      return;
    }

    // Create local preview URL
    const localUrl = URL.createObjectURL(file);
    updatePhotoState(photoType, {
      file,
      previewUrl: localUrl,
      status: "requesting_url",
      error: null,
    });

    // 2. Request presigned upload URL from backend
    try {
      const urlRes = await requestUploadUrl({
        photo_type: photoType,
        content_type: file.type,
        file_size_bytes: file.size,
      });

      if (urlRes.error || !urlRes.data) {
        updatePhotoState(photoType, {
          status: "error",
          error: urlRes.error ?? "Failed to initialize secure upload link.",
        });
        toast.error("Could not obtain secure upload link. Please retry.");
        return;
      }

      const { upload_url, object_key, fields } = urlRes.data;

      // 3. Direct upload to private S3 bucket via presigned PUT (§5)
      updatePhotoState(photoType, {
        status: "uploading",
        objectKey: object_key,
      });

      const uploadResult = await uploadToPresignedUrl(upload_url, file, fields);

      if (!uploadResult.ok) {
        updatePhotoState(photoType, {
          status: "error",
          error: uploadResult.error ?? "Network error during upload.",
        });
        toast.error(`${photoType === "selfie" ? "Selfie" : "Land photo"} upload failed. Click Retry.`);
        return;
      }

      // 4. Success State for this photo
      updatePhotoState(photoType, {
        status: "uploaded",
        error: null,
      });
      toast.success(`${photoType === "selfie" ? "Selfie" : "Land photo"} uploaded securely.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected upload failure.";
      updatePhotoState(photoType, {
        status: "error",
        error: message,
      });
      toast.error("Upload error. Please try again.");
    }
  };

  const updatePhotoState = (photoType: PhotoType, partial: Partial<UploadedPhotoState>) => {
    if (photoType === "selfie") {
      setSelfieState((prev) => ({ ...prev, ...partial }));
    } else {
      setLandState((prev) => ({ ...prev, ...partial }));
    }
  };

  const handleRetryUpload = (photoType: PhotoType) => {
    const targetState = photoType === "selfie" ? selfieState : landState;
    if (targetState.file) {
      handlePhotoSelect(photoType, targetState.file);
    } else {
      // Prompt user to select file again
      if (photoType === "selfie") {
        selfieInputRef.current?.click();
      } else {
        landInputRef.current?.click();
      }
    }
  };

  const handleRemovePhoto = (photoType: PhotoType) => {
    const targetState = photoType === "selfie" ? selfieState : landState;
    if (targetState.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(targetState.previewUrl);
    }
    updatePhotoState(photoType, {
      file: null,
      previewUrl: null,
      objectKey: null,
      status: "idle",
      error: null,
    });
  };

  // ── Submit Application (§5, §12.2) ──────────────────────────────────────────

  const handleSubmit = async () => {
    // Validation: both photos must be uploaded
    if (selfieState.status !== "uploaded" || !selfieState.objectKey) {
      toast.error("Please upload a valid selfie photo before submitting.");
      return;
    }
    if (landState.status !== "uploaded" || !landState.objectKey) {
      toast.error("Please upload a valid land photo before submitting.");
      return;
    }

    // Validation: declaration terms accepted
    if (!termsAccepted) {
      setTermsError("You must acknowledge the verification and retention terms to proceed.");
      return;
    }

    setTermsError(null);
    setIsSubmitting(true);
    setSubmitError(null);

    const res = await submitVerification({
      selfie_photo_key: selfieState.objectKey,
      land_photo_key: landState.objectKey,
    });

    setIsSubmitting(false);

    if (res.error) {
      setSubmitError(res.error);
      toast.error(res.error);
      return;
    }

    if (res.data) {
      toast.success("Verification application submitted successfully!");
      setCurrentStatus("pending");
      setApplication(res.data.verification);

      // Optimistically update current user in auth context
      if (user) {
        setUser({
          ...user,
          verification_status: "pending",
        });
      }
    }
  };

  const handleRestartVerification = () => {
    // Reset all stepper and photo state for re-application
    setSelfieState({
      file: null,
      previewUrl: null,
      objectKey: null,
      status: "idle",
      error: null,
    });
    setLandState({
      file: null,
      previewUrl: null,
      objectKey: null,
      status: "idle",
      error: null,
    });
    setTermsAccepted(false);
    setTermsError(null);
    setSubmitError(null);
    setCurrentStep(1);
    setCurrentStatus("unverified");
  };

  // User summary for AppShell
  const shellRole: "farmer" | "admin" | "super_admin" =
    user?.platform_role === "super_admin"
      ? "super_admin"
      : user?.platform_role === "admin"
      ? "admin"
      : "farmer";

  const shellUser = user
    ? {
        name: user.full_name,
        phone: user.phone_number,
        role: shellRole,
        verificationStatus: user.verification_status,
      }
    : undefined;

  // ───────────────────────────────────────────────────────────────────────────
  // UI STATE 6: Permission Denied (Non-farmer user trying to access verification)
  // ───────────────────────────────────────────────────────────────────────────
  if (user && user.user_type && user.user_type !== "farmer" && user.platform_role === "user") {
    return (
      <AppShell user={shellUser} onLogout={logout}>
        <div className="verification-page">
          <div className="verification-page__container">
            <div className="verification-status-card" role="region" aria-label="Permission Notice">
              <div className="verification-status-card__icon-circle verification-status-card__icon-circle--pending">
                <ShieldAlert size={40} />
              </div>
              <h1 className="verification-status-card__title">Farmer Verification Only</h1>
              <p className="verification-status-card__desc">
                Your account is currently registered as a <strong>{user.user_type}</strong>.
                Farmer verification is reserved specifically for active farmers to verify land ownership
                and access protected agricultural tools.
              </p>
              <div className="verification-status-card__actions">
                <Link to="/dashboard" className="btn btn-primary">
                  Go to Dashboard
                </Link>
                <Link to="/profile" className="btn btn-outline">
                  View Profile
                </Link>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UI STATE 1: Initial Loading Skeleton
  // ───────────────────────────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <AppShell user={shellUser} onLogout={logout}>
        <div className="verification-page" aria-busy="true" aria-label="Loading verification status">
          <div className="verification-page__container">
            <div className="verification-skeleton">
              <div className="verification-skeleton__header" />
              <div className="verification-skeleton__card" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UI STATE 7: Service Unavailable / Stale Data
  // ───────────────────────────────────────────────────────────────────────────
  if (serverUnavailable) {
    return (
      <AppShell user={shellUser} onLogout={logout}>
        <div className="verification-page">
          <div className="verification-page__container">
            <div className="verification-alert verification-alert--warning" role="alert">
              <AlertCircle size={24} className="verification-icon" />
              <div className="verification-alert__content">
                <strong>Secure Storage Service Temporarily Unavailable</strong>
                <p>
                  Our private document storage service is currently undergoing scheduled maintenance
                  or experiencing high load. Your account data is safe. Please check back shortly.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline verification-alert__retry-btn"
                onClick={loadStatus}
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UI STATE 5: Top-level API / Network Error
  // ───────────────────────────────────────────────────────────────────────────
  if (fetchError) {
    return (
      <AppShell user={shellUser} onLogout={logout}>
        <div className="verification-page">
          <div className="verification-page__container">
            <div className="verification-alert verification-alert--error" role="alert">
              <WifiOff size={24} className="verification-icon" />
              <div className="verification-alert__content">
                <strong>Unable to load verification status</strong>
                <p>{fetchError}</p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline verification-alert__retry-btn"
                onClick={loadStatus}
              >
                <RefreshCw size={14} /> Retry Connection
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UI STATE 3: Success — Existing Verified Status Card
  // ───────────────────────────────────────────────────────────────────────────
  if (currentStatus === "verified") {
    return (
      <AppShell user={shellUser} onLogout={logout}>
        <div className="verification-page">
          <div className="verification-page__container">
            <div className="verification-status-card" role="region" aria-label="Verification Status: Verified">
              <div className="verification-status-card__badge-wrapper">
                <StatusBadge variant="verified" label="Verified Farmer" size="md" />
              </div>
              <div className="verification-status-card__icon-circle verification-status-card__icon-circle--verified">
                <ShieldCheck size={48} />
              </div>
              <h1 className="verification-status-card__title">You are a Verified Farmer!</h1>
              <p className="verification-status-card__desc">
                Your identity and agricultural land have been certified by Bhoomi administrators.
                You have full access to high-trust marketplace listings, verified agronomic advisories,
                and plot management.
              </p>

              <div className="verification-status-card__details-list">
                <div className="verification-status-card__detail-row">
                  <span className="verification-status-card__detail-row-label">Status</span>
                  <span className="verification-status-card__detail-row-value" style={{ color: "#1F7A3E" }}>
                    Verified & Active
                  </span>
                </div>
                {application?.reviewed_at && (
                  <div className="verification-status-card__detail-row">
                    <span className="verification-status-card__detail-row-label">Approved On</span>
                    <span className="verification-status-card__detail-row-value">
                      {new Date(application.reviewed_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                )}
                <div className="verification-status-card__detail-row">
                  <span className="verification-status-card__detail-row-label">Data Privacy</span>
                  <span className="verification-status-card__detail-row-value" style={{ color: "#79563D" }}>
                    Documents purged per §5 retention schedule
                  </span>
                </div>
              </div>

              <div className="verification-status-card__actions">
                <Link to="/farms" className="btn btn-primary">
                  Go to My Farms <ArrowRight size={16} />
                </Link>
                <Link to="/dashboard" className="btn btn-outline">
                  Return to Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UI STATE 3: Success — Existing Pending Review Card
  // ───────────────────────────────────────────────────────────────────────────
  if (currentStatus === "pending") {
    return (
      <AppShell user={shellUser} onLogout={logout}>
        <div className="verification-page">
          <div className="verification-page__container">
            <div className="verification-status-card" role="region" aria-label="Verification Status: Pending Review">
              <div className="verification-status-card__badge-wrapper">
                <StatusBadge variant="pending" label="Pending Review" size="md" />
              </div>
              <div className="verification-status-card__icon-circle verification-status-card__icon-circle--pending">
                <Clock size={48} />
              </div>
              <h1 className="verification-status-card__title">Verification Under Review</h1>
              <p className="verification-status-card__desc">
                Your selfie and farm plot photos have been securely submitted to Bhoomi's verification team.
                Reviews are typically completed within 24 to 48 business hours.
              </p>

              <div className="verification-status-card__details-list">
                <div className="verification-status-card__detail-row">
                  <span className="verification-status-card__detail-row-label">Application Status</span>
                  <span className="verification-status-card__detail-row-value" style={{ color: "#D97706" }}>
                    Awaiting Reviewer Approval
                  </span>
                </div>
                {application?.submitted_at && (
                  <div className="verification-status-card__detail-row">
                    <span className="verification-status-card__detail-row-label">Submitted On</span>
                    <span className="verification-status-card__detail-row-value">
                      {new Date(application.submitted_at).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="verification-status-card__detail-row">
                  <span className="verification-status-card__detail-row-label">Storage Location</span>
                  <span className="verification-status-card__detail-row-value">
                    KMS-encrypted private bucket (§5)
                  </span>
                </div>
              </div>

              <div className="verification-status-card__actions">
                <Link to="/dashboard" className="btn btn-primary">
                  Go to Dashboard
                </Link>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={loadStatus}
                  title="Check if status has changed"
                >
                  <RefreshCw size={14} /> Refresh Status
                </button>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UI STATE 4 / Status: Rejected Notice
  // ───────────────────────────────────────────────────────────────────────────
  const showRejectedBanner = currentStatus === "rejected";

  // ───────────────────────────────────────────────────────────────────────────
  // MAIN STEPPER FLOW (Purpose → Photos → Review)
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <AppShell user={shellUser} onLogout={logout}>
      <div className="verification-page">
        <div className="verification-page__container">

          {/* Page Headline */}
          <header className="verification-header">
            <h1 className="verification-header__title">
              <ShieldCheck className="verification-header__icon" size={28} />
              Farmer Verification
            </h1>
            <p className="verification-header__subtitle">
              Verify your agricultural status in 3 simple steps to unlock verified badges,
              agronomic consultations, and high-trust marketplace connections.
            </p>
          </header>

          {/* Rejected Notification Banner if applicable */}
          {showRejectedBanner && (
            <div className="verification-alert verification-alert--error" role="alert">
              <XCircle size={24} className="verification-icon" />
              <div className="verification-alert__content">
                <strong>Previous Application Requires Attention</strong>
                <p>
                  {application?.rejection_reason
                    ? `Reason provided: "${application.rejection_reason}"`
                    : "Your previous submission did not meet verification criteria. Please review the guidelines below and submit clear photographs."}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline verification-alert__retry-btn"
                onClick={handleRestartVerification}
              >
                <RotateCcw size={14} /> Re-apply
              </button>
            </div>
          )}

          {/* Stepper Navigation (§12.2) */}
          <nav className="verification-stepper" aria-label="Verification progress">
            <button
              type="button"
              className={`verification-stepper__step ${
                currentStep === 1
                  ? "verification-stepper__step--active"
                  : currentStep > 1
                  ? "verification-stepper__step--completed"
                  : ""
              }`}
              onClick={() => setCurrentStep(1)}
              aria-current={currentStep === 1 ? "step" : undefined}
            >
              <span className="verification-stepper__circle">
                {currentStep > 1 ? <CheckCircle2 size={16} /> : "1"}
              </span>
              <span className="verification-stepper__label">1. Purpose & Privacy</span>
            </button>

            <div
              className={`verification-stepper__divider ${
                currentStep > 1 ? "verification-stepper__divider--completed" : ""
              }`}
            />

            <button
              type="button"
              className={`verification-stepper__step ${
                currentStep === 2
                  ? "verification-stepper__step--active"
                  : currentStep > 2
                  ? "verification-stepper__step--completed"
                  : ""
              }`}
              onClick={() => {
                if (currentStep > 2 || currentStep === 1) setCurrentStep(2);
              }}
              aria-current={currentStep === 2 ? "step" : undefined}
            >
              <span className="verification-stepper__circle">
                {currentStep > 2 ? <CheckCircle2 size={16} /> : "2"}
              </span>
              <span className="verification-stepper__label">2. Upload Photos</span>
            </button>

            <div
              className={`verification-stepper__divider ${
                currentStep > 2 ? "verification-stepper__divider--completed" : ""
              }`}
            />

            <button
              type="button"
              className={`verification-stepper__step ${
                currentStep === 3 ? "verification-stepper__step--active" : ""
              }`}
              onClick={() => {
                // Only allow navigating to step 3 if photos uploaded
                if (
                  selfieState.status === "uploaded" &&
                  landState.status === "uploaded"
                ) {
                  setCurrentStep(3);
                } else {
                  toast.error("Please upload both photos first.");
                }
              }}
              aria-current={currentStep === 3 ? "step" : undefined}
            >
              <span className="verification-stepper__circle">3</span>
              <span className="verification-stepper__label">3. Review & Submit</span>
            </button>
          </nav>

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* STEP 1: Purpose & Privacy (§5, §12.2)                               */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          {currentStep === 1 && (
            <div className="verification-card">
              <div className="verification-card__body verification-purpose">
                <div className="verification-purpose__hero">
                  <div className="verification-purpose__illustration">
                    <ShieldCheck size={48} />
                  </div>
                  <div>
                    <h2 className="verification-purpose__intro-title">
                      Why verify your farmer status?
                    </h2>
                    <p className="verification-purpose__intro-desc">
                      Bhoomi connects farmers with genuine buyers, expert agronomists, and government
                      schemes. Verifying your identity establishes trust across the agricultural network
                      while protecting your land information.
                    </p>
                  </div>
                </div>

                {/* Benefits Grid */}
                <div className="verification-purpose__benefits-grid">
                  <div className="verification-purpose__benefit-item">
                    <Sparkles className="verification-purpose__benefit-icon" size={22} />
                    <div>
                      <div className="verification-purpose__benefit-title">Verified Farmer Badge</div>
                      <div className="verification-purpose__benefit-desc">
                        A green badge displayed on your profile and crop cycles for all buyers.
                      </div>
                    </div>
                  </div>
                  <div className="verification-purpose__benefit-item">
                    <MapPin className="verification-purpose__benefit-icon" size={22} />
                    <div>
                      <div className="verification-purpose__benefit-title">Verified Agronomic Support</div>
                      <div className="verification-purpose__benefit-desc">
                        Get personalized weather warnings and localized pest alerts for your registered plots.
                      </div>
                    </div>
                  </div>
                  <div className="verification-purpose__benefit-item">
                    <FileCheck className="verification-purpose__benefit-icon" size={22} />
                    <div>
                      <div className="verification-purpose__benefit-title">Direct Produce Selling</div>
                      <div className="verification-purpose__benefit-desc">
                        Post verified crop listings directly to vetted institutional buyers.
                      </div>
                    </div>
                  </div>
                  <div className="verification-purpose__benefit-item">
                    <Lock className="verification-purpose__benefit-icon" size={22} />
                    <div>
                      <div className="verification-purpose__benefit-title">Zero Document Leakage</div>
                      <div className="verification-purpose__benefit-desc">
                        No government ID number is requested; images are purged after verification.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mandatory Plain-Language Privacy & Retention Note per §5 */}
                <div className="verification-purpose__privacy-box">
                  <div className="verification-purpose__privacy-header">
                    <Lock size={18} />
                    Bhoomi Data Protection & Storage Commitment (§5)
                  </div>
                  <ul className="verification-purpose__privacy-list">
                    <li>
                      <strong>What we collect:</strong> Only (1) a live selfie and (2) a photograph of
                      you at your farm plot. We do <em>not</em> collect Aadhaar, PAN, or national ID numbers.
                    </li>
                    <li>
                      <strong>Encrypted Private Storage:</strong> Your photos are transmitted directly
                      to a private, SSE-KMS encrypted bucket (<code>bhoomi-verification-private</code>).
                      They are never stored on public servers or shared with advertisers.
                    </li>
                    <li>
                      <strong>Strict Permission-Gated Review:</strong> Only certified administrators
                      holding an active verification review grant can view documents. Every view logs
                      a mandatory audit trail recording the reviewer ID, timestamp, and business reason.
                    </li>
                    <li>
                      <strong>Automatic Data Purge:</strong> Raw photos are automatically and permanently
                      purged from storage shortly after a review decision is reached (<code>docs_purge_at</code>).
                      Only the verification decision record is retained.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="verification-card__actions">
                <Link to="/dashboard" className="btn btn-ghost">
                  Back to Dashboard
                </Link>
                <button
                  type="button"
                  id="btn-begin-verification"
                  className="btn btn-primary"
                  onClick={() => setCurrentStep(2)}
                >
                  Begin Verification <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* STEP 2: Photo Uploads (Selfie + Land) (§5, §12.2)                   */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          {currentStep === 2 && (
            <div className="verification-card">
              <div className="verification-card__body verification-photos">
                <div className="verification-photos__grid">

                  {/* ── Photo 1: Live Selfie ───────────────────────────────── */}
                  <div
                    className={`photo-uploader ${
                      selfieState.status === "uploaded"
                        ? "photo-uploader--uploaded"
                        : selfieState.status === "error"
                        ? "photo-uploader--error"
                        : ""
                    }`}
                  >
                    <div className="photo-uploader__title">
                      <span>1. Farmer Live Selfie</span>
                      {selfieState.status === "uploaded" && (
                        <StatusBadge variant="verified" label="Uploaded" size="sm" />
                      )}
                    </div>
                    <p className="photo-uploader__instructions">
                      Take a clear, front-facing photo of yourself. Ensure good lighting and remove
                      sunglasses, caps, or face coverings.
                    </p>

                    {/* Hidden input */}
                    <input
                      ref={selfieInputRef}
                      type="file"
                      id="selfie-file-input"
                      className="photo-uploader__input"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhotoSelect("selfie", file);
                      }}
                    />

                    {/* Preview / Dropzone */}
                    {selfieState.previewUrl ? (
                      <div className="photo-uploader__preview-container">
                        <img
                          src={selfieState.previewUrl}
                          alt="Selfie preview"
                          className="photo-uploader__preview-image"
                        />
                        <div className="photo-uploader__preview-overlay">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            style={{ background: "#fff" }}
                            onClick={() => selfieInputRef.current?.click()}
                          >
                            <Camera size={14} /> Change Photo
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => handleRemovePhoto("selfie")}
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="photo-uploader__dropzone"
                        tabIndex={0}
                        role="button"
                        aria-label="Upload live selfie photo"
                        onClick={() => selfieInputRef.current?.click()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            selfieInputRef.current?.click();
                          }
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const file = e.dataTransfer.files?.[0];
                          if (file) handlePhotoSelect("selfie", file);
                        }}
                      >
                        <Camera size={36} className="photo-uploader__dropzone-icon" />
                        <div className="photo-uploader__dropzone-text">
                          Drag & drop or <span>browse photo</span>
                        </div>
                        <div className="photo-uploader__dropzone-hint">
                          JPEG, PNG, WebP up to {MAX_FILE_SIZE_LABEL}
                        </div>
                      </div>
                    )}

                    {/* Upload Status Banner */}
                    {selfieState.status === "requesting_url" && (
                      <div className="photo-uploader__status-banner photo-uploader__status-banner--uploading">
                        <RefreshCw size={14} className="spin" /> Generating secure upload link...
                      </div>
                    )}
                    {selfieState.status === "uploading" && (
                      <div className="photo-uploader__status-banner photo-uploader__status-banner--uploading">
                        <RefreshCw size={14} className="spin" /> Uploading directly to private storage...
                      </div>
                    )}
                    {selfieState.status === "uploaded" && (
                      <div className="photo-uploader__status-banner photo-uploader__status-banner--success">
                        <CheckCircle2 size={14} /> Secured in private storage
                      </div>
                    )}
                    {selfieState.status === "error" && (
                      <div className="photo-uploader__retry-bar" role="alert">
                        <span>{selfieState.error || "Upload failed."}</span>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => handleRetryUpload("selfie")}
                        >
                          <RefreshCw size={12} /> Retry
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── Photo 2: Land / Farm Plot Photo ─────────────────────── */}
                  <div
                    className={`photo-uploader ${
                      landState.status === "uploaded"
                        ? "photo-uploader--uploaded"
                        : landState.status === "error"
                        ? "photo-uploader--error"
                        : ""
                    }`}
                  >
                    <div className="photo-uploader__title">
                      <span>2. Land / Farm Plot Photo</span>
                      {landState.status === "uploaded" && (
                        <StatusBadge variant="verified" label="Uploaded" size="sm" />
                      )}
                    </div>
                    <p className="photo-uploader__instructions">
                      Take a photo of yourself standing at your farming plot or field, showing the
                      surrounding soil, crops, or boundary landmarks.
                    </p>

                    {/* Hidden input */}
                    <input
                      ref={landInputRef}
                      type="file"
                      id="land-file-input"
                      className="photo-uploader__input"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhotoSelect("land", file);
                      }}
                    />

                    {/* Preview / Dropzone */}
                    {landState.previewUrl ? (
                      <div className="photo-uploader__preview-container">
                        <img
                          src={landState.previewUrl}
                          alt="Land photo preview"
                          className="photo-uploader__preview-image"
                        />
                        <div className="photo-uploader__preview-overlay">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            style={{ background: "#fff" }}
                            onClick={() => landInputRef.current?.click()}
                          >
                            <Camera size={14} /> Change Photo
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => handleRemovePhoto("land")}
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="photo-uploader__dropzone"
                        tabIndex={0}
                        role="button"
                        aria-label="Upload farm land photo"
                        onClick={() => landInputRef.current?.click()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            landInputRef.current?.click();
                          }
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const file = e.dataTransfer.files?.[0];
                          if (file) handlePhotoSelect("land", file);
                        }}
                      >
                        <MapPin size={36} className="photo-uploader__dropzone-icon" />
                        <div className="photo-uploader__dropzone-text">
                          Drag & drop or <span>browse photo</span>
                        </div>
                        <div className="photo-uploader__dropzone-hint">
                          JPEG, PNG, WebP up to {MAX_FILE_SIZE_LABEL}
                        </div>
                      </div>
                    )}

                    {/* Upload Status Banner */}
                    {landState.status === "requesting_url" && (
                      <div className="photo-uploader__status-banner photo-uploader__status-banner--uploading">
                        <RefreshCw size={14} className="spin" /> Generating secure upload link...
                      </div>
                    )}
                    {landState.status === "uploading" && (
                      <div className="photo-uploader__status-banner photo-uploader__status-banner--uploading">
                        <RefreshCw size={14} className="spin" /> Uploading directly to private storage...
                      </div>
                    )}
                    {landState.status === "uploaded" && (
                      <div className="photo-uploader__status-banner photo-uploader__status-banner--success">
                        <CheckCircle2 size={14} /> Secured in private storage
                      </div>
                    )}
                    {landState.status === "error" && (
                      <div className="photo-uploader__retry-bar" role="alert">
                        <span>{landState.error || "Upload failed."}</span>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => handleRetryUpload("land")}
                        >
                          <RefreshCw size={12} /> Retry
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Plain-language note */}
                <p style={{ fontSize: "0.8125rem", color: "#666", textAlign: "center", margin: 0 }}>
                  <Lock size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                  Files are transferred directly to private storage without passing unencrypted through our API servers.
                </p>
              </div>

              <div className="verification-card__actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setCurrentStep(1)}
                >
                  <ArrowLeft size={16} /> Back to Purpose
                </button>
                <button
                  type="button"
                  id="btn-goto-review"
                  className="btn btn-primary"
                  disabled={
                    selfieState.status !== "uploaded" ||
                    landState.status !== "uploaded"
                  }
                  onClick={() => {
                    if (
                      selfieState.status === "uploaded" &&
                      landState.status === "uploaded"
                    ) {
                      setCurrentStep(3);
                    } else {
                      toast.error("Please upload both photos to continue.");
                    }
                  }}
                >
                  Review Application <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* STEP 3: Review & Submit (§5, §12.2)                                 */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          {currentStep === 3 && (
            <div className="verification-card">
              <div className="verification-card__body verification-review">

                {/* Error Banner if submit failed (§12.4 State 5) */}
                {submitError && (
                  <div className="verification-alert verification-alert--error" role="alert">
                    <AlertCircle size={20} className="verification-icon" />
                    <div className="verification-alert__content">
                      <strong>Submission Failed</strong>
                      <p>{submitError}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline verification-alert__retry-btn"
                      onClick={handleSubmit}
                    >
                      <RefreshCw size={14} /> Retry Submission
                    </button>
                  </div>
                )}

                {/* Applicant Summary */}
                <div className="verification-review__applicant-box">
                  <div className="verification-review__applicant-title">
                    <ShieldCheck size={18} />
                    Applicant Information
                  </div>
                  <div className="verification-review__applicant-grid">
                    <div className="verification-review__applicant-field">
                      <span className="verification-review__applicant-label">Full Name</span>
                      <span className="verification-review__applicant-value">
                        {user?.full_name ?? "—"}
                      </span>
                    </div>
                    <div className="verification-review__applicant-field">
                      <span className="verification-review__applicant-label">Phone Number</span>
                      <span className="verification-review__applicant-value">
                        {user?.phone_number ?? "—"}
                      </span>
                    </div>
                    <div className="verification-review__applicant-field">
                      <span className="verification-review__applicant-label">Registered Role</span>
                      <span className="verification-review__applicant-value">
                        Farmer
                      </span>
                    </div>
                  </div>
                </div>

                {/* Uploaded Documents Thumbnails */}
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem", color: "#1A2E1A" }}>
                  Attached Verification Photographs
                </h3>
                <div className="verification-review__photos-preview-grid">
                  <div className="verification-review__photo-card">
                    <div className="verification-review__photo-card-header">
                      <span>1. Farmer Live Selfie</span>
                      <StatusBadge variant="verified" label="Attached" size="sm" />
                    </div>
                    {selfieState.previewUrl && (
                      <img
                        src={selfieState.previewUrl}
                        alt="Selfie submission preview"
                        className="verification-review__photo-card-thumb"
                      />
                    )}
                  </div>

                  <div className="verification-review__photo-card">
                    <div className="verification-review__photo-card-header">
                      <span>2. Land / Plot Photograph</span>
                      <StatusBadge variant="verified" label="Attached" size="sm" />
                    </div>
                    {landState.previewUrl && (
                      <img
                        src={landState.previewUrl}
                        alt="Land submission preview"
                        className="verification-review__photo-card-thumb"
                      />
                    )}
                  </div>
                </div>

                {/* Authenticity Declaration Checkbox (§12.4 State 4) */}
                <div className="verification-review__declaration">
                  <input
                    type="checkbox"
                    id="verification-declaration-checkbox"
                    checked={termsAccepted}
                    onChange={(e) => {
                      setTermsAccepted(e.target.checked);
                      if (e.target.checked) setTermsError(null);
                    }}
                  />
                  <label htmlFor="verification-declaration-checkbox">
                    I confirm that the photographs provided are authentic, accurately depict myself and
                    my agricultural land, and that no altered imagery has been uploaded. I understand
                    that photos will be evaluated by authorized reviewers and automatically purged per
                    Bhoomi's retention policy (§5).
                  </label>
                </div>
                {termsError && (
                  <p
                    style={{
                      color: "#DC2626",
                      fontSize: "0.8125rem",
                      marginTop: "6px",
                      fontWeight: 500,
                    }}
                    role="alert"
                  >
                    {termsError}
                  </p>
                )}
              </div>

              <div className="verification-card__actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setCurrentStep(2)}
                  disabled={isSubmitting}
                >
                  <ArrowLeft size={16} /> Edit Photos
                </button>
                <button
                  type="button"
                  id="btn-submit-verification"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={16} className="spin" /> Submitting Application...
                    </>
                  ) : (
                    <>
                      Submit Application <CheckCircle2 size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </AppShell>
  );
}

export default VerificationScreen;
