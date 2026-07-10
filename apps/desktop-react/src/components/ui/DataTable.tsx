import type { ReactNode } from "react";

export function DataTable({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="ui-table-frame">
      <table className="ui-table" aria-label={label}>{children}</table>
    </div>
  );
}

export function TableActions({ children }: { children: ReactNode }) {
  return <div className="ui-table-actions">{children}</div>;
}
