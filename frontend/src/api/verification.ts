/**
 * Bhoomi Verification API — Typed calls to the verification blueprint (Prompt 5 backend).
 *
 * Upload flow per §5:
 *   1. POST /verification/upload-url → presigned upload URL + object_key
 *   2. Client uploads file directly to S3 via the presigned URL (PUT, no auth header)
 *   3. POST /verification/submit → { selfie_photo_key, land_photo_key }
 *
 * CSRF tokens are injected on every mutating call per §6.
 */

import { api } from "./client";
import { csrfHeaders } from "./csrf";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";
export type PhotoType = "selfie" | "land";

export interface VerificationApplication {
  id: string;
  user_id: string;
  selfie_photo_key: string | null;
  land_photo_key: string | null;
  status: VerificationStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  docs_purge_at: string | null;
}

export interface VerificationStatusResponse {
  user_id: string;
  verification_status: VerificationStatus;
  application: VerificationApplication | null;
}

export interface UploadUrlResponse {
  upload_url: string;
  object_key: string;
  fields: Record<string, string>;
  expires_in: number;
}

// ─── API Calls ────────────────────────────────────────────────────────────────

/**
 * Get the current user's verification status and latest application.
 */
export async function fetchVerificationStatus() {
  return api.get<VerificationStatusResponse>("/verification/status");
}

/**
 * Request a presigned upload URL for a verification photo.
 * `photo_type`: 'selfie' | 'land'
 * `content_type`: 'image/jpeg' | 'image/png' | 'image/webp'
 * `file_size_bytes`: actual file size in bytes (enforced in presigned policy)
 */
export async function requestUploadUrl(payload: {
  photo_type: PhotoType;
  content_type: string;
  file_size_bytes: number;
}) {
  return api.post<UploadUrlResponse>(
    "/verification/upload-url",
    payload,
    csrfHeaders()
  );
}

/**
 * Upload a file directly to S3 using a presigned URL (§5).
 * This is a direct fetch — no auth headers, no JSON content type.
 * Uses PUT with the file and the presigned fields in the URL.
 *
 * For simple presigned PUT URLs: PUT directly with the file as body.
 * For POST presigned policies (S3 multipart): build FormData with `fields`.
 *
 * Returns { ok: boolean; error: string | null }
 */
export async function uploadToPresignedUrl(
  uploadUrl: string,
  file: File,
  fields: Record<string, string> = {}
): Promise<{ ok: boolean; error: string | null }> {
  try {
    // In local development / mock environment without live AWS S3 credentials
    if (uploadUrl.includes("mock_presigned_upload")) {
      // Simulate realistic upload latency
      await new Promise((resolve) => setTimeout(resolve, 650));
      return { ok: true, error: null };
    }

    // Direct upload to S3 via presigned PUT (§5)
    const headers: Record<string, string> = {
      "Content-Type": file.type || "image/jpeg",
    };
    if (fields["x-amz-server-side-encryption"]) {
      headers["x-amz-server-side-encryption"] = fields["x-amz-server-side-encryption"];
    }

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers,
      body: file,
    });

    if (!res.ok) {
      return { ok: false, error: `Upload failed: Storage returned HTTP ${res.status}` };
    }
    return { ok: true, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Upload failed — network connection error.";
    return { ok: false, error: message };
  }
}

/**
 * Submit verification application with both photo object keys.
 * Called after both photos are successfully uploaded to S3.
 */
export async function submitVerification(payload: {
  selfie_photo_key: string;
  land_photo_key: string;
}) {
  return api.post<{ message: string; verification: VerificationApplication }>(
    "/verification/submit",
    payload,
    csrfHeaders()
  );
}
