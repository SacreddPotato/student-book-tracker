<script lang="ts">
  import { language } from "$lib/i18n";

  let { children } = $props();
</script>

<div class="localized-shell" lang={$language} dir={$language === "ar" ? "rtl" : "ltr"}>
  {@render children()}
</div>

<style>
  .localized-shell {
    min-height: 100vh;
  }
</style>
