import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  MapPin,
  Sprout,
  CalendarCheck2,
  CloudSun,
  ShieldCheck,
  User,
  Palette,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import { StatusBadge } from "../StatusBadge/StatusBadge";
import "./Sidebar.scss";

export interface UserSummary {
  name: string;
  phone?: string;
  role: "farmer" | "admin" | "super_admin";
  verificationStatus?: "verified" | "pending" | "rejected" | "unverified";
}

export interface SidebarProps {
  user?: UserSummary;
  onLogout?: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  onLogout,
  className = "",
}) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem("bhoomi_token");
      navigate("/login");
    }
  };

  return (
    <aside className={`sidebar ${className}`} aria-label="Main Navigation">
      {/* Brand Header */}
      <div className="sidebar__brand">
        <div className="sidebar__logo-mark">🌱</div>
        <div className="sidebar__brand-text">
          <span className="sidebar__title">Bhoomi</span>
          <span className="sidebar__tagline">Agri Platform</span>
        </div>
      </div>

      {/* User Card if logged in */}
      {user && (
        <div className="sidebar__user">
          <div className="sidebar__avatar">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="sidebar__user-details">
            <span className="sidebar__user-name">{user.name}</span>
            <div className="sidebar__user-badges">
              <span className="sidebar__role-tag">{user.role}</span>
              {user.verificationStatus === "verified" && (
                <StatusBadge variant="verified" size="sm" label="Verified" />
              )}
              {user.verificationStatus === "pending" && (
                <StatusBadge variant="pending" size="sm" label="Pending" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Sections */}
      <nav className="sidebar__nav">
        <div className="sidebar__section-title">Farm Management</div>
        <ul className="sidebar__menu">
          <li>
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `sidebar__link ${isActive ? "sidebar__link--active" : ""}`
              }
            >
              <LayoutDashboard size={18} className="sidebar__icon" />
              <span>Dashboard</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/farms"
              className={({ isActive }) =>
                `sidebar__link ${isActive ? "sidebar__link--active" : ""}`
              }
            >
              <MapPin size={18} className="sidebar__icon" />
              <span>My Farms</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/crop-cycles"
              className={({ isActive }) =>
                `sidebar__link ${isActive ? "sidebar__link--active" : ""}`
              }
            >
              <Sprout size={18} className="sidebar__icon" />
              <span>Crop Cycles</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/activities"
              className={({ isActive }) =>
                `sidebar__link ${isActive ? "sidebar__link--active" : ""}`
              }
            >
              <CalendarCheck2 size={18} className="sidebar__icon" />
              <span>Activities</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/weather"
              className={({ isActive }) =>
                `sidebar__link ${isActive ? "sidebar__link--active" : ""}`
              }
            >
              <CloudSun size={18} className="sidebar__icon" />
              <span>Weather & Advisory</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/verification"
              className={({ isActive }) =>
                `sidebar__link ${isActive ? "sidebar__link--active" : ""}`
              }
            >
              <ShieldCheck size={18} className="sidebar__icon" />
              <span>Farmer Verification</span>
            </NavLink>
          </li>
        </ul>

        {/* Administration Links (if admin/super_admin or for navigation) */}
        {(user?.role === "admin" || user?.role === "super_admin") && (
          <>
            <div className="sidebar__section-title">Administration</div>
            <ul className="sidebar__menu">
              <li>
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    `sidebar__link ${isActive ? "sidebar__link--active" : ""}`
                  }
                >
                  <ShieldAlert size={18} className="sidebar__icon" />
                  <span>Admin Portal</span>
                </NavLink>
              </li>
              {user?.role === "super_admin" && (
                <li>
                  <NavLink
                    to="/super-admin"
                    className={({ isActive }) =>
                      `sidebar__link ${isActive ? "sidebar__link--active" : ""}`
                    }
                  >
                    <ShieldAlert size={18} className="sidebar__icon" />
                    <span>Super Admin</span>
                  </NavLink>
                </li>
              )}
            </ul>
          </>
        )}

        <div className="sidebar__section-title">System & Tools</div>
        <ul className="sidebar__menu">
          <li>
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `sidebar__link ${isActive ? "sidebar__link--active" : ""}`
              }
            >
              <User size={18} className="sidebar__icon" />
              <span>My Profile</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/style-guide"
              className={({ isActive }) =>
                `sidebar__link ${isActive ? "sidebar__link--active" : ""}`
              }
            >
              <Palette size={18} className="sidebar__icon" />
              <span>Design System Guide</span>
            </NavLink>
          </li>
        </ul>
      </nav>

      {/* Footer / Logout */}
      <div className="sidebar__footer">
        <button
          type="button"
          className="sidebar__logout-btn"
          onClick={handleLogout}
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
