/**
 * Bhoomi Weather & Advisories API — Typed client for verified weather data with provenance (§8).
 */

import { api } from "./client";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WeatherProvenance {
  source_name: string;
  source_updated_at: string;
  valid_until: string;
  region_code: string;
  is_official: boolean;
}

export interface WeatherPayload {
  temperature_celsius?: number;
  condition?: string;
  humidity_percent?: number;
  precipitation_probability_percent?: number;
  cloud_cover_percent?: number;
  wind_speed_kmh?: number;
  uv_index?: number;
  advisory?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface WeatherAdvisoryPayload {
  title?: string;
  severity?: "High" | "Medium" | "Low" | string;
  recommended_action?: string;
}

export interface ForecastRecord {
  id: string;
  region_code: string;
  source_name: string;
  data_type: string;
  payload: WeatherPayload;
  source_updated_at: string;
  valid_until: string;
  created_at?: string;
}

export interface ForecastResponse {
  status: "current" | "stale" | "unavailable" | "not_found";
  is_stale: boolean;
  message: string;
  forecast: ForecastRecord | null;
  provenance: WeatherProvenance | null;
  location?: {
    name: string;
    state?: string | null;
    country?: string | null;
    latitude: number;
    longitude: number;
  };
}

export interface AdvisoryRecord {
  id: string;
  region_code: string;
  source_name: string;
  data_type: "advisory";
  payload: WeatherAdvisoryPayload;
  source_updated_at: string;
  valid_until: string;
  is_valid: boolean;
  created_at?: string;
}

export interface AdvisoriesResponse {
  advisories: AdvisoryRecord[];
  region: string;
  total: number;
}

export interface CitySuggestion {
  name: string;
  state?: string | null;
  country?: string | null;
  latitude: number;
  longitude: number;
}

// ─── API Endpoints ─────────────────────────────────────────────────────────────

/**
 * Fetch current or last-known-good forecast for a region or coordinates.
 */
export async function fetchForecast(params?: {
  region?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
}) {
  const qp = new URLSearchParams();
  if (params?.region) qp.set("region", params.region);
  if (params?.latitude !== undefined) qp.set("latitude", String(params.latitude));
  if (params?.longitude !== undefined) qp.set("longitude", String(params.longitude));
  if (params?.city) qp.set("city", params.city);
  const query = qp.toString() ? `?${qp.toString()}` : "";
  return api.get<ForecastResponse>(`/weather/forecast${query}`);
}

/**
 * List regional agronomic advisories.
 */
export async function fetchAdvisories(params?: { region?: string }) {
  const qp = new URLSearchParams();
  if (params?.region) qp.set("region", params.region);
  const query = qp.toString() ? `?${qp.toString()}` : "";
  return api.get<AdvisoriesResponse>(`/weather/advisories${query}`);
}

/** Fetch provider-backed city suggestions without exposing the provider key. */
export async function searchWeatherCities(query: string) {
  const qp = new URLSearchParams({ q: query });
  return api.get<{ suggestions: CitySuggestion[] }>(`/weather/cities?${qp.toString()}`);
}
