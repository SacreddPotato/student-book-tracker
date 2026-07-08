<script lang="ts">
  import { educationStages, type EducationStage } from "@app/shared";

  import { getTranslation, language, type TranslationKey } from "$lib/i18n";
  import type { BookRow } from "$lib/db/repositories/books";

  export type BookFormValue = {
    name: string;
    educationStage: EducationStage;
  };

  type Props = {
    book?: BookRow | null;
    onCancel: () => void;
    onSave: (value: BookFormValue) => void | Promise<void>;
  };

  const { book = null, onCancel, onSave }: Props = $props();

  let initializedFor = $state<string | null>(null);
  let name = $state("");
  let educationStage = $state<EducationStage>("primary");

  $effect(() => {
    const nextFormKey = book?.id ?? "new";

    if (initializedFor === nextFormKey) {
      return;
    }

    initializedFor = nextFormKey;
    name = book?.name ?? "";
    educationStage = book?.educationStage ?? "primary";
  });

  function t(key: TranslationKey): string {
    return getTranslation($language, key);
  }

  function stageLabel(stage: EducationStage): string {
    return t(`stages.${stage}`);
  }

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    await onSave({
      name: trimmedName,
      educationStage,
    });
  }
</script>

<form class="book-form" aria-label={book ? t("books.editBook") : t("books.addBook")} onsubmit={handleSubmit}>
  <label>
    <span>{t("forms.bookName")}</span>
    <input bind:value={name} required autocomplete="off" />
  </label>

  <label>
    <span>{t("forms.educationStage")}</span>
    <select bind:value={educationStage}>
      {#each educationStages as stage}
        <option value={stage}>{stageLabel(stage)}</option>
      {/each}
    </select>
  </label>

  <div class="form-actions">
    <button type="button" class="secondary" onclick={onCancel}>{t("buttons.cancel")}</button>
    <button type="submit" disabled={!name.trim()}>{t("buttons.save")}</button>
  </div>
</form>

<style>
  .book-form {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(180px, 240px) auto;
    gap: 12px;
    align-items: end;
    padding: 16px 0;
    border-bottom: 1px solid #e3ebe8;
  }

  label {
    display: grid;
    gap: 6px;
    color: #42535a;
    font-size: 0.84rem;
    font-weight: 700;
  }

  input,
  select {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #cbd8d5;
    border-radius: 6px;
    padding: 9px 10px;
    color: #17212f;
    background: #ffffff;
    font: inherit;
  }

  .form-actions {
    display: flex;
    gap: 8px;
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

  button.secondary {
    color: #42535a;
    background: #ffffff;
    border-color: #cbd8d5;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  @media (max-width: 760px) {
    .book-form {
      grid-template-columns: 1fr;
    }

    .form-actions {
      justify-content: flex-start;
    }
  }
</style>
