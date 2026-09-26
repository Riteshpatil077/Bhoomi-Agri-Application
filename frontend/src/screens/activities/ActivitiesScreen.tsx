/**
 * Bhoomi — ActivitiesScreen (Prompt 14, §12.2, §12.4)
 *
 * Implements the farmer's agricultural activity timeline and logging workflow:
 *  - Master timeline grouped chronologically by date
 *  - Filtering by completion status (All / Due / Completed) and activity type
 *  - Summary metrics strip (Total, Pending, Completed)
 *  - Prominent "Log Activity" modal with cycle selector, type chips, and notes
 *  - Inline Quick-Complete action and Edit/Delete controls
 *
 * All 7 mandatory UI states (§12.4):
 *  1. Loading          — Skeletal shimmers for stats and timeline
 *  2. Empty            — Explanatory empty state with Sprout icon and CTA
 *  3. Success          — Grouped timeline cards with status badges and actions
 *  4. Validation error — Inline field-level errors on modal form
 *  5. API error        — Retryable error alert
 *  6. Permission denied— 403 Access Denied guard
 *  7. Unavailable      — Service offline / 503 outage banner with retry
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  Edit2,
  Lock,
  WifiOff,
  AlertCircle,
  Filter,
} from "lucide-react";
import {
  AppShell,
  EmptyState,
  ConfirmDialog,
  FormField,
  StatusBadge,
  useToast,
} from "../../design-system";
import {
  fetchActivities,
  createActivity,
  updateActivity,
  completeActivity,
  deleteActivity,
  type FarmActivity,
  type ActivityType,
} from "../../api/activities";
import { fetchAllCropCycles, type CropCycle } from "../../api/cropCycles";
import "./ActivitiesScreen.scss";

// ─── Filter Options ──────────────────────────────────────────────────────────

type StatusFilter = "all" | "pending" | "completed";

const TYPE_OPTIONS: { type: ActivityType | "all"; label: string; icon: string }[] = [
  { type: "all", label: "All Types", icon: "🌱" },
  { type: "irrigation", label: "Irrigation", icon: "💧" },
  { type: "fertilizer", label: "Fertilizer", icon: "🧪" },
  { type: "pesticide", label: "Pesticide", icon: "🛡️" },
  { type: "other", label: "Other", icon: "📋" },
];

const TYPE_ICONS: Record<ActivityType, string> = {
  irrigation: "💧",
  fertilizer: "🧪",
  pesticide: "🛡️",
  other: "📋",
};

// ─── Date Helpers ────────────────────────────────────────────────────────────

function formatDayLabel(dateStr: string | null): string {
  if (!dateStr) return "Unscheduled";
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";

    return target.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function isDateOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    return target < today;
  } catch {
    return false;
  }
}

// ─── Screen State ────────────────────────────────────────────────────────────

type ScreenState =
  | { kind: "loading" }
  | { kind: "success"; activities: FarmActivity[] }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "permission_denied" }
  | { kind: "unavailable" };

export function ActivitiesScreen() {
  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);

  // Core state
  const [screenState, setScreenState] = useState<ScreenState>({ kind: "loading" });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<ActivityType | "all">("all");
  const [activeCycles, setActiveCycles] = useState<CropCycle[]>([]);

  // Modal: Log / Edit Activity
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<FarmActivity | null>(null);
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [formType, setFormType] = useState<ActivityType>("irrigation");
  const [formScheduledDate, setFormScheduledDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [formIsCompleted, setFormIsCompleted] = useState(false);
  const [formCompletedDate, setFormCompletedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [formNotes, setFormNotes] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick complete & delete
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [deletingActivity, setDeletingActivity] = useState<FarmActivity | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Load Activities ──────────────────────────────────────────────────────────

  const loadActivities = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setScreenState({ kind: "loading" });

    try {
      const isCompParam =
        statusFilter === "completed"
          ? true
          : statusFilter === "pending"
          ? false
          : undefined;

      const actTypeParam = typeFilter !== "all" ? typeFilter : undefined;

      const res = await fetchActivities({
        is_completed: isCompParam,
        activity_type: actTypeParam,
      });

      if (ctrl.signal.aborted) return;

      if (res.error || !res.data) {
        if (res.status === 403) {
          setScreenState({ kind: "permission_denied" });
        } else if (!navigator.onLine || res.status === 503 || res.status === 504) {
          setScreenState({ kind: "unavailable" });
        } else {
          setScreenState({
            kind: "error",
            message: res.error ?? "Failed to load farm activities.",
          });
        }
        return;
      }

      if (res.data.activities.length === 0) {
        setScreenState({ kind: "empty" });
      } else {
        setScreenState({ kind: "success", activities: res.data.activities });
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
          message: e?.message ?? "Failed to load farm activities.",
        });
      }
    }
  }, [statusFilter, typeFilter]);

  // Load available crop cycles for logging
  const loadCycles = useCallback(async () => {
    try {
      const res = await fetchAllCropCycles();
      if (res.data?.crop_cycles) {
        setActiveCycles(res.data.crop_cycles);
        if (res.data.crop_cycles.length > 0 && !selectedCycleId) {
          setSelectedCycleId(res.data.crop_cycles[0].id);
        }
      }
    } catch {
      // Ignored non-fatal helper
    }
  }, [selectedCycleId]);

  useEffect(() => {
    loadActivities();
    loadCycles();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadActivities, loadCycles]);

  // ── Stats Calculation ────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    if (screenState.kind !== "success") return null;
    const all = screenState.activities;
    const pending = all.filter((a) => !a.is_completed).length;
    const completed = all.filter((a) => a.is_completed).length;
    return { total: all.length, pending, completed };
  }, [screenState]);

  // ── Grouped Timeline ─────────────────────────────────────────────────────────

  const groupedTimeline = useMemo(() => {
    if (screenState.kind !== "success") return [];
    const groups: Record<string, FarmActivity[]> = {};

    screenState.activities.forEach((act) => {
      const dateKey = act.scheduled_date || act.completed_date || "No Date";
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(act);
    });

    return Object.entries(groups).map(([dateKey, items]) => ({
      dateKey,
      dayLabel: formatDayLabel(dateKey === "No Date" ? null : dateKey),
      items,
    }));
  }, [screenState]);

  // ── Modal Actions ────────────────────────────────────────────────────────────

  const openLogModal = () => {
    setEditingActivity(null);
    setFormType("irrigation");
    setFormScheduledDate(new Date().toISOString().slice(0, 10));
    setFormIsCompleted(false);
    setFormCompletedDate(new Date().toISOString().slice(0, 10));
    setFormNotes("");
    setFormErrors({});
    if (activeCycles.length > 0 && !selectedCycleId) {
      setSelectedCycleId(activeCycles[0].id);
    }
    setIsModalOpen(true);
  };

  const openEditModal = (act: FarmActivity) => {
    setEditingActivity(act);
    setSelectedCycleId(act.crop_cycle_id);
    setFormType(act.activity_type);
    setFormScheduledDate(act.scheduled_date ?? new Date().toISOString().slice(0, 10));
    setFormIsCompleted(act.is_completed);
    setFormCompletedDate(act.completed_date ?? new Date().toISOString().slice(0, 10));
    setFormNotes(act.notes ?? "");
    setFormErrors({});
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingActivity(null);
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};

    if (!editingActivity && !selectedCycleId) {
      errs.cycle_id = "Please select a crop cycle.";
    }
    if (!formType) {
      errs.activity_type = "Please select an activity type.";
    }
    if (!formScheduledDate) {
      errs.scheduled_date = "Please enter a scheduled date.";
    }
    if (formIsCompleted && !formCompletedDate) {
      errs.completed_date = "Please enter completion date.";
    }
    if (formNotes.length > 2000) {
      errs.notes = "Notes must not exceed 2000 characters.";
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      if (editingActivity) {
        // Edit existing
        const res = await updateActivity(editingActivity.id, {
          activity_type: formType,
          scheduled_date: formScheduledDate,
          completed_date: formIsCompleted ? formCompletedDate : null,
          notes: formNotes || null,
        });

        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success("Activity updated successfully.");
          closeModal();
          await loadActivities();
        }
      } else {
        // Log new
        const res = await createActivity(selectedCycleId, {
          activity_type: formType,
          scheduled_date: formScheduledDate,
          completed_date: formIsCompleted ? formCompletedDate : null,
          notes: formNotes || null,
        });

        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success("Activity logged successfully.");
          closeModal();
          await loadActivities();
        }
      }
    } catch {
      toast.error("Failed to save activity.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Quick Complete ───────────────────────────────────────────────────────────

  const handleQuickComplete = async (act: FarmActivity) => {
    setCompletingId(act.id);
    try {
      const res = await completeActivity(act.id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Marked ${act.activity_type} as completed!`);
        await loadActivities();
      }
    } catch {
      toast.error("Could not complete activity.");
    } finally {
      setCompletingId(null);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDeleteActivity = async () => {
    if (!deletingActivity) return;
    setIsDeleting(true);
    try {
      const res = await deleteActivity(deletingActivity.id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Activity deleted.");
        setDeletingActivity(null);
        await loadActivities();
      }
    } catch {
      toast.error("Could not delete activity.");
    } finally {
      setIsDeleting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <div className="act-screen">
        {/* Header */}
        <header className="act-screen__header">
          <div className="act-screen__header-text">
            <h1 className="act-screen__title">
              <span aria-hidden="true">🚜</span> Farm Activity Log
            </h1>
            <p className="act-screen__subtitle">
              Plan, schedule, and record essential farm tasks across your crop cycles.
            </p>
          </div>
          <div className="act-screen__header-actions">
            <button
              id="act-log-btn"
              type="button"
              className="btn btn-primary"
              onClick={openLogModal}
              disabled={activeCycles.length === 0 && screenState.kind !== "loading"}
            >
              <Plus size={18} aria-hidden="true" />
              Log Activity
            </button>
          </div>
        </header>

        {/* Summary Stats Strip */}
        {stats && (
          <section className="act-screen__stats" aria-label="Activities summary">
            <div className="act-screen__stat-card">
              <span className="act-screen__stat-card-label">Total Activities</span>
              <span className="act-screen__stat-card-value">{stats.total}</span>
            </div>
            <div className="act-screen__stat-card">
              <span className="act-screen__stat-card-label">Pending / Due</span>
              <span className="act-screen__stat-card-value act-screen__stat-card-value--pending">
                {stats.pending}
              </span>
            </div>
            <div className="act-screen__stat-card">
              <span className="act-screen__stat-card-label">Completed</span>
              <span className="act-screen__stat-card-value act-screen__stat-card-value--completed">
                {stats.completed}
              </span>
            </div>
          </section>
        )}

        {/* Filter Toolbar */}
        <div className="act-screen__toolbar" role="region" aria-label="Filters">
          <div className="act-screen__tabs-row">
            {/* Status Tabs */}
            <div className="act-screen__tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={statusFilter === "all"}
                className={`act-screen__tab ${statusFilter === "all" ? "act-screen__tab--active" : ""}`}
                onClick={() => setStatusFilter("all")}
              >
                All
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={statusFilter === "pending"}
                className={`act-screen__tab ${statusFilter === "pending" ? "act-screen__tab--active" : ""}`}
                onClick={() => setStatusFilter("pending")}
              >
                Due / Pending
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={statusFilter === "completed"}
                className={`act-screen__tab ${statusFilter === "completed" ? "act-screen__tab--active" : ""}`}
                onClick={() => setStatusFilter("completed")}
              >
                Completed
              </button>
            </div>

            {/* Type Chips */}
            <div className="act-screen__chips" aria-label="Activity type filter">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  className={`act-screen__chip ${typeFilter === opt.type ? "act-screen__chip--active" : ""}`}
                  onClick={() => setTypeFilter(opt.type)}
                >
                  <span aria-hidden="true">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 1. Loading State ──────────────────────────────────────────────── */}
        {screenState.kind === "loading" && (
          <div aria-label="Loading activities" aria-busy="true">
            <div className="act-screen__skeleton-header" />
            <div className="act-screen__skeleton-card" />
            <div className="act-screen__skeleton-card" />
            <div className="act-screen__skeleton-card" />
          </div>
        )}

        {/* ── 5. API Error State ────────────────────────────────────────────── */}
        {screenState.kind === "error" && (
          <div className="act-screen__banner act-screen__banner--error" role="alert">
            <AlertCircle size={24} aria-hidden="true" />
            <div>
              <p className="act-screen__banner-title">Could not load activities</p>
              <p className="act-screen__banner-msg">{screenState.message}</p>
            </div>
            <button
              id="act-retry-btn"
              type="button"
              className="act-screen__banner-retry"
              onClick={loadActivities}
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
            description="You do not have permission to view or manage activities on these farms."
          />
        )}

        {/* ── 7. Unavailable State ─────────────────────────────────────────── */}
        {screenState.kind === "unavailable" && (
          <div className="act-screen__banner act-screen__banner--warn" role="alert">
            <WifiOff size={24} aria-hidden="true" />
            <div>
              <p className="act-screen__banner-title">Service Unavailable</p>
              <p className="act-screen__banner-msg">
                Unable to contact the activity service. Please check your network connection.
              </p>
            </div>
            <button
              id="act-unavail-retry-btn"
              type="button"
              className="act-screen__banner-retry"
              onClick={loadActivities}
            >
              Retry
            </button>
          </div>
        )}

        {/* ── 2. Empty State ────────────────────────────────────────────────── */}
        {screenState.kind === "empty" && (
          <EmptyState
            icon={Filter}
            title={
              activeCycles.length === 0
                ? "No Crop Cycles Active"
                : "No Activities Found"
            }
            description={
              activeCycles.length === 0
                ? "You need at least one crop cycle before you can schedule irrigation, fertilizer, or other activities."
                : statusFilter !== "all" || typeFilter !== "all"
                ? "No activities match your current filter settings. Try selecting another filter or type."
                : "Keep track of farm operations by logging your first scheduled task."
            }
            action={
              activeCycles.length === 0 ? (
                <a href="/crop-cycles" className="btn btn-primary">
                  View Crop Cycles
                </a>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={openLogModal}
                >
                  <Plus size={18} aria-hidden="true" />
                  Log First Activity
                </button>
              )
            }
          />
        )}

        {/* ── 3. Success State (Timeline) ───────────────────────────────────── */}
        {screenState.kind === "success" && (
          <div className="act-screen__timeline">
            {groupedTimeline.map((group) => (
              <section key={group.dateKey} className="act-screen__date-group">
                <div className="act-screen__date-header">
                  <Calendar size={18} className="act-screen__date-header-icon" aria-hidden="true" />
                  <span>{group.dayLabel}</span>
                  <span className="act-screen__date-header-badge">
                    {group.items.length} {group.items.length === 1 ? "task" : "tasks"}
                  </span>
                </div>

                {group.items.map((act) => {
                  const overdue = !act.is_completed && isDateOverdue(act.scheduled_date);
                  return (
                    <article
                      key={act.id}
                      className={`act-screen__card ${act.is_completed ? "act-screen__card--completed" : ""}`}
                    >
                      {/* Icon */}
                      <div
                        className={`act-screen__card-icon-wrap act-screen__card-icon-wrap--${act.activity_type}`}
                        aria-hidden="true"
                      >
                        {TYPE_ICONS[act.activity_type] || "📋"}
                      </div>

                      {/* Body */}
                      <div className="act-screen__card-body">
                        <div className="act-screen__card-head">
                          <h3 className="act-screen__card-title">
                            {act.activity_type.charAt(0).toUpperCase() + act.activity_type.slice(1)}
                          </h3>
                          <StatusBadge
                            variant={
                              act.is_completed
                                ? "harvested"
                                : overdue
                                ? "overdue"
                                : "due"
                            }
                            label={
                              act.is_completed
                                ? "Completed"
                                : overdue
                                ? "Overdue"
                                : "Scheduled"
                            }
                            size="sm"
                          />
                        </div>

                        <div className="act-screen__card-meta">
                          {act.crop_name && (
                            <span className="act-screen__card-tag">🌾 {act.crop_name}</span>
                          )}
                          {act.plot_name && (
                            <span className="act-screen__card-tag">📍 {act.plot_name}</span>
                          )}
                          {act.scheduled_date && (
                            <span>
                              <Clock size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                              Scheduled: {act.scheduled_date}
                            </span>
                          )}
                          {act.completed_date && (
                            <span>
                              <CheckCircle2 size={14} style={{ verticalAlign: "middle", marginRight: 4, color: "#2F5D3A" }} />
                              Done: {act.completed_date}
                            </span>
                          )}
                        </div>

                        {act.notes && (
                          <div className="act-screen__card-notes">
                            {act.notes}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="act-screen__card-actions">
                        {!act.is_completed && (
                          <button
                            type="button"
                            className="act-screen__card-complete-btn"
                            onClick={() => handleQuickComplete(act)}
                            disabled={completingId === act.id}
                            aria-label={`Mark ${act.activity_type} completed`}
                          >
                            <CheckCircle2 size={16} aria-hidden="true" />
                            {completingId === act.id ? "Done..." : "Complete"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="act-screen__card-action-btn"
                          onClick={() => openEditModal(act)}
                          aria-label="Edit activity"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          className="act-screen__card-action-btn act-screen__card-action-btn--delete"
                          onClick={() => setDeletingActivity(act)}
                          aria-label="Delete activity"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>
            ))}
          </div>
        )}

        {/* ── 4. Log / Edit Activity Modal (With Validation State) ─────────── */}
        {isModalOpen && (
          <div
            className="act-screen__modal-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isSubmitting) closeModal();
            }}
          >
            <div
              className="act-screen__modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="act-modal-title"
            >
              <header className="act-screen__modal-header">
                <h2 id="act-modal-title" className="act-screen__modal-title">
                  {editingActivity ? "Edit Activity" : "Log Farm Activity"}
                </h2>
                <button
                  type="button"
                  className="act-screen__modal-close"
                  onClick={closeModal}
                  disabled={isSubmitting}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </header>

              <form onSubmit={handleSubmitModal}>
                <div className="act-screen__modal-body">
                  {/* Crop Cycle selector */}
                  {!editingActivity && (
                    <FormField
                      label="Select Crop Cycle"
                      id="act-cycle-select"
                      required
                      error={formErrors.cycle_id}
                      hint="Choose which plot & crop cycle this activity applies to."
                    >
                      <select
                        id="act-cycle-select"
                        className="select-field"
                        value={selectedCycleId}
                        onChange={(e) => setSelectedCycleId(e.target.value)}
                        disabled={isSubmitting}
                      >
                        {activeCycles.length === 0 && (
                          <option value="">No active crop cycles found</option>
                        )}
                        {activeCycles.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.crop_name || "Unknown Crop"} — {c.plot_name || "Plot"} ({c.status})
                          </option>
                        ))}
                      </select>
                    </FormField>
                  )}

                  {/* Activity Type grid */}
                  <FormField
                    label="Activity Type"
                    id="act-type-select"
                    required
                    error={formErrors.activity_type}
                  >
                    <div className="act-screen__type-grid" role="radiogroup">
                      {(["irrigation", "fertilizer", "pesticide", "other"] as ActivityType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          role="radio"
                          aria-checked={formType === t}
                          className={`act-screen__type-btn ${formType === t ? "act-screen__type-btn--active" : ""}`}
                          onClick={() => setFormType(t)}
                        >
                          <span aria-hidden="true">{TYPE_ICONS[t]}</span>
                          <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                        </button>
                      ))}
                    </div>
                  </FormField>

                  {/* Scheduled Date */}
                  <FormField
                    label="Scheduled Date"
                    id="act-scheduled-date"
                    required
                    error={formErrors.scheduled_date}
                  >
                    <input
                      type="date"
                      id="act-scheduled-date"
                      className="input-field"
                      value={formScheduledDate}
                      onChange={(e) => setFormScheduledDate(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </FormField>

                  {/* Completed Checkbox */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
                    <input
                      type="checkbox"
                      id="act-is-completed"
                      checked={formIsCompleted}
                      onChange={(e) => setFormIsCompleted(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    <label htmlFor="act-is-completed" style={{ fontWeight: 600, fontSize: "0.9rem", color: "#263229" }}>
                      Mark this activity as already completed
                    </label>
                  </div>

                  {/* Completed Date (if completed) */}
                  {formIsCompleted && (
                    <FormField
                      label="Completion Date"
                      id="act-completed-date"
                      required
                      error={formErrors.completed_date}
                    >
                      <input
                        type="date"
                        id="act-completed-date"
                        className="input-field"
                        value={formCompletedDate}
                        onChange={(e) => setFormCompletedDate(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </FormField>
                  )}

                  {/* Notes */}
                  <FormField
                    label="Notes / Instructions"
                    id="act-notes"
                    hint="Optional dosage, water quantity, or field observations (max 2000 chars)."
                    error={formErrors.notes}
                  >
                    <textarea
                      id="act-notes"
                      className="textarea-field"
                      rows={3}
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      disabled={isSubmitting}
                      placeholder="e.g. Applied 200L drip irrigation; check soil moisture tomorrow."
                    />
                  </FormField>
                </div>

                <footer className="act-screen__modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={closeModal}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    id="act-submit-btn"
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSubmitting}
                  >
                    {isSubmitting
                      ? "Saving..."
                      : editingActivity
                      ? "Save Changes"
                      : "Record Activity"}
                  </button>
                </footer>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <ConfirmDialog
          isOpen={Boolean(deletingActivity)}
          title="Delete Farm Activity"
          message={`Are you sure you want to delete this ${deletingActivity?.activity_type} activity? This action cannot be undone.`}
          confirmText={isDeleting ? "Deleting..." : "Delete"}
          variant="danger"
          isLoading={isDeleting}
          onConfirm={handleDeleteActivity}
          onCancel={() => setDeletingActivity(null)}
        />
      </div>
    </AppShell>
  );
}

export default ActivitiesScreen;
