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
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
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

import "./farms.scss";

const COMMON_SOILS = [
  "Alluvial Soil",
  "Black Soil (Regur)",
  "Red & Yellow Soil",
  "Laterite Soil",
  "Arid / Desert Soil",
  "Saline Soil",
  "Peaty / Organic Soil",
  "Clay Loam",
  "Sandy Loam",
  "Silt Loam",
];

export function MyFarmsScreen() {
  const { user, logout } = useAuth();
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
  const [formName, setFormName] = useState<string>("");
  const [formLatitude, setFormLatitude] = useState<string>("");
  const [formLongitude, setFormLongitude] = useState<string>("");
  const [formSoilType, setFormSoilType] = useState<string>("");
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    latitude?: string;
    longitude?: string;
  }>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);

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

  // ─── Modal Open / Close Handlers ───────────────────────────────────────────
  const openCreateModal = () => {
    setEditingFarm(null);
    setFormName("");
    setFormLatitude("");
    setFormLongitude("");
    setFormSoilType("");
    setFormErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (farm: Farm) => {
    setEditingFarm(farm);
    setFormName(farm.name);
    setFormLatitude(farm.latitude != null ? String(farm.latitude) : "");
    setFormLongitude(farm.longitude != null ? String(farm.longitude) : "");
    setFormSoilType(farm.soil_type || "");
    setFormErrors({});
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingFarm(null);
    setFormErrors({});
  };

  // ─── Form Validation (§12.4 State 4) ────────────────────────────────────────
  const validateForm = (): boolean => {
    const errs: { name?: string; latitude?: string; longitude?: string } = {};

    if (!formName.trim()) {
      errs.name = "Farm name is required.";
    } else if (formName.trim().length < 2) {
      errs.name = "Farm name must be at least 2 characters long.";
    }

    if (formLatitude.trim()) {
      const lat = parseFloat(formLatitude);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        errs.latitude = "Latitude must be a valid number between -90 and 90.";
      }
    }

    if (formLongitude.trim()) {
      const lng = parseFloat(formLongitude);
      if (isNaN(lng) || lng < -180 || lng > 180) {
        errs.longitude = "Longitude must be a valid number between -180 and 180.";
      }
    }

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
      latitude: formLatitude.trim() ? parseFloat(formLatitude) : null,
      longitude: formLongitude.trim() ? parseFloat(formLongitude) : null,
      soil_type: formSoilType.trim() || null,
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
      }
    } else {
      // Create
      const res = await createFarm(payload);
      setIsSaving(false);

      if (res.error) {
        toast.error(res.error);
        return;
      }

      if (res.data) {
        toast.success(`Farm "${res.data.farm.name}" created successfully.`);
        setFarms((prev) => [res.data!.farm, ...prev]);
        closeModal();
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
                My Agricultural Farms
              </h1>
              <p className="farms-header__subtitle">
                Manage your land holdings, register boundary plots, and track agricultural cycles.
              </p>
            </div>
            <div className="farms-header__actions">
              <button
                type="button"
                id="btn-add-farm"
                className="btn btn-primary"
                onClick={openCreateModal}
              >
                <Plus size={16} /> Add New Farm
              </button>
            </div>
          </header>

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
              title="No Farms Registered Yet"
              description="Register your first agricultural land holding to start subdividing it into plots, recording crop cycles, and accessing localized weather forecasts."
              icon={Sprout}
              action={
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={openCreateModal}
                >
                  <Plus size={16} /> Add Your First Farm
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
                    {editingFarm ? "Edit Farm Details" : "Register New Farm"}
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
                      label="Farm Name"
                      id="farm-name-input"
                      required
                      error={formErrors.name}
                      hint="E.g. Greenfield Valley, East Acre Estate"
                    >
                      <input
                        type="text"
                        id="farm-name-input"
                        className="input-field"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="Enter farm name"
                        disabled={isSaving}
                      />
                    </FormField>

                    {/* Soil Type Field */}
                    <FormField
                      label="Primary Soil Type"
                      id="farm-soil-input"
                      hint="Optional agronomic classification"
                    >
                      <select
                        id="farm-soil-input"
                        className="select-field"
                        value={formSoilType}
                        onChange={(e) => setFormSoilType(e.target.value)}
                        disabled={isSaving}
                      >
                        <option value="">Select or leave blank</option>
                        {COMMON_SOILS.map((soil) => (
                          <option key={soil} value={soil}>
                            {soil}
                          </option>
                        ))}
                      </select>
                    </FormField>

                    {/* Coordinates (Lat / Long) */}
                    <div className="farm-modal__row">
                      <FormField
                        label="Latitude"
                        id="farm-lat-input"
                        error={formErrors.latitude}
                        hint="Decimal degrees (-90 to 90)"
                      >
                        <input
                          type="number"
                          step="any"
                          id="farm-lat-input"
                          className="input-field"
                          value={formLatitude}
                          onChange={(e) => setFormLatitude(e.target.value)}
                          placeholder="e.g. 18.5204"
                          disabled={isSaving}
                        />
                      </FormField>

                      <FormField
                        label="Longitude"
                        id="farm-lng-input"
                        error={formErrors.longitude}
                        hint="Decimal degrees (-180 to 180)"
                      >
                        <input
                          type="number"
                          step="any"
                          id="farm-lng-input"
                          className="input-field"
                          value={formLongitude}
                          onChange={(e) => setFormLongitude(e.target.value)}
                          placeholder="e.g. 73.8567"
                          disabled={isSaving}
                        />
                      </FormField>
                    </div>
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
