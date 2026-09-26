/**
 * Bhoomi Farms & Plots API — Typed calls to farms and plots blueprints (Prompt 6 backend).
 *
 * Implements strict owner-only agricultural lifecycle management.
 * All mutating calls automatically inject the in-memory CSRF double-submit token (§6).
 */

import { api } from "./client";
import { csrfHeaders } from "./csrf";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Farm {
  id: string;
  user_id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  soil_type: string | null;
  plots_count?: number;
  plots?: Plot[];
  created_at: string;
  updated_at: string;
}

export interface Plot {
  id: string;
  farm_id: string;
  plot_name: string;
  area_acres: number;
  active_cycles_count?: number;
  crop_cycles?: CropCycleSummary[];
  created_at: string;
  updated_at: string;
}

export interface CropCycleSummary {
  id: string;
  plot_id: string;
  crop_catalog_id: string;
  crop_name?: string;
  sowing_date: string;
  expected_harvest_date: string | null;
  actual_harvest_date: string | null;
  status: "active" | "harvested" | "failed";
  created_at: string;
}

export interface CreateFarmPayload {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  soil_type?: string | null;
}

export interface UpdateFarmPayload {
  name?: string;
  latitude?: number | null;
  longitude?: number | null;
  soil_type?: string | null;
}

export interface CreatePlotPayload {
  plot_name: string;
  area_acres: number;
}

export interface UpdatePlotPayload {
  plot_name?: string;
  area_acres?: number;
}

// ─── Farm Endpoints ───────────────────────────────────────────────────────────

/**
 * Fetch all farms owned by the currently authenticated farmer.
 */
export async function fetchFarms() {
  return api.get<{ farms: Farm[]; total: number }>("/farms");
}

/**
 * Fetch a single farm by ID, including its nested plots.
 * If caller does not own the farm, returns status 403.
 */
export async function fetchFarm(farmId: string) {
  return api.get<{ farm: Farm }>(`/farms/${farmId}`);
}

/**
 * Create a new farm.
 */
export async function createFarm(payload: CreateFarmPayload) {
  return api.post<{ message: string; farm: Farm }>(
    "/farms",
    payload,
    csrfHeaders()
  );
}

/**
 * Update an existing farm.
 * Requires ownership of the farm (returns 403 on cross-user attempt).
 */
export async function updateFarm(farmId: string, payload: UpdateFarmPayload) {
  return api.patch<{ message: string; farm: Farm }>(
    `/farms/${farmId}`,
    payload,
    csrfHeaders()
  );
}

/**
 * Delete a farm and cascade delete all nested plots and crop cycles.
 * Requires ownership (returns 403 on cross-user attempt).
 */
export async function deleteFarm(farmId: string) {
  return api.delete<{ message: string }>(
    `/farms/${farmId}`,
    csrfHeaders()
  );
}

// ─── Plot Endpoints ───────────────────────────────────────────────────────────

/**
 * Fetch all plots for a specific parent farm.
 * Requires ownership of the parent farm (returns 403 on cross-user attempt).
 */
export async function fetchPlotsForFarm(farmId: string) {
  return api.get<{ plots: Plot[]; total: number; farm_id: string }>(
    `/plots/farm/${farmId}`
  );
}

/**
 * Fetch a single plot by ID, including its crop cycles.
 * Requires ownership of the parent farm (returns 403 on cross-user attempt).
 */
export async function fetchPlot(plotId: string) {
  return api.get<{ plot: Plot }>(`/plots/${plotId}`);
}

/**
 * Create a new plot inside the specified parent farm.
 * Requires ownership of the parent farm.
 */
export async function createPlot(farmId: string, payload: CreatePlotPayload) {
  return api.post<{ message: string; plot: Plot }>(
    `/plots/farm/${farmId}`,
    payload,
    csrfHeaders()
  );
}

/**
 * Update an existing plot.
 * Requires ownership of the parent farm.
 */
export async function updatePlot(plotId: string, payload: UpdatePlotPayload) {
  return api.patch<{ message: string; plot: Plot }>(
    `/plots/${plotId}`,
    payload,
    csrfHeaders()
  );
}

/**
 * Delete a plot and cascade delete all associated crop cycles.
 * Requires ownership of the parent farm.
 */
export async function deletePlot(plotId: string) {
  return api.delete<{ message: string }>(
    `/plots/${plotId}`,
    csrfHeaders()
  );
}
