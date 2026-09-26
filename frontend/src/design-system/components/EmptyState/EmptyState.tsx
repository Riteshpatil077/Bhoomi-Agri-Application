import React from "react";
import { Sprout, type LucideIcon } from "lucide-react";
import "./EmptyState.scss";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * EmptyState Component (§12.4 & Prompt 9)
 * Used across screens when collections (farms, plots, cycles, activities)
 * have 0 items. Always includes clear context and an actionable button.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Sprout,
  title,
  description,
  action,
  className = "",
}) => {
  return (
    <div className={`empty-state card ${className}`}>
      <div className="empty-state__icon-wrapper">
        <Icon className="empty-state__icon" size={32} aria-hidden="true" />
      </div>
      <h3 className="empty-state__title">{title}</h3>
      <p className="empty-state__description">{description}</p>
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
};
