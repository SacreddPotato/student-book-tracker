<script lang="ts">
  import { getTranslation, language, type TranslationKey } from "$lib/i18n";

  type Props = {
    onCancel: () => void;
    onDiscard: () => void;
  };

  const { onCancel, onDiscard }: Props = $props();

  function t(key: TranslationKey): string {
    return getTranslation($language, key);
  }
</script>

<div class="dialog-shell" role="dialog" aria-modal="true" aria-labelledby="unsaved-selection-heading">
  <div class="dialog">
    <div>
      <p class="eyebrow">{t("students.draftSelection")}</p>
      <h3 id="unsaved-selection-heading">{t("students.unconfirmedSelections")}</h3>
    </div>

    <p>{t("warnings.unsavedBookSelection")}</p>

    <div class="dialog-actions">
      <button type="button" class="secondary" onclick={onCancel}>{t("buttons.cancel")}</button>
      <button type="button" onclick={onDiscard}>{t("students.discardSelection")}</button>
    </div>
  </div>
</div>

<style>
  .dialog-shell {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgb(20 30 36 / 0.34);
  }

  .dialog {
    width: min(420px, 100%);
    box-sizing: border-box;
    display: grid;
    gap: 16px;
    border: 1px solid #d5dfdc;
    border-radius: 8px;
    padding: 20px;
    background: #ffffff;
    box-shadow: 0 16px 36px rgb(15 32 40 / 0.18);
  }

  .eyebrow {
    margin: 0 0 4px;
    color: #637178;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    color: #17212f;
    font-size: 1.05rem;
    letter-spacing: 0;
  }

  p {
    color: #42535a;
    line-height: 1.5;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  button {
    min-height: 38px;
    border: 1px solid #8a3d10;
    border-radius: 6px;
    padding: 8px 14px;
    color: #ffffff;
    background: #8a3d10;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  button.secondary {
    color: #42535a;
    background: #ffffff;
    border-color: #cbd8d5;
  }
</style>
