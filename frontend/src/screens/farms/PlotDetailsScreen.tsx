/**
 * Bhoomi Plot Details Screen (Prompt 12)
 *
 * Implements the detail view for a specific agricultural plot:
 *   - Plot acreage, parent farm context, and registered status
 *   - Overview of active and historical crop cycles on this plot
 *   - Edit plot and delete plot dialogs with parent-farm redirection
 *
 * All 7 UI states explicitly implemented per §12.4:
 *   1. Loading          — skeleton hero card
 *   2. Empty            — empty crop cycles state with CTA to start first cycle
 *   3. Success          — plot details + crop cycle summary list
 *   4. Validation error — inline errors on edit plot modal (positive acreage, name)
 *   5. API error        — error alert with Retry button
 *   6. Permission denied— EXPLICIT REQUIREMENT: honest 403 view when accessing
 *                         another user's plot, with "Return to My Farms" CTA
 *   7. Unavailable      — 503 service outage state with retry button
 */

import React, { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  Grid,
  Sprout,
  Edit,
  Trash2,
  RefreshCw,
  WifiOff,
  AlertCircle,
  ShieldAlert,
  ArrowLeft,
  X,
  Plus,
  Calendar,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import {
  AppShell,
  FormField,
  EmptyState,
  ConfirmDialog,
  StatusBadge,
  useToast,
} from "../../design-system";
import {
  fetchPlot,
  updatePlot,
  deletePlot,
  fetchFarm,
  type Plot,
  type Farm,
  type UpdatePlotPayload,
} from "../../api/farms";

import "./farms.scss";

export function PlotDetailsScreen() {
  const { farmId, plotId } = useParams<{ farmId: string; plotId: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  // ─── Data State ─────────────────────────────────────────────────────────────
  const [plot, setPlot] = useState<Plot | null>(null);
  const [parentFarm, setParentFarm] = useState<Farm | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState<boolean>(false);
  const [permissionDenied, setPermissionDenied] = useState<boolean>(false);
  const [notFound, setNotFound] = useState<boolean>(false);

  // ─── Edit Plot Modal State ──────────────────────────────────────────────────
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>("");
  const [editAcres, setEditAcres] = useState<string>("");
  const [formErrors, setFormErrors] = useState<{
    plot_name?: string;
    area_acres?: string;
  }>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // ─── Delete Dialog State ───────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // ─── Fetch Plot & Parent Farm ───────────────────────────────────────────────
  const loadPlotData = async () => {
    if (!plotId) return;

    setLoading(true);
    setFetchError(null);
    setIsUnavailable(false);
    setPermissionDenied(false);
    setNotFound(false);

    // Fetch plot
    const res = await fetchPlot(plotId);
    setLoading(false);

    if (res.error) {
      if (res.status === 403) {
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
      setPlot(res.data.plot);

      // Optionally fetch parent farm details for breadcrumb
      if (farmId) {
        const farmRes = await fetchFarm(farmId);
        if (farmRes.data) {
          setParentFarm(farmRes.data.farm);
        }
      }
    }
  };

  useEffect(() => {
    loadPlotData();
  }, [plotId, farmId]);

  // ─── Modal Handlers ────────────────────────────────────────────────────────
  const openEditModal = () => {
    if (!plot) return;
    setEditName(plot.plot_name);
    setEditAcres(String(plot.area_acres));
    setFormErrors({});
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errs: { plot_name?: string; area_acres?: string } = {};

    if (!editName.trim()) {
      errs.plot_name = "Plot name is required.";
    }

    const acres = parseFloat(editAcres);
    if (!editAcres.trim() || isNaN(acres)) {
      errs.area_acres = "Acreage must be a valid number.";
    } else if (acres <= 0) {
      errs.area_acres = "Acreage must be greater than 0.";
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleUpdatePlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plot || !validateForm()) return;

    setIsSaving(true);
    const payload: UpdatePlotPayload = {
      plot_name: editName.trim(),
      area_acres: parseFloat(editAcres),
    };

    const res = await updatePlot(plot.id, payload);
    setIsSaving(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }

    if (res.data) {
      toast.success("Plot updated successfully.");
      setPlot((prev) => (prev ? { ...prev, ...res.data!.plot } : res.data!.plot));
      closeEditModal();
    }
  };

  // ─── Delete Handler ────────────────────────────────────────────────────────
  const handleDeletePlot = async () => {
    if (!plot) return;

    setIsDeleting(true);
    const res = await deletePlot(plot.id);
    setIsDeleting(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }

    toast.success(`Plot "${plot.plot_name}" deleted.`);
    // Navigate back to parent farm
    if (farmId) {
      navigate(`/farms/${farmId}`, { replace: true });
    } else {
      navigate("/farms", { replace: true });
    }
  };

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
  // UI STATE 6: Permission Denied — Another User's Plot (§12.4, Prompt 12)
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
                You do not have permission to view this plot. It belongs to a farm owned by another user.
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
  // 404 Not Found
  // ───────────────────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <AppShell user={shellUser} onLogout={logout}>
        <div className="farms-page">
          <div className="farms-page__container">
            <div className="farm-permission-card">
              <div className="farm-permission-card__icon" style={{ backgroundColor: "#F3F4F6", color: "#4B5563" }}>
                <Grid size={40} />
              </div>
              <h1 className="farm-permission-card__title">Plot Not Found</h1>
              <p className="farm-permission-card__desc">
                The plot you requested does not exist or may have been deleted.
              </p>
              <div className="farm-permission-card__actions">
                <Link to={farmId ? `/farms/${farmId}` : "/farms"} className="btn btn-primary">
                  <ArrowLeft size={16} /> Back to Farm
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
                <strong>Plot Storage Backend Temporarily Unavailable</strong>
                <p>The agricultural plot service is currently undergoing maintenance. Please retry shortly.</p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline farm-alert__retry-btn"
                onClick={loadPlotData}
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
  // UI STATE 5: Top-Level API Error
  // ───────────────────────────────────────────────────────────────────────────
  if (fetchError) {
    return (
      <AppShell user={shellUser} onLogout={logout}>
        <div className="farms-page">
          <div className="farms-page__container">
            <div className="farm-alert farm-alert--error" role="alert">
              <WifiOff size={24} />
              <div className="farm-alert__content">
                <strong>Failed to load plot details</strong>
                <p>{fetchError}</p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline farm-alert__retry-btn"
                onClick={loadPlotData}
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
  if (loading || !plot) {
    return (
      <AppShell user={shellUser} onLogout={logout}>
        <div className="farms-page" aria-busy="true" aria-label="Loading plot details">
          <div className="farms-page__container">
            <div className="farm-skeleton-grid" style={{ marginBottom: "2rem" }}>
              <div className="farm-skeleton-grid__card" style={{ height: "160px" }} />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UI STATE 3: Success — Plot Details & Cycles
  // ───────────────────────────────────────────────────────────────────────────
  const cycles = plot.crop_cycles || [];

  return (
    <AppShell user={shellUser} onLogout={logout}>
      <div className="farms-page">
        <div className="farms-page__container">

          {/* Breadcrumb Navigation */}
          <nav className="farms-breadcrumb" aria-label="Breadcrumb">
            <Link to="/farms">My Farms</Link>
            <span className="farms-breadcrumb__separator">/</span>
            {farmId && (
              <>
                <Link to={`/farms/${farmId}`}>{parentFarm?.name || "Parent Farm"}</Link>
                <span className="farms-breadcrumb__separator">/</span>
              </>
            )}
            <span className="farms-breadcrumb__current">{plot.plot_name}</span>
          </nav>

          {/* Hero Card */}
          <section className="farm-details-hero" aria-labelledby="plot-heading">
            <div className="farm-details-hero__header">
              <div className="farm-details-hero__title-box">
                <div className="farm-details-hero__icon" aria-hidden="true" style={{ backgroundColor: "#F7F3E8", color: "#6F965A" }}>
                  <Grid size={32} />
                </div>
                <div>
                  <h1 className="farm-details-hero__title" id="plot-heading">
                    {plot.plot_name}
                  </h1>
                  <div className="farm-details-hero__subtitle">
                    {parentFarm && (
                      <span>Part of {parentFarm.name}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  id="btn-edit-plot"
                  className="btn btn-outline btn-sm"
                  onClick={openEditModal}
                >
                  <Edit size={14} /> Edit Plot
                </button>
                <button
                  type="button"
                  id="btn-delete-plot"
                  className="btn btn-outline btn-sm"
                  style={{ color: "#B42318", borderColor: "rgba(180, 35, 24, 0.3)" }}
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 size={14} /> Delete Plot
                </button>
                <Link
                  to={`/crop-cycles?plotId=${plot.id}`}
                  className="btn btn-primary btn-sm"
                >
                  <Plus size={14} /> Start Crop Cycle
                </Link>
              </div>
            </div>

            {/* Plot Attribute Grid */}
            <div className="farm-details-hero__attributes-grid">
              <div className="farm-details-hero__attr">
                <span className="farm-details-hero__attr-label">Plot Area</span>
                <span className="farm-details-hero__attr-value" style={{ fontSize: "1.25rem", color: "#2F5D3A" }}>
                  {plot.area_acres} Acres
                </span>
              </div>
              <div className="farm-details-hero__attr">
                <span className="farm-details-hero__attr-label">Crop Cycles</span>
                <span className="farm-details-hero__attr-value">{cycles.length} Total</span>
              </div>
              <div className="farm-details-hero__attr">
                <span className="farm-details-hero__attr-label">Registered On</span>
                <span className="farm-details-hero__attr-value">
                  {new Date(plot.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="farm-details-hero__attr">
                <span className="farm-details-hero__attr-label">Parent Farm</span>
                <span className="farm-details-hero__attr-value">
                  {farmId ? (
                    <Link to={`/farms/${farmId}`} style={{ color: "#2F5D3A", textDecoration: "underline" }}>
                      {parentFarm?.name || "View Farm"}
                    </Link>
                  ) : (
                    "Registered Farm"
                  )}
                </span>
              </div>
            </div>
          </section>

          {/* Crop Cycles Section */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#263229", display: "flex", alignItems: "center", gap: "8px" }}>
              <Sprout size={20} style={{ color: "#2F5D3A" }} />
              Crop Cycles on this Plot ({cycles.length})
            </h2>
            <Link
              to={`/crop-cycles?plotId=${plot.id}`}
              className="btn btn-primary btn-sm"
            >
              <Plus size={14} /> Start Cycle
            </Link>
          </div>

          {cycles.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "2rem" }}>
              {cycles.map((cycle) => (
                <div
                  key={cycle.id}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #D8DFD2",
                    borderRadius: "12px",
                    padding: "1rem 1.25rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.03)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "8px",
                        background: "#E8F0E3",
                        color: "#2F5D3A",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Sprout size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "1rem", color: "#263229" }}>
                        {cycle.crop_name || "Crop Cycle"}
                      </div>
                      <div style={{ fontSize: "0.8125rem", color: "#5B6E60", display: "flex", alignItems: "center", gap: "6px" }}>
                        <Calendar size={12} />
                        Sown: {new Date(cycle.sowing_date).toLocaleDateString()}
                        {cycle.expected_harvest_date && (
                          <span>· Expected Harvest: {new Date(cycle.expected_harvest_date).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <StatusBadge
                    variant={
                      cycle.status === "active"
                        ? "active"
                        : cycle.status === "harvested"
                        ? "harvested"
                        : "failed"
                    }
                    size="sm"
                  />
                </div>
              ))}
            </div>
          ) : (
            /* ─────────────────────────────────────────────────────────────── */
            /* UI STATE 2: Empty Crop Cycles State                             */
            /* ─────────────────────────────────────────────────────────────── */
            <EmptyState
              title="No Crop Cycles on this Plot Yet"
              description="Start your first crop cycle on this plot to track seed variety, duration to harvest, and daily farming activities."
              icon={Sprout}
              action={
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate(`/crop-cycles?plotId=${plot.id}`)}
                >
                  Start First Crop Cycle
                </button>
              }
            />
          )}

          {/* Edit Plot Modal */}
          {isEditModalOpen && (
            <div
              className="farm-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-edit-plot-title"
            >
              <div className="farm-modal">
                <header className="farm-modal__header">
                  <h2 className="farm-modal__title" id="modal-edit-plot-title">
                    <Edit size={20} style={{ color: "#2F5D3A" }} />
                    Edit Plot
                  </h2>
                  <button
                    type="button"
                    className="farm-modal__close-btn"
                    onClick={closeEditModal}
                    aria-label="Close edit plot modal"
                  >
                    <X size={20} />
                  </button>
                </header>

                <form onSubmit={handleUpdatePlot}>
                  <div className="farm-modal__body">
                    <FormField
                      label="Plot Name / Identifier"
                      id="edit-plot-name"
                      required
                      error={formErrors.plot_name}
                    >
                      <input
                        type="text"
                        id="edit-plot-name"
                        className="input-field"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        disabled={isSaving}
                      />
                    </FormField>

                    <FormField
                      label="Area in Acres"
                      id="edit-plot-acres"
                      required
                      error={formErrors.area_acres}
                    >
                      <input
                        type="number"
                        step="any"
                        id="edit-plot-acres"
                        className="input-field"
                        value={editAcres}
                        onChange={(e) => setEditAcres(e.target.value)}
                        disabled={isSaving}
                      />
                    </FormField>
                  </div>

                  <footer className="farm-modal__footer">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={closeEditModal}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isSaving}
                    >
                      {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </footer>
                </form>
              </div>
            </div>
          )}

          {/* Delete Plot Confirmation Dialog */}
          <ConfirmDialog
            isOpen={showDeleteConfirm}
            title="Delete Plot"
            message={`Are you sure you want to delete "${plot.plot_name}"? All agricultural cycles associated with this plot will be permanently removed.`}
            confirmText={isDeleting ? "Deleting..." : "Delete Plot"}
            variant="danger"
            onConfirm={handleDeletePlot}
            onCancel={() => setShowDeleteConfirm(false)}
          />

        </div>
      </div>
    </AppShell>
  );
}

export default PlotDetailsScreen;
