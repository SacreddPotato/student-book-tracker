import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

export const Field = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  hint?: ReactNode;
}>(({ label, error, hint, id, className, ...props }, ref) => {
  const generated = useId();
  const inputId = id ?? generated;
  const messageId = `${inputId}-message`;
  return (
    <div className={["ui-field", className].filter(Boolean).join(" ")}>
      <label htmlFor={inputId}>{label}</label>
      <input
        {...props}
        id={inputId}
        ref={ref}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error || hint ? messageId : undefined}
      />
      {error || hint ? (
        <div id={messageId} className="ui-field-message" data-error={Boolean(error)}>
          {error ?? hint}
        </div>
      ) : null}
    </div>
  );
});
Field.displayName = "Field";
