import { RotateCcw } from "lucide-react";

import { useI18n } from "../../app/AppProviders";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import type { LogEntry } from "../../core/backend/types";
import { formatCairoDateTime } from "../../core/i18n";

export function LogCard({ log, onReverse }: { log: LogEntry; onReverse(log: LogEntry): void }) {
  const { language, t } = useI18n();
  const reversed = Boolean(log.reversedByTransactionId) || log.type === "reversal";
  const titleKey = log.type === "stock_increase" ? "logs.stockIncrease" : log.type === "student_issue" ? "logs.studentIssue" : "logs.reversal";
  return (
    <article className="log-card" data-reversal={log.type === "reversal" || undefined}>
      <header className="log-card-header"><div><div className="log-title-line"><h3>{t(titleKey)}</h3>{reversed ? <Badge tone="neutral">{t("logs.alreadyReversed")}</Badge> : null}</div><p>{log.studentName ?? formatCairoDateTime(language, log.occurredAt)}</p></div>
        {!reversed ? <Button size="small" intent="quiet" onClick={() => onReverse(log)}><RotateCcw size={15} aria-hidden="true" />{t("logs.reverse")}</Button> : null}
      </header>
      <div className="log-items">{log.items.map((item) => <div className="log-item" key={item.id}><strong>{item.bookName}</strong><span className={item.quantityDelta > 0 ? "positive-delta" : "negative-delta"}>{item.quantityDelta > 0 ? "+" : ""}{item.quantityDelta}</span><small>{t("logs.quantityAfter", { count: item.quantityAfter })}</small></div>)}</div>
      {log.studentName ? <time>{formatCairoDateTime(language, log.occurredAt)}</time> : null}
    </article>
  );
}
