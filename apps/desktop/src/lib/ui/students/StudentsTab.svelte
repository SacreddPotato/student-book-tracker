<script lang="ts">
  import { onMount } from "svelte";
  import {
    educationStages,
    gradeLevelsByStage,
    type EducationStage,
    type GradeLevel,
  } from "@app/shared";

  import { initializeLocalDatabase, type SqlDatabase } from "$lib/db/local-db";
  import { listBooks, type BookRow } from "$lib/db/repositories/books";
  import { listStudents, upsertStudent, type StudentRow } from "$lib/db/repositories/students";
  import { listActiveStudentBookRows } from "$lib/db/repositories/transactions";
  import { getTranslation, language, type TranslationKey } from "$lib/i18n";
  import type { StudentsWorkbook } from "$lib/services/excel-export";
  import { issueBooksToStudent } from "$lib/services/inventory-service";
  import StudentBookPanel from "./StudentBookPanel.svelte";
  import StudentForm, { type StudentFormValue } from "./StudentForm.svelte";
  import UnsavedBookSelectionDialog from "./UnsavedBookSelectionDialog.svelte";

  type GroupFilter<T extends string> = T | "all";

  type Props = {
    database?: SqlDatabase;
    createId?: () => string;
    now?: () => string;
    deviceId?: string;
    onDraftSelectionChange?: (hasDraft: boolean) => void;
    onWorkbookExport?: (workbook: StudentsWorkbook) => void | Promise<void>;
  };

  const {
    database,
    createId = () => crypto.randomUUID(),
    now = () => new Date().toISOString(),
    deviceId = "local-device",
    onDraftSelectionChange,
    onWorkbookExport,
  }: Props = $props();

  let activeDatabase = $state<SqlDatabase | null>(null);
  let students = $state<StudentRow[]>([]);
  let books = $state<BookRow[]>([]);
  let issuedBookIds = $state<string[]>([]);
  let selectedBookIds = $state<string[]>([]);
  let selectedStudent = $state<StudentRow | null>(null);
  let pendingStudent = $state<StudentRow | null>(null);
  let showCreateForm = $state(false);
  let editingStudent = $state<StudentRow | null>(null);
  let loading = $state(true);
  let selectedStage = $state<GroupFilter<EducationStage>>("all");
  let selectedGrade = $state<GroupFilter<GradeLevel>>("all");
  let errorKey = $state<TranslationKey | null>(null);

  const hasDraftSelections = $derived(selectedBookIds.length > 0);
  const canExport = $derived(selectedGrade !== "all");
  const stageGradeOptions = $derived(
    selectedStage === "all"
      ? Object.values(gradeLevelsByStage).flat()
      : [...gradeLevelsByStage[selectedStage]],
  );
  const visibleStudents = $derived(
    students.filter((student) => {
      const matchesStage = selectedStage === "all" || student.educationStage === selectedStage;
      const matchesGrade = selectedGrade === "all" || student.gradeLevel === selectedGrade;
      return matchesStage && matchesGrade;
    }),
  );

  $effect(() => {
    onDraftSelectionChange?.(hasDraftSelections);
  });

  $effect(() => {
    if (
      selectedGrade !== "all" &&
      selectedStage !== "all" &&
      !(gradeLevelsByStage[selectedStage] as readonly GradeLevel[]).includes(selectedGrade)
    ) {
      selectedGrade = "all";
    }
  });

  function t(key: TranslationKey): string {
    return getTranslation($language, key);
  }

  function stageLabel(stage: EducationStage): string {
    return t(`stages.${stage}`);
  }

  function gradeLabel(grade: GradeLevel): string {
    return t(`grades.${grade}`);
  }

  async function getDatabase(): Promise<SqlDatabase> {
    if (activeDatabase) {
      return activeDatabase;
    }

    if (database) {
      activeDatabase = database;
      return activeDatabase;
    }

    activeDatabase = await initializeLocalDatabase();
    return activeDatabase;
  }

  async function refreshStudentsAndBooks(): Promise<void> {
    const db = await getDatabase();
    students = await listStudents(db);
    books = await listBooks(db);

    if (selectedStudent) {
      selectedStudent = students.find((student) => student.id === selectedStudent?.id) ?? null;
      await refreshIssuedBooks();
    }

    loading = false;
  }

  async function refreshIssuedBooks(): Promise<void> {
    if (!selectedStudent) {
      issuedBookIds = [];
      return;
    }

    const db = await getDatabase();
    issuedBookIds = (await listActiveStudentBookRows(db, selectedStudent.id)).map(({ bookId }) => bookId);
  }

  onMount(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDraftSelections) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    void refreshStudentsAndBooks().catch(() => {
      loading = false;
      errorKey = "errors.studentsLoadFailed";
    });

    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  });

  async function saveStudent(value: StudentFormValue): Promise<void> {
    const db = await getDatabase();
    const timestamp = now();
    const currentStudent = editingStudent;

    await upsertStudent(db, {
      id: currentStudent?.id ?? createId(),
      scopeId: currentStudent?.scopeId ?? "global",
      name: value.name,
      governmentId: value.governmentId,
      educationStage: value.educationStage,
      gradeLevel: value.gradeLevel,
      createdAt: currentStudent?.createdAt ?? timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });

    showCreateForm = false;
    editingStudent = null;
    await refreshStudentsAndBooks();
  }

  async function selectStudent(student: StudentRow): Promise<void> {
    if (selectedStudent?.id === student.id) {
      return;
    }

    if (hasDraftSelections) {
      pendingStudent = student;
      return;
    }

    selectedStudent = student;
    selectedBookIds = [];
    await refreshIssuedBooks();
  }

  function cancelStudentSwitch(): void {
    pendingStudent = null;
  }

  async function discardDraftAndSwitch(): Promise<void> {
    const nextStudent = pendingStudent;
    pendingStudent = null;
    selectedBookIds = [];

    if (nextStudent) {
      selectedStudent = nextStudent;
      await refreshIssuedBooks();
    }
  }

  function toggleDraftBook(bookId: string, checked: boolean): void {
    selectedBookIds = checked
      ? [...selectedBookIds, bookId]
      : selectedBookIds.filter((selectedBookId) => selectedBookId !== bookId);
  }

  async function confirmIssue(): Promise<void> {
    if (!selectedStudent || selectedBookIds.length === 0) {
      return;
    }

    const db = await getDatabase();
    await issueBooksToStudent(
      {
        studentId: selectedStudent.id,
        bookIds: selectedBookIds,
      },
      {
        database: db,
        createId,
        now,
        deviceId,
      },
    );

    selectedBookIds = [];
    await refreshStudentsAndBooks();
  }

  async function exportSelectedGrade(): Promise<void> {
    if (selectedGrade === "all") {
      return;
    }

    const db = await getDatabase();
    const gradeStudents = students.filter((student) => student.gradeLevel === selectedGrade);
    const issuedEntries = await Promise.all(
      gradeStudents.map(async (student) => [
        student.id,
        (await listActiveStudentBookRows(db, student.id)).map(({ bookId }) => bookId),
      ] as const),
    );
    const { downloadStudentsWorkbook, exportStudentsWorkbook } = await import(
      "$lib/services/excel-export"
    );
    const workbook = exportStudentsWorkbook({
      students: gradeStudents,
      books,
      selectedStage,
      selectedGradeLevel: selectedGrade,
      language: $language,
      issuedBookIdsByStudentId: Object.fromEntries(issuedEntries),
    });

    await (onWorkbookExport ?? downloadStudentsWorkbook)(workbook);
  }

  function cancelForm(): void {
    showCreateForm = false;
    editingStudent = null;
  }
