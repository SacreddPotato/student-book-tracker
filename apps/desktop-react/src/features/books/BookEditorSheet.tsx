import { educationStages, type EducationStage } from "@app/shared";
import { useEffect, useState, type FormEvent } from "react";

import { useI18n } from "../../app/AppProviders";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Feedback";
import { Field } from "../../components/ui/Field";
import { SelectField } from "../../components/ui/Select";
import { Sheet } from "../../components/ui/Sheet";
import type { BookInput } from "../../core/backend/types";
import type { BookRow } from "../../core/db/repositories/books";

export function BookEditorSheet({ open, book, saving, error, onOpenChange, onSave }: {
  open: boolean; book: BookRow | null; saving: boolean; error: string | null;
  onOpenChange(open: boolean): void; onSave(input: BookInput): void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [stage, setStage] = useState<EducationStage>("primary");
  useEffect(() => {
    if (!open) return;
    setName(book?.name ?? "");
    setStage(book?.educationStage ?? "primary");
  }, [book, open]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) onSave({ id: book?.id, name, educationStage: stage });
  }
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }} title={book ? t("books.edit") : t("books.add")} description={t("books.description")}
      footer={<><Button onClick={() => onOpenChange(false)} disabled={saving}>{t("common.cancel")}</Button><Button type="submit" form="book-editor" intent="primary" busy={saving}>{t("common.save")}</Button></>}>
      <form id="book-editor" className="book-editor" onSubmit={submit}>
        {error ? <Alert>{error}</Alert> : null}
        <Field label={t("fields.bookName")} value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
        <SelectField label={t("fields.educationStage")} value={stage} options={educationStages.map((value) => ({ value, label: t(`stages.${value}`) }))} onValueChange={(value) => setStage(value as EducationStage)} />
      </form>
    </Sheet>
  );
}
