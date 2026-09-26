/**
 * Bhoomi FarmCard Component (§12.2, §12.3)
 *
 * Displays a farm summary in the Modern Agriculture Skeuomorphism system.
 * Shows real backend data: name, soil type, coordinates, and exact plots count.
 * No invented statistics or completion percentages.
 */

import React from "react";
import { Link } from "react-router-dom";
import { Sprout, MapPin, Layers, Edit, Trash2, ArrowRight } from "lucide-react";
import type { Farm } from "../../../api/farms";
import "./FarmCard.scss";

export interface FarmCardProps {
  farm: Farm;
  onEdit?: (farm: Farm) => void;
  onDelete?: (farm: Farm) => void;
}

export const FarmCard: React.FC<FarmCardProps> = ({
  farm,
  onEdit,
  onDelete,
}) => {
  const plotsCount = farm.plots_count ?? farm.plots?.length ?? 0;
  const hasCoordinates = farm.latitude != null && farm.longitude != null;

  return (
    <article className="farm-card" aria-labelledby={`farm-title-${farm.id}`}>
      {/* Visual Top Banner */}
      <div className="farm-card__banner">
        <div className="farm-card__icon-box" aria-hidden="true">
          <Sprout size={24} />
        </div>
        <div className="farm-card__header-content">
          <h3 className="farm-card__title" id={`farm-title-${farm.id}`}>
            <Link to={`/farms/${farm.id}`}>{farm.name}</Link>
          </h3>
          <div className="farm-card__meta">
            {hasCoordinates ? (
              <>
                <MapPin size={12} />
                <span>
                  {farm.latitude?.toFixed(4)}, {farm.longitude?.toFixed(4)}
                </span>
              </>
            ) : (
              <span>Coordinates not set</span>
            )}
          </div>
        </div>
        <div className="farm-card__badge" title="Number of plots registered">
          <Layers size={13} />
          <span>{plotsCount} {plotsCount === 1 ? "Plot" : "Plots"}</span>
        </div>
      </div>

      {/* Body Info */}
      <div className="farm-card__body">
        <div className="farm-card__info-grid">
          <div className="farm-card__info-item">
            <span className="farm-card__info-item-label">Soil Type</span>
            <span className="farm-card__info-item-value">
              {farm.soil_type || "Not specified"}
            </span>
          </div>
          <div className="farm-card__info-item">
            <span className="farm-card__info-item-label">Registered</span>
            <span className="farm-card__info-item-value">
              {new Date(farm.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Card Actions */}
      <footer className="farm-card__actions">
        <div className="btn-group">
          {onEdit && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onEdit(farm)}
              aria-label={`Edit farm ${farm.name}`}
            >
              <Edit size={14} /> Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="btn btn-ghost btn-sm text-danger"
              style={{ color: "#B42318" }}
              onClick={() => onDelete(farm)}
              aria-label={`Delete farm ${farm.name}`}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>

        <Link
          to={`/farms/${farm.id}`}
          className="btn btn-outline btn-sm"
          aria-label={`View details and plots for ${farm.name}`}
        >
          View Plots <ArrowRight size={14} />
        </Link>
      </footer>
    </article>
  );
};
