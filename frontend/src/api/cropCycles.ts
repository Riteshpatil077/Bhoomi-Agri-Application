/**
 * Bhoomi Crop Cycles & Crop Catalog API — Typed calls to crop-cycles and crops blueprints.
 *
 * Crop cycles are always scoped to an owning user via the backend's farm/plot ownership chain.
 * All mutating calls automatically inject the in-memory CSRF double-submit token (§6).
 */

import { api } from "./client";
import { csrfHeaders } from "./csrf";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CropCatalogEntry {
  id: string;
  crop_name: string;
  category: string; // e.g. "Cereal", "Vegetable", "Fruit", "Pulse", "Oilseed"
  typical_duration_days: number | null;
  description: string | null;
}

export interface CropCycle {
  id: string;
  plot_id: string;
  crop_catalog_id: string;
  crop_name?: string;
  category?: string;
  plot_name?: string;
  sowing_date: string;          // ISO date string
  expected_harvest_date: string | null;
  actual_harvest_date: string | null;
  status: "active" | "harvested" | "failed";
  created_at: string;
  updated_at: string;
  // Populated by GET /crop-cycles/<id>
  crop?: CropCatalogEntry;
  activities?: ActivityEntry[];
}

export interface ActivityEntry {
  id: string;
  crop_cycle_id: string;
  activity_type: string;
  notes: string | null;
  activity_date: string;
  created_at: string;
}

export interface CreateCropCyclePayload {
  crop_catalog_id: string;
  sowing_date: string; // "YYYY-MM-DD"
  expected_harvest_date?: string | null;
  status?: "active" | "harvested" | "failed";
}

export interface UpdateCropCyclePayload {
  status?: "active" | "harvested" | "failed";
  expected_harvest_date?: string | null;
  actual_harvest_date?: string | null;
}

// ─── Crop Catalog Endpoints ────────────────────────────────────────────────────

/**
 * List all crops in the reference catalog.
 * Optionally filter by category or search string.
 */
export async function fetchCropCatalog(params?: {
  category?: string;
  search?: string;
}) {
  const qp = new URLSearchParams();
  if (params?.category) qp.set("category", params.category);
  if (params?.search) qp.set("search", params.search);
  const query = qp.toString() ? `?${qp.toString()}` : "";
  return api.get<{ crops: CropCatalogEntry[]; total: number }>(`/crops${query}`);
}

// ─── Crop Cycle Endpoints ──────────────────────────────────────────────────────

/**
 * List all crop cycles owned by the caller (across all farms/plots).
 * Optionally filter by status.
 */
export async function fetchAllCropCycles(status?: "active" | "harvested" | "failed") {
  const query = status ? `?status=${status}` : "";
  return api.get<{ crop_cycles: CropCycle[]; total: number }>(`/crop-cycles${query}`);
}

/**
 * List all crop cycles for a specific plot.
 * Requires ownership of the parent farm.
 */
export async function fetchCropCyclesForPlot(
  plotId: string,
  status?: "active" | "harvested" | "failed"
) {
  const query = status ? `?status=${status}` : "";
  return api.get<{ crop_cycles: CropCycle[]; total: number; plot_id: string }>(
    `/crop-cycles/plot/${plotId}${query}`
  );
}

/**
 * Fetch a single crop cycle with full detail (crop info + activities).
 * Requires ownership of the parent farm.
 */
export async function fetchCropCycle(cycleId: string) {
  return api.get<{ crop_cycle: CropCycle }>(`/crop-cycles/${cycleId}`);
}

/**
 * Create a new crop cycle on a plot.
 * Backend auto-computes expected_harvest_date from the crop's typical_duration_days
 * when not provided.
 */
export async function createCropCycle(
  plotId: string,
  payload: CreateCropCyclePayload
) {
  return api.post<{ message: string; crop_cycle: CropCycle }>(
    `/crop-cycles/plot/${plotId}`,
    payload,
    csrfHeaders()
  );
}

/**
 * Update a crop cycle's status or harvest dates.
 * Requires ownership of the parent farm.
 */
export async function updateCropCycle(
  cycleId: string,
  payload: UpdateCropCyclePayload
) {
  return api.patch<{ message: string; crop_cycle: CropCycle }>(
    `/crop-cycles/${cycleId}`,
    payload,
    csrfHeaders()
  );
}

/**
 * Delete a crop cycle and cascade its activity logs.
 * Requires ownership of the parent farm.
 */
export async function deleteCropCycle(cycleId: string) {
  return api.delete<{ message: string }>(
    `/crop-cycles/${cycleId}`,
    csrfHeaders()
  );
}
