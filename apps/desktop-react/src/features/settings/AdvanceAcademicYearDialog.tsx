import { useEffect, useState, type FormEvent } from "react";

import { useAcademicYear } from "../../app/AcademicYearProvider";
import { useI18n } from "../../app/AppProviders";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Alert } from "../../components/ui/Feedback";
import { Field } from "../../components/ui/Field";

export function AdvanceAcademicYearDialog({ targetYear, open, onOpenChange }: {
  targetYear: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const { advance } = useAcademicYear();
  const { t } = useI18n();
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setConfirmation(""); setError(null); } }, [open]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (confirmation !== targetYear || saving) return;
    setSaving(true);
    try { await advance(targetYear); onOpenChange(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("errors.save")); }
    finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }} title={t("academicYears.advanceTitle")} description={t("academicYears.advanceDescription", { year: targetYear })} footer={<><Button onClick={() => onOpenChange(false)} disabled={saving}>{t("common.cancel")}</Button><Button type="submit" form="advance-academic-year" intent="primary" disabled={confirmation !== targetYear} busy={saving}>{t("academicYears.advanceAction")}</Button></>}>
    <form id="advance-academic-year" onSubmit={(event) => void submit(event)}>
      {error ? <Alert>{error}</Alert> : null}
      <Field label={t("academicYears.confirmLabel", { year: targetYear })} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
    </form>
  </Dialog>;
}
