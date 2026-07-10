import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonIntent = "primary" | "secondary" | "quiet" | "destructive";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  intent?: ButtonIntent;
  size?: "small" | "default";
  busy?: boolean;
}>(({ intent = "secondary", size = "default", busy = false, disabled, children, ...props }, ref) => (
  <button
    {...props}
    ref={ref}
    className={["ui-button", props.className].filter(Boolean).join(" ")}
    data-intent={intent}
    data-size={size}
    aria-busy={busy || undefined}
    disabled={disabled || busy}
  >
    {busy ? <span className="ui-spinner" aria-hidden="true" /> : null}
    {children}
  </button>
));
Button.displayName = "Button";
