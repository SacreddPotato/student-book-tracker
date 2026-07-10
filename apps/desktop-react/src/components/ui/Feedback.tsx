import type { ReactNode } from "react";

export function Alert({ children }: { children: ReactNode }) {
  return <div className="ui-alert" role="alert">{children}</div>;
}

export function EmptyState({ title, description, action }: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty-state">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return <div className="ui-loading" aria-label={label} aria-busy="true"><span className="ui-spinner" /></div>;
}
