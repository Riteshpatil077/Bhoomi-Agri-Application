/**
 * Bhoomi — WeatherScreen (Prompt 15, §8, §12.2, §12.4)
 *
 * Surfaces verified weather forecasts and regional agronomic advisories:
 *  - External provenance metadata (§8): source name, updated timestamp, validity window
 *  - Hyperlocal forecast display (temperature, condition, humidity, rain chance, wind, UV)
 *  - Agronomic advisories list with severity ratings using <WeatherAdvisoryCard />
 *  - MANDATORY Stale Data Handling (§8, §12.4): "Data unavailable, last known good at X"
 *  - Region selector across agricultural zones
 *
 * All 7 mandatory UI states (§12.4):
 *  1. Loading          — Shimmer skeletons for forecast and advisories
 *  2. Empty            — Friendly empty state when no regional alerts are active
 *  3. Success          — Real-time verified forecast and advisory cards
 *  4. Validation error — Search / region query validation
 *  5. API error        — Retryable API failure alert
 *  6. Permission denied— 403 restriction notice
 *  7. Unavailable / Stale — Explicit last-known-good warning banner without data fabrication
 */

import { useState, useEffect, useCallback, useMemo, useRef, type FormEvent } from "react";
import {
  Cloud,
  CloudRain,
  Droplets,
  Wind,
  Sun,
  RefreshCw,
  Clock,
  AlertTriangle,
  Lock,
  WifiOff,
  AlertCircle,
  Sparkles,
  Search,
} from "lucide-react";
import {
  AppShell,
  EmptyState,
  StatusBadge,
  WeatherAdvisoryCard,
  useToast,
} from "../../design-system";
import {
  fetchForecast,
  searchWeatherCities,
  type ForecastRecord,
  type WeatherProvenance,
  type AdvisoryRecord,
} from "../../api/weather";
import { fetchFarms, type Farm } from "../../api/farms";
import "./WeatherScreen.scss";

const CITY_SUGGESTIONS = [
  "Ahmedabad", "Bengaluru", "Bhopal", "Chennai", "Delhi", "Hyderabad",
  "Jaipur", "Kolkata", "Kolhapur", "Lucknow", "Mumbai", "Nagpur",
  "Nashik", "Pune", "Sambhajinagar", "Solapur", "Surat",
];

// ─── Weather Condition Icons ─────────────────────────────────────────────────

function getWeatherEmoji(condition: string | undefined): string {
  if (!condition) return "🌤️";
  const c = condition.toLowerCase();
  if (c.includes("thunder") || c.includes("storm")) return "⛈️";
  if (c.includes("rain") || c.includes("drizzle") || c.includes("shower")) return "🌧️";
  if (c.includes("cloud") || c.includes("overcast")) return "⛅";
  if (c.includes("clear") || c.includes("sun")) return "☀️";
  if (c.includes("mist") || c.includes("fog") || c.includes("haze")) return "🌫️";
  return "🌤️";
}

function formatDateDisplay(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ─── Screen State ────────────────────────────────────────────────────────────

type ScreenState =
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string }
  | { kind: "permission_denied" }
  | { kind: "unavailable" };

