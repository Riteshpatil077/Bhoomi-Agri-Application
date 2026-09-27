import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Check, CheckCheck, ShieldCheck, User } from "lucide-react";
import { Sidebar, type UserSummary } from "../Sidebar/Sidebar";
import { BottomNavigation } from "../BottomNavigation/BottomNavigation";
import { useAuth } from "../../../context/AuthContext";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "../../../api/notifications";
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
  const navigate = useNavigate();
  const location = useLocation();

  const user: UserSummary | undefined =
    customUser ||
    (auth.user
      ? {
          name: auth.user.full_name,
          phone: auth.user.phone_number,
          role: auth.user.platform_role,
          userType: auth.user.user_type,
          verificationStatus: auth.user.verification_status as
            | "verified"
            | "pending"
            | "rejected"
            | "unverified"
            | undefined,
        }
      : undefined);

  const onLogout = customOnLogout || auth.logout;
  const showBackButton = location.pathname !== "/dashboard";
  const [unreadCount, setUnreadCount] = useState(unreadNotificationsCount);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  const refreshUnreadCount = useCallback(async () => {
    if (!auth.user) return;
    const response = await fetchUnreadNotificationCount();
    if (response.data) setUnreadCount(response.data.unread_count);
  }, [auth.user]);

  const loadNotifications = useCallback(async () => {
    const [listResponse, countResponse] = await Promise.all([
      fetchNotifications(),
      fetchUnreadNotificationCount(),
    ]);
    if (listResponse.data) setNotifications(listResponse.data.notifications);
    else setNotificationError(listResponse.error ?? "Could not load notifications.");
    if (countResponse.data) setUnreadCount(countResponse.data.unread_count);
    setIsLoadingNotifications(false);
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshUnreadCount(), 0);
    const timer = window.setInterval(() => void refreshUnreadCount(), 60_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
    };
  }, [refreshUnreadCount]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => void loadNotifications(), 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, loadNotifications]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!notificationRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const handleMarkRead = async (notification: AppNotification) => {
    if (notification.is_read) return;
    const response = await markNotificationRead(notification.id);
    if (response.error) {
      setNotificationError(response.error);
      return;
    }
    setNotifications((items) => items.map((item) =>
      item.id === notification.id ? { ...item, is_read: true } : item
    ));
    setUnreadCount((count) => Math.max(0, count - 1));
  };

  const handleMarkAllRead = async () => {
    const response = await markAllNotificationsRead();
    if (response.error) {
      setNotificationError(response.error);
      return;
    }
    setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
    setUnreadCount(0);
  };

  const handleBack = () => {
    const historyIndex = window.history.state?.idx;
    if (typeof historyIndex === "number" && historyIndex > 0) navigate(-1);
    else navigate("/dashboard");
  };

  return (
    <div className="app-shell">
      {/* Desktop Sidebar */}
      <Sidebar user={user} onLogout={onLogout} />

      <div className="app-shell__wrapper">
        {/* Top Header Bar */}
        <header className="app-shell__header">
          {showBackButton && (
            <button
              type="button"
              className="app-shell__icon-button app-shell__back-button"
              aria-label="Go back"
              title="Go back"
              onClick={handleBack}
            >
              <ArrowLeft size={18} />
            </button>
          )}

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

            <div className="app-shell__notifications" ref={notificationRef}>
              <button
                type="button"
                className="app-shell__icon-button"
                aria-label={`Notifications, ${unreadCount} unread`}
                aria-expanded={isOpen}
                aria-controls="notification-popover"
                onClick={() => {
                  if (!isOpen) {
                    setIsLoadingNotifications(true);
                    setNotificationError(null);
                  }
                  setIsOpen((open) => !open);
                }}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="app-shell__notification-badge">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {isOpen && (
                <section className="app-shell__notification-popover" id="notification-popover" aria-label="Notifications">
                  <header className="app-shell__notification-header">
                    <div>
                      <h2>Notifications</h2>
                      <span>{unreadCount} unread</span>
                    </div>
                    <button
                      type="button"
                      className="app-shell__mark-all-button"
                      onClick={() => void handleMarkAllRead()}
                      disabled={unreadCount === 0}
                      title="Mark all notifications as read"
                    >
                      <CheckCheck size={15} /> Mark all read
                    </button>
                  </header>
                  {notificationError && <p className="app-shell__notification-error" role="alert">{notificationError}</p>}
                  {isLoadingNotifications ? (
                    <p className="app-shell__notification-state" role="status">Loading notifications…</p>
                  ) : notifications.length === 0 && !notificationError ? (
                    <p className="app-shell__notification-state">You’re all caught up.</p>
                  ) : (
                    <ul className="app-shell__notification-list">
                      {notifications.map((notification) => (
                        <li key={notification.id} className={`app-shell__notification-item${notification.is_read ? " is-read" : " is-unread"}`}>
                          <div className="app-shell__notification-copy">
                            <strong>{notification.title}</strong>
                            <p>{notification.message}</p>
                            {notification.created_at && <time dateTime={notification.created_at}>{new Date(notification.created_at).toLocaleString()}</time>}
                          </div>
                          {!notification.is_read && (
                            <button
                              type="button"
                              className="app-shell__mark-read-button"
                              aria-label={`Mark ${notification.title} as read`}
                              onClick={() => void handleMarkRead(notification)}
                            ><Check size={16} /></button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>

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
