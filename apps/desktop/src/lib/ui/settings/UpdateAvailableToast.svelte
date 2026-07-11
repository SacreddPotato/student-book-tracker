<script lang="ts">
  import { getTranslation, language, type TranslationKey } from "$lib/i18n";
  import { updaterStatus } from "$lib/services/updater";
  import { requestAppScreen } from "$lib/ui/app-navigation";

  let dismissedVersion = $state<string | null>(null);

  const availableVersion = $derived(
    $updaterStatus.phase === "available" ? $updaterStatus.availableVersion : null,
  );
  const isVisible = $derived(
    availableVersion !== null && dismissedVersion !== availableVersion,
  );

  function t(key: TranslationKey): string {
    return getTranslation($language, key);
  }

  function dismiss(): void {
    dismissedVersion = availableVersion;
  }

  function openUpdateSettings(): void {
    requestAppScreen("settings");
    dismiss();
  }
</script>

{#if isVisible}
  <aside class="update-toast" role="status" aria-label={t("updater.notificationTitle")} aria-live="polite">
    <div class="toast-copy">
      <strong>{t("updater.notificationTitle")}</strong>
      <p>{t("updater.available").replace("{version}", availableVersion ?? "")}</p>
    </div>

    <div class="toast-actions">
      <button type="button" class="view-update" onclick={openUpdateSettings}>
        {t("updater.viewUpdate")}
      </button>
      <button type="button" class="dismiss" onclick={dismiss}>
        {t("updater.dismiss")}
      </button>
    </div>
  </aside>
{/if}

<style>
  .update-toast {
    position: fixed;
    z-index: 40;
    inset-inline-end: 20px;
    inset-block-start: 20px;
    display: grid;
    gap: 13px;
    width: min(410px, calc(100vw - 40px));
    box-sizing: border-box;
    border: 1px solid #bbdfd4;
    border-radius: 14px;
    padding: 15px;
    color: #234e48;
    background: #f4fffb;
    box-shadow: 0 18px 42px rgb(23 52 71 / 0.18);
  }

  .toast-copy {
    display: grid;
    gap: 5px;
  }

  strong,
  p {
    margin: 0;
  }

  strong {
    color: #1f594f;
    font-size: 0.86rem;
    font-weight: 850;
  }

  p {
    color: #4f716c;
    font-size: 0.8rem;
    font-weight: 650;
    line-height: 1.45;
  }

  .toast-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  button {
    min-height: 34px;
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 800;
  }

  .view-update {
    border: 1px solid #216354;
    color: #ffffff;
    background: #216354;
  }

  .dismiss {
    border: 1px solid #c8dfd8;
    color: #48706a;
    background: #ffffff;
  }

  button:hover {
    filter: brightness(0.96);
  }

  button:focus-visible {
    outline: 3px solid rgb(101 211 180 / 0.36);
    outline-offset: 2px;
  }

  @media (max-width: 540px) {
    .update-toast {
      inset-inline: 16px;
      inset-block-start: 16px;
      width: auto;
    }
  }
</style>
