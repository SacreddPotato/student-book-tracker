import { educationStages, gradeLevelsByStage, type EducationStage, type GradeLevel } from "@app/shared";
import { useEffect, useState, type FormEvent } from "react";

import { useI18n } from "../../app/AppProviders";
import { useAcademicYear } from "../../app/AcademicYearProvider";
import { Alert } from "../../components/ui/Feedback";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { SelectField } from "../../components/ui/Select";
import { Sheet } from "../../components/ui/Sheet";
import type { StudentRow } from "../../core/db/repositories/students";
import type { StudentInput } from "../../core/backend/types";

export function StudentEditorSheet({ open, student, saving, error, onOpenChange, onSave }: {
  open: boolean;
  student: StudentRow | null;
  saving: boolean;
  error: string | null;
  onOpenChange(open: boolean): void;
  onSave(input: StudentInput): void;
}) {
  const { t } = useI18n();
  const { currentYear } = useAcademicYear();
  const [name, setName] = useState("");
  const [governmentId, setGovernmentId] = useState("");
  const [stage, setStage] = useState<EducationStage>("primary");
  const [grade, setGrade] = useState<GradeLevel>("primary1");

  useEffect(() => {
    if (!open) return;
    setName(student?.name ?? "");
    setGovernmentId(student?.governmentId ?? "");
    setStage(student?.educationStage ?? "primary");
    setGrade(student?.gradeLevel ?? "primary1");
  }, [open, student]);

  function changeStage(value: string) {
    const next = value as EducationStage;
    setStage(next);
    setGrade(gradeLevelsByStage[next][0] as GradeLevel);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !governmentId.trim()) return;
    if (!currentYear) return;
    onSave({ id: student?.id, name, governmentId, educationStage: stage, gradeLevel: grade, academicYear: currentYear });
  }

  const stageOptions = educationStages.map((value) => ({ value, label: t(`stages.${value}`) }));
  const gradeOptions = gradeLevelsByStage[stage].map((value) => ({
    value,
    label: t(`grades.${value}`),
  }));

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => { if (!saving) onOpenChange(next); }}
      title={student ? t("students.edit") : t("students.add")}
      description={t("students.description")}
      footer={(
        <>
          <Button type="button" onClick={() => onOpenChange(false)} disabled={saving}>{t("common.cancel")}</Button>
          <Button type="submit" form="student-editor" intent="primary" busy={saving}>{t("common.save")}</Button>
        </>
      )}
    >
      <form id="student-editor" className="student-editor" onSubmit={submit}>
        {error ? <Alert>{error}</Alert> : null}
        <Field label={t("fields.studentName")} value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
        <Field label={t("fields.governmentId")} value={governmentId} onChange={(event) => setGovernmentId(event.target.value)} required />
        <SelectField label={t("fields.educationStage")} value={stage} options={stageOptions} onValueChange={changeStage} />
        <SelectField label={t("fields.gradeLevel")} value={grade} options={gradeOptions} onValueChange={(value) => setGrade(value as GradeLevel)} />
      </form>
    </Sheet>
  );
}
