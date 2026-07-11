import type { ReactNode } from "react";

export function Badge({ children, tone = "neutral" }: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return <span className="ui-badge" data-tone={tone}>{children}</span>;
}
