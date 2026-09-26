/**
 * Bhoomi — CropCycleDetailScreen (Prompt 13, §12.2, §12.4)
 *
 * Full-detail view for a single crop cycle, including:
 *  - Crop info panel (name, category, sowing/harvest dates, status)
 *  - Inline status update controls
 *  - Activity log summary (read-only list, Prompt 14 handles full log screen)
 *  - Delete confirmation
 *
 * 7 mandatory UI states (§12.4):
 *  1. Loading   — full-page skeleton
 *  2. Success   — cycle info + activity list
 *  3. Empty     — no activities (inline)
 *  4. Validation — status-change inline validation (§12.4)
 *  5. API Error  — inline error with retry
 *  6. Permission Denied — 403 guard
 *  7. Unavailable — network down
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Lock, ClipboardList } from "lucide-react";
import {
  AppShell,
  EmptyState,
  ConfirmDialog,
  FormField,
  useToast,
} from "../../design-system";
import {
  fetchCropCycle,
  updateCropCycle,
  deleteCropCycle,
  type CropCycle,
  type ActivityEntry,
} from "../../api/cropCycles";
import "./CropCycleDetailScreen.scss";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso ?? "—";
  }
}

const STATUS_ICONS: Record<CropCycle["status"], string> = {
  active:    "🟢",
  harvested: "🌾",
  failed:    "❌",
};

const STATUS_LABELS: Record<CropCycle["status"], string> = {
  active:    "Active",
  harvested: "Harvested",
  failed:    "Failed",
};

const ACTIVITY_ICONS: Record<string, string> = {
  sowing:      "🌱",
  irrigation:  "💧",
  fertilizing: "🌿",
  spraying:    "🚿",
  weeding:     "✂️",
  harvesting:  "🌾",
  observation: "👁️",
  default:     "📝",
};

// ─── Screen state ─────────────────────────────────────────────────────────────

type ScreenState =
  | { kind: "loading" }
  | { kind: "success"; cycle: CropCycle }
  | { kind: "error"; message: string }
  | { kind: "permission_denied" }
  | { kind: "unavailable" };

// ─── Screen ───────────────────────────────────────────────────────────────────

export function CropCycleDetailScreen() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);

  const [screenState, setScreenState] = useState<ScreenState>({ kind: "loading" });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting]     = useState(false);
  const [isUpdating, setIsUpdating]     = useState(false);
  const [statusError, setStatusError]   = useState("");

  // Harvest date edit
  const [editingHarvest, setEditingHarvest]   = useState(false);
  const [harvestDate, setHarvestDate]         = useState("");
  const [harvestDateError, setHarvestDateError] = useState("");

  // ── Load ────────────────────────────────────────────────────────────────────

  const loadCycle = useCallback(async () => {
    if (!cycleId) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setScreenState({ kind: "loading" });

    try {
      const res = await fetchCropCycle(cycleId);
      if (ctrl.signal.aborted) return;
      if (res.error || !res.data) {
        if (res.status === 403) setScreenState({ kind: "permission_denied" });
        else if (!navigator.onLine || res.status === 503 || res.status === 504)
          setScreenState({ kind: "unavailable" });
        else setScreenState({ kind: "error", message: res.error ?? "Failed to load cycle." });
        return;
      }
      setScreenState({ kind: "success", cycle: res.data.crop_cycle });
      setHarvestDate(res.data.crop_cycle.expected_harvest_date?.slice(0, 10) ?? "");
    } catch (err: unknown) {
      if (ctrl.signal.aborted) return;
      const e = err as { status?: number; message?: string };
      if (e?.status === 403)         setScreenState({ kind: "permission_denied" });
      else if (!navigator.onLine || e?.status === 503 || e?.status === 504)
        setScreenState({ kind: "unavailable" });
      else                           setScreenState({ kind: "error", message: e?.message ?? "Failed to load cycle." });
    }
  }, [cycleId]);

  useEffect(() => {
    loadCycle();
    return () => { abortRef.current?.abort(); };
  }, [loadCycle]);

  // ── Status change ────────────────────────────────────────────────────────────

  const handleStatusChange = useCallback(
    async (newStatus: CropCycle["status"]) => {
      if (screenState.kind !== "success") return;
      setStatusError("");
      if (screenState.cycle.status === newStatus) {
        setStatusError(`Cycle is already ${newStatus}.`);
        return;
      }
      setIsUpdating(true);
      try {
        await updateCropCycle(screenState.cycle.id, { status: newStatus });
        toast.success(`Cycle marked as ${newStatus}.`);
        await loadCycle();
      } catch {
        toast.error("Could not update status.");
      } finally {
        setIsUpdating(false);
      }
    },
    [screenState, loadCycle, toast]
  );

  // ── Update harvest date ──────────────────────────────────────────────────────

  const handleSaveHarvestDate = useCallback(async () => {
    if (screenState.kind !== "success") return;
    setHarvestDateError("");

    if (!harvestDate) {
      setHarvestDateError("Please enter a harvest date.");
      return;
    }
    const sowDate = new Date(screenState.cycle.sowing_date);
    const harDate = new Date(harvestDate);
    if (harDate < sowDate) {
      setHarvestDateError("Harvest date must be after sowing date.");
      return;
    }

    setIsUpdating(true);
    try {
      await updateCropCycle(screenState.cycle.id, {
        expected_harvest_date: harvestDate,
      });
      toast.success("Harvest date updated.");
      setEditingHarvest(false);
      await loadCycle();
    } catch {
      toast.error("Could not update harvest date.");
    } finally {
      setIsUpdating(false);
    }
  }, [screenState, harvestDate, loadCycle, toast]);

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (screenState.kind !== "success") return;
    setIsDeleting(true);
    try {
      await deleteCropCycle(screenState.cycle.id);
      toast.success("Crop cycle deleted.");
      navigate("/crop-cycles");
    } catch {
      toast.error("Could not delete crop cycle.");
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [screenState, navigate, toast]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  const cycle = screenState.kind === "success" ? screenState.cycle : null;

  return (
    <AppShell>
      <div className="ccd-screen">

        {/* ── Back nav ──────────────────────────────────────────────────────── */}
        <nav className="ccd-screen__breadcrumb" aria-label="Breadcrumb">
          <Link to="/crop-cycles" className="ccd-screen__back-link">
            ← All Crop Cycles
          </Link>
          {cycle && (
            <>
              <span className="ccd-screen__breadcrumb-sep" aria-hidden="true">/</span>
              <span className="ccd-screen__breadcrumb-current">{cycle.crop_name}</span>
            </>
          )}
        </nav>

        {/* 1. Loading ─────────────────────────────────────────────────────────── */}
        {screenState.kind === "loading" && (
          <div className="ccd-screen__skeleton-wrap" aria-label="Loading" aria-busy="true">
            <div className="ccd-screen__skeleton ccd-screen__skeleton--header" />
            <div className="ccd-screen__skeleton ccd-screen__skeleton--body" />
            <div className="ccd-screen__skeleton ccd-screen__skeleton--list" />
          </div>
        )}

        {/* 5. API Error ───────────────────────────────────────────────────────── */}
        {screenState.kind === "error" && (
          <div className="ccd-screen__banner ccd-screen__banner--error" role="alert">
            <span>⚠️</span>
            <div>
              <p className="ccd-screen__banner-title">Could not load crop cycle</p>
              <p className="ccd-screen__banner-msg">{screenState.message}</p>
            </div>
            <button id="ccd-retry-btn" className="ccd-screen__retry-btn" onClick={loadCycle}>
              Retry
            </button>
          </div>
        )}

        {/* 6. Permission Denied ──────────────────────────────────────────────── */}
        {screenState.kind === "permission_denied" && (
          <EmptyState
            icon={Lock}
            title="Access denied"
            description="You don't have permission to view this crop cycle."
            action={
              <button className="btn btn-primary" onClick={() => navigate("/crop-cycles")}>
                Back to Crop Cycles
              </button>
            }
          />
        )}

        {/* 7. Unavailable ────────────────────────────────────────────────────── */}
        {screenState.kind === "unavailable" && (
          <div className="ccd-screen__banner ccd-screen__banner--warn" role="alert">
            <span>🌐</span>
            <div>
              <p className="ccd-screen__banner-title">Service unavailable</p>
              <p className="ccd-screen__banner-msg">Check your connection and try again.</p>
            </div>
            <button id="ccd-unavailable-retry-btn" className="ccd-screen__retry-btn" onClick={loadCycle}>
              Retry
            </button>
          </div>
        )}

        {/* 2 & 3. Success ─────────────────────────────────────────────────────── */}
        {screenState.kind === "success" && cycle && (
          <>
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <header className="ccd-screen__header">
              <div className="ccd-screen__crop-icon" aria-hidden="true">
                {getCategoryIcon(cycle.crop?.category ?? cycle.category)}
              </div>
              <div className="ccd-screen__header-text">
                <h1 className="ccd-screen__crop-name">{cycle.crop_name}</h1>
                {cycle.plot_name && (
                  <p className="ccd-screen__plot-ref">
                    📍 {cycle.plot_name}
                  </p>
                )}
                {cycle.crop?.category && (
                  <span className="ccd-screen__category-tag">
                    {cycle.crop.category}
                  </span>
                )}
              </div>

              {/* Status pill */}
              <div
                className={`ccd-screen__status-pill ccd-screen__status-pill--${cycle.status}`}
                aria-label={`Status: ${STATUS_LABELS[cycle.status]}`}
              >
                {STATUS_ICONS[cycle.status]} {STATUS_LABELS[cycle.status]}
              </div>
            </header>

            {/* ── Info grid ──────────────────────────────────────────────────── */}
            <section className="ccd-screen__info-grid" aria-label="Cycle details">
              <InfoCard label="Sowing Date"         value={formatDate(cycle.sowing_date)} />
              <InfoCard
                label="Expected Harvest"
                value={formatDate(cycle.expected_harvest_date)}
                extra={
                  !editingHarvest && cycle.status === "active" ? (
                    <button
                      className="ccd-screen__edit-link"
                      onClick={() => setEditingHarvest(true)}
                      id="ccd-edit-harvest-btn"
                    >
                      Edit
                    </button>
                  ) : undefined
                }
              />
              {cycle.actual_harvest_date && (
                <InfoCard label="Actual Harvest" value={formatDate(cycle.actual_harvest_date)} />
              )}
              {cycle.crop?.typical_duration_days && (
                <InfoCard
                  label="Typical Duration"
                  value={`${cycle.crop.typical_duration_days} days`}
                />
              )}
            </section>

            {/* ── Harvest date edit ───────────────────────────────────────────── */}
            {editingHarvest && (
              <div className="ccd-screen__harvest-edit" role="form" aria-label="Edit harvest date">
                {/* 4. Validation state */}
                <FormField
                  label="Expected Harvest Date"
                  id="ccd-harvest-date"
                  error={harvestDateError}
                  required
                >
                  <input
                    type="date"
                    id="ccd-harvest-date"
                    className="input-field"
                    value={harvestDate}
                    onChange={(e) => {
                      setHarvestDate(e.target.value);
                      setHarvestDateError("");
                    }}
                    min={cycle.sowing_date.slice(0, 10)}
                    disabled={isUpdating}
                  />
                </FormField>
                <div className="ccd-screen__harvest-actions">
                  <button
                    id="ccd-save-harvest-btn"
                    className="btn btn--primary"
                    onClick={handleSaveHarvestDate}
                    disabled={isUpdating}
                  >
                    {isUpdating ? "Saving…" : "Save"}
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() => { setEditingHarvest(false); setHarvestDateError(""); }}
                    disabled={isUpdating}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── Crop description ────────────────────────────────────────────── */}
            {cycle.crop?.description && (
              <section className="ccd-screen__description" aria-label="Crop description">
                <h2 className="ccd-screen__section-title">About {cycle.crop_name}</h2>
                <p className="ccd-screen__description-text">{cycle.crop.description}</p>
              </section>
            )}

            {/* ── Status controls (only for active) ──────────────────────────── */}
            {cycle.status === "active" && (
              <section className="ccd-screen__status-controls" aria-label="Update cycle status">
                <h2 className="ccd-screen__section-title">Update Status</h2>
                {statusError && (
                  <p className="ccd-screen__status-error" role="alert">{statusError}</p>
                )}
                <div className="ccd-screen__status-btn-row">
                  <button
                    id="ccd-mark-harvested-btn"
                    className="ccd-screen__status-btn ccd-screen__status-btn--harvest"
                    onClick={() => handleStatusChange("harvested")}
                    disabled={isUpdating}
                    aria-label="Mark as harvested"
                  >
                    🌾 Mark as Harvested
                  </button>
                  <button
                    id="ccd-mark-failed-btn"
                    className="ccd-screen__status-btn ccd-screen__status-btn--failed"
                    onClick={() => handleStatusChange("failed")}
                    disabled={isUpdating}
                    aria-label="Mark as failed"
                  >
                    ✖ Mark as Failed
                  </button>
                </div>
              </section>
            )}

            {/* ── Activity log summary ────────────────────────────────────────── */}
            <section className="ccd-screen__activities" aria-label="Activity log">
              <h2 className="ccd-screen__section-title">
                Activity Log
                <span className="ccd-screen__activity-count">
                  {cycle.activities?.length ?? 0}
                </span>
              </h2>

              {/* 3. Empty state */}
              {(!cycle.activities || cycle.activities.length === 0) ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No activities logged"
                  description="Activity logs for this crop cycle will appear here. Use the Activities screen to log work."
                  action={
                    <button className="btn btn-outline" onClick={() => navigate("/activities")}>
                      Go to Activities
                    </button>
                  }
                />
              ) : (
                <ol className="ccd-screen__activity-list">
                  {cycle.activities.map((activity) => (
                    <ActivityRow key={activity.id} activity={activity} />
                  ))}
                </ol>
              )}
            </section>

            {/* ── Danger zone ─────────────────────────────────────────────────── */}
            <section className="ccd-screen__danger-zone" aria-label="Danger zone">
              <h2 className="ccd-screen__danger-title">Danger Zone</h2>
              <p className="ccd-screen__danger-desc">
                Deleting this crop cycle will permanently remove all associated activity logs.
                This action cannot be undone.
              </p>
              <button
                id="ccd-delete-btn"
                className="ccd-screen__delete-btn"
                onClick={() => setShowDeleteConfirm(true)}
              >
                🗑 Delete Crop Cycle
              </button>
            </section>

            {/* ── Delete confirm ──────────────────────────────────────────────── */}
            <ConfirmDialog
              isOpen={showDeleteConfirm}
              title="Delete Crop Cycle"
              message={`Permanently delete the "${cycle.crop_name}" crop cycle? All activity logs on this cycle will also be removed.`}
              confirmText="Delete Cycle"
              isLoading={isDeleting}
              variant="danger"
              onConfirm={handleDelete}
              onCancel={() => setShowDeleteConfirm(false)}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}

