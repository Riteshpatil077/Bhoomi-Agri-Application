import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  Users,
  Key,
  ScrollText,
  Plus,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Lock,
  X,
  CheckCircle,
  XCircle,
  Search,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  fetchAdminList,
  createAdminAccount,
  deactivateAdminAccount,
  activateAdminAccount,
  fetchAdminPermissions,
  grantAdminPermission,
  revokeAdminPermission,
  fetchAuditLogs,
} from "../../api/superAdmin";
import type {
  AuditLogEntry,
  AuditLogsParams,
  GrantInfo,
} from "../../api/superAdmin";
import type { AdminUserListItem } from "../../api/admin";
import { fetchMyAdminPermissions } from "../../api/admin";
import { fetchPlatformSettings, updatePlatformSetting, type PlatformSetting } from "../../api/superAdmin";
import { AppShell } from "../../design-system/components/AppShell/AppShell";
import { StatusBadge } from "../../design-system/components/StatusBadge/StatusBadge";
import type { BadgeVariant } from "../../design-system/components/StatusBadge/StatusBadge";
import { EmptyState } from "../../design-system/components/EmptyState/EmptyState";
import { useToast } from "../../design-system/components/Toast/ToastContext";
import "./SuperAdminScreen.scss";

// Standard permissions from §4 / §7
const STANDARD_PERMISSIONS = [
  "verification_review",
  "content_moderation",
  "user_reports",
  "audit_log_view",
  "chat_support_view",
];

type SATab = "admins" | "permissions" | "audit" | "settings";

