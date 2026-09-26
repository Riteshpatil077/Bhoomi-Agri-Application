import React from "react";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Activity,
  Check,
  AlertTriangle,
  Calendar,
  AlertCircle,
  ShieldCheck,
  FileEdit,
  type LucideIcon,
} from "lucide-react";
import "./StatusBadge.scss";

export type BadgeVariant =
  | "verified"
  | "pending"
  | "rejected"
  | "active"
  | "harvested"
  | "failed"
  | "due"
  | "overdue"
  | "official"
  | "draft";

interface BadgeConfig {
  defaultLabel: string;
  icon: LucideIcon;
  className: string;
}

const BADGE_CONFIGS: Record<BadgeVariant, BadgeConfig> = {
  verified: {
    defaultLabel: "Verified",
    icon: CheckCircle2,
    className: "badge--verified",
  },
  pending: {
    defaultLabel: "Pending Verification",
    icon: Clock,
    className: "badge--pending",
  },
  rejected: {
    defaultLabel: "Rejected",
    icon: XCircle,
    className: "badge--rejected",
  },
  active: {
    defaultLabel: "Active",
    icon: Activity,
    className: "badge--active",
  },
  harvested: {
    defaultLabel: "Harvested",
    icon: Check,
    className: "badge--harvested",
  },
  failed: {
    defaultLabel: "Failed",
    icon: AlertTriangle,
    className: "badge--failed",
  },
  due: {
    defaultLabel: "Due Soon",
    icon: Calendar,
    className: "badge--due",
  },
  overdue: {
    defaultLabel: "Overdue",
    icon: AlertCircle,
    className: "badge--overdue",
  },
  official: {
    defaultLabel: "Official IMD",
    icon: ShieldCheck,
    className: "badge--official",
  },
  draft: {
    defaultLabel: "Draft",
    icon: FileEdit,
    className: "badge--draft",
  },
};

export interface StatusBadgeProps {
  variant: BadgeVariant;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}

/**
 * StatusBadge Component (§12.5)
 * Statuses MUST NEVER rely on color alone. Each badge displays an icon
 * and explicit label for accessibility and clarity.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  variant,
  label,
  className = "",
  size = "md",
}) => {
  const config = BADGE_CONFIGS[variant];
  const Icon = config.icon;
  const displayText = label || config.defaultLabel;

  return (
    <span
      className={`status-badge ${config.className} status-badge--${size} ${className}`}
      role="status"
    >
      <Icon className="status-badge__icon" aria-hidden="true" size={size === "sm" ? 12 : 14} />
      <span className="status-badge__label">{displayText}</span>
    </span>
  );
};
