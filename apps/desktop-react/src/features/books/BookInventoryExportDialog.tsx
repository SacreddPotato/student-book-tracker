import { useEffect, useId, useState, type FormEvent } from "react";

import { useI18n } from "../../app/AppProviders";
import { Alert } from "../../components/ui/Feedback";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Dialog } from "../../components/ui/Dialog";

export type BookInventoryExportOption = {
  id: string;
  label: string;
};

export type BookInventoryExportDialogProps = {
  open: boolean;
  options: BookInventoryExportOption[];
  exporting: boolean;
  error: string | null;
  onOpenChange(open: boolean): void;
  onExport(selectedBookIds: string[]): void;
};

export function BookInventoryExportDialog({
  open,
  options,
  exporting,
  error,
  onOpenChange,
  onExport,
}: BookInventoryExportDialogProps) {
  const { t } = useI18n();
  const formId = useId();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSelected(new Set(options.map(({ id }) => id)));
  }, [open, options]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!exporting && selected.size) {
      onExport(options.filter(({ id }) => selected.has(id)).map(({ id }) => id));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!exporting) onOpenChange(next); }}
      title={t("books.exportDialogTitle")}
      footer={(
        <>
          <Button type="button" disabled={exporting} onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button type="submit" form={formId} intent="primary" busy={exporting} disabled={!selected.size}>{t("books.exportInventory")}</Button>
        </>
      )}
    >
      <form id={formId} onSubmit={submit}>
        {error ? <Alert>{error}</Alert> : null}
        <fieldset className="book-export-subjects">
          <legend>{t("books.exportSubjects")}</legend>
          {options.map((option) => (
            <Checkbox
              key={option.id}
              label={option.label}
              checked={selected.has(option.id)}
              disabled={exporting}
              onCheckedChange={(checked) => setSelected((current) => {
                const next = new Set(current);
                if (checked) next.add(option.id); else next.delete(option.id);
                return next;
              })}
            />
          ))}
        </fieldset>
      </form>
    </Dialog>
  );
}
