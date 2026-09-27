/**
 * Bhoomi PlotCard Component (§12.2, §12.3)
 *
 * Displays a single agricultural plot within a farm.
 * Surfaces area in acres, active crop cycles, and direct navigation.
 * Adheres to strict "no invented progress bars or stats" rule.
 */

import React from "react";
import { Link } from "react-router-dom";
import { Grid, Sprout, Edit, Trash2, ArrowRight } from "lucide-react";
import type { Plot } from "../../../api/farms";
import "./PlotCard.scss";

export interface PlotCardProps {
  plot: Plot;
  farmId: string;
  onEdit?: (plot: Plot) => void;
  onDelete?: (plot: Plot) => void;
}

export const PlotCard: React.FC<PlotCardProps> = ({
  plot,
  farmId,
  onEdit,
  onDelete,
}) => {
  const activeCycles = plot.active_cycles_count ?? 0;

  return (
    <article className="plot-card" aria-labelledby={`plot-title-${plot.id}`}>
      {/* Banner */}
      <div className="plot-card__banner">
        <div className="plot-card__icon-box" aria-hidden="true">
          <Grid size={20} />
        </div>
        <div className="plot-card__header-content">
          <h3 className="plot-card__title" id={`plot-title-${plot.id}`}>
            <Link to={`/farms/${farmId}/plots/${plot.id}`}>{plot.plot_name}</Link>
          </h3>
        </div>
      </div>

      {/* Body Info */}
      <div className="plot-card__body">
        <div className="plot-card__stats">
          <span className="plot-card__acres-number">{plot.area_acres}</span>
          <span className="plot-card__acres-label">Acres</span>
        </div>
        {plot.area_is_estimated && <span role="status" className="plot-card__estimate-badge">Approximate estimate</span>}

        {/* Real active cycle count */}
        <div
          className={`plot-card__cycles-indicator ${
            activeCycles > 0 ? "plot-card__cycles-indicator--active" : ""
          }`}
        >
          <Sprout size={15} />
          <span>
            {activeCycles > 0
              ? `${activeCycles} Active Crop ${activeCycles === 1 ? "Cycle" : "Cycles"}`
              : "No active crop cycle"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <footer className="plot-card__actions">
        <div className="btn-group">
          {onEdit && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onEdit(plot)}
              aria-label={`Edit plot ${plot.plot_name}`}
            >
              <Edit size={14} /> Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="btn btn-ghost btn-sm text-danger"
              style={{ color: "#B42318" }}
              onClick={() => onDelete(plot)}
              aria-label={`Delete plot ${plot.plot_name}`}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>

        <Link
          to={`/farms/${farmId}/plots/${plot.id}`}
          className="btn btn-outline btn-sm"
          aria-label={`View plot ${plot.plot_name}`}
        >
          View Details <ArrowRight size={14} />
        </Link>
      </footer>
    </article>
  );
};
