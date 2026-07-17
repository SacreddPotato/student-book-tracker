import { useEffect, useId, useState, type FormEvent } from "react";

import { useI18n } from "../../app/AppProviders";
import { Alert } from "../../components/ui/Feedback";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Dialog } from "../../components/ui/Dialog";

export type BookInventoryExportDialogProps = {
  open: boolean;
  subjects: string[];
  exporting: boolean;
  error: string | null;
  onOpenChange(open: boolean): void;
  onExport(selectedSubjects: string[]): void;
};

export function BookInventoryExportDialog({
  open,
  subjects,
  exporting,
  error,
  onOpenChange,
  onExport,
}: BookInventoryExportDialogProps) {
  const { t } = useI18n();
  const formId = useId();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSelected(new Set(subjects));
  }, [open, subjects]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!exporting && selected.size) {
      onExport(subjects.filter((subject) => selected.has(subject)));
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
          {subjects.map((subject) => (
            <Checkbox
              key={subject}
              label={subject}
              checked={selected.has(subject)}
              disabled={exporting}
              onCheckedChange={(checked) => setSelected((current) => {
                const next = new Set(current);
                if (checked) next.add(subject); else next.delete(subject);
                return next;
              })}
            />
          ))}
        </fieldset>
      </form>
    </Dialog>
  );
}
