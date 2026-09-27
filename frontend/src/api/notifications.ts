/** Typed calls to the authenticated in-app notifications API. */
import { api } from "./client";
import { csrfHeaders } from "./csrf";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  channel: "in_app" | "email" | "sms";
  is_read: boolean;
  read_at: string | null;
  data: Record<string, unknown> | null;
  created_at: string | null;
}

export interface NotificationListResponse {
  notifications: AppNotification[];
  total: number;
  page: number;
  per_page: number;
}

export const fetchNotifications = (perPage = 10) =>
  api.get<NotificationListResponse>(`/notifications?page=1&per_page=${perPage}`);

export const fetchUnreadNotificationCount = () =>
  api.get<{ unread_count: number }>("/notifications/unread-count");

export const markNotificationRead = (id: string) =>
  api.patch<{ message: string }>(`/notifications/${id}/read`, {}, csrfHeaders());

export const markAllNotificationsRead = () =>
  api.patch<{ message: string; count: number }>("/notifications/read-all", {}, csrfHeaders());
