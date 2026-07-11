import { useState, type FormEvent } from "react";

import { useAcademicYear } from "../../app/AcademicYearProvider";
import { useI18n } from "../../app/AppProviders";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Alert } from "../../components/ui/Feedback";
import { Field } from "../../components/ui/Field";

export function AcademicYearSetupDialog() {
  const { currentYear, loading, initialize } = useAcademicYear();
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try { await initialize(value); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("errors.save")); }
    finally { setSaving(false); }
  }
  return <Dialog open={!loading && !currentYear} onOpenChange={() => {}} title={t("academicYears.setupTitle")} description={t("academicYears.setupDescription")} footer={<Button type="submit" form="academic-year-setup" intent="primary" busy={saving}>{t("academicYears.start")}</Button>}>
    <form id="academic-year-setup" onSubmit={(event) => void submit(event)}>
      {error ? <Alert>{error}</Alert> : null}
      <Field label={t("academicYears.label")} value={value} placeholder="2025-2026" pattern="[0-9]{4}-[0-9]{4}" onChange={(event) => setValue(event.target.value)} required autoFocus />
    </form>
  </Dialog>;
}
