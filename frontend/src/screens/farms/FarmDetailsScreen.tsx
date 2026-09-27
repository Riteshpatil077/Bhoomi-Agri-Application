/**
 * Bhoomi Farm Details Screen (Prompt 12)
 *
 * Implements the detail view for a specific farm and its plots:
 *   - Farm overview (soil type, coordinates, total plots, total acreage)
 *   - Plot list using the PlotCard component
 *   - Create and Edit Plot modal with acreage validation
 *   - Delete Plot confirmation dialog
 *
 * All 7 UI states explicitly implemented per §12.4:
 *   1. Loading          — skeleton hero and plot grid
 *   2. Empty            — empty plots state with "Add First Plot" CTA
 *   3. Success          — farm metadata card + grid of PlotCards
 *   4. Validation error — inline errors on plot form (name, positive acreage)
 *   5. API error        — server/network failure alert with Retry button
 *   6. Permission denied— EXPLICIT REQUIREMENT: honest 403 view when accessing
 *                         another user's farm, with "Return to My Farms" CTA
 *   7. Unavailable      — 503 outage state with retry button
 */

import React, { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  Sprout,
  Plus,
  Grid,
  MapPin,
  Edit,
  Trash2,
  RefreshCw,
  WifiOff,
  AlertCircle,
  ShieldAlert,
  ArrowLeft,
  X,
  Layers,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  AppShell,
  PlotCard,
  FormField,
  EmptyState,
  ConfirmDialog,
  useToast,
} from "../../design-system";
import {
  fetchFarm,
  updateFarm,
  deleteFarm,
  createPlot,
  updatePlot,
  deletePlot,
  type Farm,
  type Plot,
  type CreatePlotPayload,
} from "../../api/farms";
import { createRequestId } from "../../api/requestId";

import "./farms.scss";

