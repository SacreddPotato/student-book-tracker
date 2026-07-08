<script lang="ts">
  import {
    educationStages,
    gradeLevelsByStage,
    isGradeAllowedForStage,
    type EducationStage,
    type GradeLevel,
  } from "@app/shared";

  import type { StudentRow } from "$lib/db/repositories/students";
  import { getTranslation, language, type TranslationKey } from "$lib/i18n";

  export type StudentFormValue = {
    name: string;
    governmentId: string;
    educationStage: EducationStage;
    gradeLevel: GradeLevel;
  };

  type Props = {
    student?: StudentRow | null;
    onCancel: () => void;
    onSave: (value: StudentFormValue) => void | Promise<void>;
  };

  const { student = null, onCancel, onSave }: Props = $props();

  let initializedFor = $state<string | null>(null);
  let name = $state("");
  let governmentId = $state("");
  let educationStage = $state<EducationStage>("primary");
  let gradeLevel = $state<GradeLevel>("primary1");

  const availableGrades = $derived(gradeLevelsByStage[educationStage]);

  $effect(() => {
    const nextFormKey = student?.id ?? "new";

    if (initializedFor === nextFormKey) {
      return;
    }

    initializedFor = nextFormKey;
    name = student?.name ?? "";
    governmentId = student?.governmentId ?? "";
    educationStage = student?.educationStage ?? "primary";
    gradeLevel = student?.gradeLevel ?? gradeLevelsByStage[educationStage][0];
  });

  $effect(() => {
    if (!isGradeAllowedForStage(educationStage, gradeLevel)) {
      gradeLevel = gradeLevelsByStage[educationStage][0];
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

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedGovernmentId = governmentId.trim();

    if (!trimmedName || !trimmedGovernmentId) {
      return;
    }

    await onSave({
      name: trimmedName,
      governmentId: trimmedGovernmentId,
      educationStage,
      gradeLevel,
    });
  }
</script>

<form
  class="student-form"
  aria-label={student ? t("students.editStudent") : t("students.addStudent")}
  onsubmit={handleSubmit}
>
  <label>
    <span>{t("forms.studentName")}</span>
    <input bind:value={name} required autocomplete="off" />
  </label>

  <label>
    <span>{t("forms.governmentId")}</span>
    <input bind:value={governmentId} required autocomplete="off" />
  </label>

  <label>
    <span>{t("forms.educationStage")}</span>
    <select bind:value={educationStage}>
      {#each educationStages as stage}
        <option value={stage}>{stageLabel(stage)}</option>
      {/each}
    </select>
  </label>

  <label>
    <span>{t("forms.gradeLevel")}</span>
    <select bind:value={gradeLevel}>
      {#each availableGrades as grade}
        <option value={grade}>{gradeLabel(grade)}</option>
      {/each}
    </select>
  </label>

  <div class="form-actions">
    <button type="button" class="secondary" onclick={onCancel}>{t("buttons.cancel")}</button>
    <button type="submit" disabled={!name.trim() || !governmentId.trim()}>{t("buttons.save")}</button>
  </div>
</form>

<style>
  .student-form {
    display: grid;
    grid-template-columns: minmax(160px, 1.2fr) minmax(150px, 1fr) minmax(150px, 0.8fr) minmax(150px, 0.8fr) auto;
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

  @media (max-width: 980px) {
    .student-form {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 640px) {
    .student-form {
      grid-template-columns: 1fr;
    }
  }
</style>
