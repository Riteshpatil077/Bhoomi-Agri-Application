import React, { useEffect } from "react";
import { AlertTriangle, HelpCircle, X } from "lucide-react";
import "./ConfirmDialog.scss";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "primary" | "danger";
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * ConfirmDialog Component (§12.1 & Prompt 9)
 * Accessible tactile modal for confirming destructive or significant actions.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "primary",
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isLoading) {
        onCancel();
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onCancel();
      }}
    >
      <div
        className="dialog-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <button
          type="button"
          className="dialog-modal__close-btn"
          onClick={onCancel}
          disabled={isLoading}
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>

        <div className="dialog-modal__header">
          <div
            className={`dialog-modal__icon-badge dialog-modal__icon-badge--${variant}`}
          >
            {variant === "danger" ? (
              <AlertTriangle size={24} aria-hidden="true" />
            ) : (
              <HelpCircle size={24} aria-hidden="true" />
            )}
          </div>
          <h2 id="dialog-title" className="dialog-modal__title">
            {title}
          </h2>
        </div>

        <div className="dialog-modal__body">
          {typeof message === "string" ? <p>{message}</p> : message}
        </div>

        <div className="dialog-modal__footer">
          <button
            type="button"
            className="btn btn-outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn btn-${variant}`}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
