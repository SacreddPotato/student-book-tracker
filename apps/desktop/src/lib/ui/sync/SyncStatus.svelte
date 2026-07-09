<script lang="ts">
  import { getTranslation, language, type TranslationKey } from "$lib/i18n";
  import { syncStatus } from "$lib/sync/sync-status";

  const labelKeyByPhase = {
    syncing: "sync.syncing",
    synced: "sync.synced",
    offline: "sync.offline",
    rejected: "sync.rejected",
    error: "sync.error",
  } as const satisfies Record<"syncing" | "synced" | "offline" | "rejected" | "error", TranslationKey>;

  function t(key: TranslationKey): string {
    return getTranslation($language, key);
  }
</script>

{#if $syncStatus.phase !== "idle"}
  <aside class="sync-status" data-phase={$syncStatus.phase} aria-live="polite">
    <span class="status-dot" aria-hidden="true"></span>
    <span>{t(labelKeyByPhase[$syncStatus.phase])}</span>
    {#if $syncStatus.pendingCount > 0}
      <span class="detail">
        {t("sync.pendingCount").replace("{count}", String($syncStatus.pendingCount))}
      </span>
    {/if}
    {#if $syncStatus.rejectedCount > 0}
      <span class="detail">
        {t("sync.rejectedCount").replace("{count}", String($syncStatus.rejectedCount))}
      </span>
    {/if}
  </aside>
{/if}

<style>
  .sync-status {
    position: fixed;
    z-index: 30;
    inset-inline-end: 20px;
    inset-block-end: 20px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: min(400px, calc(100vw - 40px));
    box-sizing: border-box;
    border: 1px solid #dce6ed;
    border-radius: 10px;
    padding: 9px 12px;
    color: #405267;
    background: rgb(255 255 255 / 0.95);
    box-shadow: 0 10px 24px rgb(23 52 71 / 0.12);
    font-size: 0.78rem;
    font-weight: 750;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: #6f8193;
  }

  .detail {
    color: #718195;
    font-weight: 650;
  }

  .sync-status[data-phase="syncing"] .status-dot {
    background: #d99a31;
  }

  .sync-status[data-phase="synced"] .status-dot {
    background: #43a989;
  }

  .sync-status[data-phase="offline"] .status-dot,
  .sync-status[data-phase="error"] .status-dot,
  .sync-status[data-phase="rejected"] .status-dot {
    background: #bc613b;
  }
</style>
