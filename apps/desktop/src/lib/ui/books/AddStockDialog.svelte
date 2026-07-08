<script lang="ts">
  import { getTranslation, language, type TranslationKey } from "$lib/i18n";
  import type { BookRow } from "$lib/db/repositories/books";

  type Props = {
    book: BookRow;
    onCancel: () => void;
    onConfirm: (quantity: number) => void | Promise<void>;
  };

  const { book, onCancel, onConfirm }: Props = $props();

  let quantity = $state(1);

  function t(key: TranslationKey): string {
    return getTranslation($language, key);
  }

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (quantity <= 0) {
      return;
    }

    await onConfirm(quantity);
  }
</script>

<div class="dialog-shell" role="dialog" aria-modal="true" aria-labelledby="add-stock-heading">
  <form class="dialog" onsubmit={handleSubmit}>
    <div>
      <p class="eyebrow">{t("buttons.addStock")}</p>
      <h3 id="add-stock-heading">{book.name}</h3>
    </div>

    <label>
      <span>{t("forms.quantity")}</span>
      <input type="number" min="1" step="1" bind:value={quantity} />
    </label>

    <div class="dialog-actions">
      <button type="button" class="secondary" onclick={onCancel}>{t("buttons.cancel")}</button>
      <button type="submit" disabled={quantity <= 0}>{t("buttons.confirm")}</button>
    </div>
  </form>
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

  h3 {
    margin: 0;
    color: #17212f;
    font-size: 1.05rem;
    letter-spacing: 0;
  }

  label {
    display: grid;
    gap: 6px;
    color: #42535a;
    font-size: 0.84rem;
    font-weight: 700;
  }

  input {
    border: 1px solid #cbd8d5;
    border-radius: 6px;
    padding: 9px 10px;
    color: #17212f;
    background: #ffffff;
    font: inherit;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
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
</style>
