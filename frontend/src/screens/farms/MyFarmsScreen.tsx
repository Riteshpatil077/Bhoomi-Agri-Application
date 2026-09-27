/**
 * Bhoomi My Farms Screen (Prompt 12)
 *
 * Implements the farmer's primary agricultural estate view:
 *   - Overview of all owned farms with plot aggregations
 *   - Modal to create and edit farms (name, coordinates, soil type)
 *   - Cascading delete confirmation dialog
 *
 * All 7 UI states explicitly implemented per §12.4:
 *   1. Loading      — skeleton card grid on initial fetch
 *   2. Empty        — first-run empty state with "Add Your First Farm" CTA
 *   3. Success      — list/grid of FarmCard components + summary stats
 *   4. Validation   — inline errors on create/edit farm modal (min 2 chars, lat/lng ranges)
 *   5. API error    — server/network error alert with dedicated Retry button
 *   6. Perm denied  — honest message if account is inactive or unauthorized
 *   7. Unavailable  — service unavailable alert with Retry button
 */

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Sprout,
  Plus,
  Layers,
  Search,
  RefreshCw,
  WifiOff,
  AlertCircle,
  ShieldAlert,
  X,
  MapPin,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  AppShell,
  FarmCard,
  FormField,
  EmptyState,
  ConfirmDialog,
  useToast,
} from "../../design-system";
import {
  fetchFarms,
  createFarm,
  updateFarm,
  deleteFarm,
  type Farm,
  type CreateFarmPayload,
} from "../../api/farms";
import { createRequestId } from "../../api/requestId";
import { countQueuedFarms, enqueueFarm, syncQueuedFarms } from "../../api/offlineFarmQueue";

import "./farms.scss";

const COMMON_SOILS = ["Black Soil (Regur)", "Red Soil", "Alluvial Soil", "Laterite Soil"];

function removeDraftSafely(key: string | null): void {
  if (!key) return;
  try { localStorage.removeItem(key); } catch { /* Browser storage may be disabled. */ }
}

