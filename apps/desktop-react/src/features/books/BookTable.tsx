import type { BookSemester } from "@app/shared";
import { ChevronDown, Pencil, Plus } from "lucide-react";
import { Fragment, useState } from "react";

import { useI18n } from "../../app/AppProviders";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable, TableActions } from "../../components/ui/DataTable";
import type { BookRow } from "../../core/db/repositories/books";
import { BookHistoryPanel } from "./BookHistoryPanel";

export function BookTable({ books, onEdit, onAddStock }: {
  books: BookRow[];
  onEdit(book: BookRow): void;
  onAddStock(book: BookRow, semester: BookSemester): void;
}) {
  const { t } = useI18n();
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null);
  const toggle = (bookId: string) => setExpandedBookId((current) => current === bookId ? null : bookId);

  return (
    <DataTable label={t("books.title")}><thead><tr>
      <th>{t("fields.bookName")}</th><th>{t("fields.educationStage")}</th><th>{t("semesters.first")}</th><th>{t("semesters.second")}</th><th><span className="sr-only">{t("common.actions")}</span></th>
    </tr></thead><tbody>{books.map((book) => {
      const expanded = expandedBookId === book.id;
      const panelId = `book-history-${book.id}`;
      return <Fragment key={book.id}>
        <tr className="book-row" data-empty={book.firstSemesterQuantity === 0 && book.secondSemesterQuantity === 0 || undefined} data-expanded={expanded || undefined} onClick={() => toggle(book.id)}>
          <td><strong>{book.name}</strong></td><td><Badge>{t(`stages.${book.educationStage}`)}</Badge></td>
          {(["first", "second"] as const).map((semester) => {
            const quantity = semester === "first" ? book.firstSemesterQuantity : book.secondSemesterQuantity;
            return <td className="book-semester-stock" key={semester}>
              <span className="book-quantity">{quantity}</span>
              <Badge tone={quantity > 0 ? "success" : "warning"}>{t(quantity > 0 ? "books.inStock" : "books.outOfStock")}</Badge>
              <Button size="small" intent="quiet" aria-label={t("books.addSemesterStockTo", { semester: t(`semesters.${semester}`).toLocaleLowerCase(), name: book.name })} onClick={(event) => { event.stopPropagation(); onAddStock(book, semester); }}><Plus size={16} aria-hidden="true" /></Button>
            </td>;
          })}
          <td><TableActions>
            <Button size="small" intent="quiet" aria-label={`${t("books.edit")} ${book.name}`} onClick={(event) => { event.stopPropagation(); onEdit(book); }}><Pencil size={16} aria-hidden="true" /></Button>
            <Button size="small" intent="quiet" className="book-history-toggle" aria-label={t(expanded ? "books.historyCollapse" : "books.historyExpand", { name: book.name })} aria-expanded={expanded} aria-controls={panelId} onClick={(event) => { event.stopPropagation(); toggle(book.id); }}><ChevronDown size={17} aria-hidden="true" /></Button>
          </TableActions></td>
        </tr>
        {expanded ? <tr className="book-history-row"><td colSpan={5}><BookHistoryPanel bookId={book.id} panelId={panelId} /></td></tr> : null}
      </Fragment>;
    })}</tbody></DataTable>
  );
}