export function WeatherScreen() {
  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);

  const [cityQuery, setCityQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [resolvedCity, setResolvedCity] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [farmerFarm, setFarmerFarm] = useState<Farm | null>(null);
  const [farmsLoaded, setFarmsLoaded] = useState(false);
  const [farmsError, setFarmsError] = useState("");
  const [screenState, setScreenState] = useState<ScreenState>({ kind: "loading" });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Weather data
  const [forecast, setForecast] = useState<ForecastRecord | null>(null);
  const [provenance, setProvenance] = useState<WeatherProvenance | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [staleMessage, setStaleMessage] = useState("");
  const [advisories, setAdvisories] = useState<AdvisoryRecord[]>([]);
  const [advisoriesError, setAdvisoriesError] = useState(false);

  // Severity filter for advisories
  const [severityFilter, setSeverityFilter] = useState<"all" | "high" | "medium" | "low">("all");

  useEffect(() => {
    let active = true;
    fetchFarms()
      .then((result) => {
        if (!active) return;
        if (result.error) {
          setFarmsError(result.error);
        } else {
          const locationFarm = result.data?.farms.find(
            (farm) => farm.latitude != null && farm.longitude != null
          );
          setFarmerFarm(locationFarm || null);
        }
        setFarmsLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setFarmsError("Could not load your farm location.");
        setFarmsLoaded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const query = cityQuery.trim();
    if (query.length < 2) {
      setCitySuggestions([]);
      return;
    }
    const localSuggestions = CITY_SUGGESTIONS.filter((city) =>
      city.toLocaleLowerCase().startsWith(query.toLocaleLowerCase())
    );
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchWeatherCities(query);
        if (!active) return;
        const providerSuggestions = result.data?.suggestions
          .filter((city) => city.country === "IN" && city.name.toLocaleLowerCase().startsWith(query.toLocaleLowerCase()))
          .map((city) => [city.name, city.state, city.country].filter(Boolean).join(", ")) || [];
        const providerNames = new Set(providerSuggestions.map((city) => city.split(",")[0].toLocaleLowerCase()));
        const remainingLocal = localSuggestions.filter((city) => !providerNames.has(city.toLocaleLowerCase()));
        setCitySuggestions([...new Set([...providerSuggestions, ...remainingLocal])]);
      } catch {
        if (active) setCitySuggestions(localSuggestions);
      }
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [cityQuery]);

  // ── Load Weather & Advisories ──────────────────────────────────────────────

  const loadWeatherData = useCallback(
    async (silent = false): Promise<boolean> => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      if (!silent) {
        setScreenState({ kind: "loading" });
      } else {
        setIsRefreshing(true);
      }

      try {
        if (!selectedCity && !farmsLoaded) return false;
        if (!selectedCity && !farmerFarm) {
          setScreenState({
            kind: "error",
            message: farmsError || "Add latitude and longitude to your farm details to show local weather, or search for a city.",
          });
          return false;
        }
        const forecastRes = await (selectedCity
          ? fetchForecast({ city: selectedCity })
          : fetchForecast({
              region: `FARM-${farmerFarm!.id}-${farmerFarm!.latitude!.toFixed(3)}-${farmerFarm!.longitude!.toFixed(3)}`,
              latitude: farmerFarm!.latitude!,
              longitude: farmerFarm!.longitude!,
            }));

        if (ctrl.signal.aborted) return false;

        // Check if forecast returned network/API error
        if (forecastRes.error && !forecastRes.data) {
          if (forecastRes.status === 403) {
            setScreenState({ kind: "permission_denied" });
          } else if (!navigator.onLine || forecastRes.status === 503 || forecastRes.status === 504) {
            setScreenState({ kind: "unavailable" });
          } else {
            setScreenState({
              kind: "error",
              message: forecastRes.error ?? "Failed to fetch weather forecast.",
            });
          }
          return false;
        }

        const data = forecastRes.data;
        if (data) {
          if (data.status === "not_found") {
            setForecast(null);
            setProvenance(null);
            setResolvedCity("");
            setAdvisories([]);
            setAdvisoriesError(false);
            setScreenState({ kind: "error", message: data.message });
            return false;
          }
          if (data.status === "unavailable") {
            setForecast(null);
            setProvenance(null);
            setResolvedCity("");
            setIsStale(false);
            setAdvisories([]);
            setAdvisoriesError(false);
            setScreenState({ kind: "unavailable" });
            return false;
          }
          setForecast(data.forecast);
          setProvenance(data.provenance);
          setResolvedCity(data.location
            ? [data.location.name, data.location.state, data.location.country]
                .filter(Boolean)
                .join(", ")
            : "");
          setIsStale(Boolean(data.is_stale));
          setStaleMessage(data.message || "");
        }

        setAdvisories([]);
        setAdvisoriesError(false);

        setScreenState({ kind: "success" });
        return true;
      } catch (err: unknown) {
        if (ctrl.signal.aborted) return false;
        const e = err as { status?: number; message?: string };
        if (e?.status === 403) {
          setScreenState({ kind: "permission_denied" });
        } else if (!navigator.onLine || e?.status === 503 || e?.status === 504) {
          setScreenState({ kind: "unavailable" });
        } else {
          setScreenState({
            kind: "error",
            message: e?.message ?? "Failed to load weather data.",
          });
        }
        return false;
      } finally {
        setIsRefreshing(false);
      }
    },
    [selectedCity, farmerFarm, farmsLoaded, farmsError]
  );

  useEffect(() => {
    loadWeatherData();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadWeatherData]);

  const handleManualRefresh = async () => {
    const succeeded = await loadWeatherData(true);
    if (succeeded) toast.success("Weather forecast refreshed.");
  };

  // ── Filtered Advisories ────────────────────────────────────────────────────

  const filteredAdvisories = useMemo(() => {
    if (severityFilter === "all") return advisories;
    return advisories.filter(
      (a) => (a.payload?.severity || "medium").toLowerCase() === severityFilter
    );
  }, [advisories, severityFilter]);

  const displayLocationName = selectedCity
    ? resolvedCity || selectedCity
    : farmerFarm?.name || "your farm";

  const handleCitySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const city = cityQuery.trim();
    if (city.length < 2) {
      setScreenState({ kind: "error", message: "Enter at least two characters for a city name." });
      return;
    }
    setSelectedCity(city);
    setCitySuggestions([]);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <div className="weather-screen">
        {/* Header */}
        <header className="weather-screen__header">
          <div className="weather-screen__header-text">
            <h1 className="weather-screen__title">
              <span aria-hidden="true">🌦️</span> Weather & Agronomic Advisories
            </h1>
            <p className="weather-screen__subtitle">
              Hyperlocal forecasts and verified pest/moisture alerts with official provenance (§8).
            </p>
          </div>
          <button
            id="weather-refresh-btn"
            type="button"
            className="weather-screen__refresh-btn"
            onClick={handleManualRefresh}
            disabled={isRefreshing || screenState.kind === "loading"}
            aria-label="Refresh weather data"
          >
            <RefreshCw size={16} className={isRefreshing ? "spin" : ""} aria-hidden="true" />
            {isRefreshing ? "Updating..." : "Refresh Feed"}
          </button>
        </header>

        <form className="weather-screen__city-search" onSubmit={handleCitySearch} role="search">
          <label className="weather-screen__city-search-label" htmlFor="weather-city-search">
            Search weather by city
          </label>
          <div className="weather-screen__city-search-controls">
            <input
              id="weather-city-search"
              type="search"
              value={cityQuery}
              onChange={(event) => setCityQuery(event.target.value)}
              placeholder="Enter a city, e.g. Mumbai"
              maxLength={100}
              autoComplete="address-level2"
              list="weather-city-suggestions"
            />
            <datalist id="weather-city-suggestions">
              {citySuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
            <button type="submit" disabled={screenState.kind === "loading"}>
              <Search size={16} aria-hidden="true" /> Search
            </button>
          </div>
        </form>

        {!selectedCity && farmerFarm && (
          <p className="weather-screen__farmer-location">
            📍 Showing weather for your farm: <strong>{farmerFarm.name}</strong>
          </p>
        )}
        {selectedCity && farmerFarm && (
          <button
            type="button"
            className="weather-screen__farm-location-btn"
            onClick={() => {
              setSelectedCity("");
              setResolvedCity("");
            }}
          >
            📍 Use my farm location ({farmerFarm.name})
          </button>
        )}

        {/* ── 1. Loading State ──────────────────────────────────────────────── */}
        {screenState.kind === "loading" && (
          <div aria-label="Loading weather data" aria-busy="true">
            <div className="weather-screen__skeleton-hero" />
            <div className="weather-screen__skeleton-card" />
            <div className="weather-screen__skeleton-card" />
          </div>
        )}

        {/* ── 5. API Error State ────────────────────────────────────────────── */}
        {screenState.kind === "error" && (
          <div className="weather-screen__banner weather-screen__banner--error" role="alert">
            <AlertCircle size={24} aria-hidden="true" />
            <div>
              <p className="weather-screen__banner-title">Could not load weather information</p>
              <p className="weather-screen__banner-msg">{screenState.message}</p>
            </div>
            <button
              id="weather-retry-btn"
              type="button"
              className="weather-screen__banner-retry"
              onClick={() => loadWeatherData()}
            >
              Retry
            </button>
          </div>
        )}

        {/* ── 6. Permission Denied State ────────────────────────────────────── */}
        {screenState.kind === "permission_denied" && (
          <EmptyState
            icon={Lock}
            title="Access Restricted"
            description="You do not have permission to view licensed weather feeds for this region."
          />
        )}

        {/* ── 7. Unavailable State (Network Offline / 503) ─────────────────── */}
        {screenState.kind === "unavailable" && (
          <div className="weather-screen__banner weather-screen__banner--warn" role="alert">
            <WifiOff size={24} aria-hidden="true" />
            <div>
              <p className="weather-screen__banner-title">Weather Service Offline</p>
              <p className="weather-screen__banner-msg">
                Unable to reach official meteorological servers. Check your connection.
              </p>
            </div>
            <button
              id="weather-unavail-retry-btn"
              type="button"
              className="weather-screen__banner-retry"
              onClick={() => loadWeatherData()}
            >
              Retry
            </button>
          </div>
        )}

        {/* ── 3. Success & Stale External Data States (§8, §12.4) ──────────── */}
        {screenState.kind === "success" && (
          <>
            {/* Provenance Metadata Bar */}
            {provenance && (
              <div
                className="weather-screen__provenance-banner"
                role="region"
                aria-label="Feed Provenance"
              >
                <div className="weather-screen__provenance-banner-left">
                  {provenance.is_official && (
                    <StatusBadge variant="official" label="Official Feed" size="sm" />
                  )}
                  <span className="weather-screen__provenance-banner-source">
                    {provenance.source_name}
                  </span>
                  <span>• Location: {displayLocationName}</span>
                </div>
                <div className="weather-screen__provenance-banner-times">
                  <span>
                    <Clock size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    Updated: {formatDateDisplay(provenance.source_updated_at)}
                  </span>
                  <span>Valid until: {formatDateDisplay(provenance.valid_until)}</span>
                </div>
              </div>
            )}

            {/* MANDATORY Stale Data Warning Banner (§8 & §12.4) */}
            {isStale && (
              <div
                className="weather-screen__stale-banner"
                role="alert"
                aria-live="polite"
              >
                <AlertTriangle size={24} className="weather-screen__stale-banner-icon" aria-hidden="true" />
                <div className="weather-screen__stale-banner-text">
                  <p className="weather-screen__stale-banner-title">
                    Stale External Meteorological Data (§8 Compliance)
                  </p>
                  <p className="weather-screen__stale-banner-msg">
                    {staleMessage ||
                      `Data unavailable from official source. Displaying last known good data from ${formatDateDisplay(
                        provenance?.source_updated_at
                      )}.`}
                    {" "}Bhoomi never fabricates synthetic weather data during upstream provider downtime.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleManualRefresh}
                  style={{ background: "#FFFFFF", whiteSpace: "nowrap" }}
                >
                  Retry Feed
                </button>
              </div>
            )}

            {/* Current Forecast Hero Card */}
            {forecast && forecast.payload && (
              <section
                className={`weather-screen__hero-card ${
                  isStale ? "weather-screen__hero-card--stale" : ""
                }`}
                aria-label={`Current weather for ${displayLocationName}`}
              >
                {isStale && (
                  <span className="weather-screen__hero-card-stale-indicator">
                    Stale Data (Last Known Good)
                  </span>
                )}

                <div className="weather-screen__weather-main">
                  {/* Temp + condition */}
                  <div className="weather-screen__temp-block">
                    <span className="weather-screen__weather-icon" aria-hidden="true">
                      {getWeatherEmoji(forecast.payload.condition)}
                    </span>
                    <div>
                      <div className="weather-screen__temp-value">
                        {forecast.payload.temperature_celsius !== undefined
                          ? `${Math.round(forecast.payload.temperature_celsius)}°C`
                          : "—"}
                      </div>
                      <div className="weather-screen__condition-text">
                        {forecast.payload.condition || "Clear"}
                      </div>
                    </div>
                  </div>

                  {/* 4-Metric Grid */}
                  <div className="weather-screen__metrics-grid">
                    <div className="weather-screen__metric-item">
                      <Droplets size={22} className="weather-screen__metric-item-icon" aria-hidden="true" />
                      <div className="weather-screen__metric-item-info">
                        <span className="weather-screen__metric-item-label">Humidity</span>
                        <span className="weather-screen__metric-item-value">
                          {forecast.payload.humidity_percent !== undefined
                            ? `${forecast.payload.humidity_percent}%`
                            : "Unavailable"}
                        </span>
                      </div>
                    </div>

                    <div className="weather-screen__metric-item">
                      <CloudRain size={22} className="weather-screen__metric-item-icon" aria-hidden="true" />
                      <div className="weather-screen__metric-item-info">
                        <span className="weather-screen__metric-item-label">Precipitation</span>
                        <span className="weather-screen__metric-item-value">
                          {forecast.payload.precipitation_probability_percent !== undefined
                            ? `${forecast.payload.precipitation_probability_percent}%`
                            : forecast.payload.cloud_cover_percent !== undefined
                              ? `${forecast.payload.cloud_cover_percent}% cloud cover`
                              : "Unavailable"}
                        </span>
                      </div>
                    </div>

                    <div className="weather-screen__metric-item">
                      <Wind size={22} className="weather-screen__metric-item-icon" aria-hidden="true" />
                      <div className="weather-screen__metric-item-info">
                        <span className="weather-screen__metric-item-label">Wind Speed</span>
                        <span className="weather-screen__metric-item-value">
                          {forecast.payload.wind_speed_kmh !== undefined
                            ? `${forecast.payload.wind_speed_kmh} km/h`
                            : "Unavailable"}
                        </span>
                      </div>
                    </div>

                    <div className="weather-screen__metric-item">
                      <Sun size={22} className="weather-screen__metric-item-icon" aria-hidden="true" />
                      <div className="weather-screen__metric-item-info">
                        <span className="weather-screen__metric-item-label">UV Index</span>
                        <span className="weather-screen__metric-item-value">
                          {forecast.payload.uv_index !== undefined
                            ? `${forecast.payload.uv_index}`
                            : "Unavailable"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Hyperlocal Agronomic Advice */}
                {forecast.payload.advisory && (
                  <div className="weather-screen__agri-advice" role="note">
                    <span className="weather-screen__agri-advice-icon" aria-hidden="true">
                      🌱
                    </span>
                    <div>
                      <h4 className="weather-screen__agri-advice-title">
                        Field Agronomy Recommendation
                      </h4>
                      <p className="weather-screen__agri-advice-body">
                        {forecast.payload.advisory}
                      </p>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Regional Agronomic Advisories Section */}
            <section
              className="weather-screen__advisories-section"
              aria-label="Regional agronomic advisories"
            >
              <div className="weather-screen__advisories-header">
                <h2 className="weather-screen__advisories-title">
                  <Sparkles size={20} style={{ color: "#2F5D3A" }} aria-hidden="true" />
                  Regional Crop & Pest Advisories
                  <span className="weather-screen__advisories-count">
                    {advisories.length}
                  </span>
                </h2>

                {/* Severity Filter Tabs */}
                {advisories.length > 0 && (
                  <div style={{ display: "flex", gap: 6 }}>
                    {(["all", "high", "medium", "low"] as const).map((sev) => (
                      <button
                        key={sev}
                        type="button"
                        className={`weather-screen__region-chip ${
                          severityFilter === sev ? "weather-screen__region-chip--active" : ""
                        }`}
                        onClick={() => setSeverityFilter(sev)}
                        style={{ padding: "4px 12px", fontSize: "0.8rem" }}
                      >
                        {sev.charAt(0).toUpperCase() + sev.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Empty State (When no advisories for this region) */}
              {filteredAdvisories.length === 0 ? (
                <EmptyState
                  icon={Cloud}
                  title={advisoriesError ? "Alerts Unavailable" : "No Active Alerts"}
                  description={
                    advisoriesError
                      ? "Advisories could not be loaded. Retry the feed to check for current alerts."
                      : severityFilter !== "all"
                      ? `No ${severityFilter}-severity alerts reported for ${displayLocationName}.`
                      : `Location-specific crop advisories are not available here. The weather shown is for ${displayLocationName}.`
                  }
                  action={
                    severityFilter !== "all" ? (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setSeverityFilter("all")}
                      >
                        Show all advisories
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="weather-screen__advisories-grid">
                  {filteredAdvisories.map((advisory) => (
                    <WeatherAdvisoryCard key={advisory.id} advisory={advisory} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default WeatherScreen;
