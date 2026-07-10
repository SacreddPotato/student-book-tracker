import { BookCheck } from "lucide-react";

import { useI18n } from "../../app/AppProviders";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Alert, EmptyState, LoadingState } from "../../components/ui/Feedback";
import type { BookRow } from "../../core/db/repositories/books";
import type { StudentRow } from "../../core/db/repositories/students";

export function StudentIssuancePanel({ student, books, issuedBookIds, draftBookIds, loading, saving, error, onToggle, onConfirm }: {
  student: StudentRow | null;
  books: BookRow[];
  issuedBookIds: Set<string>;
  draftBookIds: Set<string>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onToggle(bookId: string, checked: boolean): void;
  onConfirm(): void;
}) {
  const { t } = useI18n();
  if (!student) return <aside className="issuance-panel"><EmptyState title={t("students.selectPrompt")} /></aside>;
  const stageBooks = books.filter((book) => book.educationStage === student.educationStage);

  return (
    <aside className="issuance-panel" aria-label={t("students.bookChecklist")}>
      <div className="issuance-panel-header">
        <div>
          <span className="section-kicker">{t("students.selectedStudent")}</span>
          <h3>{student.name}</h3>
          <p>{t("students.issueDescription")}</p>
        </div>
        <Badge tone={draftBookIds.size ? "info" : "neutral"}>{t("students.draftCount", { count: draftBookIds.size })}</Badge>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {loading ? <LoadingState label={t("common.loading")} /> : stageBooks.length ? (
        <div className="issuance-checklist">
          {stageBooks.map((book) => {
            const issued = issuedBookIds.has(book.id);
            const unavailable = issued || book.quantity <= 0;
            return (
              <Checkbox
                key={book.id}
                label={book.name}
                description={issued ? t("students.issued") : t("students.availableCount", { count: book.quantity })}
                checked={issued || draftBookIds.has(book.id)}
                disabled={unavailable || saving}
                onCheckedChange={(checked) => onToggle(book.id, checked)}
              />
            );
          })}
        </div>
      ) : <EmptyState title={t("students.noStageBooks")} />}
      <div className="issuance-panel-footer">
        <Button intent="primary" busy={saving} disabled={!draftBookIds.size} onClick={onConfirm}>
          <BookCheck size={17} aria-hidden="true" />{t("students.confirmIssue")}
        </Button>
      </div>
    </aside>
  );
}
