/**
 * Bhoomi — CropCyclesScreen (Prompt 13, §12.2)
 *
 * Displays all crop cycles owned by the authenticated farmer across all farms/plots.
 * Filter by status (active | harvested | failed | all).
 * Supports inline quick-status changes, delete confirmation, and new cycle creation
 * via a modal that navigates back to the relevant plot page for full context.
 *
 * 7 mandatory UI states (§12.4):
 *  1. Loading   — skeleton grid
 *  2. Empty     — illustration + CTA to create a farm / plot first
 *  3. Success   — grid of CropCycleCards
 *  4. Validation — N/A (no standalone form on this screen)
 *  5. API Error  — inline error banner with retry
 *  6. Permission Denied — 403 guard
 *  7. Unavailable — network/service-down state
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sprout, Lock, Search } from "lucide-react";
import {
  AppShell,
  EmptyState,
  ConfirmDialog,
  useToast,
  CropCycleCard,
} from "../../design-system";
import {
  fetchAllCropCycles,
  updateCropCycle,
  deleteCropCycle,
  type CropCycle,
} from "../../api/cropCycles";
import "./CropCyclesScreen.scss";

// ─── Filter type ──────────────────────────────────────────────────────────────

type StatusFilter = "all" | "active" | "harvested" | "failed";

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all",      label: "All Cycles" },
  { value: "active",   label: "Active" },
  { value: "harvested",label: "Harvested" },
  { value: "failed",   label: "Failed" },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

type ScreenState =
  | { kind: "loading" }
  | { kind: "success"; cycles: CropCycle[] }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "permission_denied" }
  | { kind: "unavailable" };

export function CropCyclesScreen() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [screenState, setScreenState] = useState<ScreenState>({ kind: "loading" });
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery]     = useState("");
  const [deletingCycle, setDeletingCycle] = useState<CropCycle | null>(null);
  const [isDeleting, setIsDeleting]       = useState(false);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadCycles = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setScreenState({ kind: "loading" });

    try {
      const apiFilter = statusFilter !== "all" ? statusFilter : undefined;
      const res = await fetchAllCropCycles(apiFilter);
      if (ctrl.signal.aborted) return;

      if (res.error || !res.data) {
        if (res.status === 403) {
          setScreenState({ kind: "permission_denied" });
        } else if (!navigator.onLine || res.status === 503 || res.status === 504) {
          setScreenState({ kind: "unavailable" });
        } else {
          setScreenState({
            kind: "error",
            message: res.error ?? "Failed to load crop cycles.",
          });
        }
        return;
      }

      if (res.data.crop_cycles.length === 0) {
        setScreenState({ kind: "empty" });
      } else {
        setScreenState({ kind: "success", cycles: res.data.crop_cycles });
      }
    } catch (err: unknown) {
      if (ctrl.signal.aborted) return;
      const e = err as { status?: number; message?: string };
      if (e?.status === 403) {
        setScreenState({ kind: "permission_denied" });
      } else if (!navigator.onLine || e?.status === 503 || e?.status === 504) {
        setScreenState({ kind: "unavailable" });
      } else {
        setScreenState({
          kind: "error",
          message: e?.message ?? "Failed to load crop cycles.",
        });
      }
    }
  }, [statusFilter]);

  useEffect(() => {
    loadCycles();
    return () => { abortRef.current?.abort(); };
  }, [loadCycles]);

  // ── Filtered list ─────────────────────────────────────────────────────────

  const visibleCycles = useMemo(() => {
    if (screenState.kind !== "success") return [];
    const q = searchQuery.trim().toLowerCase();
    return screenState.cycles.filter((c) => {
      if (!q) return true;
      return (
        c.crop_name?.toLowerCase().includes(q) ||
        c.plot_name?.toLowerCase().includes(q) ||
        c.category?.toLowerCase().includes(q)
      );
    });
  }, [screenState, searchQuery]);

  // ── Quick status change ───────────────────────────────────────────────────

  const handleStatusChange = useCallback(
    async (cycle: CropCycle, newStatus: "active" | "harvested" | "failed") => {
      setChangingStatus(cycle.id);
      try {
        await updateCropCycle(cycle.id, { status: newStatus });
        toast.success(`Cycle marked as ${newStatus}.`);
        await loadCycles();
      } catch {
        toast.error("Could not update cycle status.");
      } finally {
        setChangingStatus(null);
      }
    },
    [loadCycles, toast]
  );

  // ── Delete ────────────────────────────────────────────────────────────────

  const confirmDelete = useCallback(async () => {
    if (!deletingCycle) return;
    setIsDeleting(true);
    try {
      await deleteCropCycle(deletingCycle.id);
      toast.success("Crop cycle deleted.");
      setDeletingCycle(null);
      await loadCycles();
    } catch {
      toast.error("Could not delete crop cycle.");
    } finally {
      setIsDeleting(false);
    }
  }, [deletingCycle, loadCycles, toast]);

  // ── Stats (computed from all loaded cycles, not filtered) ─────────────────

  const stats = useMemo(() => {
    if (screenState.kind !== "success") return null;
    const all = screenState.cycles;
    return {
      total:     all.length,
      active:    all.filter((c) => c.status === "active").length,
      harvested: all.filter((c) => c.status === "harvested").length,
      failed:    all.filter((c) => c.status === "failed").length,
    };
  }, [screenState]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <div className="cc-screen">
        {/* ── Page Header ─────────────────────────────────────────────────── */}
        <header className="cc-screen__header">
          <div className="cc-screen__header-text">
            <h1 className="cc-screen__title">
              <span aria-hidden="true">🌾</span> Crop Cycles
            </h1>
            <p className="cc-screen__subtitle">
              Track and manage all planting cycles across your farms.
            </p>
          </div>
        </header>

        {/* ── Stats Strip ─────────────────────────────────────────────────── */}
        {stats && (
          <div className="cc-screen__stats" role="region" aria-label="Summary statistics">
            {[
              { label: "Total Cycles",  value: stats.total,     color: "neutral" },
              { label: "Active",        value: stats.active,    color: "success" },
              { label: "Harvested",     value: stats.harvested, color: "warning" },
              { label: "Failed",        value: stats.failed,    color: "error" },
            ].map((s) => (
              <div
                key={s.label}
                className={`cc-screen__stat cc-screen__stat--${s.color}`}
              >
                <span className="cc-screen__stat-value">{s.value}</span>
                <span className="cc-screen__stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div className="cc-screen__toolbar">
          <div className="cc-screen__filters" role="group" aria-label="Filter by status">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                id={`cc-filter-${opt.value}`}
                className={`cc-screen__filter-btn${statusFilter === opt.value ? " cc-screen__filter-btn--active" : ""}`}
                onClick={() => setStatusFilter(opt.value)}
                aria-pressed={statusFilter === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="cc-screen__search-wrap">
            <label htmlFor="cc-search" className="sr-only">Search crop cycles</label>
            <input
              id="cc-search"
              type="search"
              className="cc-screen__search"
              placeholder="Search by crop, plot…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* ── Main Content ────────────────────────────────────────────────── */}
        <main className="cc-screen__content" aria-live="polite" aria-busy={screenState.kind === "loading"}>

          {/* 1. Loading */}
          {screenState.kind === "loading" && (
            <div className="cc-screen__grid" aria-label="Loading crop cycles">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="cc-screen__skeleton" aria-hidden="true" />
              ))}
            </div>
          )}

          {/* 2. Empty */}
          {screenState.kind === "empty" && (
            <EmptyState
              icon={Sprout}
              title="No crop cycles yet"
              description={
                statusFilter !== "all"
                  ? `No ${statusFilter} crop cycles found. Try changing the filter.`
                  : "Start by creating a farm, adding a plot, and logging your first sowing."
              }
              action={
                statusFilter !== "all" ? (
                  <button className="btn btn-outline" onClick={() => setStatusFilter("all")}>
                    Show all cycles
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={() => navigate("/farms")}>
                    Go to My Farms
                  </button>
                )
              }
            />
          )}

          {/* 5. API Error */}
          {screenState.kind === "error" && (
            <div className="cc-screen__error-banner" role="alert">
              <div className="cc-screen__error-icon">⚠️</div>
              <div>
                <p className="cc-screen__error-title">Could not load crop cycles</p>
                <p className="cc-screen__error-msg">{screenState.message}</p>
              </div>
              <button
                className="cc-screen__retry-btn"
                onClick={loadCycles}
                id="cc-retry-btn"
              >
                Retry
              </button>
            </div>
          )}

          {/* 6. Permission Denied */}
          {screenState.kind === "permission_denied" && (
            <EmptyState
              icon={Lock}
              title="Access denied"
              description="You don't have permission to view crop cycles. Please contact your administrator."
            />
          )}

          {/* 7. Unavailable */}
          {screenState.kind === "unavailable" && (
            <div className="cc-screen__unavailable-banner" role="alert">
              <span className="cc-screen__unavailable-icon">🌐</span>
              <div>
                <p className="cc-screen__error-title">Service unavailable</p>
                <p className="cc-screen__error-msg">
                  Could not reach the server. Check your connection and try again.
                </p>
              </div>
              <button
                className="cc-screen__retry-btn"
                onClick={loadCycles}
                id="cc-unavailable-retry-btn"
              >
                Retry
              </button>
            </div>
          )}

          {/* 3. Success */}
          {screenState.kind === "success" && (
            <>
              {visibleCycles.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="No matching cycles"
                  description={`No crop cycles match "${searchQuery}". Try a different search.`}
                  action={
                    <button className="btn btn-outline" onClick={() => setSearchQuery("")}>
                      Clear search
                    </button>
                  }
                />
              ) : (
                <div className="cc-screen__grid">
                  {visibleCycles.map((cycle) => (
                    <div
                      key={cycle.id}
                      className={changingStatus === cycle.id ? "cc-screen__card-wrap cc-screen__card-wrap--updating" : "cc-screen__card-wrap"}
                    >
                      <CropCycleCard
                        cycle={cycle}
                        onClick={(c) => navigate(`/crop-cycles/${c.id}`)}
                        onDelete={(c) => setDeletingCycle(c)}
                        onStatusChange={handleStatusChange}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>

        {/* ── Delete Confirm ───────────────────────────────────────────────── */}
        <ConfirmDialog
          isOpen={deletingCycle !== null}
          title="Delete Crop Cycle"
          message={`Are you sure you want to delete the "${deletingCycle?.crop_name ?? "crop"}" cycle? All associated activity logs will also be permanently removed.`}
          confirmText="Delete Cycle"
          isLoading={isDeleting}
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeletingCycle(null)}
        />
      </div>
    </AppShell>
  );
}


