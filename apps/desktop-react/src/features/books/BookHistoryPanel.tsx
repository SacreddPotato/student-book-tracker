import { useQuery } from "@tanstack/react-query";

import { useBackend, useI18n } from "../../app/AppProviders";
import { Badge } from "../../components/ui/Badge";
import { Alert, EmptyState, LoadingState } from "../../components/ui/Feedback";
import { formatCairoDateTime } from "../../core/i18n";

export const bookHistoryKey = (bookId: string) => ["books", "history", bookId] as const;

export function BookHistoryPanel({ bookId, panelId }: { bookId: string; panelId: string }) {
  const backend = useBackend();
  const { language, t } = useI18n();
  const history = useQuery({
    queryKey: bookHistoryKey(bookId),
    queryFn: () => backend.listBookHistory(bookId),
  });

  if (history.isPending) return <div id={panelId} className="book-history-panel"><LoadingState label={t("common.loading")} /></div>;
  if (history.isError) return <div id={panelId} className="book-history-panel"><Alert>{t("books.historyError")}</Alert></div>;
  if (!history.data.length) return <div id={panelId} className="book-history-panel"><EmptyState title={t("books.historyEmpty")} /></div>;

  const groups = new Map<string, typeof history.data>();
  for (const event of history.data) {
    groups.set(event.academicYear, [...(groups.get(event.academicYear) ?? []), event]);
  }

  return <div id={panelId} className="book-history-panel">
    {[...groups].map(([academicYear, events]) => <section className="book-history-year" key={academicYear}>
      <h4>{academicYear}</h4>
      <div className="book-history-events">
        {events.map((event) => {
          const title = event.type === "stock_increase"
            ? t("books.historyAdded")
            : event.type === "student_issue"
              ? t("books.historyIssued")
              : t("books.historyReversal");
          const date = event.type === "stock_increase" && event.receiptDate
            ? event.receiptDate
            : formatCairoDateTime(language, event.occurredAt);
          return <article className="book-history-event" key={event.id}>
            <div className="book-history-event-title">
              <strong>{title}</strong>
              <Badge>{t(`semesters.${event.semester}`)}</Badge>
              {event.reversedByTransactionId ? <Badge tone="neutral">{t("books.historyReversed")}</Badge> : null}
            </div>
            <span className={event.quantityDelta >= 0 ? "positive-delta" : "negative-delta"}>
              {event.quantityDelta > 0 ? "+" : ""}{event.quantityDelta}
            </span>
            <small>{t("logs.quantityAfter", { count: event.quantityAfter })}</small>
            <div className="book-history-metadata">
              {event.receiptNumber ? <span>{t("books.historyReceipt", { number: event.receiptNumber })}</span> : null}
              {event.studentName ? <span>{t("books.historyStudent", { name: event.studentName })}</span> : null}
              <time dateTime={event.type === "stock_increase" && event.receiptDate ? event.receiptDate : event.occurredAt}>{date}</time>
            </div>
          </article>;
        })}
      </div>
    </section>)}
  </div>;
}
