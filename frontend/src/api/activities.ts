/**
 * Bhoomi Farm Activities API — Typed calls to farm_activities blueprint.
 *
 * Activities are logged against a crop cycle and scoped to the user's farm/plot ownership.
 * All mutating calls inject the in-memory double-submit CSRF token (§6).
 */

import { api } from "./client";
import { csrfHeaders } from "./csrf";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ActivityType = "irrigation" | "fertilizer" | "pesticide" | "other";

export interface FarmActivity {
  id: string;
  crop_cycle_id: string;
  activity_type: ActivityType;
  scheduled_date: string | null;  // "YYYY-MM-DD"
  completed_date: string | null;  // "YYYY-MM-DD"
  is_completed: boolean;
  notes: string | null;
  created_at: string;
  crop_name?: string;
  plot_name?: string;
}

export interface ActivityFilterParams {
  is_completed?: boolean;
  activity_type?: ActivityType;
  from_date?: string;
  to_date?: string;
}

export interface CreateActivityPayload {
  activity_type: ActivityType;
  scheduled_date?: string | null;
  completed_date?: string | null;
  notes?: string | null;
}

export interface UpdateActivityPayload {
  activity_type?: ActivityType;
  scheduled_date?: string | null;
  completed_date?: string | null;
  notes?: string | null;
}

export interface CompleteActivityPayload {
  completed_date?: string | null;
  notes?: string | null;
}

// ─── API Methods ───────────────────────────────────────────────────────────────

/**
 * List all activities across all farms and crop cycles for current user.
 */
export async function fetchActivities(params?: ActivityFilterParams) {
  const qp = new URLSearchParams();
  if (params?.is_completed !== undefined) {
    qp.set("is_completed", String(params.is_completed));
  }
  if (params?.activity_type) {
    qp.set("activity_type", params.activity_type);
  }
  if (params?.from_date) {
    qp.set("from_date", params.from_date);
  }
  if (params?.to_date) {
    qp.set("to_date", params.to_date);
  }
  const query = qp.toString() ? `?${qp.toString()}` : "";
  return api.get<{ activities: FarmActivity[]; total: number }>(`/activities${query}`);
}

/**
 * List activities for a specific crop cycle.
 */
export async function fetchActivitiesForCycle(cycleId: string) {
  return api.get<{ activities: FarmActivity[]; total: number; crop_cycle_id: string }>(
    `/activities/cycle/${cycleId}`
  );
}

/**
 * Get single activity by ID.
 */
export async function fetchActivity(activityId: string) {
  return api.get<{ activity: FarmActivity }>(`/activities/${activityId}`);
}

/**
 * Create/schedule an activity on a crop cycle.
 */
export async function createActivity(
  cycleId: string,
  payload: CreateActivityPayload
) {
  return api.post<{ message: string; activity: FarmActivity }>(
    `/activities/cycle/${cycleId}`,
    payload,
    csrfHeaders()
  );
}

/**
 * Update an existing activity.
 */
export async function updateActivity(
  activityId: string,
  payload: UpdateActivityPayload
) {
  return api.patch<{ message: string; activity: FarmActivity }>(
    `/activities/${activityId}`,
    payload,
    csrfHeaders()
  );
}

/**
 * Quick-complete an activity.
 */
export async function completeActivity(
  activityId: string,
  payload?: CompleteActivityPayload
) {
  return api.post<{ message: string; activity: FarmActivity }>(
    `/activities/${activityId}/complete`,
    payload ?? {},
    csrfHeaders()
  );
}

/**
 * Delete an activity.
 */
export async function deleteActivity(activityId: string) {
  return api.delete<{ message: string }>(
    `/activities/${activityId}`,
    csrfHeaders()
  );
}