// ─── Helper sub-components ────────────────────────────────────────────────────

function InfoCard({
  label,
  value,
  extra,
}: {
  label: string;
  value: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="ccd-screen__info-card">
      <dt className="ccd-screen__info-label">{label}</dt>
      <dd className="ccd-screen__info-value">
        {value}
        {extra}
      </dd>
    </div>
  );
}

function ActivityRow({ activity }: { activity: ActivityEntry }) {
  const icon =
    ACTIVITY_ICONS[activity.activity_type.toLowerCase()] ??
    ACTIVITY_ICONS.default;

  return (
    <li className="ccd-screen__activity-row">
      <span className="ccd-screen__activity-icon" aria-hidden="true">{icon}</span>
      <div className="ccd-screen__activity-body">
        <span className="ccd-screen__activity-type">
          {capitalize(activity.activity_type)}
        </span>
        {activity.notes && (
          <span className="ccd-screen__activity-notes">{activity.notes}</span>
        )}
      </div>
      <time className="ccd-screen__activity-date" dateTime={activity.activity_date}>
        {formatDate(activity.activity_date)}
      </time>
    </li>
  );
}

function getCategoryIcon(category?: string | null): string {
  const map: Record<string, string> = {
    Cereal: "🌾", Vegetable: "🥦", Fruit: "🍎",
    Pulse: "🫘", Oilseed: "🌻", Spice: "🌿",
  };
  return map[category ?? ""] ?? "🌱";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
