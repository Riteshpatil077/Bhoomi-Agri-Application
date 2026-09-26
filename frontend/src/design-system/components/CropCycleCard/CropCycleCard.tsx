/**
 * Bhoomi Design System — CropCycleCard Component (§12.3)
 *
 * Displays a single crop cycle summary with status badge, crop name,
 * sowing date, and expected harvest date.
 * Follows Modern Agriculture Skeuomorphism with 3-D card depth and soil-toned palette.
 */

import React from "react";
import { StatusBadge } from "../StatusBadge/StatusBadge";
import type { CropCycle } from "../../../api/cropCycles";
import "./CropCycleCard.scss";

export interface CropCycleCardProps {
  cycle: CropCycle;
  /** Called when the card is clicked for detail navigation */
  onClick?: (cycle: CropCycle) => void;
  /** Called when user requests delete */
  onDelete?: (cycle: CropCycle) => void;
  /** Called when user requests quick-status-change */
  onStatusChange?: (cycle: CropCycle, status: "active" | "harvested" | "failed") => void;
  /** Suppress controls (read-only mode) */
  readOnly?: boolean;
}

const CROP_CATEGORY_ICONS: Record<string, string> = {
  Cereal: "🌾",
  Vegetable: "🥦",
  Fruit: "🍎",
  Pulse: "🫘",
  Oilseed: "🌻",
  Spice: "🌿",
  Cash: "💰",
  default: "🌱",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function daysUntilHarvest(expectedIso: string | null): string | null {
  if (!expectedIso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expectedIso);
  exp.setHours(0, 0, 0, 0);
  const diffMs = exp.getTime() - today.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Harvest today";
  return `${days}d to harvest`;
}

export const CropCycleCard: React.FC<CropCycleCardProps> = ({
  cycle,
  onClick,
  onDelete,
  onStatusChange,
  readOnly = false,
}) => {
  const icon =
    CROP_CATEGORY_ICONS[cycle.category ?? ""] ?? CROP_CATEGORY_ICONS.default;
  const harvestCountdown =
    cycle.status === "active" ? daysUntilHarvest(cycle.expected_harvest_date) : null;
  const isOverdue =
    harvestCountdown !== null && harvestCountdown.includes("overdue");


  return (
    <article
      className={`crop-cycle-card crop-cycle-card--${cycle.status}`}
      onClick={() => onClick?.(cycle)}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${cycle.crop_name ?? "Crop cycle"} — ${cycle.status}`}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(cycle);
        }
      }}
    >
      {/* Icon + heading */}
      <div className="crop-cycle-card__header">
        <span className="crop-cycle-card__icon" aria-hidden="true">
          {icon}
        </span>
        <div className="crop-cycle-card__title-group">
          <h3 className="crop-cycle-card__crop-name">
            {cycle.crop_name ?? "Unknown Crop"}
          </h3>
          {cycle.plot_name && (
            <span className="crop-cycle-card__plot-name">
              📍 {cycle.plot_name}
            </span>
          )}
        </div>
        <div className="crop-cycle-card__badge">
          <StatusBadge variant={cycle.status} />
        </div>
      </div>

      {/* Date row */}
      <dl className="crop-cycle-card__dates">
        <div className="crop-cycle-card__date-item">
          <dt>Sown</dt>
          <dd>{formatDate(cycle.sowing_date)}</dd>
        </div>
        <div className="crop-cycle-card__date-item">
          <dt>{cycle.actual_harvest_date ? "Harvested" : "Expected"}</dt>
          <dd>
            {formatDate(
              cycle.actual_harvest_date ?? cycle.expected_harvest_date
            )}
          </dd>
        </div>
      </dl>

      {/* Harvest countdown */}
      {harvestCountdown && (
        <div
          className={`crop-cycle-card__countdown${isOverdue ? " crop-cycle-card__countdown--overdue" : ""}`}
        >
          ⏱ {harvestCountdown}
        </div>
      )}

      {/* Quick actions */}
      {!readOnly && (
        <div className="crop-cycle-card__actions">
          {cycle.status === "active" && onStatusChange && (
            <>
              <button
                className="crop-cycle-card__action-btn crop-cycle-card__action-btn--harvest"
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(cycle, "harvested");
                }}
                aria-label="Mark as harvested"
              >
                🌾 Harvested
              </button>
              <button
                className="crop-cycle-card__action-btn crop-cycle-card__action-btn--failed"
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(cycle, "failed");
                }}
                aria-label="Mark as failed"
              >
                ✖ Failed
              </button>
            </>
          )}
          {onDelete && (
            <button
              className="crop-cycle-card__action-btn crop-cycle-card__action-btn--delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(cycle);
              }}
              aria-label="Delete crop cycle"
            >
              🗑
            </button>
          )}
        </div>
      )}
    </article>
  );
};