export function MyFarmsScreen() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();

  // ─── Data State ─────────────────────────────────────────────────────────────
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState<boolean>(false);
  const [permissionDenied, setPermissionDenied] = useState<boolean>(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState<string>("");

  // ─── Modal State (Create / Edit) ────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingFarm, setEditingFarm] = useState<Farm | null>(null);
  const draftKey = user?.id ? `bhoomi:farm-draft:${user.id}` : null;
  let savedDraft: { name?: string; location?: string; soil?: string; latitude?: string; longitude?: string; requestId?: string } | null = null;
  if (draftKey) {
    try {
      savedDraft = JSON.parse(localStorage.getItem(draftKey) ?? "null");
    } catch {
      removeDraftSafely(draftKey);
    }
  }
  const [formName, setFormName] = useState<string>(savedDraft?.name ?? "");
  const [formLatitude, setFormLatitude] = useState<string>(savedDraft?.latitude ?? "");
  const [formLongitude, setFormLongitude] = useState<string>(savedDraft?.longitude ?? "");
  const [formLocationName, setFormLocationName] = useState<string>(savedDraft?.location ?? "");
  const [formSoilType, setFormSoilType] = useState<string>(savedDraft?.soil ?? "");
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    location?: string;
  }>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [formRequestId, setFormRequestId] = useState(
    savedDraft?.requestId && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(savedDraft.requestId)
      ? savedDraft.requestId
      : createRequestId()
  );
  const [queuedFarmCount, setQueuedFarmCount] = useState(() => user?.id ? countQueuedFarms(user.id) : 0);

  useEffect(() => {
    if (!draftKey || editingFarm || !isModalOpen) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ name: formName, location: formLocationName, soil: formSoilType, latitude: formLatitude, longitude: formLongitude, requestId: formRequestId || createRequestId() }));
    } catch {
      // Keep form use available when browser storage is disabled or full.
    }
  }, [draftKey, editingFarm, isModalOpen, formName, formLocationName, formSoilType, formLatitude, formLongitude, formRequestId]);

  // ─── Delete Dialog State ───────────────────────────────────────────────────
  const [deletingFarm, setDeletingFarm] = useState<Farm | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // ─── Fetch Farms ────────────────────────────────────────────────────────────
  const loadFarms = async () => {
    setLoading(true);
    setFetchError(null);
    setIsUnavailable(false);
    setPermissionDenied(false);

    const res = await fetchFarms();
    setLoading(false);

    if (res.error) {
      if (res.status === 403) {
        setPermissionDenied(true);
      } else if (res.status === 503) {
        setIsUnavailable(true);
      } else {
        setFetchError(res.error);
      }
      return;
    }

    if (res.data) {
      setFarms(res.data.farms);
    }
  };

  useEffect(() => {
    loadFarms();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const sync = async () => {
      const result = await syncQueuedFarms(user.id);
      setQueuedFarmCount(result.remaining);
      if (result.synced > 0) await loadFarms();
    };
    window.addEventListener("online", sync);
    if (navigator.onLine) void sync();
    return () => window.removeEventListener("online", sync);
  }, [user?.id]);

  // ─── Modal Open / Close Handlers ───────────────────────────────────────────
  const openCreateModal = () => {
    setEditingFarm(null);
    let hasDraft = false;
    try { hasDraft = Boolean(draftKey && localStorage.getItem(draftKey)); } catch { /* Continue without draft storage. */ }
    if (!hasDraft) {
      setFormName(user?.full_name?.trim() ? `${user.full_name.trim().split(/\s+/)[0]}'s Farm` : "");
      setFormLatitude("");
      setFormLongitude("");
      setFormLocationName("");
      setFormSoilType("");
      setFormRequestId(createRequestId());
    }
    setFormErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (farm: Farm) => {
    setEditingFarm(farm);
    setFormName(farm.name);
    setFormLatitude(farm.latitude != null ? String(farm.latitude) : "");
    setFormLongitude(farm.longitude != null ? String(farm.longitude) : "");
    setFormLocationName(farm.location_name || "");
    setFormSoilType(farm.soil_type || "");
    setFormErrors({});
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingFarm(null);
    setFormErrors({});
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Location is not available in this browser. Enter a place name instead.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setFormLatitude(String(coords.latitude));
        setFormLongitude(String(coords.longitude));
        if (!formLocationName.trim()) setFormLocationName("Current location");
        setIsLocating(false);
      },
      (error) => {
        toast.error(error.code === error.PERMISSION_DENIED ? "Allow location access or enter a place name." : "Could not determine your location. Try again or enter a place name.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // ─── Form Validation (§12.4 State 4) ────────────────────────────────────────
  const validateForm = (): boolean => {
    const errs: { name?: string; location?: string } = {};

    if (!formName.trim()) {
      errs.name = "Farm name is required.";
    } else if (formName.trim().length < 2) {
      errs.name = "Farm name must be at least 2 characters long.";
    }

    if (!formLocationName.trim()) errs.location = "Enter a village, town, or use GPS to locate your farm.";

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ─── Save Farm (Create or Update) ───────────────────────────────────────────
  const handleSaveFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSaving(true);

    const payload: CreateFarmPayload = {
      name: formName.trim(),
      client_request_id: !editingFarm ? formRequestId || createRequestId() : undefined,
      latitude: formLatitude.trim() ? parseFloat(formLatitude) : null,
      longitude: formLongitude.trim() ? parseFloat(formLongitude) : null,
      soil_type: formSoilType.trim() || null,
      location_name: formLocationName.trim() || null,
      soil_type_source: "farmer_provided",
    };

    if (editingFarm) {
      // Update
      const res = await updateFarm(editingFarm.id, payload);
      setIsSaving(false);

      if (res.error) {
        toast.error(res.error);
        return;
      }

      if (res.data) {
        toast.success(`Farm "${res.data.farm.name}" updated successfully.`);
        setFarms((prev) =>
          prev.map((f) => (f.id === editingFarm.id ? { ...f, ...res.data!.farm } : f))
        );
        closeModal();
        removeDraftSafely(draftKey);
      }
    } else {
      // Create
      if (!navigator.onLine && user?.id) {
        if (!enqueueFarm(user.id, payload)) {
          setIsSaving(false);
          toast.error("This browser could not save the farm offline. Free device storage or reconnect and retry.");
          return;
        }
        setQueuedFarmCount(countQueuedFarms(user.id));
        setIsSaving(false);
        toast.success("Farm saved on this device and will sync when you reconnect.");
        removeDraftSafely(draftKey);
        closeModal();
        return;
      }
      const res = await createFarm(payload);
      setIsSaving(false);

      if (res.error) {
        if (res.status === 0 && user?.id) {
          if (!enqueueFarm(user.id, payload)) {
            toast.error("Connection lost, and this browser could not queue the farm. Keep this form open and retry.");
            return;
          }
          setQueuedFarmCount(countQueuedFarms(user.id));
          toast.success("Connection lost. Farm saved on this device and will sync when you reconnect.");
          removeDraftSafely(draftKey);
          closeModal();
          return;
        }
        toast.error(res.error);
        return;
      }

      if (res.data) {
        toast.success(`Farm "${res.data.farm.name}" created successfully.`);
        setFarms((prev) => [res.data!.farm, ...prev]);
        closeModal();
        removeDraftSafely(draftKey);
      }
    }
  };

  // ─── Delete Farm ────────────────────────────────────────────────────────────
  const confirmDeleteFarm = async () => {
    if (!deletingFarm) return;

    setIsDeleting(true);
    const res = await deleteFarm(deletingFarm.id);
    setIsDeleting(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }

    toast.success(`Farm "${deletingFarm.name}" and associated plots removed.`);
    setFarms((prev) => prev.filter((f) => f.id !== deletingFarm.id));
    setDeletingFarm(null);
  };

  // ─── Derived Calculations ──────────────────────────────────────────────────
  const filteredFarms = farms.filter((f) => {
    const q = searchQuery.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      (f.soil_type && f.soil_type.toLowerCase().includes(q))
    );
  });

  const totalPlotsCount = farms.reduce(
    (acc, f) => acc + (f.plots_count ?? f.plots?.length ?? 0),
    0
  );

  const shellRole: "farmer" | "admin" | "super_admin" =
    user?.platform_role === "super_admin"
      ? "super_admin"
      : user?.platform_role === "admin"
      ? "admin"
      : "farmer";

  const shellUser = user
    ? {
        name: user.full_name,
        phone: user.phone_number,
        role: shellRole,
        verificationStatus: user.verification_status,
      }
    : undefined;

  // ───────────────────────────────────────────────────────────────────────────
  // UI STATE 6: Permission Denied
  // ───────────────────────────────────────────────────────────────────────────
  if (permissionDenied) {
    return (
      <AppShell user={shellUser} onLogout={logout}>
        <div className="farms-page">
          <div className="farms-page__container">
            <div className="farm-permission-card" role="region" aria-label="Permission Denied">
              <div className="farm-permission-card__icon">
                <ShieldAlert size={36} />
              </div>
              <h2 className="farm-permission-card__title">Access Restricted</h2>
              <p className="farm-permission-card__desc">
                Your account does not have permission to access farm management. If your account was
                recently updated or deactivated, please contact Bhoomi support.
              </p>
              <div className="farm-permission-card__actions">
                <Link to="/dashboard" className="btn btn-primary">
                  Go to Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UI STATE 7: Service Unavailable
  // ───────────────────────────────────────────────────────────────────────────
  if (isUnavailable) {
    return (
      <AppShell user={shellUser} onLogout={logout}>
        <div className="farms-page">
          <div className="farms-page__container">
            <div className="farm-alert farm-alert--warning" role="alert">
              <AlertCircle size={24} />
              <div className="farm-alert__content">
                <strong>Farm Service Temporarily Unavailable</strong>
                <p>The farm management service is currently undergoing routine maintenance. Please try again shortly.</p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline farm-alert__retry-btn"
                onClick={loadFarms}
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // MAIN VIEW
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <AppShell user={shellUser} onLogout={logout}>
      <div className="farms-page">
        <div className="farms-page__container">

          {/* Breadcrumb */}
          <nav className="farms-breadcrumb" aria-label="Breadcrumb">
            <Link to="/dashboard">Dashboard</Link>
            <span className="farms-breadcrumb__separator">/</span>
            <span className="farms-breadcrumb__current">My Farms</span>
          </nav>

          {/* Page Header */}
          <header className="farms-header">
            <div className="farms-header__titles">
              <h1 className="farms-header__title">
                <Sprout size={28} style={{ color: "#2F5D3A" }} />
                {t("My Agricultural Farms")}
              </h1>
              <p className="farms-header__subtitle">
                {t("Manage your land holdings, register boundary plots, and track agricultural cycles.")}
              </p>
            </div>
            <div className="farms-header__actions">
              <button
                type="button"
                id="btn-add-farm"
                className="btn btn-primary"
                onClick={openCreateModal}
              >
                <Plus size={16} /> {t("Add New Farm")}
              </button>
            </div>
          </header>

          {queuedFarmCount > 0 && <div role="status" className="farm-alert farm-alert--warning">{queuedFarmCount} farm {queuedFarmCount === 1 ? "change is" : "changes are"} saved on this device and waiting to sync.</div>}

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* UI STATE 5: Top-Level API / Network Error                           */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          {fetchError && (
            <div className="farm-alert farm-alert--error" role="alert">
              <WifiOff size={24} />
              <div className="farm-alert__content">
                <strong>Failed to load farms</strong>
                <p>{fetchError}</p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline farm-alert__retry-btn"
                onClick={loadFarms}
              >
                <RefreshCw size={14} /> Retry Connection
              </button>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* UI STATE 1: Loading Skeleton                                        */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          {loading ? (
            <div className="farm-skeleton-grid" aria-busy="true" aria-label="Loading farms">
              <div className="farm-skeleton-grid__card" />
              <div className="farm-skeleton-grid__card" />
              <div className="farm-skeleton-grid__card" />
            </div>
          ) : farms.length > 0 ? (
            <>
              {/* Summary Metrics Bar (§12.2) */}
              <div className="farms-summary-bar">
                <div className="farms-summary-bar__item">
                  <div className="farms-summary-bar__icon">
                    <Sprout size={22} />
                  </div>
                  <div>
                    <div className="farms-summary-bar__label">Total Farms</div>
                    <div className="farms-summary-bar__value">{farms.length}</div>
                  </div>
                </div>

                <div className="farms-summary-bar__divider" />

                <div className="farms-summary-bar__item">
                  <div className="farms-summary-bar__icon">
                    <Layers size={22} />
                  </div>
                  <div>
                    <div className="farms-summary-bar__label">Registered Plots</div>
                    <div className="farms-summary-bar__value">{totalPlotsCount}</div>
                  </div>
                </div>

                <div className="farms-summary-bar__divider" />

                {/* Filter Search Input */}
                <div style={{ flex: 1, maxWidth: "320px" }}>
                  <div className="input-field" style={{ display: "flex", alignItems: "center", padding: "0 10px" }}>
                    <Search size={16} style={{ color: "#5B6E60", marginRight: "8px" }} />
                    <input
                      type="text"
                      placeholder="Search farms or soil type..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ border: "none", outline: "none", width: "100%", background: "transparent" }}
                      aria-label="Filter farms by name or soil type"
                    />
                  </div>
                </div>
              </div>

              {/* ───────────────────────────────────────────────────────────── */}
              {/* UI STATE 3: Success — Farm Cards Grid                         */}
              {/* ───────────────────────────────────────────────────────────── */}
              {filteredFarms.length > 0 ? (
                <div className="farms-grid">
                  {filteredFarms.map((farm) => (
                    <FarmCard
                      key={farm.id}
                      farm={farm}
                      onEdit={openEditModal}
                      onDelete={(f) => setDeletingFarm(f)}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "3rem 1rem", background: "#fff", borderRadius: "1rem" }}>
                  <p style={{ color: "#5B6E60", fontSize: "0.9375rem" }}>
                    No farms match your search for "{searchQuery}".
                  </p>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear Filter
                  </button>
                </div>
              )}
            </>
          ) : (
            /* ─────────────────────────────────────────────────────────────── */
            /* UI STATE 2: Empty State (First-run)                             */
            /* ─────────────────────────────────────────────────────────────── */
            <EmptyState
              title={t("No Farms Registered Yet")}
              description={t("Start by creating a farm, adding a plot, and logging your first sowing.")}
              icon={Sprout}
              action={
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={openCreateModal}
                >
                  <Plus size={16} /> {t("Add Your First Farm")}
                </button>
              }
            />
          )}

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* Create / Edit Farm Modal Dialog                                     */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          {isModalOpen && (
            <div
              className="farm-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-farm-title"
            >
              <div className="farm-modal">
                <header className="farm-modal__header">
                  <h2 className="farm-modal__title" id="modal-farm-title">
                    <Sprout size={20} style={{ color: "#2F5D3A" }} />
                    {editingFarm ? t("Edit Farm Details") : t("Register New Farm")}
                  </h2>
                  <button
                    type="button"
                    className="farm-modal__close-btn"
                    onClick={closeModal}
                    aria-label="Close modal"
                  >
                    <X size={20} />
                  </button>
                </header>

                <form onSubmit={handleSaveFarm}>
                  <div className="farm-modal__body">
                    {/* Farm Name Field */}
                    <FormField
                      label={t("Farm Name")}
                      id="farm-name-input"
                      required
                      error={formErrors.name}
                      hint={t("E.g. Greenfield Valley, East Acre Estate")}
                    >
                      <input
                        type="text"
                        id="farm-name-input"
                        className="input-field"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder={t("Enter farm name")}
                        disabled={isSaving}
                      />
                    </FormField>

                    <FormField label={t("Farm location")} id="farm-location-input" required error={formErrors.location ? t(formErrors.location) : undefined} hint={t("Use GPS or enter your village, town, or address.")}>
                      <input id="farm-location-input" list="farm-location-suggestions" className="input-field" value={formLocationName} onChange={(e) => setFormLocationName(e.target.value)} placeholder="Village or town" disabled={isSaving} />
                      <datalist id="farm-location-suggestions">
                        {Array.from(new Set(farms.map((farm) => farm.location_name).filter((location): location is string => Boolean(location?.trim())))).map((location) => <option key={location} value={location} />)}
                      </datalist>
                    </FormField>
                    <button type="button" className="btn btn-outline btn-sm" onClick={useCurrentLocation} disabled={isSaving || isLocating}>
                      <MapPin size={14} /> {isLocating ? "Finding location…" : formLatitude && formLongitude ? "Refresh GPS location" : "Use my current location"}
                    </button>
                    {(formLatitude || formLongitude) && <p role="status" className="farm-location-status">GPS pin saved with this farm.</p>}

                    <fieldset style={{ border: 0, padding: 0, margin: "1rem 0 0" }}>
                      <legend style={{ fontWeight: 600, marginBottom: 8 }}>{t("Soil type")} <span style={{ fontWeight: 400, color: "#5B6E60" }}>({t("optional")})</span></legend>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                        {COMMON_SOILS.map((soil) => <button key={soil} type="button" className={`btn ${formSoilType === soil ? "btn-primary" : "btn-outline"}`} onClick={() => setFormSoilType(formSoilType === soil ? "" : soil)} disabled={isSaving} aria-pressed={formSoilType === soil}>{soil}</button>)}
                      </div>
                      <p style={{ color: "#5B6E60", fontSize: 13, marginTop: 8 }}>Choose what you know, or leave blank. Verified regional soil suggestions are not configured yet.</p>
                    </fieldset>
                  </div>

                  <footer className="farm-modal__footer">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={closeModal}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <>
                          <RefreshCw size={14} className="spin" /> Saving...
                        </>
                      ) : editingFarm ? (
                        "Update Farm"
                      ) : (
                        "Create Farm"
                      )}
                    </button>
                  </footer>
                </form>
              </div>
            </div>
          )}

          {/* Delete Confirmation Dialog */}
          <ConfirmDialog
            isOpen={deletingFarm !== null}
            title="Delete Farm"
            message={`Are you sure you want to delete "${deletingFarm?.name}"? This action cannot be undone and will permanently remove all plots and crop cycles linked to this farm.`}
            confirmText={isDeleting ? "Deleting..." : "Delete Farm"}
            isLoading={isDeleting}
            variant="danger"
            onConfirm={confirmDeleteFarm}
            onCancel={() => setDeletingFarm(null)}
          />

        </div>
      </div>
    </AppShell>
  );
}

export default MyFarmsScreen;
