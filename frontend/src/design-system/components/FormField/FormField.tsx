import React, { useId } from "react";
import { AlertCircle } from "lucide-react";
import "./FormField.scss";

export interface FormFieldProps {
  label: string;
  id?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * FormField Component (§12.1)
 * Wraps inputs, selects, and textareas with standard labels, required asterisks,
 * helper hints, and accessible inline error feedback.
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  id: customId,
  required = false,
  hint,
  error,
  className = "",
  children,
}) => {
  const generatedId = useId();
  const inputId = customId || generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(" ") || undefined;

  // Clone single input element if valid React element to inject id & aria attributes
  let renderedChild = children;
  if (React.isValidElement(children)) {
    const childProps = children.props as Record<string, unknown>;
    renderedChild = React.cloneElement(
      children as React.ReactElement<Record<string, unknown>>,
      {
        id: childProps.id || inputId,
        "aria-describedby": childProps["aria-describedby"] || describedBy,
        "aria-invalid": Boolean(error),
        className: [
          childProps.className,
          error ? "input-field--error" : "",
        ]
          .filter(Boolean)
          .join(" "),
      }
    );
  }

  return (
    <div className={`form-field ${error ? "form-field--has-error" : ""} ${className}`}>
      <div className="form-field__header">
        <label htmlFor={inputId} className="form-field__label">
          {label}
          {required && <span className="form-field__required" aria-hidden="true">*</span>}
        </label>
      </div>

      <div className="form-field__control">{renderedChild}</div>

      {hint && !error && (
        <p id={hintId} className="form-field__hint">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="form-field__error" role="alert">
          <AlertCircle size={14} className="form-field__error-icon" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};
