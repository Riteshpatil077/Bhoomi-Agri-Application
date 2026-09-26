/**
 * Bhoomi Admin API — Typed client for Admin portal and verification reviews (§5, §7).
 */

import { api } from "./client";
import { csrfHeaders } from "./csrf";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AdminPermissionInfo {
  permission_key: string;
  granted_by_user_id?: string;
  granted_at?: string;
}

export interface MyPermissionsResponse {
  user_id: string;
  platform_role: "admin" | "super_admin";
  implicit_super_admin: boolean;
  permissions: (string | AdminPermissionInfo)[];
}

export interface AdminUserListItem {
  id: string;
  phone_number: string;
  email: string | null;
  full_name: string;
  user_type: string;
  platform_role: "user" | "admin" | "super_admin";
  verification_status: string;
  is_active: boolean;
  preferred_language: string;
  created_at: string;
  last_login_at: string | null;
}

export interface ListUsersParams {
  page?: number;
  per_page?: number;
  platform_role?: string;
  user_type?: string;
  is_active?: boolean;
  search?: string;
}

export interface ListUsersResponse {
  users: AdminUserListItem[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
}

export interface VerificationApplicationItem {
  id: string;
  user_id: string;
  applicant_name: string;
  applicant_phone: string;
  status: "pending" | "verified" | "rejected";
  selfie_photo_key: string;
  land_photo_key: string;
  reviewer_user_id: string | null;
  rejection_reason: string | null;
  docs_purge_at: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  created_at: string;
}

export interface ListApplicationsParams {
  page?: number;
  per_page?: number;
  status?: string;
}

export interface ListApplicationsResponse {
  applications: VerificationApplicationItem[];
  total: number;
  page: number;
  per_page: number;
}

export interface PhotoUrlResponse {
  download_url: string;
  expires_in: number;
  photo_type: "selfie" | "land";
}

// ─── API Endpoints ─────────────────────────────────────────────────────────────

/**
 * Get active permission grants for currently logged-in Admin/Super Admin.
 */
export async function fetchMyAdminPermissions() {
  return api.get<MyPermissionsResponse>("/admin/me/permissions");
}

/**
 * List platform users (requires user_reports grant).
 */
export async function fetchUsersList(params?: ListUsersParams) {
  const qp = new URLSearchParams();
  if (params?.page) qp.set("page", String(params.page));
  if (params?.per_page) qp.set("per_page", String(params.per_page));
  if (params?.platform_role) qp.set("platform_role", params.platform_role);
  if (params?.user_type) qp.set("user_type", params.user_type);
  if (params?.is_active !== undefined) qp.set("is_active", String(params.is_active));
  if (params?.search) qp.set("search", params.search);
  const query = qp.toString() ? `?${qp.toString()}` : "";
  return api.get<ListUsersResponse>(`/admin/users${query}`);
}

/**
 * Get single user detail (requires user_reports grant).
 */
export async function fetchUserDetails(userId: string) {
  return api.get<{ user: AdminUserListItem }>(`/admin/users/${userId}`);
}

/**
 * Deactivate user account with mandatory reason (§7).
 */
export async function deactivateUser(userId: string, reason: string) {
  return api.patch<{ message: string }>(
    `/admin/users/${userId}/deactivate`,
    { reason },
    csrfHeaders()
  );
}

/**
 * Reactivate user account with mandatory reason (§7).
 */
export async function activateUser(userId: string, reason: string) {
  return api.patch<{ message: string }>(
    `/admin/users/${userId}/activate`,
    { reason },
    csrfHeaders()
  );
}

/**
 * List verification applications (requires verification_review grant).
 */
export async function fetchVerificationApplications(params?: ListApplicationsParams) {
  const qp = new URLSearchParams();
  if (params?.page) qp.set("page", String(params.page));
  if (params?.per_page) qp.set("per_page", String(params.per_page));
  if (params?.status) qp.set("status", params.status);
  const query = qp.toString() ? `?${qp.toString()}` : "";
  return api.get<ListApplicationsResponse>(`/verification/applications${query}`);
}

/**
 * Request short-lived presigned GET URL to view a verification photo.
 * Enforces mandatory audit log reason string (min 5 chars) per §5 & §9.
 */
export async function fetchPhotoPresignedUrl(
  applicationId: string,
  photoType: "selfie" | "land",
  reason: string
) {
  return api.post<PhotoUrlResponse>(
    `/verification/applications/${applicationId}/photos/url`,
    { photo_type: photoType, reason },
    csrfHeaders()
  );
}

/**
 * Approve or reject verification application with reason.
 */
export async function reviewVerificationApplication(
  applicationId: string,
  payload: { decision: "verified" | "rejected"; reason?: string }
) {
  return api.post<{ message: string; status: string }>(
    `/verification/applications/${applicationId}/review`,
    payload,
    csrfHeaders()
  );
}
