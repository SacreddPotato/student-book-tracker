import { educationStages, gradeLevelsByStage, type EducationStage, type GradeLevel } from "@app/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useBackend, useI18n, useNavigation, useNotices } from "../../app/AppProviders";
import { Button } from "../../components/ui/Button";
import { EmptyState, LoadingState, Alert } from "../../components/ui/Feedback";
import { Field } from "../../components/ui/Field";
import { SelectField } from "../../components/ui/Select";
import type { StudentRow } from "../../core/db/repositories/students";
import { DiscardDraftDialog } from "./DiscardDraftDialog";
import { StudentEditorSheet } from "./StudentEditorSheet";
import { StudentIssuancePanel } from "./StudentIssuancePanel";
import { StudentTable } from "./StudentTable";
import { studentKeys, useBooksQuery, useIssuedBooksQuery, useStudentsQuery } from "./student-queries";

type StageFilter = EducationStage | "all";
type GradeFilter = GradeLevel | "all";

export function StudentsScreen() {
  const backend = useBackend();
  const { language, t } = useI18n();
  const navigation = useNavigation();
  const notices = useNotices();
  const queryClient = useQueryClient();
  const studentsQuery = useStudentsQuery();
  const booksQuery = useBooksQuery();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<StageFilter>("all");
  const [grade, setGrade] = useState<GradeFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [discardOpen, setDiscardOpen] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const navigationResolver = useRef<((allowed: boolean) => void) | null>(null);
  const selected = studentsQuery.data?.find(({ id }) => id === selectedId) ?? null;
  const issuedQuery = useIssuedBooksQuery(selectedId);
  const issuedIds = useMemo(() => new Set(issuedQuery.data?.map(({ bookId }) => bookId) ?? []), [issuedQuery.data]);

  useEffect(() => {
    if (!draft.size) {
      navigation.setBlocker(null);
      return;
    }
    navigation.setBlocker(() => new Promise<boolean>((resolve) => {
      navigationResolver.current = resolve;
      setDiscardOpen(true);
    }));
    return () => navigation.setBlocker(null);
  }, [draft.size, navigation]);

  useEffect(() => {
    if (!draft.size) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [draft.size]);

  const saveMutation = useMutation({
    mutationFn: (input: Parameters<typeof backend.saveStudent>[0]) => backend.saveStudent(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: studentKeys.all });
      setEditorOpen(false);
      setEditing(null);
      setEditorError(null);
      notices.announce(t("feedback.studentSaved"));
    },
    onError: () => setEditorError(t("errors.save")),
  });
  const issueMutation = useMutation({
    mutationFn: () => backend.issueBooks({ studentId: selectedId!, bookIds: [...draft] }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studentKeys.books }),
        queryClient.invalidateQueries({ queryKey: studentKeys.issued(selectedId!) }),
      ]);
      setDraft(new Set());
      setIssueError(null);
      notices.announce(t("feedback.booksIssued"));
    },
    onError: () => setIssueError(t("errors.issue")),
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (studentsQuery.data ?? []).filter((student) =>
      (stage === "all" || student.educationStage === stage)
      && (grade === "all" || student.gradeLevel === grade)
      && (!needle || student.name.toLocaleLowerCase().includes(needle) || student.governmentId.includes(needle)));
  }, [grade, search, stage, studentsQuery.data]);

  const gradeOptions = [
    { value: "all", label: t("students.allGrades") },
    ...Object.values(gradeLevelsByStage).flat().map((value) => ({ value, label: t(`grades.${value}`) })),
  ];
  const stageOptions = [
    { value: "all", label: t("students.allStages") },
    ...educationStages.map((value) => ({ value, label: t(`stages.${value}`) })),
  ];

  function selectStudent(student: StudentRow) {
    if (draft.size && student.id !== selectedId) {
      setDiscardOpen(true);
      navigationResolver.current = (allowed) => {
        if (allowed) { setDraft(new Set()); setSelectedId(student.id); }
      };
      return;
    }
    setDraft(new Set());
    setIssueError(null);
    setSelectedId(student.id);
  }

  function editStudent(student: StudentRow) {
    const openEditor = () => {
      setEditing(student);
      setEditorError(null);
      setEditorOpen(true);
    };
    if (draft.size) {
      setDiscardOpen(true);
      navigationResolver.current = (allowed) => { if (allowed) openEditor(); };
      return;
    }
    openEditor();
  }

  function resolveDiscard(allowed: boolean) {
    if (allowed) setDraft(new Set());
    navigationResolver.current?.(allowed);
    navigationResolver.current = null;
    setDiscardOpen(false);
  }

  async function exportGrade() {
    if (grade === "all" || exporting) return;
    setExporting(true);
    try {
      const students = studentsQuery.data ?? [];
      const issuedEntries = await Promise.all(students.filter((item) => item.gradeLevel === grade).map(async (item) => [
        item.id,
        (await backend.listIssuedBooks(item.id)).map(({ bookId }) => bookId),
      ] as const));
      const { buildStudentsWorkbook, downloadStudentsWorkbook } = await import("../../core/export/excel-export");
      const workbook = buildStudentsWorkbook({
        students,
        books: booksQuery.data ?? [],
        gradeLevel: grade,
        language,
        issuedBookIdsByStudentId: Object.fromEntries(issuedEntries),
        translate: (key) => t(key as Parameters<typeof t>[0]),
      });
      await downloadStudentsWorkbook(workbook, `students-${grade}.xlsx`);
      notices.announce(t("feedback.exportReady"));
    } catch {
      notices.announce(t("errors.export"), "error");
    } finally {
      setExporting(false);
    }
  }

  const loading = studentsQuery.isPending || booksQuery.isPending;
  const failed = studentsQuery.isError || booksQuery.isError;
  return (
    <section className="students-screen">
      <header className="workspace-heading">
        <div><h2>{t("students.title")}</h2><p>{t("students.description")}</p></div>
        <div className="workspace-heading-actions">
          <Button disabled={grade === "all"} busy={exporting} onClick={() => void exportGrade()} title={grade === "all" ? t("students.exportHint") : undefined}>
            <Download size={17} aria-hidden="true" />{t("students.export")}
          </Button>
          <Button intent="primary" onClick={() => { setEditing(null); setEditorError(null); setEditorOpen(true); }}>
            <Plus size={17} aria-hidden="true" />{t("students.add")}
          </Button>
        </div>
      </header>
      <div className="student-filters">
        <div className="student-search"><Search size={17} aria-hidden="true" /><Field label={t("common.search")} value={search} placeholder={t("students.searchPlaceholder")} onChange={(event) => setSearch(event.target.value)} /></div>
        <SelectField label={t("fields.educationStage")} value={stage} options={stageOptions} onValueChange={(value) => { setStage(value as StageFilter); if (value !== "all" && grade !== "all" && !(gradeLevelsByStage[value as EducationStage] as readonly string[]).includes(grade)) setGrade("all"); }} />
        <SelectField label={t("fields.gradeLevel")} value={grade} options={gradeOptions} onValueChange={(value) => setGrade(value as GradeFilter)} />
        <span className="student-result-count">{t("students.count", { count: filtered.length })}</span>
      </div>
      {failed ? <Alert>{t("errors.studentsLoad")}</Alert> : loading ? <LoadingState label={t("common.loading")} /> : !(studentsQuery.data?.length) ? <EmptyState title={t("students.empty")} /> : (
        <div className="students-layout">
          <div className="student-table-region">
            {filtered.length ? <StudentTable students={filtered} selectedId={selectedId} onSelect={selectStudent} onEdit={editStudent} />
              : <EmptyState title={t("students.noResults")} />}
          </div>
          <StudentIssuancePanel
            student={selected}
            books={booksQuery.data ?? []}
            issuedBookIds={issuedIds}
            draftBookIds={draft}
            loading={issuedQuery.isPending && Boolean(selectedId)}
            saving={issueMutation.isPending}
            error={issueError}
            onToggle={(bookId, checked) => setDraft((current) => { const next = new Set(current); if (checked) next.add(bookId); else next.delete(bookId); return next; })}
            onConfirm={() => { if (draft.size && !issueMutation.isPending) issueMutation.mutate(); }}
          />
        </div>
      )}
      <StudentEditorSheet open={editorOpen} student={editing} saving={saveMutation.isPending} error={editorError} onOpenChange={setEditorOpen} onSave={(input) => saveMutation.mutate(input)} />
      <DiscardDraftDialog open={discardOpen} onCancel={() => resolveDiscard(false)} onDiscard={() => resolveDiscard(true)} />
    </section>
  );
}
