/**
 * Bhoomi Design System — WeatherAdvisoryCard Component (§8, §12.2, §12.5)
 *
 * Displays an agronomic advisory with severity badge (labeled, never color alone),
 * recommendation, external source provenance, and validity window.
 */

import React from "react";
import { AlertTriangle, AlertCircle, Info, ShieldCheck, Clock } from "lucide-react";
import type { AdvisoryRecord } from "../../../api/weather";
import "./WeatherAdvisoryCard.scss";

export interface WeatherAdvisoryCardProps {
  advisory: AdvisoryRecord;
  className?: string;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export const WeatherAdvisoryCard: React.FC<WeatherAdvisoryCardProps> = ({
  advisory,
  className = "",
}) => {
  const { payload, source_name, valid_until, is_valid } = advisory;
  const severity = (payload?.severity || "Medium").toLowerCase() as "high" | "medium" | "low";

  const SeverityIcon =
    severity === "high"
      ? AlertTriangle
      : severity === "low"
      ? Info
      : AlertCircle;

  return (
    <article
      className={`weather-advisory-card weather-advisory-card--${severity} ${
        !is_valid ? "weather-advisory-card--expired" : ""
      } ${className}`}
      aria-label={`Advisory: ${payload?.title || "Agronomic Advisory"}`}
    >
      <div className="weather-advisory-card__header">
        <div className="weather-advisory-card__title-group">
          <span className="weather-advisory-card__icon" aria-hidden="true">
            {severity === "high" ? "🚨" : severity === "low" ? "💡" : "⚠️"}
          </span>
          <h3 className="weather-advisory-card__title">
            {payload?.title || "Agronomic Advisory"}
          </h3>
        </div>

        <div className="weather-advisory-card__badges">
          <span
            className={`weather-advisory-card__severity-badge weather-advisory-card__severity-badge--${severity}`}
          >
            <SeverityIcon size={12} aria-hidden="true" />
            <span>{payload?.severity || "Advisory"} Severity</span>
          </span>
          {!is_valid && (
            <span
              style={{
                fontSize: "0.75rem",
                padding: "2px 8px",
                borderRadius: "9999px",
                background: "#F2F4F7",
                color: "#667085",
                fontWeight: 600,
              }}
            >
              Expired
            </span>
          )}
        </div>
      </div>

      {payload?.recommended_action && (
        <div className="weather-advisory-card__action-box">
          <span className="weather-advisory-card__action-box-label">
            Recommended Agronomic Action
          </span>
          <p style={{ margin: 0 }}>{payload.recommended_action}</p>
        </div>
      )}

      <footer className="weather-advisory-card__footer">
        <div className="weather-advisory-card__source">
          <ShieldCheck size={14} style={{ color: "#2F5D3A" }} aria-hidden="true" />
          <span>Source: {source_name || "Official Ag Extension"}</span>
        </div>
        <div className="weather-advisory-card__validity">
          <Clock size={14} aria-hidden="true" />
          <span>Valid until: {formatDate(valid_until)}</span>
        </div>
      </footer>
    </article>
  );
};
