import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  MapPin,
  Sprout,
  CalendarCheck2,
  CloudSun,
  MoreHorizontal,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useLanguage } from "../../../i18n/LanguageContext";
import "./BottomNavigation.scss";

export const BottomNavigation: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  if (!user) return null;

  if (user.user_type !== "farmer") {
    return (
      <nav className="bottom-nav" aria-label="Mobile Navigation">
        <NavLink to="/dashboard" className={({ isActive }) => `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`}>
          <LayoutDashboard size={20} className="bottom-nav__icon" />
          <span className="bottom-nav__label">{t("Home")}</span>
        </NavLink>
        {user.platform_role === "admin" && (
          <NavLink to="/admin" className={({ isActive }) => `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`}>
            <ShieldAlert size={20} className="bottom-nav__icon" />
            <span className="bottom-nav__label">{t("Admin Portal")}</span>
          </NavLink>
        )}
        {user.platform_role === "super_admin" && (
          <NavLink to="/super-admin" className={({ isActive }) => `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`}>
            <ShieldAlert size={20} className="bottom-nav__icon" />
            <span className="bottom-nav__label">{t("Governance")}</span>
          </NavLink>
        )}
        <NavLink to="/profile" className={({ isActive }) => `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`}>
          <MoreHorizontal size={20} className="bottom-nav__icon" />
          <span className="bottom-nav__label">{t("Profile")}</span>
        </NavLink>
      </nav>
    );
  }

  return (
    <nav className="bottom-nav" aria-label="Mobile Navigation">
      <NavLink
        to="/dashboard"
        className={({ isActive }) =>
          `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`
        }
      >
        <LayoutDashboard size={20} className="bottom-nav__icon" />
        <span className="bottom-nav__label">{t("Home")}</span>
      </NavLink>

      <NavLink
        to="/farms"
        className={({ isActive }) =>
          `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`
        }
      >
        <MapPin size={20} className="bottom-nav__icon" />
        <span className="bottom-nav__label">{t("Farms")}</span>
      </NavLink>

      <NavLink
        to="/crop-cycles"
        className={({ isActive }) =>
          `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`
        }
      >
        <Sprout size={20} className="bottom-nav__icon" />
        <span className="bottom-nav__label">{t("Crop Cycles")}</span>
      </NavLink>

      <NavLink
        to="/activities"
        className={({ isActive }) =>
          `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`
        }
      >
        <CalendarCheck2 size={20} className="bottom-nav__icon" />
        <span className="bottom-nav__label">{t("Activities")}</span>
      </NavLink>

      <NavLink
        to="/weather"
        className={({ isActive }) =>
          `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`
        }
      >
        <CloudSun size={20} className="bottom-nav__icon" />
        <span className="bottom-nav__label">{t("Weather")}</span>
      </NavLink>

      {(user.platform_role === "admin" || user.platform_role === "super_admin") && (
        <NavLink
          to={user.platform_role === "super_admin" ? "/super-admin" : "/admin"}
          className={({ isActive }) => `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`}
        >
          <ShieldAlert size={20} className="bottom-nav__icon" />
          <span className="bottom-nav__label">{user.platform_role === "super_admin" ? t("Governance") : t("Admin Portal")}</span>
        </NavLink>
      )}

      <NavLink
        to="/profile"
        className={({ isActive }) =>
          `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`
        }
      >
        <MoreHorizontal size={20} className="bottom-nav__icon" />
        <span className="bottom-nav__label">{t("More")}</span>
      </NavLink>
    </nav>
  );
};
