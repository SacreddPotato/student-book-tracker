import { educationStages, type BookSemester, type EducationStage } from "@app/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useBackend, useI18n, useNotices } from "../../app/AppProviders";
import { useAcademicYear } from "../../app/AcademicYearProvider";
import { Button } from "../../components/ui/Button";
import { DeleteConfirmationDialog } from "../../components/ui/DeleteConfirmationDialog";
import { Alert, EmptyState, LoadingState } from "../../components/ui/Feedback";
import { Field } from "../../components/ui/Field";
import { SelectField } from "../../components/ui/Select";
import type { BookRow } from "../../core/db/repositories/books";
import { AddStockDialog } from "./AddStockDialog";
import { BookEditorSheet } from "./BookEditorSheet";
import { BookInventoryExportDialog } from "./BookInventoryExportDialog";
import { BookTable } from "./BookTable";

const booksKey = ["books"] as const;
type StageFilter = EducationStage | "all";

export function BooksScreen() {
  const backend = useBackend();
  const { language, t } = useI18n();
  const notices = useNotices();
  const queryClient = useQueryClient();
  const { currentYear, years } = useAcademicYear();
  const booksQuery = useQuery({ queryKey: booksKey, queryFn: () => backend.listBooks() });
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<StageFilter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<BookRow | null>(null);
  const [stockTarget, setStockTarget] = useState<{ book: BookRow; semester: BookSemester } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BookRow | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (input: Parameters<typeof backend.saveBooks>[0]) => backend.saveBooks(input),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: booksKey }); setEditorOpen(false); setEditing(null); setEditorError(null); notices.announce(t("feedback.bookSaved")); },
    onError: () => setEditorError(t("errors.save")),
  });
  const deleteMutation = useMutation({
    mutationFn: () => backend.deleteBook(deleteTarget!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: booksKey });
      setDeleteTarget(null);
      notices.announce(t("feedback.bookDeleted"));
    },
    onError: () => notices.announce(t("errors.delete"), "error"),
  });
  const stockMutation = useMutation({
    mutationFn: (input: { quantity: number; receiptNumber: string; receiptDate: string }) => backend.addStock({ academicYear: currentYear!, bookId: stockTarget!.book.id, semester: stockTarget!.semester, ...input }),
    onSuccess: async () => { const name = stockTarget!.book.name; await queryClient.invalidateQueries({ queryKey: booksKey }); setStockTarget(null); setStockError(null); notices.announce(t("books.stockSuccess", { name })); },
    onError: () => setStockError(t("errors.stock")),
  });
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (booksQuery.data ?? []).filter((book) => (stage === "all" || book.educationStage === stage) && (!needle || book.name.toLocaleLowerCase().includes(needle)));
  }, [booksQuery.data, search, stage]);
  const exportOptions = useMemo(() => (booksQuery.data ?? [])
    .map((book) => ({
      id: book.id,
      label: `${book.name} — ${t(`grades.${book.gradeLevel}`)}`,
    }))
    .sort((left, right) => left.label.localeCompare(right.label)), [booksQuery.data, t]);
  const currentAcademicYear = years.find((row) =>
    row.status === "current" && row.academicYear === currentYear) ?? null;
  const zeroCount = filtered.filter(({ firstSemesterQuantity, secondSemesterQuantity }) => firstSemesterQuantity === 0 || secondSemesterQuantity === 0).length;

  async function exportInventory(selectedBookIds: string[]) {
    if (!currentAcademicYear || exporting || !selectedBookIds.length) return;
    setExporting(true);
    setExportError(null);
    try {
      const logs = await backend.listLogs(currentAcademicYear.academicYear);
      const { buildBooksWorkbook, downloadBooksWorkbook } = await import("../../core/export/excel-export");
      const workbook = buildBooksWorkbook({
        books: booksQuery.data ?? [],
        logs,
        academicYear: currentAcademicYear,
        selectedBookIds,
        language,
        translate: (key, values) => t(key as Parameters<typeof t>[0], values),
      });
      await downloadBooksWorkbook(workbook, `book-inventory-audit-${currentAcademicYear.academicYear}.xlsx`);
      setExportOpen(false);
      notices.announce(t("feedback.exportReady"));
    } catch {
      setExportError(t("errors.export"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="books-screen">
      <header className="workspace-heading">
        <div><h2>{t("books.title")}</h2><p>{t("books.description")}</p></div>
        <div className="workspace-heading-actions">
          <Button disabled={!currentAcademicYear || !exportOptions.length} busy={exporting} onClick={() => { setExportError(null); setExportOpen(true); }}><Download size={17} aria-hidden="true" />{t("books.exportInventory")}</Button>
          <Button intent="primary" onClick={() => { setEditing(null); setEditorError(null); setEditorOpen(true); }}><Plus size={17} aria-hidden="true" />{t("books.add")}</Button>
        </div>
      </header>
      <div className="book-summary">
        <div className="book-search"><Search size={17} aria-hidden="true" /><Field label={t("common.search")} value={search} placeholder={t("books.searchPlaceholder")} onChange={(event) => setSearch(event.target.value)} /></div>
        <SelectField label={t("fields.educationStage")} value={stage} options={[{ value: "all", label: t("books.allStages") }, ...educationStages.map((value) => ({ value, label: t(`stages.${value}`) }))]} onValueChange={(value) => setStage(value as StageFilter)} />
        <div className="book-metrics"><span>{t("books.count", { count: filtered.length })}</span><span data-warning={zeroCount > 0 || undefined}>{t("books.zeroCount", { count: zeroCount })}</span></div>
      </div>
      {booksQuery.isError ? <Alert>{t("errors.booksLoad")}</Alert> : booksQuery.isPending ? <LoadingState label={t("common.loading")} /> : filtered.length ? <BookTable books={filtered} onEdit={(book) => { setEditing(book); setEditorError(null); setEditorOpen(true); }} onDelete={setDeleteTarget} onAddStock={(book, semester) => { setStockError(null); setStockTarget({ book, semester }); }} /> : <EmptyState title={(booksQuery.data?.length ?? 0) ? t("books.noResults") : t("books.empty")} />}
      <BookEditorSheet open={editorOpen} book={editing} saving={saveMutation.isPending} error={editorError} onOpenChange={setEditorOpen} onSave={(input) => { if (!saveMutation.isPending) saveMutation.mutate(input); }} />
      <AddStockDialog target={stockTarget} saving={stockMutation.isPending} error={stockError} onOpenChange={(open) => { if (!open) setStockTarget(null); }} onAdd={(input) => { if (!stockMutation.isPending) stockMutation.mutate(input); }} />
      <BookInventoryExportDialog open={exportOpen} options={exportOptions} exporting={exporting} error={exportError} onOpenChange={(open) => { setExportOpen(open); if (!open) setExportError(null); }} onExport={(selectedBookIds) => { void exportInventory(selectedBookIds); }} />
      <DeleteConfirmationDialog open={Boolean(deleteTarget)} title={t("books.deleteTitle")} description={t("books.deleteDescription")} entityName={deleteTarget?.name ?? ""} saving={deleteMutation.isPending} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} onConfirm={() => { if (deleteTarget && !deleteMutation.isPending) deleteMutation.mutate(); }} />
    </section>
  );
}
