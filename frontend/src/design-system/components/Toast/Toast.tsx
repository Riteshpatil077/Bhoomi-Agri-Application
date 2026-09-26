import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import "./Toast.scss";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const { id, type, title, message, duration = 4000 } = toast;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [id, duration, onDismiss]);

  const Icon = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  }[type];

  return (
    <div className={`toast toast--${type}`} role="alert">
      <Icon className="toast__icon" size={20} aria-hidden="true" />
      <div className="toast__content">
        {title && <h4 className="toast__title">{title}</h4>}
        <p className="toast__message">{message}</p>
      </div>
      <button
        type="button"
        className="toast__close-btn"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
};
