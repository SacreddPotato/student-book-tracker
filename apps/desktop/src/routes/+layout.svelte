<script lang="ts">
  import { onMount } from "svelte";

  import { initializeLocalDatabase } from "$lib/db/local-db";
  import { language } from "$lib/i18n";

  let { children } = $props();

  onMount(() => {
    void initializeLocalDatabase().catch((error: unknown) => {
      console.error("Failed to initialize local database", error);
    });
  });
</script>

<div class="localized-shell" lang={$language} dir={$language === "ar" ? "rtl" : "ltr"}>
  {@render children()}
</div>

<style>
  .localized-shell {
    min-height: 100vh;
  }
</style>
