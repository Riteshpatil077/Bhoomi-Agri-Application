/**
 * Bhoomi Super Admin API — Typed client for Super Admin control panel (§7.4, §7.6).
 */

import { api } from "./client";
import { csrfHeaders } from "./csrf";
import type { AdminUserListItem } from "./admin";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CreateAdminPayload {
  full_name: string;
  phone_number: string;
  email?: string;
  password: string;
  step_up_password: string; // Step-up re-auth per §6 & §7.6
  platform_role: "admin" | "super_admin";
  user_type?: string | null;
}

export interface ListAdminsResponse {
  admins: AdminUserListItem[];
}

export interface GrantInfo {
  id: string;
  admin_user_id: string;
  permission_key: string;
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  is_active: boolean;
}

export interface AdminPermissionsResponse {
  user_id: string;
  grants: GrantInfo[];
  active_permissions: string[];
}

export interface AuditLogEntry {
  id: string;
  actor_user_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  reason: string | null;
  metadata_redacted: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogsResponse {
  audit_logs: AuditLogEntry[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
}

export interface AuditLogsParams {
  page?: number;
  per_page?: number;
  actor_user_id?: string;
  action?: string;
  resource_type?: string;
}

// ─── API Functions ──────────────────────────────────────────────────────────────

/**
 * List all admin and super_admin accounts.
 * GET /api/super-admin/admins
 */
export async function fetchAdminList() {
  return api.get<ListAdminsResponse>("/super-admin/admins");
}

/**
 * Create a new admin or super_admin account with step-up re-authentication.
 * POST /api/super-admin/admins
 * Body requires step_up_password per §6/§7.6.
 */
export async function createAdminAccount(payload: CreateAdminPayload) {
  return api.post<{ message: string; user: AdminUserListItem }>(
    "/super-admin/admins",
    payload,
    csrfHeaders()
  );
}

/**
 * Deactivate an admin/super_admin account.
 * PATCH /api/super-admin/admins/<id>/deactivate
 */
export async function deactivateAdminAccount(userId: string, reason: string) {
  return api.patch<{ message: string; user: AdminUserListItem }>(
    `/super-admin/admins/${userId}/deactivate`,
    { reason },
    csrfHeaders()
  );
}

/**
 * Reactivate an admin/super_admin account.
 * PATCH /api/super-admin/admins/<id>/activate
 */
export async function activateAdminAccount(userId: string, reason: string) {
  return api.patch<{ message: string; user: AdminUserListItem }>(
    `/super-admin/admins/${userId}/activate`,
    { reason },
    csrfHeaders()
  );
}

/**
 * List all permission grants for a specific admin.
 * GET /api/super-admin/admins/<id>/permissions
 */
export async function fetchAdminPermissions(userId: string) {
  return api.get<AdminPermissionsResponse>(
    `/super-admin/admins/${userId}/permissions`
  );
}

/**
 * Grant a permission to an admin.
 * POST /api/super-admin/admins/<id>/permissions
 */
export async function grantAdminPermission(
  userId: string,
  permissionKey: string
) {
  return api.post<{ message: string; grant: GrantInfo }>(
    `/super-admin/admins/${userId}/permissions`,
    { permission_key: permissionKey },
    csrfHeaders()
  );
}

/**
 * Revoke an active permission grant from an admin.
 * DELETE /api/super-admin/admins/<id>/permissions/<key>
 */
export async function revokeAdminPermission(
  userId: string,
  permissionKey: string
) {
  return api.delete<{ message: string; grant: GrantInfo }>(
    `/super-admin/admins/${userId}/permissions/${permissionKey}`,
    csrfHeaders()
  );
}

/**
 * View paginated audit logs.
 * GET /api/super-admin/audit-logs
 */
export async function fetchAuditLogs(params?: AuditLogsParams) {
  const qp = new URLSearchParams();
  if (params?.page) qp.set("page", String(params.page));
  if (params?.per_page) qp.set("per_page", String(params.per_page));
  if (params?.actor_user_id) qp.set("actor_user_id", params.actor_user_id);
  if (params?.action) qp.set("action", params.action);
  if (params?.resource_type) qp.set("resource_type", params.resource_type);
  const qs = qp.toString() ? `?${qp.toString()}` : "";
  return api.get<AuditLogsResponse>(`/super-admin/audit-logs${qs}`);
}
