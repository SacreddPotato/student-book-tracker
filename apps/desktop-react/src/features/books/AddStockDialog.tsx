import { useEffect, useState, type FormEvent } from "react";

import { useI18n } from "../../app/AppProviders";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Alert } from "../../components/ui/Feedback";
import { Field } from "../../components/ui/Field";
import type { BookRow } from "../../core/db/repositories/books";

export function AddStockDialog({ book, saving, error, onOpenChange, onAdd }: {
  book: BookRow | null; saving: boolean; error: string | null;
  onOpenChange(open: boolean): void; onAdd(quantity: number): void;
}) {
  const { t } = useI18n();
  const [quantity, setQuantity] = useState("");
  useEffect(() => { if (book) setQuantity(""); }, [book]);
  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(quantity);
    if (Number.isInteger(value) && value > 0 && !saving) onAdd(value);
  }
  return (
    <Dialog open={Boolean(book)} onOpenChange={(next) => { if (!saving) onOpenChange(next); }} title={t("books.addStockTo", { name: book?.name ?? "" })}
      description={t("books.description")}
      footer={<><Button onClick={() => onOpenChange(false)} disabled={saving}>{t("common.cancel")}</Button><Button type="submit" form="add-stock" intent="primary" busy={saving}>{t("books.addStock")}</Button></>}>
      <form id="add-stock" className="add-stock-form" onSubmit={submit}>
        {error ? <Alert>{error}</Alert> : null}
        <Field label={t("fields.quantity")} value={quantity} type="number" min="1" step="1" inputMode="numeric" onChange={(event) => setQuantity(event.target.value)} required autoFocus />
      </form>
    </Dialog>
  );
}
