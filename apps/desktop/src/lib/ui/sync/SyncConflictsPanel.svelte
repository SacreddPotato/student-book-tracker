<script lang="ts">
  import { onMount } from "svelte";

  import { initializeLocalDatabase, type SqlDatabase } from "$lib/db/local-db";
  import { getTranslation, language, type TranslationKey } from "$lib/i18n";
  import {
    acknowledgeSyncConflict,
    listSyncConflicts,
    type SyncConflict,
  } from "$lib/sync/sync-conflicts";
  import { setSyncStatus, syncStatus } from "$lib/sync/sync-status";

  type Props = {
    database?: SqlDatabase;
    now?: () => string;
  };

  const { database, now = () => new Date().toISOString() }: Props = $props();

  let activeDatabase = $state<SqlDatabase | null>(null);
  let conflicts = $state<SyncConflict[]>([]);
  let loaded = $state(false);
  let observedRejectedCount = $state<number | null>(null);

  const visibleConflicts = $derived(conflicts.filter((conflict) => !conflict.acknowledged));

  function t(key: TranslationKey): string {
    return getTranslation($language, key);
  }

  async function getDatabase(): Promise<SqlDatabase> {
    if (activeDatabase) {
      return activeDatabase;
    }

    activeDatabase = database ?? (await initializeLocalDatabase());
    return activeDatabase;
  }

  async function refresh(): Promise<void> {
    const db = await getDatabase();
    conflicts = await listSyncConflicts(db);
    setSyncStatus({ unacknowledgedRejectedCount: visibleConflicts.length });
  }

  async function acknowledge(conflictId: string): Promise<void> {
    await acknowledgeSyncConflict(await getDatabase(), conflictId, now());
    await refresh();
  }

  onMount(() => {
    loaded = true;
    void refresh().catch(() => {
      setSyncStatus({ unacknowledgedRejectedCount: 0 });
    });
  });

  $effect(() => {
    const rejectedCount = $syncStatus.rejectedCount;
    if (!loaded || observedRejectedCount === rejectedCount) {
      return;
    }

    observedRejectedCount = rejectedCount;
    void refresh().catch(() => {
      setSyncStatus({ unacknowledgedRejectedCount: 0 });
    });
  });
</script>

{#if visibleConflicts.length > 0}
  <section class="sync-conflicts" aria-label={t("sync.conflicts")} aria-live="polite">
    <header>
      <p>{t("sync.conflicts")}</p>
      <span>{t("sync.conflictCount").replace("{count}", String(visibleConflicts.length))}</span>
    </header>

    <div class="conflict-list">
      {#each visibleConflicts as conflict (conflict.row.id)}
        <article>
          <div class="conflict-heading">
            <strong>
              {conflict.isInsufficientStock
                ? t("sync.insufficientStockConflict")
                : t("sync.rejected")}
            </strong>
            <button type="button" onclick={() => void acknowledge(conflict.row.id)}>
              {t("sync.acknowledge")}
            </button>
          </div>

          {#if conflict.isInsufficientStock}
            <dl>
              <div>
                <dt>{t("sync.student")}</dt>
                <dd>{conflict.studentName ?? t("logs.unknownStudent")}</dd>
              </div>
              <div>
                <dt>{t("sync.books")}</dt>
                <dd>{conflict.bookNames.join(", ") || t("logs.unknownBook")}</dd>
              </div>
            </dl>
          {/if}

          {#if conflict.row.lastError}
            <p class="reason">{conflict.row.lastError}</p>
          {/if}
        </article>
      {/each}
    </div>
  </section>
{/if}

<style>
  .sync-conflicts {
    position: fixed;
    z-index: 31;
    inset-inline-end: 20px;
    inset-block-end: 70px;
    width: min(390px, calc(100vw - 40px));
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid #e5c9bd;
    border-radius: 14px;
    background: #fffaf7;
    box-shadow: 0 18px 42px rgb(23 52 71 / 0.18);
  }

  header,
  .conflict-heading,
  dl div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  header {
    padding: 13px 15px;
    border-bottom: 1px solid #f0ddd5;
    background: #fff3ed;
  }

  header p,
  header span,
  .reason,
  dt,
  dd {
    margin: 0;
  }

  header p {
    color: #834324;
    font-size: 0.83rem;
    font-weight: 850;
  }

  header span {
    color: #a76343;
    font-size: 0.73rem;
    font-weight: 750;
  }

  .conflict-list {
    display: grid;
    max-height: 310px;
    overflow-y: auto;
  }

  article {
    display: grid;
    gap: 10px;
    padding: 14px 15px;
    border-bottom: 1px solid #f1e1da;
  }

  article:last-child {
    border-bottom: 0;
  }

  strong {
    color: #6f351d;
    font-size: 0.82rem;
  }

  button {
    border: 1px solid #d9ab95;
    border-radius: 7px;
    padding: 5px 8px;
    color: #854225;
    background: #ffffff;
    cursor: pointer;
    font: inherit;
    font-size: 0.73rem;
    font-weight: 800;
  }

  dl {
    display: grid;
    gap: 5px;
    margin: 0;
  }

  dt {
    color: #8d6b5e;
    font-size: 0.7rem;
    font-weight: 800;
  }

  dd {
    color: #4b3d38;
    font-size: 0.76rem;
    font-weight: 700;
    text-align: end;
  }

  .reason {
    color: #8d6b5e;
    font-size: 0.72rem;
    line-height: 1.35;
  }
</style>
