import React, { createContext, useContext, useState, useCallback } from "react";
import { Toast, type ToastItem, type ToastType } from "./Toast";

export interface ToastOptions {
  type?: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toast: {
    (options: ToastOptions): string;
    success: (message: string, title?: string) => string;
    error: (message: string, title?: string) => string;
    warning: (message: string, title?: string) => string;
    info: (message: string, title?: string) => string;
  };
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type = "info", title, message, duration = 4000 }: ToastOptions): string => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastItem = { id, type, title, message, duration };
      setToasts((prev) => [...prev, newToast]);
      return id;
    },
    []
  );

  const toastMethods = Object.assign(showToast, {
    success: (message: string, title?: string) =>
      showToast({ type: "success", title, message }),
    error: (message: string, title?: string) =>
      showToast({ type: "error", title, message }),
    warning: (message: string, title?: string) =>
      showToast({ type: "warning", title, message }),
    info: (message: string, title?: string) =>
      showToast({ type: "info", title, message }),
  });

  return (
    <ToastContext.Provider value={{ toast: toastMethods, dismissToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((item) => (
          <Toast key={item.id} toast={item} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