</script>

<section class="students-tab" aria-label={t("students.registry")}>
  <div class="students-toolbar">
    <div class="group-controls">
      <label>
        <span>{t("students.stageGroup")}</span>
        <select bind:value={selectedStage}>
          <option value="all">{t("students.allStages")}</option>
          {#each educationStages as stage}
            <option value={stage}>{stageLabel(stage)}</option>
          {/each}
        </select>
      </label>

      <label>
        <span>{t("students.gradeGroup")}</span>
        <select bind:value={selectedGrade}>
          <option value="all">{t("students.allGrades")}</option>
          {#each stageGradeOptions as grade}
            <option value={grade}>{gradeLabel(grade)}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="toolbar-actions">
      <div class="export-action">
        <button type="button" class="secondary" disabled={!canExport} onclick={() => void exportSelectedGrade()}>
          {t("buttons.export")}
        </button>
        {#if !canExport}
          <p>{t("export.chooseGradeGroup")}</p>
        {/if}
      </div>

      <button
        type="button"
        onclick={() => {
          editingStudent = null;
          showCreateForm = true;
        }}
      >
        {t("students.addStudent")}
      </button>
    </div>
  </div>

  {#if errorKey}
    <p class="status-message">{t(errorKey)}</p>
  {/if}

  {#if showCreateForm}
    <StudentForm onCancel={cancelForm} onSave={saveStudent} />
  {/if}

  {#if editingStudent}
    {#key editingStudent.id}
      <StudentForm student={editingStudent} onCancel={cancelForm} onSave={saveStudent} />
    {/key}
  {/if}

  <div class="students-layout">
    <div class="students-list">
      {#if loading}
        <p class="status-message">{t("students.loading")}</p>
      {:else if visibleStudents.length === 0}
        <p class="status-message">
          {students.length === 0 ? t("emptyStates.students") : t("students.noMatchingGroups")}
        </p>
      {:else}
        <div class="students-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t("forms.studentName")}</th>
                <th scope="col">{t("forms.governmentId")}</th>
                <th scope="col">{t("forms.educationStage")}</th>
                <th scope="col">{t("forms.gradeLevel")}</th>
                <th scope="col">{t("students.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {#each visibleStudents as student}
                <tr class:active={selectedStudent?.id === student.id}>
                  <td>
                    <strong>{student.name}</strong>
                  </td>
                  <td>{student.governmentId}</td>
                  <td>{stageLabel(student.educationStage)}</td>
                  <td>{gradeLabel(student.gradeLevel)}</td>
                  <td>
                    <div class="row-actions">
                      <button
                        type="button"
                        class="secondary"
                        aria-label={`${t("students.editStudent")} ${student.name}`}
                        onclick={() => {
                          showCreateForm = false;
                          editingStudent = student;
                        }}
                      >
                        {t("buttons.edit")}
                      </button>
                      <button
                        type="button"
                        aria-label={`${t("students.selectStudent")} ${student.name}`}
                        onclick={() => void selectStudent(student)}
                      >
                        {t("students.select")}
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    {#if selectedStudent}
      <StudentBookPanel
        student={selectedStudent}
        {books}
        {selectedBookIds}
        {issuedBookIds}
        onToggle={toggleDraftBook}
        onConfirm={confirmIssue}
      />
    {:else if students.length > 0}
      <aside class="student-book-placeholder">
        <p>{t("students.selectStudentPrompt")}</p>
      </aside>
    {/if}
  </div>

  {#if pendingStudent}
    <UnsavedBookSelectionDialog
      onCancel={cancelStudentSwitch}
      onDiscard={discardDraftAndSwitch}
    />
  {/if}
</section>

<style>
  .students-tab {
    display: grid;
    gap: 16px;
  }

  .students-toolbar {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 0;
    border-bottom: 1px solid #e3ebe8;
  }

  .group-controls {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .toolbar-actions {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .export-action {
    display: grid;
    justify-items: end;
    gap: 5px;
  }

  .export-action p {
    max-width: 220px;
    margin: 0;
    color: #637178;
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.35;
    text-align: end;
  }

  label {
    display: grid;
    gap: 6px;
    min-width: 190px;
    color: #42535a;
    font-size: 0.84rem;
    font-weight: 700;
  }

  select {
    border: 1px solid #cbd8d5;
    border-radius: 6px;
    padding: 9px 10px;
    color: #17212f;
    background: #ffffff;
    font: inherit;
  }

  button {
    min-height: 38px;
    border: 1px solid #1f6f62;
    border-radius: 6px;
    padding: 8px 14px;
    color: #ffffff;
    background: #1f6f62;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    white-space: nowrap;
  }

  button.secondary {
    color: #42535a;
    background: #ffffff;
    border-color: #cbd8d5;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .students-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
    gap: 20px;
    align-items: start;
  }

  .students-list {
    min-width: 0;
  }

  .students-table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    min-width: 760px;
    border-collapse: collapse;
  }

  th,
  td {
    border-bottom: 1px solid #e4ebe9;
    padding: 12px 10px;
    color: #24313c;
    text-align: start;
    vertical-align: middle;
  }

  th {
    color: #607077;
    background: #f7faf9;
    font-size: 0.78rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  tr.active {
    background: #eef7f3;
  }

  .row-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .status-message,
  .student-book-placeholder {
    margin: 0;
    padding: 28px 0;
    color: #637178;
    font-weight: 700;
    text-align: center;
  }

  .student-book-placeholder {
    border-inline-start: 1px solid #e3ebe8;
    padding-inline-start: 20px;
  }

  @media (max-width: 900px) {
    .students-layout {
      grid-template-columns: 1fr;
    }

    .student-book-placeholder {
      border-inline-start: 0;
      border-top: 1px solid #e3ebe8;
      padding-inline-start: 0;
      padding-top: 18px;
    }
  }

  @media (max-width: 640px) {
    .students-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .group-controls {
      flex-direction: column;
    }

    .toolbar-actions {
      flex-direction: column;
    }

    .export-action {
      justify-items: stretch;
    }

    .export-action p {
      max-width: none;
      text-align: start;
    }

    label {
      min-width: 0;
    }

    .row-actions {
      justify-content: flex-start;
    }
  }
</style>
