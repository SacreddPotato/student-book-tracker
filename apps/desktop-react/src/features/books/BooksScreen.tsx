import { educationStages, type EducationStage } from "@app/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useBackend, useI18n, useNotices } from "../../app/AppProviders";
import { Button } from "../../components/ui/Button";
import { Alert, EmptyState, LoadingState } from "../../components/ui/Feedback";
import { Field } from "../../components/ui/Field";
import { SelectField } from "../../components/ui/Select";
import type { BookRow } from "../../core/db/repositories/books";
import { AddStockDialog } from "./AddStockDialog";
import { BookEditorSheet } from "./BookEditorSheet";
import { BookTable } from "./BookTable";

const booksKey = ["books"] as const;
type StageFilter = EducationStage | "all";

export function BooksScreen() {
  const backend = useBackend();
  const { t } = useI18n();
  const notices = useNotices();
  const queryClient = useQueryClient();
  const booksQuery = useQuery({ queryKey: booksKey, queryFn: () => backend.listBooks() });
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<StageFilter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<BookRow | null>(null);
  const [stockBook, setStockBook] = useState<BookRow | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (input: Parameters<typeof backend.saveBook>[0]) => backend.saveBook(input),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: booksKey }); setEditorOpen(false); setEditing(null); setEditorError(null); notices.announce(t("feedback.bookSaved")); },
    onError: () => setEditorError(t("errors.save")),
  });
  const stockMutation = useMutation({
    mutationFn: (quantity: number) => backend.addStock({ bookId: stockBook!.id, quantity }),
    onSuccess: async () => { const name = stockBook!.name; await queryClient.invalidateQueries({ queryKey: booksKey }); setStockBook(null); setStockError(null); notices.announce(t("books.stockSuccess", { name })); },
    onError: () => setStockError(t("errors.stock")),
  });
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (booksQuery.data ?? []).filter((book) => (stage === "all" || book.educationStage === stage) && (!needle || book.name.toLocaleLowerCase().includes(needle)));
  }, [booksQuery.data, search, stage]);
  const zeroCount = filtered.filter(({ quantity }) => quantity === 0).length;
  return (
    <section className="books-screen">
      <header className="workspace-heading"><div><h2>{t("books.title")}</h2><p>{t("books.description")}</p></div><Button intent="primary" onClick={() => { setEditing(null); setEditorError(null); setEditorOpen(true); }}><Plus size={17} aria-hidden="true" />{t("books.add")}</Button></header>
      <div className="book-summary">
        <div className="book-search"><Search size={17} aria-hidden="true" /><Field label={t("common.search")} value={search} placeholder={t("books.searchPlaceholder")} onChange={(event) => setSearch(event.target.value)} /></div>
        <SelectField label={t("fields.educationStage")} value={stage} options={[{ value: "all", label: t("books.allStages") }, ...educationStages.map((value) => ({ value, label: t(`stages.${value}`) }))]} onValueChange={(value) => setStage(value as StageFilter)} />
        <div className="book-metrics"><span>{t("books.count", { count: filtered.length })}</span><span data-warning={zeroCount > 0 || undefined}>{t("books.zeroCount", { count: zeroCount })}</span></div>
      </div>
      {booksQuery.isError ? <Alert>{t("errors.booksLoad")}</Alert> : booksQuery.isPending ? <LoadingState label={t("common.loading")} /> : filtered.length ? <BookTable books={filtered} onEdit={(book) => { setEditing(book); setEditorError(null); setEditorOpen(true); }} onAddStock={(book) => { setStockError(null); setStockBook(book); }} /> : <EmptyState title={(booksQuery.data?.length ?? 0) ? t("books.noResults") : t("books.empty")} />}
      <BookEditorSheet open={editorOpen} book={editing} saving={saveMutation.isPending} error={editorError} onOpenChange={setEditorOpen} onSave={(input) => { if (!saveMutation.isPending) saveMutation.mutate(input); }} />
      <AddStockDialog book={stockBook} saving={stockMutation.isPending} error={stockError} onOpenChange={(open) => { if (!open) setStockBook(null); }} onAdd={(quantity) => { if (!stockMutation.isPending) stockMutation.mutate(quantity); }} />
    </section>
  );
}
