<script lang="ts">
  import type { BookRow } from "$lib/db/repositories/books";
  import type { StudentRow } from "$lib/db/repositories/students";
  import { getTranslation, language, type TranslationKey } from "$lib/i18n";

  type Props = {
    student: StudentRow;
    books: BookRow[];
    selectedBookIds: string[];
    issuedBookIds: string[];
    onToggle: (bookId: string, checked: boolean) => void;
    onConfirm: () => void | Promise<void>;
    saving?: boolean;
  };

  const { student, books, selectedBookIds, issuedBookIds, onToggle, onConfirm, saving = false }: Props = $props();

  const stageBooks = $derived(
    books.filter((book) => book.educationStage === student.educationStage),
  );
  const selectedSet = $derived(new Set(selectedBookIds));
  const issuedSet = $derived(new Set(issuedBookIds));
  const canConfirm = $derived(selectedBookIds.length > 0);

  function t(key: TranslationKey): string {
    return getTranslation($language, key);
  }

  async function handleConfirm(): Promise<void> {
    if (saving || !canConfirm) {
      return;
    }

    await onConfirm();
  }
</script>

<aside class="student-book-panel" aria-label={t("students.bookChecklist")}>
  <div class="panel-heading">
    <p>{t("students.selectedStudent")}</p>
    <h3>{student.name}</h3>
    <span>{t(`stages.${student.educationStage}`)} · {t(`grades.${student.gradeLevel}`)}</span>
  </div>

  {#if stageBooks.length === 0}
    <p class="empty-message">{t("students.noStageBooks")}</p>
  {:else}
    <fieldset>
      <legend>{t("students.bookChecklist")}</legend>
      <div class="book-options">
        {#each stageBooks as book}
          <label
            class:zero-stock={book.quantity === 0}
            class:issued={issuedSet.has(book.id)}
            data-stock-state={book.quantity === 0 ? "zero" : "available"}
          >
            <input
              type="checkbox"
              aria-label={book.name}
              checked={selectedSet.has(book.id) || issuedSet.has(book.id)}
              disabled={saving || book.quantity === 0 || issuedSet.has(book.id)}
              onchange={(event) =>
                onToggle(book.id, (event.currentTarget as HTMLInputElement).checked)}
            />
            <span class="book-name">{book.name}</span>
            <span class="book-meta">
              {#if issuedSet.has(book.id)}
                {t("students.issued")}
              {:else if book.quantity === 0}
                {t("warnings.zeroStock")}
              {:else}
                {t("students.availableCount").replace("{count}", String(book.quantity))}
              {/if}
            </span>
          </label>
        {/each}
      </div>
    </fieldset>

    <div class="panel-actions">
      <button type="button" disabled={saving || !canConfirm} onclick={handleConfirm}>{t("buttons.confirm")}</button>
    </div>
  {/if}
</aside>

<style>
  .student-book-panel {
    display: grid;
    gap: 16px;
    align-content: start;
    border-inline-start: 1px solid #e3ebe8;
    padding-inline-start: 20px;
  }

  .panel-heading {
    display: grid;
    gap: 4px;
  }

  .panel-heading p,
  .panel-heading span,
  legend {
    margin: 0;
    color: #637178;
    font-size: 0.82rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .panel-heading h3 {
    margin: 0;
    color: #17212f;
    font-size: 1.15rem;
    letter-spacing: 0;
  }

  fieldset {
    display: grid;
    gap: 10px;
    min-width: 0;
    border: 0;
    margin: 0;
    padding: 0;
  }

  .book-options {
    display: grid;
    gap: 8px;
  }

  label {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    border: 1px solid #dbe5e2;
    border-radius: 8px;
    padding: 10px 12px;
    background: #ffffff;
  }

  label.zero-stock {
    background: #fff8ed;
  }

  label.issued {
    background: #eef7f3;
  }

  input {
    width: 18px;
    height: 18px;
  }

  .book-name {
    min-width: 0;
    color: #24313c;
    font-weight: 800;
  }

  .book-meta {
    border-radius: 999px;
    padding: 3px 9px;
    color: #607077;
    background: #f2f6f5;
    font-size: 0.78rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .zero-stock .book-meta {
    color: #8a3d10;
    background: #ffead2;
  }

  .issued .book-meta {
    color: #27554b;
    background: #dff1eb;
  }

  .panel-actions {
    display: flex;
    justify-content: flex-end;
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
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .empty-message {
    margin: 0;
    color: #637178;
    font-weight: 700;
  }

  @media (max-width: 900px) {
    .student-book-panel {
      border-inline-start: 0;
      border-top: 1px solid #e3ebe8;
      padding-inline-start: 0;
      padding-top: 18px;
    }
  }
</style>
