import { Boxes, Pencil } from "lucide-react";

import { useI18n } from "../../app/AppProviders";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable, TableActions } from "../../components/ui/DataTable";
import type { BookRow } from "../../core/db/repositories/books";

export function BookTable({ books, onEdit, onAddStock }: { books: BookRow[]; onEdit(book: BookRow): void; onAddStock(book: BookRow): void }) {
  const { t } = useI18n();
  return (
    <DataTable label={t("books.title")}><thead><tr>
      <th>{t("fields.bookName")}</th><th>{t("fields.educationStage")}</th><th>{t("fields.quantity")}</th><th>{t("common.status")}</th><th><span className="sr-only">{t("common.actions")}</span></th>
    </tr></thead><tbody>{books.map((book) => (
      <tr key={book.id} data-empty={book.quantity === 0 || undefined}>
        <td><strong>{book.name}</strong></td><td><Badge>{t(`stages.${book.educationStage}`)}</Badge></td><td className="book-quantity">{book.quantity}</td>
        <td><Badge tone={book.quantity > 0 ? "success" : "warning"}>{t(book.quantity > 0 ? "books.inStock" : "books.outOfStock")}</Badge></td>
        <td><TableActions>
          <Button size="small" intent="quiet" aria-label={`${t("books.addStockTo", { name: book.name })}`} onClick={() => onAddStock(book)}><Boxes size={16} aria-hidden="true" /></Button>
          <Button size="small" intent="quiet" aria-label={`${t("books.edit")} ${book.name}`} onClick={() => onEdit(book)}><Pencil size={16} aria-hidden="true" /></Button>
        </TableActions></td>
      </tr>
    ))}</tbody></DataTable>
  );
}
