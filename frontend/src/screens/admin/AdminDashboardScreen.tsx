import React, { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Users,
  FileCheck,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lock,
  RefreshCw,
  Clock,
  ExternalLink,
  Info,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  fetchMyAdminPermissions,
  fetchUsersList,
  fetchVerificationApplications,
  fetchPhotoPresignedUrl,
  reviewVerificationApplication,
  deactivateUser,
  activateUser,
} from "../../api/admin";
import type {
  VerificationApplicationItem,
  AdminUserListItem,
  ListUsersParams,
} from "../../api/admin";
import { AppShell } from "../../design-system/components/AppShell/AppShell";
import { StatusBadge } from "../../design-system/components/StatusBadge/StatusBadge";
import type { BadgeVariant } from "../../design-system/components/StatusBadge/StatusBadge";
import { EmptyState } from "../../design-system/components/EmptyState/EmptyState";
import { useToast } from "../../design-system/components/Toast/ToastContext";
import "./AdminDashboardScreen.scss";

type AdminTab = "verification" | "users";

export const AdminDashboardScreen: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  // ── Permissions State ───────────────────────────────────────────────────
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [grantedKeys, setGrantedKeys] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // ── Active Tab ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<AdminTab>("verification");

  // ── Tab 1: Verification Applications State ──────────────────────────────
  const [apps, setApps] = useState<VerificationApplicationItem[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [appsStatusFilter, setAppsStatusFilter] = useState<string>("pending");
  const [appsPage, setAppsPage] = useState(1);
  const [appsTotal, setAppsTotal] = useState(0);
  const appsPerPage = 15;

  // ── Photo View Audit Modal State (§5) ───────────────────────────────────
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [activeApp, setActiveApp] = useState<VerificationApplicationItem | null>(null);
  const [photoTypeToView, setPhotoTypeToView] = useState<"selfie" | "land">("selfie");
  const [photoReason, setPhotoReason] = useState("");
  const [photoReasonError, setPhotoReasonError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoExpiry, setPhotoExpiry] = useState<number>(300);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoPurged, setPhotoPurged] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // ── Application Review Modal State ──────────────────────────────────────
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<"verified" | "rejected">("verified");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewReasonError, setReviewReasonError] = useState<string | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // ── Tab 2: User Directory State ─────────────────────────────────────────
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersSearch, setUsersSearch] = useState("");
  const [usersRoleFilter, setUsersRoleFilter] = useState<string>("");
  const [usersStatusFilter, setUsersStatusFilter] = useState<string>("");
  const usersPerPage = 15;

  // ── User Activation/Deactivation Modal State ────────────────────────────
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [targetUser, setTargetUser] = useState<AdminUserListItem | null>(null);
  const [userActionType, setUserActionType] = useState<"activate" | "deactivate">("deactivate");
  const [userActionReason, setUserActionReason] = useState("");
  const [userActionReasonError, setUserActionReasonError] = useState<string | null>(null);
  const [userActionSubmitting, setUserActionSubmitting] = useState(false);

  // ── Load Permissions on Mount ───────────────────────────────────────────
  const loadPermissions = useCallback(async () => {
    setPermissionsLoading(true);
    setPermissionsError(null);
    try {
      const res = await fetchMyAdminPermissions();
      if (res.error || !res.data) {
        setPermissionsError(res.error || "Failed to load admin permissions.");
        return;
      }
      setIsSuperAdmin(res.data.implicit_super_admin || res.data.platform_role === "super_admin");
      const keys = (res.data.permissions || []).map((p) =>
        typeof p === "string" ? p : p.permission_key
      );
      setGrantedKeys(keys);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to reach authorization service.";
      setPermissionsError(msg);
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const hasGrant = (key: string): boolean => {
    if (isSuperAdmin) return true;
    return grantedKeys.includes(key);
  };

  // ── Load Verification Applications ──────────────────────────────────────
  const loadApplications = useCallback(async () => {
    setAppsLoading(true);
    setAppsError(null);
    try {
      const res = await fetchVerificationApplications({
        page: appsPage,
        per_page: appsPerPage,
        status: appsStatusFilter || undefined,
      });
      if (res.error) {
        setAppsError(res.error);
        return;
      }
      if (res.data) {
        setApps(res.data.applications || []);
        setAppsTotal(res.data.total || 0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error fetching applications.";
      setAppsError(msg);
    } finally {
      setAppsLoading(false);
    }
  }, [appsPage, appsStatusFilter]);

  useEffect(() => {
    if (activeTab === "verification" && hasGrant("verification_review")) {
      loadApplications();
    }
  }, [activeTab, loadApplications, grantedKeys, isSuperAdmin]);

  // ── Load User Directory ─────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const params: ListUsersParams = {
        page: usersPage,
        per_page: usersPerPage,
        search: usersSearch.trim() || undefined,
        platform_role: usersRoleFilter || undefined,
      };
      if (usersStatusFilter === "active") params.is_active = true;
      if (usersStatusFilter === "inactive") params.is_active = false;

      const res = await fetchUsersList(params);
      if (res.error) {
        setUsersError(res.error);
        return;
      }
      if (res.data) {
        setUsers(res.data.users || []);
        setUsersTotal(res.data.total || 0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error fetching users.";
      setUsersError(msg);
    } finally {
      setUsersLoading(false);
    }
  }, [usersPage, usersSearch, usersRoleFilter, usersStatusFilter]);

  useEffect(() => {
    if (activeTab === "users" && hasGrant("user_reports")) {
      loadUsers();
    }
  }, [activeTab, loadUsers, grantedKeys, isSuperAdmin]);

  // ── Photo View Request Handler ──────────────────────────────────────────
  const openPhotoModal = (
    app: VerificationApplicationItem,
    type: "selfie" | "land"
  ) => {
    setActiveApp(app);
    setPhotoTypeToView(type);
    setPhotoReason("");
    setPhotoReasonError(null);
    setPhotoUrl(null);
    setPhotoPurged(false);
    setPhotoError(null);
    setPhotoModalOpen(true);
  };

  const handleRequestPhotoUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeApp) return;

    if (!photoReason.trim() || photoReason.trim().length < 5) {
      setPhotoReasonError("Reason must be at least 5 characters explaining access.");
      return;
    }
    setPhotoReasonError(null);
    setPhotoLoading(true);
    setPhotoError(null);

    try {
      const res = await fetchPhotoPresignedUrl(
        activeApp.id,
        photoTypeToView,
        photoReason.trim()
      );
      if (res.status === 410) {
        setPhotoPurged(true);
        return;
      }
      if (res.error || !res.data) {
        setPhotoError(res.error || "Failed to obtain pre-signed document URL.");
        return;
      }
      setPhotoUrl(res.data.download_url);
      setPhotoExpiry(res.data.expires_in);
      toast.info("Access recorded in audit log. Document pre-signed.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load document.";
      setPhotoError(msg);
    } finally {
      setPhotoLoading(false);
    }
  };

  // ── Application Review Handler ──────────────────────────────────────────
  const openReviewModal = (
    app: VerificationApplicationItem,
    decision: "verified" | "rejected"
  ) => {
    setActiveApp(app);
    setReviewDecision(decision);
    setReviewReason("");
    setReviewReasonError(null);
    setReviewModalOpen(true);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeApp) return;

    if (reviewDecision === "rejected" && (!reviewReason.trim() || reviewReason.trim().length < 5)) {
      setReviewReasonError("Mandatory reason (min 5 characters) required when rejecting.");
      return;
    }
    setReviewReasonError(null);
    setReviewSubmitting(true);

    try {
      const res = await reviewVerificationApplication(activeApp.id, {
        decision: reviewDecision,
        reason: reviewReason.trim() || undefined,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      toast.success(
        `Application ${reviewDecision === "verified" ? "approved" : "rejected"} successfully.`
      );
      setReviewModalOpen(false);
      loadApplications();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Review submission failed.";
      toast.error(msg);
    } finally {
      setReviewSubmitting(false);
    }
  };

  // ── User Activation/Deactivation Handler ─────────────────────────────────
  const openUserActionModal = (
    usr: AdminUserListItem,
    action: "activate" | "deactivate"
  ) => {
    setTargetUser(usr);
    setUserActionType(action);
    setUserActionReason("");
    setUserActionReasonError(null);
    setUserModalOpen(true);
  };

  const handleSubmitUserAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser) return;

    if (!userActionReason.trim() || userActionReason.trim().length < 5) {
      setUserActionReasonError("Audit reason (min 5 characters) is required.");
      return;
    }
    setUserActionReasonError(null);
    setUserActionSubmitting(true);

    try {
      const res =
        userActionType === "deactivate"
          ? await deactivateUser(targetUser.id, userActionReason.trim())
          : await activateUser(targetUser.id, userActionReason.trim());

      if (res.error) {
        toast.error(res.error);
        return;
      }

      toast.success(
        `User ${targetUser.full_name} has been ${userActionType === "deactivate" ? "deactivated" : "reactivated"}.`
      );
      setUserModalOpen(false);
      loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Action failed.";
      toast.error(msg);
    } finally {
      setUserActionSubmitting(false);
    }
  };

  // ── State 6: Permission Denied (Honest 403) Check ────────────────────────
  if (!user || (user.platform_role !== "admin" && user.platform_role !== "super_admin")) {
    return (
      <AppShell>
        <div className="admin-screen">
          <div className="admin-screen__alert-box">
            <Lock size={32} />
            <div>
              <h3 className="admin-screen__alert-box-title">Permission Denied (HTTP 403)</h3>
              <p className="admin-screen__alert-box-msg">
                Your account does not possess the <code>admin</code> or <code>super_admin</code> platform role required to access this portal.
                Please contact a system administrator if you believe this is an error.
              </p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Helper: Map Verification Status to Badge Variant ─────────────────────
  const getVerificationBadgeVariant = (status: string): BadgeVariant => {
    switch (status) {
      case "verified":
        return "verified";
      case "rejected":
        return "rejected";
      case "pending":
      default:
        return "pending";
    }
  };

  return (
    <AppShell>
      <div className="admin-screen">
        {/* Header */}
        <header className="admin-screen__header">
          <div className="admin-screen__header-text">
            <h1 className="admin-screen__title">
              <Shield size={28} color="#2F5D3A" aria-hidden="true" />
              Bhoomi Admin Portal
            </h1>
            <p className="admin-screen__subtitle">
              Platform administration, farmer verification audit, and user directory management (§5, §7, §12.2).
            </p>
          </div>

          <div className="admin-screen__grants-badge">
            <Shield size={16} />
            {isSuperAdmin
              ? "Super Admin (Full Access)"
              : `Admin (${grantedKeys.length} active grant${grantedKeys.length === 1 ? "" : "s"})`}
          </div>
        </header>

        {/* Global Permissions Error Banner (State 5: API Error) */}
        {permissionsError && (
          <div className="admin-screen__alert-box" role="alert">
            <AlertTriangle size={24} />
            <div>
              <h4 className="admin-screen__alert-box-title">Authorization Sync Error</h4>
              <p className="admin-screen__alert-box-msg">{permissionsError}</p>
            </div>
            <button
              className="btn btn-outline"
              style={{ marginLeft: "auto" }}
              onClick={loadPermissions}
            >
              Retry
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <nav className="admin-screen__tabs" aria-label="Admin Navigation Tabs">
          <button
            type="button"
            className={`admin-screen__tab-btn ${activeTab === "verification" ? "admin-screen__tab-btn--active" : ""}`}
            onClick={() => setActiveTab("verification")}
          >
            <FileCheck size={18} />
            Verification Applications
            {appsTotal > 0 && appsStatusFilter === "pending" && (
              <span className="badge badge-warning" style={{ fontSize: "0.75rem", padding: "1px 6px" }}>
                {appsTotal}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`admin-screen__tab-btn ${activeTab === "users" ? "admin-screen__tab-btn--active" : ""}`}
            onClick={() => setActiveTab("users")}
          >
            <Users size={18} />
            User Directory
          </button>
        </nav>

        {/* ── TAB 1: VERIFICATION APPLICATIONS ─────────────────────────── */}
        {activeTab === "verification" && (
          <section aria-labelledby="tab-verification-title">
            <h2 id="tab-verification-title" className="sr-only">Farmer Verification Reviews</h2>

            {/* State 6: Permission Denied for specific grant */}
            {!permissionsLoading && !hasGrant("verification_review") ? (
              <div className="admin-screen__alert-box" role="alert">
                <Lock size={24} />
                <div>
                  <h4 className="admin-screen__alert-box-title">Permission Denied (HTTP 403)</h4>
                  <p className="admin-screen__alert-box-msg">
                    You do not hold the <code>verification_review</code> grant required to view or review farmer verification applications.
                    Contact a Super Admin to grant you this permission.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div className="admin-screen__toolbar">
                  <div className="admin-screen__toolbar-left">
                    <label htmlFor="apps-status-filter" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                      Filter by Status:
                    </label>
                    <select
                      id="apps-status-filter"
                      className="input-field"
                      style={{ height: 38, width: 160 }}
                      value={appsStatusFilter}
                      onChange={(e) => {
                        setAppsStatusFilter(e.target.value);
                        setAppsPage(1);
                      }}
                    >
                      <option value="">All Applications</option>
                      <option value="pending">Pending Review</option>
                      <option value="verified">Verified (Approved)</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={loadApplications}
                    disabled={appsLoading}
                    aria-label="Refresh applications list"
                  >
                    <RefreshCw size={16} className={appsLoading ? "animate-spin" : ""} />
                    Refresh
                  </button>
                </div>

                {/* State 5: API Error Banner */}
                {appsError && (
                  <div className="admin-screen__alert-box" role="alert">
                    <AlertTriangle size={24} />
                    <div>
                      <h4 className="admin-screen__alert-box-title">Failed to load verification applications</h4>
                      <p className="admin-screen__alert-box-msg">{appsError}</p>
                    </div>
                    <button className="btn btn-outline" style={{ marginLeft: "auto" }} onClick={loadApplications}>
                      Retry
                    </button>
                  </div>
                )}

                {/* Table or Empty State */}
                <div className="admin-screen__table-wrapper">
                  <table className="admin-screen__table">
                    <thead>
                      <tr>
                        <th scope="col">Applicant</th>
                        <th scope="col">Phone</th>
                        <th scope="col">Submitted Date</th>
                        <th scope="col">Status</th>
                        <th scope="col">Identity Documents (§5)</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* State 1: Loading Skeleton */}
                      {appsLoading && (
                        <>
                          {[1, 2, 3, 4].map((i) => (
                            <tr key={i} className="admin-screen__skeleton-row">
                              <td colSpan={6}>
                                <div className="skeleton-bar" />
                              </td>
                            </tr>
                          ))}
                        </>
                      )}

                      {/* State 2: Empty State */}
                      {!appsLoading && apps.length === 0 && !appsError && (
                        <tr>
                          <td colSpan={6} style={{ padding: "3rem 1rem" }}>
                            <EmptyState
                              icon={FileCheck}
                              title="No applications found"
                              description={
                                appsStatusFilter
                                  ? `There are no ${appsStatusFilter} verification applications.`
                                  : "No verification applications have been submitted yet."
                              }
                              action={
                                appsStatusFilter ? (
                                  <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => setAppsStatusFilter("")}
                                  >
                                    Clear Status Filter
                                  </button>
                                ) : undefined
                              }
                            />
                          </td>
                        </tr>
                      )}

                      {/* State 3: Success State Data Rows */}
                      {!appsLoading &&
                        apps.map((app) => (
                          <tr key={app.id}>
                            <td>
                              <strong>{app.applicant_name}</strong>
                              <div style={{ fontSize: "0.75rem", color: "#6D7A68" }}>
                                UID: {app.user_id.slice(0, 8)}...
                              </div>
                            </td>
                            <td>{app.applicant_phone}</td>
                            <td>
                              {app.submitted_at
                                ? new Date(app.submitted_at).toLocaleDateString("en-IN", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "N/A"}
                            </td>
                            <td>
                              <StatusBadge
                                variant={getVerificationBadgeVariant(app.status)}
                                label={app.status.toUpperCase()}
                              />
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                                  onClick={() => openPhotoModal(app, "selfie")}
                                >
                                  <Eye size={14} />
                                  Selfie
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                                  onClick={() => openPhotoModal(app, "land")}
                                >
                                  <Eye size={14} />
                                  Land Proof
                                </button>
                              </div>
                            </td>
                            <td>
                              {app.status === "pending" ? (
                                <div style={{ display: "flex", gap: "6px" }}>
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                                    onClick={() => openReviewModal(app, "verified")}
                                  >
                                    <CheckCircle size={14} />
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-danger"
                                    style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                                    onClick={() => openReviewModal(app, "rejected")}
                                  >
                                    <XCircle size={14} />
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span style={{ fontSize: "0.8rem", color: "#6D7A68" }}>
                                  Reviewed
                                  {app.reviewed_at &&
                                    ` on ${new Date(app.reviewed_at).toLocaleDateString()}`}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {appsTotal > appsPerPage && (
                  <div className="admin-screen__pagination">
                    <span>
                      Showing {(appsPage - 1) * appsPerPage + 1} to{" "}
                      {Math.min(appsPage * appsPerPage, appsTotal)} of {appsTotal} applications
                    </span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ padding: "4px 8px" }}
                        disabled={appsPage <= 1}
                        onClick={() => setAppsPage((p) => p - 1)}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ padding: "4px 8px" }}
                        disabled={appsPage * appsPerPage >= appsTotal}
                        onClick={() => setAppsPage((p) => p + 1)}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* ── TAB 2: USER DIRECTORY ────────────────────────────────────── */}
        {activeTab === "users" && (
          <section aria-labelledby="tab-users-title">
            <h2 id="tab-users-title" className="sr-only">Platform User Directory</h2>

            {/* State 6: Permission Denied for user_reports */}
            {!permissionsLoading && !hasGrant("user_reports") ? (
              <div className="admin-screen__alert-box" role="alert">
                <Lock size={24} />
                <div>
                  <h4 className="admin-screen__alert-box-title">Permission Denied (HTTP 403)</h4>
                  <p className="admin-screen__alert-box-msg">
                    You do not hold the <code>user_reports</code> grant required to view the user directory.
                    Contact a Super Admin to grant you this permission.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Search & Filters */}
                <div className="admin-screen__toolbar">
                  <div className="admin-screen__toolbar-left">
                    <div style={{ position: "relative" }}>
                      <Search
                        size={16}
                        style={{ position: "absolute", left: 10, top: 11, color: "#6D7A68" }}
                      />
                      <input
                        type="text"
                        placeholder="Search phone, name, email..."
                        className="admin-screen__search-input"
                        style={{ paddingLeft: 34 }}
                        value={usersSearch}
                        onChange={(e) => {
                          setUsersSearch(e.target.value);
                          setUsersPage(1);
                        }}
                      />
                    </div>

                    <select
                      className="input-field"
                      style={{ height: 38, width: 140 }}
                      value={usersRoleFilter}
                      onChange={(e) => {
                        setUsersRoleFilter(e.target.value);
                        setUsersPage(1);
                      }}
                      aria-label="Filter by role"
                    >
                      <option value="">All Roles</option>
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </select>

                    <select
                      className="input-field"
                      style={{ height: 38, width: 140 }}
                      value={usersStatusFilter}
                      onChange={(e) => {
                        setUsersStatusFilter(e.target.value);
                        setUsersPage(1);
                      }}
                      aria-label="Filter by active status"
                    >
                      <option value="">All Accounts</option>
                      <option value="active">Active Only</option>
                      <option value="inactive">Deactivated</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={loadUsers}
                    disabled={usersLoading}
                    aria-label="Refresh user list"
                  >
                    <RefreshCw size={16} className={usersLoading ? "animate-spin" : ""} />
                    Refresh
                  </button>
                </div>

                {/* State 5: API Error Banner */}
                {usersError && (
                  <div className="admin-screen__alert-box" role="alert">
                    <AlertTriangle size={24} />
                    <div>
                      <h4 className="admin-screen__alert-box-title">Failed to load user directory</h4>
                      <p className="admin-screen__alert-box-msg">{usersError}</p>
                    </div>
                    <button className="btn btn-outline" style={{ marginLeft: "auto" }} onClick={loadUsers}>
                      Retry
                    </button>
                  </div>
                )}

                {/* Users Table */}
                <div className="admin-screen__table-wrapper">
                  <table className="admin-screen__table">
                    <thead>
                      <tr>
                        <th scope="col">User</th>
                        <th scope="col">Contact</th>
                        <th scope="col">Role</th>
                        <th scope="col">Verification</th>
                        <th scope="col">Account Status</th>
                        <th scope="col">Joined</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* State 1: Loading Skeleton */}
                      {usersLoading && (
                        <>
                          {[1, 2, 3, 4].map((i) => (
                            <tr key={i} className="admin-screen__skeleton-row">
                              <td colSpan={7}>
                                <div className="skeleton-bar" />
                              </td>
                            </tr>
                          ))}
                        </>
                      )}

                      {/* State 2: Empty State */}
                      {!usersLoading && users.length === 0 && !usersError && (
                        <tr>
                          <td colSpan={7} style={{ padding: "3rem 1rem" }}>
                            <EmptyState
                              icon={Users}
                              title="No users found"
                              description={
                                usersSearch || usersRoleFilter || usersStatusFilter
                                  ? "No users matched your search criteria."
                                  : "No users registered on the platform yet."
                              }
                              action={
                                usersSearch || usersRoleFilter || usersStatusFilter ? (
                                  <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => {
                                      setUsersSearch("");
                                      setUsersRoleFilter("");
                                      setUsersStatusFilter("");
                                    }}
                                  >
                                    Reset Filters
                                  </button>
                                ) : undefined
                              }
                            />
                          </td>
                        </tr>
                      )}

                      {/* State 3: Success Data Rows */}
                      {!usersLoading &&
                        users.map((usr) => (
                          <tr key={usr.id}>
                            <td>
                              <strong>{usr.full_name}</strong>
                              <div style={{ fontSize: "0.75rem", color: "#6D7A68" }}>
                                {usr.user_type} • Lang: {usr.preferred_language}
                              </div>
                            </td>
                            <td>
                              <div>{usr.phone_number}</div>
                              {usr.email && (
                                <div style={{ fontSize: "0.75rem", color: "#6D7A68" }}>
                                  {usr.email}
                                </div>
                              )}
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  usr.platform_role === "super_admin"
                                    ? "badge-danger"
                                    : usr.platform_role === "admin"
                                    ? "badge-warning"
                                    : "badge-default"
                                }`}
                                style={{ textTransform: "uppercase", fontSize: "0.7rem" }}
                              >
                                {usr.platform_role.replace("_", " ")}
                              </span>
                            </td>
                            <td>
                              <StatusBadge
                                variant={getVerificationBadgeVariant(usr.verification_status)}
                                label={usr.verification_status.toUpperCase()}
                              />
                            </td>
                            <td>
                              <span
                                style={{
                                  display: "inline-block",
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  backgroundColor: usr.is_active ? "#2F5D3A" : "#D92D20",
                                  marginRight: 6,
                                }}
                              />
                              {usr.is_active ? "Active" : "Deactivated"}
                            </td>
                            <td>
                              {new Date(usr.created_at).toLocaleDateString("en-IN", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </td>
                            <td>
                              {/* Action: Admins cannot deactivate themselves, or other admins/super admins */}
                              {usr.id === user.id ? (
                                <span style={{ fontSize: "0.75rem", color: "#6D7A68" }}>Current User</span>
                              ) : !isSuperAdmin &&
                                (usr.platform_role === "admin" || usr.platform_role === "super_admin") ? (
                                <span style={{ fontSize: "0.75rem", color: "#6D7A68" }}>Admin Tier</span>
                              ) : usr.is_active ? (
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  style={{ padding: "4px 8px", fontSize: "0.75rem", color: "#D92D20" }}
                                  onClick={() => openUserActionModal(usr, "deactivate")}
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  style={{ padding: "4px 8px", fontSize: "0.75rem", color: "#2F5D3A" }}
                                  onClick={() => openUserActionModal(usr, "activate")}
                                >
                                  Reactivate
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {usersTotal > usersPerPage && (
                  <div className="admin-screen__pagination">
                    <span>
                      Showing {(usersPage - 1) * usersPerPage + 1} to{" "}
                      {Math.min(usersPage * usersPerPage, usersTotal)} of {usersTotal} users
                    </span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ padding: "4px 8px" }}
                        disabled={usersPage <= 1}
                        onClick={() => setUsersPage((p) => p - 1)}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ padding: "4px 8px" }}
                        disabled={usersPage * usersPerPage >= usersTotal}
                        onClick={() => setUsersPage((p) => p + 1)}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* ── MODAL 1: PRESIGNED PHOTO AUDIT REASON & VIEWER (§5) ─────── */}
        {photoModalOpen && activeApp && (
          <div className="dialog-backdrop" role="presentation">
            <div
              className={`dialog-modal admin-screen__modal ${photoUrl ? "admin-screen__modal--wide" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="photo-modal-title"
            >
              <div className="admin-screen__modal-header">
                <h3 id="photo-modal-title" className="admin-screen__modal-title">
                  {photoUrl ? "Secure Document Viewer" : "Audit Access Verification Document"}
                </h3>
                <button
                  type="button"
                  className="admin-screen__modal-close"
                  onClick={() => setPhotoModalOpen(false)}
                  aria-label="Close photo modal"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="admin-screen__modal-body">
                {/* State 7: Purged Document (Unavailable / Stale Data) */}
                {photoPurged ? (
                  <div className="admin-screen__alert-box admin-screen__alert-box--warn">
                    <Info size={24} />
                    <div>
                      <h4 className="admin-screen__alert-box-title">Document Purged (HTTP 410)</h4>
                      <p className="admin-screen__alert-box-msg">
                        This verification document has exceeded the statutory data retention policy (§5) and has been permanently purged from storage.
                      </p>
                    </div>
                  </div>
                ) : photoUrl ? (
                  /* Photo Viewer Active */
                  <div className="admin-screen__photo-viewer">
                    <img
                      src={photoUrl}
                      alt={`Applicant ${photoTypeToView}`}
                      className="admin-screen__photo-viewer-img"
                    />
                    <div className="admin-screen__photo-viewer-meta">
                      <span>
                        <Clock size={14} style={{ verticalAlign: "text-bottom", marginRight: 4 }} />
                        Pre-signed access expires in ~{Math.round(photoExpiry / 60)} minutes
                      </span>
                      <a
                        href={photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#2F5D3A" }}
                      >
                        Open full size <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>
                ) : (
                  /* Step 1: Prompt for mandatory access reason */
                  <form onSubmit={handleRequestPhotoUrl} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div className="admin-screen__audit-notice">
                      <strong>Mandatory Audit Trail (§5 & §9):</strong>
                      <p style={{ margin: "4px 0 0" }}>
                        All accesses to sensitive farmer identity photos generate a permanent audit log entry.
                        You must provide a valid business reason (min 5 characters) for reviewing this{" "}
                        <code>{photoTypeToView}</code> image.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="photo-reason" style={{ fontWeight: 600, fontSize: "0.85rem", display: "block", marginBottom: 4 }}>
                        Access Reason <span style={{ color: "#D92D20" }}>*</span>
                      </label>
                      <textarea
                        id="photo-reason"
                        className="admin-screen__modal-textarea"
                        placeholder="e.g., Reviewing farmer face clarity against national ID"
                        value={photoReason}
                        onChange={(e) => setPhotoReason(e.target.value)}
                        disabled={photoLoading}
                      />
                      {/* State 4: Validation error */}
                      {photoReasonError && (
                        <div className="admin-screen__modal-field-error">{photoReasonError}</div>
                      )}
                    </div>

                    {/* State 5: API Error in photo modal */}
                    {photoError && (
                      <div className="admin-screen__alert-box" style={{ padding: "8px 12px" }}>
                        <AlertTriangle size={16} />
                        <span style={{ fontSize: "0.85rem" }}>{photoError}</span>
                      </div>
                    )}

                    <div className="admin-screen__modal-footer">
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setPhotoModalOpen(false)}
                        disabled={photoLoading}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={photoLoading}
                      >
                        {photoLoading ? "Generating Pre-signed URL..." : "Confirm & View Document"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL 2: APPLICATION REVIEW DECISION (APPROVE / REJECT) ─── */}
        {reviewModalOpen && activeApp && (
          <div className="dialog-backdrop" role="presentation">
            <div
              className="dialog-modal admin-screen__modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="review-modal-title"
            >
              <div className="admin-screen__modal-header">
                <h3 id="review-modal-title" className="admin-screen__modal-title">
                  {reviewDecision === "verified" ? "Approve Verification" : "Reject Verification"}
                </h3>
                <button
                  type="button"
                  className="admin-screen__modal-close"
                  onClick={() => setReviewModalOpen(false)}
                  aria-label="Close review modal"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitReview} className="admin-screen__modal-body">
                <p style={{ margin: 0, fontSize: "0.9rem" }}>
                  Applicant: <strong>{activeApp.applicant_name}</strong> ({activeApp.applicant_phone})
                </p>

                {reviewDecision === "verified" ? (
                  <div className="admin-screen__audit-notice">
                    Approving will upgrade this user to <strong>Verified Farmer</strong> status, granting full access to farm creation, plot management, and crop cycle recording.
                  </div>
                ) : (
                  <div>
                    <label htmlFor="reject-reason" style={{ fontWeight: 600, fontSize: "0.85rem", display: "block", marginBottom: 4 }}>
                      Rejection Reason <span style={{ color: "#D92D20" }}>*</span>
                    </label>
                    <textarea
                      id="reject-reason"
                      className="admin-screen__modal-textarea"
                      placeholder="e.g., Land document is blurred and parcel number cannot be verified"
                      value={reviewReason}
                      onChange={(e) => setReviewReason(e.target.value)}
                      disabled={reviewSubmitting}
                    />
                    {/* State 4: Validation error */}
                    {reviewReasonError && (
                      <div className="admin-screen__modal-field-error">{reviewReasonError}</div>
                    )}
                  </div>
                )}

                <div className="admin-screen__modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setReviewModalOpen(false)}
                    disabled={reviewSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`btn ${reviewDecision === "verified" ? "btn-primary" : "btn-danger"}`}
                    disabled={reviewSubmitting}
                  >
                    {reviewSubmitting
                      ? "Submitting..."
                      : reviewDecision === "verified"
                      ? "Confirm Approval"
                      : "Confirm Rejection"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL 3: USER DEACTIVATE / ACTIVATE (§7) ────────────────── */}
        {userModalOpen && targetUser && (
          <div className="dialog-backdrop" role="presentation">
            <div
              className="dialog-modal admin-screen__modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="user-action-modal-title"
            >
              <div className="admin-screen__modal-header">
                <h3 id="user-action-modal-title" className="admin-screen__modal-title">
                  {userActionType === "deactivate" ? "Deactivate User Account" : "Reactivate User Account"}
                </h3>
                <button
                  type="button"
                  className="admin-screen__modal-close"
                  onClick={() => setUserModalOpen(false)}
                  aria-label="Close user action modal"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitUserAction} className="admin-screen__modal-body">
                <p style={{ margin: 0, fontSize: "0.9rem" }}>
                  Target: <strong>{targetUser.full_name}</strong> ({targetUser.phone_number})
                </p>

                <div className="admin-screen__audit-notice">
                  {userActionType === "deactivate"
                    ? "Deactivating an account immediately invalidates all active JWT sessions and blocks logins."
                    : "Reactivating will restore account access for this user."}
                </div>

                <div>
                  <label htmlFor="user-action-reason" style={{ fontWeight: 600, fontSize: "0.85rem", display: "block", marginBottom: 4 }}>
                    Audit Reason <span style={{ color: "#D92D20" }}>*</span>
                  </label>
                  <textarea
                    id="user-action-reason"
                    className="admin-screen__modal-textarea"
                    placeholder="e.g., Requested by user via support ticket #1234"
                    value={userActionReason}
                    onChange={(e) => setUserActionReason(e.target.value)}
                    disabled={userActionSubmitting}
                  />
                  {/* State 4: Validation error */}
                  {userActionReasonError && (
                    <div className="admin-screen__modal-field-error">{userActionReasonError}</div>
                  )}
                </div>

                <div className="admin-screen__modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setUserModalOpen(false)}
                    disabled={userActionSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`btn ${userActionType === "deactivate" ? "btn-danger" : "btn-primary"}`}
                    disabled={userActionSubmitting}
                  >
                    {userActionSubmitting
                      ? "Processing..."
                      : userActionType === "deactivate"
                      ? "Confirm Deactivation"
                      : "Confirm Reactivation"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
};
