import { useEffect, useState, type FormEvent } from "react";
import type { BookSemester } from "@app/shared";

import { useI18n } from "../../app/AppProviders";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Alert } from "../../components/ui/Feedback";
import { Field } from "../../components/ui/Field";
import type { BookRow } from "../../core/db/repositories/books";

export function AddStockDialog({ target, saving, error, onOpenChange, onAdd }: {
  target: { book: BookRow; semester: BookSemester } | null; saving: boolean; error: string | null;
  onOpenChange(open: boolean): void;
  onAdd(input: { quantity: number; receiptNumber: string; receiptDate: string }): void;
}) {
  const { t } = useI18n();
  const [quantity, setQuantity] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  useEffect(() => {
    if (target) { setQuantity(""); setReceiptNumber(""); setReceiptDate(""); }
  }, [target]);
  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(quantity);
    if (Number.isInteger(value) && value > 0 && receiptNumber.trim() && receiptDate && !saving) {
      onAdd({ quantity: value, receiptNumber, receiptDate });
    }
  }
  return (
    <Dialog open={Boolean(target)} onOpenChange={(next) => { if (!saving) onOpenChange(next); }} title={t("books.addSemesterStockTo", { semester: target ? t(`semesters.${target.semester}`).toLocaleLowerCase() : "", name: target?.book.name ?? "" })}
      description={t("books.description")}
      footer={<><Button onClick={() => onOpenChange(false)} disabled={saving}>{t("common.cancel")}</Button><Button type="submit" form="add-stock" intent="primary" busy={saving}>{t("books.addStock")}</Button></>}>
      <form id="add-stock" className="add-stock-form" onSubmit={submit}>
        {error ? <Alert>{error}</Alert> : null}
        <Field label={t("fields.quantity")} value={quantity} type="number" min="1" step="1" inputMode="numeric" onChange={(event) => setQuantity(event.target.value)} required autoFocus />
        <Field label={t("fields.receiptNumber")} value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} required />
        <Field label={t("fields.receiptDate")} value={receiptDate} type="date" onChange={(event) => setReceiptDate(event.target.value)} required />
      </form>
    </Dialog>
  );
}
