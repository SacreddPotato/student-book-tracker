import type { BookSelection, BookSemester } from "@app/shared";
import { BookCheck, ChevronDown } from "lucide-react";
import { useState } from "react";

import { useI18n } from "../../app/AppProviders";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Alert, EmptyState, LoadingState } from "../../components/ui/Feedback";
import type { BookRow } from "../../core/db/repositories/books";
import type { StudentRow } from "../../core/db/repositories/students";

const keyOf = ({ bookId, semester }: BookSelection) => `${bookId}:${semester}`;

export function StudentIssuancePanel({ student, books, issuedSelections, draftSelections, loading, saving, error, readOnly, onToggle, onConfirm }: {
  student: StudentRow | null;
  books: BookRow[];
  issuedSelections: Set<string>;
  draftSelections: Set<string>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  readOnly?: boolean;
  onToggle(selection: BookSelection, checked: boolean): void;
  onConfirm(): void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (!student) return <aside className="issuance-panel"><EmptyState title={t("students.selectPrompt")} /></aside>;
  const stageBooks = books.filter((book) => book.educationStage === student.educationStage);

  return (
    <aside className="issuance-panel" aria-label={t("students.bookChecklist")}>
      <div className="issuance-panel-header">
        <div><span className="section-kicker">{t("students.selectedStudent")}</span><h3>{student.name}</h3><p>{readOnly ? t("academicYears.archiveBanner") : t("students.issueDescription")}</p></div>
        <Badge tone={draftSelections.size ? "info" : "neutral"}>{t("students.draftCount", { count: draftSelections.size })}</Badge>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {loading ? <LoadingState label={t("common.loading")} /> : stageBooks.length ? (
        <div className="issuance-subjects">
          {stageBooks.map((book) => {
            const open = expanded.has(book.id);
            const panelId = `book-semesters-${book.id}`;
            return <section className="issuance-subject" key={book.id}>
              <button type="button" className="issuance-subject-trigger" aria-expanded={open} aria-controls={panelId} onClick={() => setExpanded((current) => { const next = new Set(current); if (open) next.delete(book.id); else next.add(book.id); return next; })}>
                <strong>{book.name}</strong><ChevronDown size={17} aria-hidden="true" />
              </button>
              {open ? <div id={panelId} className="issuance-semesters">
                {(["first", "second"] as const).map((semester: BookSemester) => {
                  const selection = { bookId: book.id, semester };
                  const key = keyOf(selection);
                  const issued = issuedSelections.has(key);
                  const quantity = semester === "first" ? book.firstSemesterQuantity : book.secondSemesterQuantity;
                  return <Checkbox key={semester} label={t(`semesters.${semester}`)} description={issued ? t("students.issued") : t("students.availableCount", { count: quantity })} checked={issued || draftSelections.has(key)} disabled={readOnly || issued || quantity <= 0 || saving} onCheckedChange={(checked) => onToggle(selection, checked)} />;
                })}
              </div> : null}
            </section>;
          })}
        </div>
      ) : <EmptyState title={t("students.noStageBooks")} />}
      {!readOnly ? <div className="issuance-panel-footer"><Button intent="primary" busy={saving} disabled={!draftSelections.size} onClick={onConfirm}><BookCheck size={17} aria-hidden="true" />{t("students.confirmIssue")}</Button></div> : null}
    </aside>
  );
}
