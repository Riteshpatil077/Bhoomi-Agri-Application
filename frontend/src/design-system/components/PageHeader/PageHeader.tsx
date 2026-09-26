import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import "./PageHeader.scss";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  className?: string;
}

/**
 * PageHeader Component (§12.1 & Prompt 9)
 * Consistent page title, breadcrumbs navigation, and action buttons header.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  actions,
  className = "",
}) => {
  return (
    <header className={`page-header ${className}`}>
      <div className="page-header__main">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="page-header__breadcrumbs" aria-label="Breadcrumb">
            <ol>
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <li key={idx} className="page-header__breadcrumb-item">
                    {crumb.href && !isLast ? (
                      <Link to={crumb.href} className="page-header__breadcrumb-link">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        className="page-header__breadcrumb-current"
                        aria-current={isLast ? "page" : undefined}
                      >
                        {crumb.label}
                      </span>
                    )}
                    {!isLast && (
                      <ChevronRight
                        size={14}
                        className="page-header__breadcrumb-sep"
                        aria-hidden="true"
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>

      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
};
