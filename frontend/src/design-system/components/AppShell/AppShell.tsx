import React from "react";
import { Link } from "react-router-dom";
import { Bell, ShieldCheck, User } from "lucide-react";
import { Sidebar, type UserSummary } from "../Sidebar/Sidebar";
import { BottomNavigation } from "../BottomNavigation/BottomNavigation";
import { useAuth } from "../../../context/AuthContext";
import "./AppShell.scss";

export interface AppShellProps {
  user?: UserSummary;
  children: React.ReactNode;
  onLogout?: () => void;
  unreadNotificationsCount?: number;
}

/**
 * AppShell Component (§12.1 & Prompt 9)
 * Responsive platform layout shell unifying desktop sidebar,
 * top header, main content surface, and mobile bottom navigation.
 */
export const AppShell: React.FC<AppShellProps> = ({
  user: customUser,
  children,
  onLogout: customOnLogout,
  unreadNotificationsCount = 0,
}) => {
  const auth = useAuth();

  const user: UserSummary | undefined =
    customUser ||
    (auth.user
      ? {
          name: auth.user.full_name,
          phone: auth.user.phone_number,
          role: (auth.user.platform_role === "super_admin"
            ? "super_admin"
            : auth.user.platform_role === "admin"
            ? "admin"
            : "farmer") as "farmer" | "admin" | "super_admin",
          verificationStatus: auth.user.verification_status as
            | "verified"
            | "pending"
            | "rejected"
            | "unverified"
            | undefined,
        }
      : undefined);

  const onLogout = customOnLogout || auth.logout;

  return (
    <div className="app-shell">
      {/* Desktop Sidebar */}
      <Sidebar user={user} onLogout={onLogout} />

      <div className="app-shell__wrapper">
        {/* Top Header Bar */}
        <header className="app-shell__header">
          {/* Mobile brand visible only on <= 768px */}
          <div className="app-shell__mobile-brand">
            <span className="app-shell__brand-icon">🌱</span>
            <span className="app-shell__brand-name">Bhoomi</span>
          </div>

          <div className="app-shell__header-spacer" />

          {/* Quick Header Actions */}
          <div className="app-shell__header-actions">
            {user?.verificationStatus === "verified" && (
              <span className="app-shell__verified-badge" title="Verified Farmer">
                <ShieldCheck size={16} />
                <span className="app-shell__verified-text">Verified</span>
              </span>
            )}

            <button
              type="button"
              className="app-shell__icon-button"
              aria-label={`Notifications, ${unreadNotificationsCount} unread`}
            >
              <Bell size={18} />
              {unreadNotificationsCount > 0 && (
                <span className="app-shell__notification-badge">
                  {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                </span>
              )}
            </button>

            <Link
              to="/profile"
              className="app-shell__profile-link"
              aria-label="User Profile"
            >
              <User size={18} />
            </Link>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="app-shell__main" id="main-content">
          <div className="app-shell__container">{children}</div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
};
