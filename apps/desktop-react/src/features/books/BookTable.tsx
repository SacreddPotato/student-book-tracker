import { Boxes, Pencil } from "lucide-react";
import type { BookSemester } from "@app/shared";

import { useI18n } from "../../app/AppProviders";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable, TableActions } from "../../components/ui/DataTable";
import type { BookRow } from "../../core/db/repositories/books";

export function BookTable({ books, onEdit, onAddStock }: { books: BookRow[]; onEdit(book: BookRow): void; onAddStock(book: BookRow, semester: BookSemester): void }) {
  const { t } = useI18n();
  return (
    <DataTable label={t("books.title")}><thead><tr>
      <th>{t("fields.bookName")}</th><th>{t("fields.educationStage")}</th><th>{t("semesters.first")}</th><th>{t("semesters.second")}</th><th><span className="sr-only">{t("common.actions")}</span></th>
    </tr></thead><tbody>{books.map((book) => (
      <tr key={book.id} data-empty={book.firstSemesterQuantity === 0 && book.secondSemesterQuantity === 0 || undefined}>
        <td><strong>{book.name}</strong></td><td><Badge>{t(`stages.${book.educationStage}`)}</Badge></td>
        {(["first", "second"] as const).map((semester) => {
          const quantity = semester === "first" ? book.firstSemesterQuantity : book.secondSemesterQuantity;
          return <td className="book-semester-stock" key={semester}>
            <span className="book-quantity">{quantity}</span>
            <Badge tone={quantity > 0 ? "success" : "warning"}>{t(quantity > 0 ? "books.inStock" : "books.outOfStock")}</Badge>
            <Button size="small" intent="quiet" aria-label={t("books.addSemesterStockTo", { semester: t(`semesters.${semester}`).toLocaleLowerCase(), name: book.name })} onClick={() => onAddStock(book, semester)}><Boxes size={16} aria-hidden="true" /></Button>
          </td>;
        })}
        <td><TableActions>
          <Button size="small" intent="quiet" aria-label={`${t("books.edit")} ${book.name}`} onClick={() => onEdit(book)}><Pencil size={16} aria-hidden="true" /></Button>
        </TableActions></td>
      </tr>
    ))}</tbody></DataTable>
  );
}
