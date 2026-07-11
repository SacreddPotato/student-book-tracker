<script lang="ts">
  import { getTranslation, language, type TranslationKey } from "$lib/i18n";
  import {
    checkForUpdates,
    desktopVersion,
    downloadAvailableUpdate,
    installAvailableUpdate,
    updaterStatus,
  } from "$lib/services/updater";

  function t(key: TranslationKey): string {
    return getTranslation($language, key);
  }

  function statusMessage(): string {
    switch ($updaterStatus.phase) {
      case "checking":
        return t("updater.checking");
      case "upToDate":
        return t("updater.upToDate");
      case "available":
        return t("updater.available").replace("{version}", $updaterStatus.availableVersion ?? "");
      case "downloading":
        return t("updater.downloading");
      case "ready":
        return t("updater.ready");
      case "installing":
        return t("updater.installing");
      case "failed":
        return $updaterStatus.error ?? t("updater.failed");
      case "disabled":
        return t("updater.disabled");
      default:
        return "";
    }
  }

  const isBusy = $derived(
    $updaterStatus.phase === "checking" ||
      $updaterStatus.phase === "downloading" ||
      $updaterStatus.phase === "installing",
  );
</script>

<section class="settings-tab" aria-label={t("updater.title")}>
  <article class="update-card">
    <div class="update-card-copy">
      <h3>{t("updater.title")}</h3>
      <p>{t("updater.description")}</p>
      <span>{t("updater.currentVersion").replace("{version}", desktopVersion)}</span>
    </div>

    <div class="update-actions">
      <button
        type="button"
        class="secondary"
        disabled={isBusy}
        onclick={() => void checkForUpdates()}
      >
        {t("updater.check")}
      </button>

      {#if $updaterStatus.phase === "available"}
        <button type="button" onclick={() => void downloadAvailableUpdate()}>
          {t("updater.download")}
        </button>
      {:else if $updaterStatus.phase === "ready"}
        <button type="button" onclick={() => void installAvailableUpdate()}>
          {t("updater.install")}
        </button>
      {/if}
    </div>

    {#if statusMessage()}
      <p class:error={$updaterStatus.phase === "failed"} class="update-status" aria-live="polite">
        {statusMessage()}
      </p>
    {/if}
  </article>
</section>

<style>
  .settings-tab {
    max-width: 760px;
  }

  .update-card {
    display: grid;
    gap: 20px;
    border: 1px solid #e1e8ef;
    border-radius: 15px;
    padding: clamp(20px, 4vw, 28px);
    background: rgb(255 255 255 / 0.92);
    box-shadow: 0 10px 26px rgb(36 57 80 / 0.055);
  }

  .update-card-copy h3,
  .update-card-copy p {
    margin: 0;
  }

  .update-card-copy h3 {
    color: #172638;
    font-size: 1.08rem;
  }

  .update-card-copy p {
    max-width: 620px;
    margin-top: 8px;
    color: #64758a;
    line-height: 1.55;
  }

  .update-card-copy span {
    display: inline-block;
    margin-top: 14px;
    color: #53667b;
    font-size: 0.82rem;
    font-weight: 750;
  }

  .update-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .update-status {
    margin: -4px 0 0;
    color: #516579;
    font-size: 0.9rem;
    font-weight: 700;
  }

  .update-status.error {
    color: #a5522a;
  }
</style>
