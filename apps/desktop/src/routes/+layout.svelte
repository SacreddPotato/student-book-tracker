<script lang="ts">
  import { onMount } from "svelte";

  import { initializeLocalDatabase } from "$lib/db/local-db";
  import { language } from "$lib/i18n";
  import { runStartupUpdateCheck } from "$lib/services/updater";
  import { SyncEngine } from "$lib/sync/sync-engine";
  import SyncConflictsPanel from "$lib/ui/sync/SyncConflictsPanel.svelte";
  import SyncStatus from "$lib/ui/sync/SyncStatus.svelte";

  let { children } = $props();

  onMount(() => {
    let disposed = false;

    async function initializeAndSync(): Promise<void> {
      try {
        const database = await initializeLocalDatabase();
        if (!disposed) {
          await new SyncEngine({ database }).sync();
        }
      } catch (error) {
        console.error("Failed to initialize local database", error);
      }
    }

    const syncWhenOnline = () => void initializeAndSync();
    void initializeAndSync();
    void runStartupUpdateCheck();
    window.addEventListener("online", syncWhenOnline);

    return () => {
      disposed = true;
      window.removeEventListener("online", syncWhenOnline);
    };
  });
</script>

<div class="localized-shell" lang={$language} dir={$language === "ar" ? "rtl" : "ltr"}>
  {@render children()}
  <SyncConflictsPanel />
  <SyncStatus />
</div>

<style>
  .localized-shell {
    min-height: 100vh;
  }
</style>
