import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  MapPin,
  CalendarCheck2,
  CloudSun,
  MoreHorizontal,
} from "lucide-react";
import "./BottomNavigation.scss";

export const BottomNavigation: React.FC = () => {
  return (
    <nav className="bottom-nav" aria-label="Mobile Navigation">
      <NavLink
        to="/dashboard"
        className={({ isActive }) =>
          `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`
        }
      >
        <LayoutDashboard size={20} className="bottom-nav__icon" />
        <span className="bottom-nav__label">Home</span>
      </NavLink>

      <NavLink
        to="/farms"
        className={({ isActive }) =>
          `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`
        }
      >
        <MapPin size={20} className="bottom-nav__icon" />
        <span className="bottom-nav__label">Farms</span>
      </NavLink>

      <NavLink
        to="/activities"
        className={({ isActive }) =>
          `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`
        }
      >
        <CalendarCheck2 size={20} className="bottom-nav__icon" />
        <span className="bottom-nav__label">Activities</span>
      </NavLink>

      <NavLink
        to="/weather"
        className={({ isActive }) =>
          `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`
        }
      >
        <CloudSun size={20} className="bottom-nav__icon" />
        <span className="bottom-nav__label">Weather</span>
      </NavLink>

      <NavLink
        to="/profile"
        className={({ isActive }) =>
          `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`
        }
      >
        <MoreHorizontal size={20} className="bottom-nav__icon" />
        <span className="bottom-nav__label">More</span>
      </NavLink>
    </nav>
  );
};