export function FarmDetailsScreen() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();

  // ─── Data State ─────────────────────────────────────────────────────────────
  const [farm, setFarm] = useState<Farm | null>(null);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState<boolean>(false);
  const [permissionDenied, setPermissionDenied] = useState<boolean>(false);
  const [notFound, setNotFound] = useState<boolean>(false);

  // ─── Farm Edit Modal State ──────────────────────────────────────────────────
  const [isFarmEditModalOpen, setIsFarmEditModalOpen] = useState<boolean>(false);
  const [editFarmName, setEditFarmName] = useState<string>("");
  const [editFarmSoil, setEditFarmSoil] = useState<string>("");
  const [editFarmLat, setEditFarmLat] = useState<string>("");
  const [editFarmLng, setEditFarmLng] = useState<string>("");
  const [farmFormErrors, setFarmFormErrors] = useState<{ name?: string }>({});
  const [isSavingFarm, setIsSavingFarm] = useState<boolean>(false);
  const [isDeletingFarm, setIsDeletingFarm] = useState<boolean>(false);
  const [showDeleteFarmConfirm, setShowDeleteFarmConfirm] = useState<boolean>(false);

  // ─── Plot Create / Edit Modal State ─────────────────────────────────────────
  const [isPlotModalOpen, setIsPlotModalOpen] = useState<boolean>(false);
  const [editingPlot, setEditingPlot] = useState<Plot | null>(null);
  const [plotName, setPlotName] = useState<string>("");
  const [plotAreaAcres, setPlotAreaAcres] = useState<string>("");
  const [plotAreaEstimated, setPlotAreaEstimated] = useState(false);
  const [plotFormErrors, setPlotFormErrors] = useState<{
    plot_name?: string;
    area_acres?: string;
  }>({});
  const [isSavingPlot, setIsSavingPlot] = useState<boolean>(false);

  // ─── Plot Delete State ──────────────────────────────────────────────────────
  const [deletingPlot, setDeletingPlot] = useState<Plot | null>(null);
  const [isDeletingPlot, setIsDeletingPlot] = useState<boolean>(false);

  // ─── Load Farm & Plots ──────────────────────────────────────────────────────
  const loadFarmData = async () => {
    if (!farmId) return;

    setLoading(true);
    setFetchError(null);
    setIsUnavailable(false);
    setPermissionDenied(false);
    setNotFound(false);

    const res = await fetchFarm(farmId);
    setLoading(false);

    if (res.error) {
      if (res.status === 403) {
        // Strict cross-user isolation: attempting to view another user's farm
        setPermissionDenied(true);
      } else if (res.status === 404) {
        setNotFound(true);
      } else if (res.status === 503) {
        setIsUnavailable(true);
      } else {
        setFetchError(res.error);
      }
      return;
    }

    if (res.data) {
      setFarm(res.data.farm);
      setPlots(res.data.farm.plots || []);
    }
  };

  useEffect(() => {
    loadFarmData();
  }, [farmId]);

  // ─── Farm Edit Handlers ─────────────────────────────────────────────────────
  const openEditFarmModal = () => {
    if (!farm) return;
    setEditFarmName(farm.name);
    setEditFarmSoil(farm.soil_type || "");
    setEditFarmLat(farm.latitude != null ? String(farm.latitude) : "");
    setEditFarmLng(farm.longitude != null ? String(farm.longitude) : "");
    setFarmFormErrors({});
    setIsFarmEditModalOpen(true);
  };

  const handleUpdateFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farm) return;

    if (!editFarmName.trim() || editFarmName.trim().length < 2) {
      setFarmFormErrors({ name: "Farm name must be at least 2 characters long." });
      return;
    }

    setIsSavingFarm(true);
    const res = await updateFarm(farm.id, {
      name: editFarmName.trim(),
      soil_type: editFarmSoil.trim() || null,
      latitude: editFarmLat.trim() ? parseFloat(editFarmLat) : null,
      longitude: editFarmLng.trim() ? parseFloat(editFarmLng) : null,
    });
    setIsSavingFarm(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }

    if (res.data) {
      toast.success("Farm details updated successfully.");
      setFarm((prev) => (prev ? { ...prev, ...res.data!.farm } : res.data!.farm));
      setIsFarmEditModalOpen(false);
    }
  };

  const handleDeleteFarm = async () => {
    if (!farm) return;
    setIsDeletingFarm(true);
    const res = await deleteFarm(farm.id);
    setIsDeletingFarm(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }

    toast.success(`Farm "${farm.name}" removed.`);
    navigate("/farms", { replace: true });
  };

  // ─── Plot Modal Handlers ────────────────────────────────────────────────────
  const openCreatePlotModal = () => {
    setEditingPlot(null);
    setPlotName("");
    setPlotAreaAcres("");
    setPlotAreaEstimated(false);
    setPlotFormErrors({});
    setIsPlotModalOpen(true);
  };

  const openEditPlotModal = (plot: Plot) => {
    setEditingPlot(plot);
    setPlotName(plot.plot_name);
    setPlotAreaAcres(String(plot.area_acres));
    setPlotAreaEstimated(plot.area_is_estimated);
    setPlotFormErrors({});
    setIsPlotModalOpen(true);
  };

  const closePlotModal = () => {
    setIsPlotModalOpen(false);
    setEditingPlot(null);
    setPlotFormErrors({});
  };

  // ─── Plot Form Validation (§12.4 State 4) ───────────────────────────────────
  const validatePlotForm = (): boolean => {
    const errs: { plot_name?: string; area_acres?: string } = {};

    if (!plotName.trim()) {
      errs.plot_name = "Plot name is required.";
    }

    const acres = parseFloat(plotAreaAcres);
    if (!plotAreaAcres.trim() || isNaN(acres)) {
      errs.area_acres = "Acreage must be a valid number.";
    } else if (acres <= 0) {
      errs.area_acres = "Plot area must be greater than 0 acres.";
    }

    setPlotFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ─── Save Plot (Create / Update) ────────────────────────────────────────────
  const handleSavePlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmId || !validatePlotForm()) return;

    setIsSavingPlot(true);

    const payload: CreatePlotPayload = {
      plot_name: plotName.trim(),
      area_acres: parseFloat(plotAreaAcres),
      area_is_estimated: plotAreaEstimated,
      client_request_id: !editingPlot ? createRequestId() : undefined,
    };

    if (editingPlot) {
      const res = await updatePlot(editingPlot.id, payload);
      setIsSavingPlot(false);

      if (res.error) {
        toast.error(res.error);
        return;
      }

      if (res.data) {
        toast.success(`Plot "${res.data.plot.plot_name}" updated.`);
        setPlots((prev) =>
          prev.map((p) => (p.id === editingPlot.id ? { ...p, ...res.data!.plot } : p))
        );
        closePlotModal();
      }
    } else {
      const res = await createPlot(farmId, payload);
      setIsSavingPlot(false);

      if (res.error) {
        toast.error(res.error);
        return;
      }

      if (res.data) {
        toast.success(`Plot "${res.data.plot.plot_name}" registered.`);
        setPlots((prev) => [...prev, res.data!.plot]);
        closePlotModal();
      }
    }
  };

  // ─── Delete Plot ────────────────────────────────────────────────────────────
  const confirmDeletePlot = async () => {
    if (!deletingPlot) return;

    setIsDeletingPlot(true);
    const res = await deletePlot(deletingPlot.id);
    setIsDeletingPlot(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }

    toast.success(`Plot "${deletingPlot.plot_name}" deleted.`);
    setPlots((prev) => prev.filter((p) => p.id !== deletingPlot.id));
    setDeletingPlot(null);
  };

  // Total acreage calculation
  const totalAcreage = plots.reduce((acc, p) => acc + (p.area_acres || 0), 0);

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
  // UI STATE 6: Permission Denied — Another User's Farm (§12.4, Prompt 12)
  // ───────────────────────────────────────────────────────────────────────────
  if (permissionDenied) {
    return (
      <AppShell user={shellUser} onLogout={logout}>
        <div className="farms-page">
          <div className="farms-page__container">
            <div className="farm-permission-card" role="region" aria-label="Permission Denied">
              <div className="farm-permission-card__icon">
                <ShieldAlert size={40} />
              </div>
              <h1 className="farm-permission-card__title">Access Restricted</h1>
              <p className="farm-permission-card__desc">
                You do not have permission to view or manage this farm. Each agricultural holding
                is private and strictly restricted to its registered owner.
              </p>
              <div className="farm-permission-card__actions">
                <Link to="/farms" className="btn btn-primary">
                  <ArrowLeft size={16} /> Return to My Farms
                </Link>
                <Link to="/dashboard" className="btn btn-outline">
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
  // UI STATE 4 / 404: Not Found
  // ───────────────────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <AppShell user={shellUser} onLogout={logout}>
        <div className="farms-page">
          <div className="farms-page__container">
            <div className="farm-permission-card">
              <div className="farm-permission-card__icon" style={{ backgroundColor: "#F3F4F6", color: "#4B5563" }}>
                <Sprout size={40} />
              </div>
              <h1 className="farm-permission-card__title">Farm Not Found</h1>
              <p className="farm-permission-card__desc">
                The farm you requested does not exist or may have been deleted.
              </p>
              <div className="farm-permission-card__actions">
                <Link to="/farms" className="btn btn-primary">
                  <ArrowLeft size={16} /> Back to My Farms
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
                <p>The farm storage backend is currently unavailable. Please retry in a few moments.</p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline farm-alert__retry-btn"
                onClick={loadFarmData}
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
  // UI STATE 5: Top-Level API / Network Error
  // ───────────────────────────────────────────────────────────────────────────
  if (fetchError) {
    return (
      <AppShell user={shellUser} onLogout={logout}>
        <div className="farms-page">
          <div className="farms-page__container">
            <div className="farm-alert farm-alert--error" role="alert">
              <WifiOff size={24} />
              <div className="farm-alert__content">
                <strong>Failed to load farm details</strong>
                <p>{fetchError}</p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline farm-alert__retry-btn"
                onClick={loadFarmData}
              >
                <RefreshCw size={14} /> Retry Connection
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UI STATE 1: Loading Skeleton
  // ───────────────────────────────────────────────────────────────────────────
  if (loading || !farm) {
    return (
      <AppShell user={shellUser} onLogout={logout}>
        <div className="farms-page" aria-busy="true" aria-label="Loading farm details">
          <div className="farms-page__container">
            <div className="farm-skeleton-grid" style={{ marginBottom: "2rem" }}>
              <div className="farm-skeleton-grid__card" style={{ height: "180px" }} />
            </div>
            <div className="farm-skeleton-grid">
              <div className="farm-skeleton-grid__card" />
              <div className="farm-skeleton-grid__card" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UI STATE 3: Success — Farm Details and Plots
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <AppShell user={shellUser} onLogout={logout}>
      <div className="farms-page">
        <div className="farms-page__container">

          {/* Breadcrumb Navigation */}
          <nav className="farms-breadcrumb" aria-label="Breadcrumb">
            <Link to="/farms">My Farms</Link>
            <span className="farms-breadcrumb__separator">/</span>
            <span className="farms-breadcrumb__current">{farm.name}</span>
          </nav>

          {/* Farm Hero Card */}
          <section className="farm-details-hero" aria-labelledby="farm-heading">
            <div className="farm-details-hero__header">
              <div className="farm-details-hero__title-box">
                <div className="farm-details-hero__icon" aria-hidden="true">
                  <Sprout size={32} />
                </div>
                <div>
                  <h1 className="farm-details-hero__title" id="farm-heading">
                    {farm.name}
                  </h1>
                  <div className="farm-details-hero__subtitle">
                    {farm.latitude != null && farm.longitude != null ? (
                      <>
                        <MapPin size={14} />
                        <span>
                          {farm.location_name || "Pinned farm location"}
                        </span>
                      </>
                    ) : (
                      <span>Coordinates not provided</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  id="btn-edit-farm"
                  className="btn btn-outline btn-sm"
                  onClick={openEditFarmModal}
                >
                  <Edit size={14} /> Edit Farm
                </button>
                <button
                  type="button"
                  id="btn-delete-farm"
                  className="btn btn-outline btn-sm"
                  style={{ color: "#B42318", borderColor: "rgba(180, 35, 24, 0.3)" }}
                  onClick={() => setShowDeleteFarmConfirm(true)}
                >
                  <Trash2 size={14} /> Delete Farm
                </button>
                <button
                  type="button"
                  id="btn-add-plot"
                  className="btn btn-primary btn-sm"
                  onClick={openCreatePlotModal}
                >
                  <Plus size={16} /> Add Plot
                </button>
              </div>
            </div>

            {/* Farm Attribute Grid */}
            <div className="farm-details-hero__attributes-grid">
              <div className="farm-details-hero__attr">
                <span className="farm-details-hero__attr-label">Primary Soil</span>
                <span className="farm-details-hero__attr-value">
                  {farm.soil_type || "Unspecified"}
                </span>
              </div>
              <div className="farm-details-hero__attr">
                <span className="farm-details-hero__attr-label">Registered Plots</span>
                <span className="farm-details-hero__attr-value">{plots.length}</span>
              </div>
              <div className="farm-details-hero__attr">
                <span className="farm-details-hero__attr-label">Total Acreage{plots.some((plot) => plot.area_is_estimated) ? " (includes estimates)" : ""}</span>
                <span className="farm-details-hero__attr-value">
                  {totalAcreage.toFixed(2)} Acres
                </span>
              </div>
              <div className="farm-details-hero__attr">
                <span className="farm-details-hero__attr-label">Created On</span>
                <span className="farm-details-hero__attr-value">
                  {new Date(farm.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>
          </section>

          {/* Plots Section Heading */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#263229", display: "flex", alignItems: "center", gap: "8px" }}>
              <Layers size={20} style={{ color: "#2F5D3A" }} />
              Plots in this Farm ({plots.length})
            </h2>
            {plots.length > 0 && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={openCreatePlotModal}
              >
                <Plus size={14} /> New Plot
              </button>
            )}
          </div>

          {/* Plots Grid or Empty State */}
          {plots.length > 0 ? (
            <div className="farms-grid">
              {plots.map((plot) => (
                <PlotCard
                  key={plot.id}
                  plot={plot}
                  farmId={farm.id}
                  onEdit={openEditPlotModal}
                  onDelete={(p) => setDeletingPlot(p)}
                />
              ))}
            </div>
          ) : (
            /* ─────────────────────────────────────────────────────────────── */
            /* UI STATE 2: Empty Plots State                                   */
            /* ─────────────────────────────────────────────────────────────── */
            <EmptyState
              title={t("No Plots in this Farm Yet")}
              description={t("Add a plot to get started")}
              icon={Grid}
              action={
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={openCreatePlotModal}
                >
                  <Plus size={16} /> Add Your First Plot
                </button>
              }
            />
          )}

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* Create / Edit Plot Modal                                            */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          {isPlotModalOpen && (
            <div
              className="farm-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-plot-title"
            >
              <div className="farm-modal">
                <header className="farm-modal__header">
                  <h2 className="farm-modal__title" id="modal-plot-title">
                    <Grid size={20} style={{ color: "#2F5D3A" }} />
                    {editingPlot ? "Edit Plot" : "Add Plot to Farm"}
                  </h2>
                  <button
                    type="button"
                    className="farm-modal__close-btn"
                    onClick={closePlotModal}
                    aria-label="Close plot modal"
                  >
                    <X size={20} />
                  </button>
                </header>

                <form onSubmit={handleSavePlot}>
                  <div className="farm-modal__body">
                    <FormField
                      label="Plot Name / Identifier"
                      id="plot-name-input"
                      required
                      error={plotFormErrors.plot_name}
                      hint="E.g. North Acre, Plot A, Wheat Patch"
                    >
                      <input
                        type="text"
                        id="plot-name-input"
                        className="input-field"
                        value={plotName}
                        onChange={(e) => setPlotName(e.target.value)}
                        placeholder="Enter plot name"
                        disabled={isSavingPlot}
                      />
                    </FormField>

                      <FormField
                      label="Area in Acres"
                      id="plot-acres-input"
                      required
                      error={plotFormErrors.area_acres}
                        hint={plotAreaEstimated ? "Approximate size; you can update it with an exact measurement later." : "Choose a size or enter the measured area."}
                    >
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }} aria-label="Approximate plot size">
                          {[
                            { label: "Small (<2 acres)", value: "1" },
                            { label: "Medium (2–5 acres)", value: "3.5" },
                            { label: "Large (>5 acres)", value: "6" },
                          ].map((size) => <button key={size.label} type="button" className="btn btn-outline btn-sm" onClick={() => { setPlotAreaAcres(size.value); setPlotAreaEstimated(true); }} disabled={isSavingPlot}>{size.label}</button>)}
                        </div>
                      <input
                        type="number"
                        step="any"
                        id="plot-acres-input"
                        className="input-field"
                        value={plotAreaAcres}
                        onChange={(e) => { setPlotAreaAcres(e.target.value); setPlotAreaEstimated(false); }}
                        placeholder="e.g. 2.5"
                        disabled={isSavingPlot}
                      />
                      {plotAreaEstimated && <p role="status" style={{ color: "#7A4B00", fontSize: 13, marginTop: 6 }}>Approximate estimate — update when you know the measured area.</p>}
                    </FormField>
                  </div>

                  <footer className="farm-modal__footer">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={closePlotModal}
                      disabled={isSavingPlot}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isSavingPlot}
                    >
                      {isSavingPlot ? (
                        <>
                          <RefreshCw size={14} className="spin" /> Saving...
                        </>
                      ) : editingPlot ? (
                        "Update Plot"
                      ) : (
                        "Add Plot"
                      )}
                    </button>
                  </footer>
                </form>
              </div>
            </div>
          )}

          {/* Edit Farm Modal */}
          {isFarmEditModalOpen && (
            <div
              className="farm-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-edit-farm-title"
            >
              <div className="farm-modal">
                <header className="farm-modal__header">
                  <h2 className="farm-modal__title" id="modal-edit-farm-title">
                    <Edit size={20} style={{ color: "#2F5D3A" }} />
                    Edit Farm Details
                  </h2>
                  <button
                    type="button"
                    className="farm-modal__close-btn"
                    onClick={() => setIsFarmEditModalOpen(false)}
                    aria-label="Close edit farm modal"
                  >
                    <X size={20} />
                  </button>
                </header>

                <form onSubmit={handleUpdateFarm}>
                  <div className="farm-modal__body">
                    <FormField
                      label="Farm Name"
                      id="edit-farm-name"
                      required
                      error={farmFormErrors.name}
                    >
                      <input
                        type="text"
                        id="edit-farm-name"
                        className="input-field"
                        value={editFarmName}
                        onChange={(e) => setEditFarmName(e.target.value)}
                        disabled={isSavingFarm}
                      />
                    </FormField>

                    <FormField
                      label="Primary Soil Type"
                      id="edit-farm-soil"
                    >
                      <input
                        type="text"
                        id="edit-farm-soil"
                        className="input-field"
                        value={editFarmSoil}
                        onChange={(e) => setEditFarmSoil(e.target.value)}
                        placeholder="e.g. Alluvial, Black, Loam"
                        disabled={isSavingFarm}
                      />
                    </FormField>

                    <div className="farm-modal__row">
                      <FormField label="Latitude" id="edit-farm-lat">
                        <input
                          type="number"
                          step="any"
                          id="edit-farm-lat"
                          className="input-field"
                          value={editFarmLat}
                          onChange={(e) => setEditFarmLat(e.target.value)}
                          disabled={isSavingFarm}
                        />
                      </FormField>

                      <FormField label="Longitude" id="edit-farm-lng">
                        <input
                          type="number"
                          step="any"
                          id="edit-farm-lng"
                          className="input-field"
                          value={editFarmLng}
                          onChange={(e) => setEditFarmLng(e.target.value)}
                          disabled={isSavingFarm}
                        />
                      </FormField>
                    </div>
                  </div>

                  <footer className="farm-modal__footer">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setIsFarmEditModalOpen(false)}
                      disabled={isSavingFarm}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isSavingFarm}
                    >
                      {isSavingFarm ? "Updating..." : "Save Changes"}
                    </button>
                  </footer>
                </form>
              </div>
            </div>
          )}

          {/* Delete Farm Dialog */}
          <ConfirmDialog
            isOpen={showDeleteFarmConfirm}
            title="Delete Farm"
            message={`Are you sure you want to permanently delete "${farm.name}"? All plots and crop cycles inside this farm will be permanently deleted.`}
            confirmText="Delete Farm"
            isLoading={isDeletingFarm}
            variant="danger"
            onConfirm={handleDeleteFarm}
            onCancel={() => setShowDeleteFarmConfirm(false)}
          />

          {/* Delete Plot Dialog */}
          <ConfirmDialog
            isOpen={deletingPlot !== null}
            title="Delete Plot"
            message={`Are you sure you want to delete plot "${deletingPlot?.plot_name}"? Any crop cycle recorded on this plot will also be removed.`}
            confirmText="Delete Plot"
            isLoading={isDeletingPlot}
            variant="danger"
            onConfirm={confirmDeletePlot}
            onCancel={() => setDeletingPlot(null)}
          />

        </div>
      </div>
    </AppShell>
  );
}

export default FarmDetailsScreen;
