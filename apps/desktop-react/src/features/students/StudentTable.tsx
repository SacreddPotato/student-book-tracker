import { Pencil, Trash2, UserRoundCheck } from "lucide-react";

import { useI18n } from "../../app/AppProviders";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable, TableActions } from "../../components/ui/DataTable";
import type { StudentRow } from "../../core/db/repositories/students";

export function StudentTable({ students, selectedId, onSelect, onEdit, onDelete, readOnly = false }: {
  students: StudentRow[];
  selectedId: string | null;
  onSelect(student: StudentRow): void;
  onEdit(student: StudentRow): void;
  onDelete(student: StudentRow): void;
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  return (
    <DataTable label={t("students.title")}>
      <thead><tr>
        <th>{t("fields.studentName")}</th>
        <th>{t("fields.governmentId")}</th>
        <th>{t("fields.educationStage")}</th>
        <th>{t("fields.gradeLevel")}</th>
        <th><span className="sr-only">{t("common.actions")}</span></th>
      </tr></thead>
      <tbody>
        {students.map((student) => (
          <tr key={student.id} data-selected={selectedId === student.id || undefined}>
            <td><strong>{student.name}</strong></td>
            <td className="student-government-id">{student.governmentId}</td>
            <td><Badge>{t(`stages.${student.educationStage}`)}</Badge></td>
            <td>{t(`grades.${student.gradeLevel}`)}</td>
            <td>
              <TableActions>
                <Button size="small" intent="quiet" aria-label={`${t("students.select")} ${student.name}`} onClick={() => onSelect(student)}>
                  <UserRoundCheck size={16} aria-hidden="true" />
                </Button>
                {!readOnly ? <Button size="small" intent="quiet" aria-label={`${t("students.edit")} ${student.name}`} onClick={() => onEdit(student)}>
                  <Pencil size={16} aria-hidden="true" />
                </Button> : null}
                {!readOnly ? <Button size="small" intent="quiet" aria-label={`${t("students.delete")} ${student.name}`} onClick={() => onDelete(student)}>
                  <Trash2 size={16} aria-hidden="true" />
                </Button> : null}
              </TableActions>
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