export const SuperAdminScreen: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<SATab>("admins");
  const [auditGrant, setAuditGrant] = useState(false);
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingKey, setSettingKey] = useState("platform.support_email");
  const [settingValue, setSettingValue] = useState("");
  const [settingSaving, setSettingSaving] = useState(false);

  useEffect(() => {
    fetchMyAdminPermissions().then((res) => {
      setAuditGrant(Boolean(res.data?.permissions?.some((item) =>
        (typeof item === "string" ? item : item.permission_key) === "audit_log_view"
      )));
    });
  }, []);

  // ── Admin List State ────────────────────────────────────────────────────
  const [admins, setAdmins] = useState<AdminUserListItem[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminsError, setAdminsError] = useState<string | null>(null);

  // ── Create Admin Modal State ────────────────────────────────────────────
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: "",
    phone_number: "",
    email: "",
    password: "",
    step_up_password: "",
    platform_role: "admin" as "admin" | "super_admin",
    user_type: "",
  });
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [showStepUpPw, setShowStepUpPw] = useState(false);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // ── Admin Action Modal (Activate/Deactivate) State ──────────────────────
  const [adminActionModalOpen, setAdminActionModalOpen] = useState(false);
  const [adminActionTarget, setAdminActionTarget] = useState<AdminUserListItem | null>(null);
  const [adminActionType, setAdminActionType] = useState<"activate" | "deactivate">("deactivate");
  const [adminActionReason, setAdminActionReason] = useState("");
  const [adminActionReasonError, setAdminActionReasonError] = useState<string | null>(null);
  const [adminActionSubmitting, setAdminActionSubmitting] = useState(false);

  // ── Permission Management State ─────────────────────────────────────────
  const [permAdmins, setPermAdmins] = useState<AdminUserListItem[]>([]);
  const [permAdminsLoading, setPermAdminsLoading] = useState(false);
  const [permAdminsError, setPermAdminsError] = useState<string | null>(null);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminUserListItem | null>(null);
  const [adminGrants, setAdminGrants] = useState<GrantInfo[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantsError, setGrantsError] = useState<string | null>(null);
  const [grantSubmitting, setGrantSubmitting] = useState<string | null>(null);

  // ── Audit Log State ─────────────────────────────────────────────────────
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPages, setAuditPages] = useState(1);
  const [auditFilters, setAuditFilters] = useState<AuditLogsParams>({
    per_page: 25,
  });
  const auditPerPage = 25;


  // ── Badge variant helpers ───────────────────────────────────────────────
  const getVerificationBadgeVariant = (status: string): BadgeVariant => {
    switch (status) {
      case "verified": return "verified";
      case "rejected": return "rejected";
      default: return "pending";
    }
  };

  // ── Load Admin Accounts ─────────────────────────────────────────────────
  const loadAdmins = useCallback(async () => {
    setAdminsLoading(true);
    setAdminsError(null);
    try {
      const res = await fetchAdminList();
      if (res.error || !res.data) {
        setAdminsError(res.error || "Failed to load admin accounts.");
        return;
      }
      setAdmins(res.data.admins || []);
    } catch (err: unknown) {
      setAdminsError(err instanceof Error ? err.message : "Error fetching admin list.");
    } finally {
      setAdminsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "admins") loadAdmins();
  }, [activeTab, loadAdmins]);

  // ── Load Admins for Permissions Tab ────────────────────────────────────
  const loadPermAdmins = useCallback(async () => {
    setPermAdminsLoading(true);
    setPermAdminsError(null);
    try {
      const res = await fetchAdminList();
      if (res.error || !res.data) {
        setPermAdminsError(res.error || "Failed to load admin list.");
        return;
      }
      setPermAdmins(res.data.admins || []);
    } catch (err: unknown) {
      setPermAdminsError(err instanceof Error ? err.message : "Error.");
    } finally {
      setPermAdminsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "permissions") loadPermAdmins();
  }, [activeTab, loadPermAdmins]);

  // ── Load Grants for Selected Admin ─────────────────────────────────────
  const loadAdminGrants = useCallback(async (adminUser: AdminUserListItem) => {
    setGrantsLoading(true);
    setGrantsError(null);
    try {
      const res = await fetchAdminPermissions(adminUser.id);
      if (res.error || !res.data) {
        setGrantsError(res.error || "Failed to load permissions.");
        return;
      }
      setAdminGrants(res.data.grants || []);
    } catch (err: unknown) {
      setGrantsError(err instanceof Error ? err.message : "Error.");
    } finally {
      setGrantsLoading(false);
    }
  }, []);

  const handleSelectAdmin = (a: AdminUserListItem) => {
    setSelectedAdmin(a);
    loadAdminGrants(a);
  };

  // ── Grant Permission ────────────────────────────────────────────────────
  const handleGrantPermission = async (permKey: string) => {
    if (!selectedAdmin) return;
    setGrantSubmitting(permKey);
    try {
      const res = await grantAdminPermission(selectedAdmin.id, permKey);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${permKey} granted to ${selectedAdmin.full_name}.`);
      loadAdminGrants(selectedAdmin);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Grant failed.");
    } finally {
      setGrantSubmitting(null);
    }
  };

  // ── Revoke Permission ───────────────────────────────────────────────────
  const handleRevokePermission = async (permKey: string) => {
    if (!selectedAdmin) return;
    setGrantSubmitting(permKey);
    try {
      const res = await revokeAdminPermission(selectedAdmin.id, permKey);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${permKey} revoked from ${selectedAdmin.full_name}.`);
      loadAdminGrants(selectedAdmin);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Revoke failed.");
    } finally {
      setGrantSubmitting(null);
    }
  };

  // ── Load Audit Logs ────────────────────────────────────────────────────
  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await fetchAuditLogs({ ...auditFilters, page: auditPage, per_page: auditPerPage });
      if (res.error || !res.data) {
        setAuditError(res.error || "Failed to load audit logs.");
        return;
      }
      setAuditLogs(res.data.audit_logs || []);
      setAuditTotal(res.data.total || 0);
      setAuditPages(res.data.pages || 1);
    } catch (err: unknown) {
      setAuditError(err instanceof Error ? err.message : "Error fetching audit logs.");
    } finally {
      setAuditLoading(false);
    }
  }, [auditPage, auditFilters]);

  useEffect(() => {
    if (activeTab === "audit" && auditGrant) loadAuditLogs();
  }, [activeTab, auditGrant, loadAuditLogs]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const res = await fetchPlatformSettings();
      if (res.error || !res.data) {
        setSettingsError(res.error || "Failed to load platform settings.");
        return;
      }
      setSettings(res.data.settings || []);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "settings") loadSettings();
  }, [activeTab, loadSettings]);

  const handleSaveSetting = async (event: React.FormEvent) => {
    event.preventDefault();
    let value: unknown;
    try {
      value = JSON.parse(settingValue);
    } catch {
      value = settingValue;
    }
    setSettingSaving(true);
    try {
      const res = await updatePlatformSetting(settingKey.trim(), value);
      if (res.error || !res.data) {
        toast.error(res.error || "Failed to save setting.");
        return;
      }
      toast.success("Platform setting saved.");
      setSettingValue("");
      loadSettings();
    } finally {
      setSettingSaving(false);
    }
  };

  // ── Create Admin Handler ────────────────────────────────────────────────
  const validateCreateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!createForm.full_name.trim() || createForm.full_name.trim().length < 2)
      errors.full_name = "Full name is required (min 2 characters).";
    if (!createForm.phone_number.trim() || createForm.phone_number.trim().length < 7)
      errors.phone_number = "Phone number is required.";
    if (!createForm.password.trim() || createForm.password.trim().length < 8)
      errors.password = "Password must be at least 8 characters.";
    if (!createForm.step_up_password.trim())
      errors.step_up_password = "Your password is required to confirm this privileged action (§6).";
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCreateForm()) return;
    setCreateSubmitting(true);
    try {
      const payload = {
        full_name: createForm.full_name.trim(),
        phone_number: createForm.phone_number.trim(),
        email: createForm.email.trim() || undefined,
        password: createForm.password,
        step_up_password: createForm.step_up_password,
        platform_role: createForm.platform_role,
        user_type: createForm.user_type || null,
      };
      const res = await createAdminAccount(payload);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${createForm.platform_role === "super_admin" ? "Super Admin" : "Admin"} account created for ${createForm.full_name}.`);
      setCreateModalOpen(false);
      setCreateForm({ full_name: "", phone_number: "", email: "", password: "", step_up_password: "", platform_role: "admin", user_type: "" });
      loadAdmins();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Creation failed.");
    } finally {
      setCreateSubmitting(false);
    }
  };

  // ── Admin Activate/Deactivate Handler ──────────────────────────────────
  const openAdminAction = (target: AdminUserListItem, action: "activate" | "deactivate") => {
    setAdminActionTarget(target);
    setAdminActionType(action);
    setAdminActionReason("");
    setAdminActionReasonError(null);
    setAdminActionModalOpen(true);
  };

  const handleAdminAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminActionTarget) return;
    if (!adminActionReason.trim() || adminActionReason.trim().length < 5) {
      setAdminActionReasonError("Audit reason (min 5 characters) is required.");
      return;
    }
    setAdminActionReasonError(null);
    setAdminActionSubmitting(true);
    try {
      const res = adminActionType === "deactivate"
        ? await deactivateAdminAccount(adminActionTarget.id, adminActionReason.trim())
        : await activateAdminAccount(adminActionTarget.id, adminActionReason.trim());
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Admin account ${adminActionTarget.full_name} ${adminActionType === "deactivate" ? "deactivated" : "reactivated"}.`);
      setAdminActionModalOpen(false);
      loadAdmins();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setAdminActionSubmitting(false);
    }
  };

  const activePermKeys = adminGrants.filter((g) => g.is_active).map((g) => g.permission_key);

  // ── State 6: Permission Denied (§12.4) ─────────────────────────────────
  if (!user || user.platform_role !== "super_admin") {
    return (
      <AppShell>
        <div className="super-admin-badge">
          <ShieldAlert size={16} />
          Super Admin Control Panel
        </div>
        <div className="sa-screen">
          <div className="sa-screen__alert-box" role="alert">
            <Lock size={32} />
            <div>
              <h3 className="sa-screen__alert-box-title">Permission Denied (HTTP 403)</h3>
              <p className="sa-screen__alert-box-msg">
                This panel requires the <code>super_admin</code> platform role.
                Admin accounts are not permitted to access this interface — the API will reject all requests with HTTP 403.
              </p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Visually distinct Super Admin identity strip (§12.2) */}
      <div className="super-admin-badge">
        <ShieldAlert size={16} />
        Super Admin Control Panel — Bhoomi Platform Governance
      </div>

      <div className="sa-screen">
        {/* Header */}
        <header className="sa-screen__header">
          <div>
            <h1 className="sa-screen__title">
              <ShieldAlert size={28} color="#1A2E20" />
              Super Admin Panel
            </h1>
            <p className="sa-screen__subtitle">
              Admin account management, permission grants, platform settings, and audit log viewer (§7.4, §9).
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.8rem", background: "#1A2E20", color: "#fff", padding: "4px 12px", borderRadius: 999, fontWeight: 700 }}>
              {user.full_name}
            </span>
          </div>
        </header>

        {/* Tabs */}
        <nav className="sa-screen__tabs" aria-label="Super Admin Navigation">
          <button
            type="button"
            className={`sa-screen__tab-btn ${activeTab === "admins" ? "sa-screen__tab-btn--active" : ""}`}
            onClick={() => setActiveTab("admins")}
          >
            <Users size={18} />
            Admin Accounts
          </button>
          <button
            type="button"
            className={`sa-screen__tab-btn ${activeTab === "permissions" ? "sa-screen__tab-btn--active" : ""}`}
            onClick={() => setActiveTab("permissions")}
          >
            <Key size={18} />
            Permission Grants
          </button>
          {auditGrant && <button
              type="button"
              className={`sa-screen__tab-btn ${activeTab === "audit" ? "sa-screen__tab-btn--active" : ""}`}
              onClick={() => setActiveTab("audit")}
            >
              <ScrollText size={18} />
              Audit Log
            </button>}
          <button
            type="button"
            className={`sa-screen__tab-btn ${activeTab === "settings" ? "sa-screen__tab-btn--active" : ""}`}
            onClick={() => setActiveTab("settings")}
          ><Key size={18} /> Platform Settings</button>
        </nav>

        {/* ── TAB 1: ADMIN ACCOUNTS ──────────────────────────────────────── */}
        {activeTab === "admins" && (
          <section aria-labelledby="tab-admins-title">
            <h2 id="tab-admins-title" className="sr-only">Admin Accounts</h2>

            <div className="sa-screen__toolbar">
              <div className="sa-screen__toolbar-left">
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  {admins.length} admin-tier account{admins.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-outline" onClick={loadAdmins} disabled={adminsLoading}>
                  <RefreshCw size={16} className={adminsLoading ? "animate-spin" : ""} />
                  Refresh
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setCreateModalOpen(true)}
                >
                  <Plus size={16} />
                  Create Admin
                </button>
              </div>
            </div>

            {/* State 5: API Error */}
            {adminsError && (
              <div className="sa-screen__alert-box" role="alert">
                <AlertTriangle size={24} />
                <div>
                  <h4 className="sa-screen__alert-box-title">Failed to load admin accounts</h4>
                  <p className="sa-screen__alert-box-msg">{adminsError}</p>
                </div>
                <button className="btn btn-outline" style={{ marginLeft: "auto" }} onClick={loadAdmins}>Retry</button>
              </div>
            )}

            <div className="sa-screen__table-wrapper">
              <table className="sa-screen__table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Phone</th>
                    <th scope="col">Role</th>
                    <th scope="col">Verification</th>
                    <th scope="col">Account Status</th>
                    <th scope="col">Joined</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* State 1: Loading */}
                  {adminsLoading && [1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td colSpan={7} style={{ padding: 16 }}>
                        <div className="sa-screen__skeleton-bar" />
                      </td>
                    </tr>
                  ))}
                  {/* State 2: Empty */}
                  {!adminsLoading && admins.length === 0 && !adminsError && (
                    <tr>
                      <td colSpan={7} style={{ padding: "3rem 1rem" }}>
                        <EmptyState
                          icon={Users}
                          title="No admin accounts found"
                          description="Create the first admin account using the button above."
                        />
                      </td>
                    </tr>
                  )}
                  {/* State 3: Success */}
                  {!adminsLoading && admins.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.full_name}</strong>
                        {a.email && <div style={{ fontSize: "0.75rem", color: "#6D7A68" }}>{a.email}</div>}
                      </td>
                      <td>{a.phone_number}</td>
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            background: a.platform_role === "super_admin" ? "#FEE4E2" : "#E8F0E3",
                            color: a.platform_role === "super_admin" ? "#B42318" : "#2F5D3A",
                            textTransform: "uppercase",
                          }}
                        >
                          {a.platform_role.replace("_", " ")}
                        </span>
                      </td>
                      <td>
                        <StatusBadge
                          variant={getVerificationBadgeVariant(a.verification_status)}
                          label={a.verification_status.toUpperCase()}
                        />
                      </td>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: "50%",
                            backgroundColor: a.is_active ? "#2F5D3A" : "#D92D20"
                          }} />
                          {a.is_active ? "Active" : "Deactivated"}
                        </span>
                      </td>
                      <td>
                        {new Date(a.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}
                      </td>
                      <td>
                        {a.id === user.id ? (
                          <span style={{ fontSize: "0.75rem", color: "#6D7A68" }}>Yourself</span>
                        ) : a.is_active ? (
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: "4px 8px", fontSize: "0.75rem", color: "#D92D20" }}
                            onClick={() => openAdminAction(a, "deactivate")}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: "4px 8px", fontSize: "0.75rem", color: "#2F5D3A" }}
                            onClick={() => openAdminAction(a, "activate")}
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
          </section>
        )}

        {/* ── TAB 2: PERMISSION GRANTS ──────────────────────────────────── */}
        {activeTab === "permissions" && (
          <section aria-labelledby="tab-perms-title">
            <h2 id="tab-perms-title" className="sr-only">Permission Grant Management</h2>

            {permAdminsError && (
              <div className="sa-screen__alert-box" role="alert">
                <AlertTriangle size={24} />
                <div>
                  <h4 className="sa-screen__alert-box-title">Failed to load admin list</h4>
                  <p className="sa-screen__alert-box-msg">{permAdminsError}</p>
                </div>
                <button className="btn btn-outline" style={{ marginLeft: "auto" }} onClick={loadPermAdmins}>Retry</button>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
              {/* Admin selector sidebar */}
              <div className="sa-screen__perm-section">
                <h4><Users size={16} /> Select Admin</h4>
                {/* State 1: Loading */}
                {permAdminsLoading && [1, 2, 3].map((i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div className="sa-screen__skeleton-bar" />
                  </div>
                ))}
                {/* State 2: Empty */}
                {!permAdminsLoading && permAdmins.length === 0 && !permAdminsError && (
                  <p style={{ fontSize: "0.85rem", color: "#6D7A68", margin: 0 }}>No admin accounts found.</p>
                )}
                {/* State 3: Success */}
                {!permAdminsLoading && permAdmins.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleSelectAdmin(a)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      border: "1px solid",
                      borderColor: selectedAdmin?.id === a.id ? "#2F5D3A" : "#D8DFD2",
                      borderRadius: 8,
                      background: selectedAdmin?.id === a.id ? "#E8F0E3" : "#fff",
                      cursor: "pointer",
                      marginBottom: 6,
                      fontSize: "0.85rem",
                      fontWeight: 600,
                    }}
                  >
                    {a.full_name}
                    <div style={{ fontSize: "0.72rem", fontWeight: 400, color: "#6D7A68", textTransform: "uppercase" }}>
                      {a.platform_role.replace("_", " ")}
                    </div>
                  </button>
                ))}
              </div>

              {/* Permission panel */}
              <div>
                {!selectedAdmin ? (
                  <div className="sa-screen__perm-section">
                    <EmptyState
                      icon={Key}
                      title="Select an admin"
                      description="Choose an admin account on the left to view and manage their permission grants."
                    />
                  </div>
                ) : (
                  <>
                    <div className="sa-screen__perm-section">
                      <h4>
                        <Key size={16} />
                        Permissions for {selectedAdmin.full_name}
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ marginLeft: "auto", padding: "4px 8px", fontSize: "0.75rem" }}
                          onClick={() => loadAdminGrants(selectedAdmin)}
                          disabled={grantsLoading}
                        >
                          <RefreshCw size={14} className={grantsLoading ? "animate-spin" : ""} />
                        </button>
                      </h4>

                      {/* State 5: API Error */}
                      {grantsError && (
                        <div className="sa-screen__alert-box" style={{ padding: "8px 12px", marginBottom: 8 }} role="alert">
                          <AlertTriangle size={16} />
                          <span style={{ fontSize: "0.85rem" }}>{grantsError}</span>
                        </div>
                      )}

                      {/* State 1: Loading */}
                      {grantsLoading && (
                        <div style={{ marginBottom: 8 }}><div className="sa-screen__skeleton-bar" /></div>
                      )}

                      {/* State 3: Grant Management UI */}
                      {!grantsLoading && (
                        <div>
                          <p style={{ fontSize: "0.8rem", color: "#6D7A68", margin: "0 0 12px" }}>
                            Toggle each permission below. Active grants are shown in green; inactive are struck through.
                          </p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {STANDARD_PERMISSIONS.map((perm) => {
                              const isActive = activePermKeys.includes(perm);
                              const isLoading = grantSubmitting === perm;
                              return (
                                <div key={perm} className={`sa-screen__perm-tag ${!isActive ? "sa-screen__perm-tag--revoked" : ""}`}>
                                  <span>{perm}</span>
                                  <button
                                    type="button"
                                    aria-label={isActive ? `Revoke ${perm}` : `Grant ${perm}`}
                                    disabled={isLoading}
                                    onClick={() => isActive ? handleRevokePermission(perm) : handleGrantPermission(perm)}
                                  >
                                    {isLoading ? (
                                      <RefreshCw size={12} className="animate-spin" />
                                    ) : isActive ? (
                                      <Trash2 size={12} />
                                    ) : (
                                      <Plus size={12} />
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>

                          {/* Full grant history */}
                          {adminGrants.length > 0 && (
                            <div style={{ marginTop: 20 }}>
                              <p style={{ fontWeight: 700, fontSize: "0.8rem", color: "#263229", marginBottom: 8 }}>Full Grant History</p>
                              <div className="sa-screen__table-wrapper">
                                <table className="sa-screen__table">
                                  <thead>
                                    <tr>
                                      <th>Permission</th>
                                      <th>Granted At</th>
                                      <th>Status</th>
                                      <th>Revoked At</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {adminGrants.map((g) => (
                                      <tr key={g.id}>
                                        <td><code>{g.permission_key}</code></td>
                                        <td style={{ fontSize: "0.8rem" }}>
                                          {new Date(g.granted_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}
                                        </td>
                                        <td>
                                          {g.is_active ? (
                                            <span style={{ color: "#2F5D3A", display: "flex", alignItems: "center", gap: 4 }}>
                                              <CheckCircle size={14} /> Active
                                            </span>
                                          ) : (
                                            <span style={{ color: "#B42318", display: "flex", alignItems: "center", gap: 4 }}>
                                              <XCircle size={14} /> Revoked
                                            </span>
                                          )}
                                        </td>
                                        <td style={{ fontSize: "0.8rem" }}>
                                          {g.revoked_at ? new Date(g.revoked_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }) : "—"}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* State 2: Empty */}
                          {adminGrants.length === 0 && !grantsLoading && (
                            <EmptyState
                              icon={Key}
                              title="No grants on record"
                              description="This admin has no permission grants yet. Use the toggles above to assign them."
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── TAB 3: AUDIT LOG ──────────────────────────────────────────── */}
        {activeTab === "audit" && auditGrant && (
          <section aria-labelledby="tab-audit-title">
            <h2 id="tab-audit-title" className="sr-only">Platform Audit Log</h2>

            {/* Filters */}
            <div className="sa-screen__toolbar">
              <div className="sa-screen__toolbar-left">
                <div style={{ position: "relative" }}>
                  <Search size={15} style={{ position: "absolute", left: 9, top: 11, color: "#6D7A68" }} />
                  <input
                    type="text"
                    placeholder="Filter by action..."
                    className="sa-screen__search-input"
                    style={{ paddingLeft: 30 }}
                    value={auditFilters.action || ""}
                    onChange={(e) => {
                      setAuditFilters((f) => ({ ...f, action: e.target.value || undefined }));
                      setAuditPage(1);
                    }}
                  />
                </div>
                <select
                  className="input-field"
                  style={{ height: 38, width: 160 }}
                  value={auditFilters.resource_type || ""}
                  onChange={(e) => {
                    setAuditFilters((f) => ({ ...f, resource_type: e.target.value || undefined }));
                    setAuditPage(1);
                  }}
                  aria-label="Filter by resource type"
                >
                  <option value="">All Resources</option>
                  <option value="User">User</option>
                  <option value="farmer_verification">Farmer Verification</option>
                  <option value="AdminPermissionGrant">Permission Grant</option>
                </select>
              </div>
              <button type="button" className="btn btn-outline" onClick={loadAuditLogs} disabled={auditLoading}>
                <RefreshCw size={16} className={auditLoading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>

            {/* State 5: API Error */}
            {auditError && (
              <div className="sa-screen__alert-box" role="alert">
                <AlertTriangle size={24} />
                <div>
                  <h4 className="sa-screen__alert-box-title">Failed to load audit logs</h4>
                  <p className="sa-screen__alert-box-msg">{auditError}</p>
                </div>
                <button className="btn btn-outline" style={{ marginLeft: "auto" }} onClick={loadAuditLogs}>Retry</button>
              </div>
            )}

            <div className="sa-screen__table-wrapper">
              <table className="sa-screen__table">
                <thead>
                  <tr>
                    <th scope="col">Timestamp</th>
                    <th scope="col">Action</th>
                    <th scope="col">Resource</th>
                    <th scope="col">Resource ID</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {/* State 1: Loading */}
                  {auditLoading && [1, 2, 3, 4].map((i) => (
                    <tr key={i}>
                      <td colSpan={5} style={{ padding: 16 }}>
                        <div className="sa-screen__skeleton-bar" />
                      </td>
                    </tr>
                  ))}

                  {/* State 2: Empty */}
                  {!auditLoading && auditLogs.length === 0 && !auditError && (
                    <tr>
                      <td colSpan={5} style={{ padding: "3rem 1rem" }}>
                        <EmptyState
                          icon={ScrollText}
                          title="No audit events found"
                          description="No events match the current filters. Try clearing the action or resource type filter."
                          action={
                            auditFilters.action || auditFilters.resource_type ? (
                              <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => setAuditFilters({ per_page: 25 })}
                              >
                                Clear Filters
                              </button>
                            ) : undefined
                          }
                        />
                      </td>
                    </tr>
                  )}

                  {/* State 3: Success */}
                  {!auditLoading && auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                        {new Date(log.created_at).toLocaleString("en-IN", {
                          year: "numeric", month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit"
                        })}
                      </td>
                      <td>
                        <span className="sa-screen__audit-action">{log.action}</span>
                      </td>
                      <td style={{ fontSize: "0.8rem" }}>{log.resource_type || "—"}</td>
                      <td style={{ fontSize: "0.75rem", color: "#6D7A68" }}>
                        {log.resource_id ? log.resource_id.slice(0, 8) + "..." : "—"}
                      </td>
                      <td>
                        <span className="sa-screen__audit-meta">
                          {log.reason || <em style={{ opacity: 0.5 }}>—</em>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {auditTotal > auditPerPage && (
              <div className="sa-screen__pagination">
                <span>
                  Page {auditPage} of {auditPages} ({auditTotal} events)
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: "4px 8px" }}
                    disabled={auditPage <= 1}
                    onClick={() => setAuditPage((p) => p - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: "4px 8px" }}
                    disabled={auditPage >= auditPages}
                    onClick={() => setAuditPage((p) => p + 1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === "settings" && (
          <section aria-labelledby="tab-settings-title">
            <h2 id="tab-settings-title" className="sr-only">Platform Settings</h2>
            <p>Manage persisted key/value configuration. Values are stored as JSON when valid, otherwise as text.</p>
            <form className="sa-screen__toolbar" onSubmit={handleSaveSetting}>
              <input className="input-field" aria-label="Setting key" value={settingKey} onChange={(e) => setSettingKey(e.target.value)} required pattern="[a-z][a-z0-9_.-]{0,119}" />
              <input className="input-field" aria-label="Setting value" placeholder='Value (e.g. "help@example.org" or true)' value={settingValue} onChange={(e) => setSettingValue(e.target.value)} required />
              <button className="btn btn-primary" type="submit" disabled={settingSaving}>{settingSaving ? "Saving…" : "Save setting"}</button>
            </form>
            {settingsError && <div className="sa-screen__alert-box" role="alert">{settingsError}</div>}
            <div className="sa-screen__table-wrapper">
              <table className="sa-screen__table">
                <thead><tr><th>Key</th><th>Value</th><th>Updated</th></tr></thead>
                <tbody>
                  {settingsLoading && <tr><td colSpan={3}>Loading settings…</td></tr>}
                  {!settingsLoading && settings.length === 0 && <tr><td colSpan={3}>No platform settings have been saved.</td></tr>}
                  {!settingsLoading && settings.map((item) => <tr key={item.key}>
                    <td><code>{item.key}</code></td>
                    <td><button className="btn btn-outline" type="button" onClick={() => { setSettingKey(item.key); setSettingValue(typeof item.value === "string" ? item.value : JSON.stringify(item.value)); }}>{JSON.stringify(item.value)}</button></td>
                    <td>{item.updated_at ? new Date(item.updated_at).toLocaleString() : "—"}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── MODAL 1: CREATE ADMIN (step-up re-auth) ─────────────────── */}
        {createModalOpen && (
          <div className="dialog-backdrop" role="presentation">
            <div
              className="dialog-modal sa-screen__modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-admin-modal-title"
            >
              <div className="sa-screen__modal-header">
                <h3 id="create-admin-modal-title" className="sa-screen__modal-title">
                  Create Admin / Super Admin Account
                </h3>
                <button type="button" className="sa-screen__modal-close" onClick={() => setCreateModalOpen(false)} disabled={createSubmitting}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateAdmin} className="sa-screen__modal-body">
                <div className="sa-screen__stepup-notice">
                  <strong>Sensitive Action (§6, §7.6):</strong> Creating an admin account is privileged. You must confirm your own password below (step-up re-authentication) before this action is accepted by the server.
                </div>

                {/* Full name */}
                <div>
                  <label htmlFor="create-full-name" className="sa-screen__label">
                    Full Name <span className="sa-screen__required">*</span>
                  </label>
                  <input
                    id="create-full-name"
                    type="text"
                    className="input-field"
                    value={createForm.full_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))}
                    disabled={createSubmitting}
                  />
                  {createErrors.full_name && <div className="sa-screen__field-error">{createErrors.full_name}</div>}
                </div>

                {/* Phone */}
                <div>
                  <label htmlFor="create-phone" className="sa-screen__label">
                    Phone Number <span className="sa-screen__required">*</span>
                  </label>
                  <input
                    id="create-phone"
                    type="tel"
                    className="input-field"
                    value={createForm.phone_number}
                    onChange={(e) => setCreateForm((f) => ({ ...f, phone_number: e.target.value }))}
                    disabled={createSubmitting}
                  />
                  {createErrors.phone_number && <div className="sa-screen__field-error">{createErrors.phone_number}</div>}
                </div>

                {/* Email (optional) */}
                <div>
                  <label htmlFor="create-email" className="sa-screen__label">Email (Optional)</label>
                  <input
                    id="create-email"
                    type="email"
                    className="input-field"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                    disabled={createSubmitting}
                  />
                </div>

                {/* Platform role */}
                <div>
                  <label htmlFor="create-role" className="sa-screen__label">
                    Platform Role <span className="sa-screen__required">*</span>
                  </label>
                  <select
                    id="create-role"
                    className="input-field"
                    value={createForm.platform_role}
                    onChange={(e) => setCreateForm((f) => ({ ...f, platform_role: e.target.value as "admin" | "super_admin" }))}
                    disabled={createSubmitting}
                  >
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>

                {/* New account password */}
                <div>
                  <label htmlFor="create-password" className="sa-screen__label">
                    Account Password <span className="sa-screen__required">*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="create-password"
                      type={showCreatePw ? "text" : "password"}
                      className="input-field"
                      style={{ paddingRight: 44 }}
                      value={createForm.password}
                      onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                      disabled={createSubmitting}
                    />
                    <button
                      type="button"
                      style={{ position: "absolute", right: 10, top: 10, background: "none", border: "none", cursor: "pointer", color: "#6D7A68" }}
                      onClick={() => setShowCreatePw((v) => !v)}
                      tabIndex={-1}
                    >
                      {showCreatePw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {createErrors.password && <div className="sa-screen__field-error">{createErrors.password}</div>}
                </div>

                {/* Step-up re-auth — YOUR password */}
                <div>
                  <label htmlFor="create-stepup" className="sa-screen__label">
                    Your Password (Step-up Re-authentication) <span className="sa-screen__required">*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="create-stepup"
                      type={showStepUpPw ? "text" : "password"}
                      className="input-field"
                      style={{ paddingRight: 44 }}
                      value={createForm.step_up_password}
                      onChange={(e) => setCreateForm((f) => ({ ...f, step_up_password: e.target.value }))}
                      disabled={createSubmitting}
                      placeholder="Re-enter your own password to confirm"
                    />
                    <button
                      type="button"
                      style={{ position: "absolute", right: 10, top: 10, background: "none", border: "none", cursor: "pointer", color: "#6D7A68" }}
                      onClick={() => setShowStepUpPw((v) => !v)}
                      tabIndex={-1}
                    >
                      {showStepUpPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {createErrors.step_up_password && <div className="sa-screen__field-error">{createErrors.step_up_password}</div>}
                </div>

                <div className="sa-screen__modal-footer">
                  <button type="button" className="btn btn-outline" onClick={() => setCreateModalOpen(false)} disabled={createSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={createSubmitting}>
                    {createSubmitting ? "Creating..." : "Create Account"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL 2: ADMIN ACTIVATE / DEACTIVATE ────────────────────── */}
        {adminActionModalOpen && adminActionTarget && (
          <div className="dialog-backdrop" role="presentation">
            <div
              className="dialog-modal sa-screen__modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-action-modal-title"
            >
              <div className="sa-screen__modal-header">
                <h3 id="admin-action-modal-title" className="sa-screen__modal-title">
                  {adminActionType === "deactivate" ? "Deactivate Admin Account" : "Reactivate Admin Account"}
                </h3>
                <button type="button" className="sa-screen__modal-close" onClick={() => setAdminActionModalOpen(false)} disabled={adminActionSubmitting}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleAdminAction} className="sa-screen__modal-body">
                <p style={{ margin: 0, fontSize: "0.9rem" }}>
                  Target: <strong>{adminActionTarget.full_name}</strong> ({adminActionTarget.phone_number})
                </p>
                <div className="sa-screen__stepup-notice">
                  {adminActionType === "deactivate"
                    ? "Deactivating this account invalidates all active JWT sessions and blocks all logins immediately."
                    : "Reactivating will restore access for this admin account."}
                </div>
                <div>
                  <label htmlFor="admin-action-reason" className="sa-screen__label">
                    Audit Reason <span className="sa-screen__required">*</span>
                  </label>
                  <textarea
                    id="admin-action-reason"
                    style={{
                      width: "100%", minHeight: 80, padding: 8,
                      border: "1px solid #D8DFD2", borderRadius: 6,
                      fontFamily: "inherit", fontSize: "0.875rem", resize: "vertical"
                    }}
                    placeholder="e.g., Account access revoked per security policy review #2234"
                    value={adminActionReason}
                    onChange={(e) => setAdminActionReason(e.target.value)}
                    disabled={adminActionSubmitting}
                  />
                  {adminActionReasonError && <div className="sa-screen__field-error">{adminActionReasonError}</div>}
                </div>
                <div className="sa-screen__modal-footer">
                  <button type="button" className="btn btn-outline" onClick={() => setAdminActionModalOpen(false)} disabled={adminActionSubmitting}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`btn ${adminActionType === "deactivate" ? "btn-danger" : "btn-primary"}`}
                    disabled={adminActionSubmitting}
                  >
                    {adminActionSubmitting ? "Processing..." : adminActionType === "deactivate" ? "Confirm Deactivation" : "Confirm Reactivation"}
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
