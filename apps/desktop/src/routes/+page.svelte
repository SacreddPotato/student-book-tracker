<script lang="ts">
  import {
    getTranslation,
    language,
    languages,
    setLanguage,
    type Language,
    type TranslationKey,
  } from "$lib/i18n";
  import { appTabs, type AppTabId } from "$lib/ui/app-tabs";
  import BooksTab from "$lib/ui/books/BooksTab.svelte";

  let activeTab = $state<AppTabId>("students");

  const panelTitleKeys: Record<AppTabId, TranslationKey> = {
    students: "tabs.students",
    books: "tabs.books",
    logs: "tabs.logs",
  };

  const emptyStateKeys: Record<AppTabId, TranslationKey> = {
    students: "emptyStates.students",
    books: "emptyStates.books",
    logs: "emptyStates.logs",
  };

  function t(key: TranslationKey): string {
    return getTranslation($language, key);
  }

  function handleLanguageChange(event: Event): void {
    setLanguage((event.currentTarget as HTMLSelectElement).value as Language);
  }
</script>

<svelte:head>
  <title>{t("app.title")}</title>
</svelte:head>

<main class="app-shell">
  <header class="top-bar">
    <div>
      <p class="eyebrow">{t("app.eyebrow")}</p>
      <h1>{t("app.title")}</h1>
    </div>
    <div class="header-controls">
      <label class="language-switcher">
        <span>{t("app.language")}</span>
        <select value={$language} onchange={handleLanguageChange}>
          {#each languages as availableLanguage}
            <option value={availableLanguage}>
              {t(`languages.${availableLanguage}`)}
            </option>
          {/each}
        </select>
      </label>
      <div class="sync-chip" aria-label={t("sync.offlineReady")}>{t("sync.offlineReady")}</div>
    </div>
  </header>

  <nav class="tabs" aria-label={t("app.primarySections")}>
    {#each appTabs as tab}
      <button
        type="button"
        class:active={activeTab === tab.id}
        aria-pressed={activeTab === tab.id}
        onclick={() => (activeTab = tab.id)}
      >
        {t(tab.labelKey)}
      </button>
    {/each}
  </nav>

  <section class="workspace" aria-labelledby="active-tab-heading">
    <div class="panel-heading">
      <h2 id="active-tab-heading">{t(panelTitleKeys[activeTab])}</h2>
      <span>{t("app.recordsCount")}</span>
    </div>

    {#if activeTab === "books"}
      <BooksTab />
    {:else}
      <div class="empty-state">{t(emptyStateKeys[activeTab])}</div>
    {/if}
  </section>
</main>

<style>
  :global(:root) {
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
      sans-serif;
    color: #18202f;
    background: #f4f7f8;
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  :global(body) {
    margin: 0;
  }

  button {
    font: inherit;
  }

  .app-shell {
    min-height: 100vh;
    display: grid;
    grid-template-rows: auto auto 1fr;
    background:
      linear-gradient(180deg, #edf4f2 0, #f8faf9 260px),
      #f8faf9;
  }

  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 28px 32px 20px;
    border-bottom: 1px solid #d9e2df;
  }

  .eyebrow {
    margin: 0 0 6px;
    color: #5e6d73;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1,
  h2 {
    margin: 0;
    letter-spacing: 0;
  }

  h1 {
    font-size: 1.9rem;
    line-height: 1.2;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .language-switcher {
    display: grid;
    gap: 4px;
    color: #415159;
    font-size: 0.82rem;
    font-weight: 700;
  }

  .language-switcher select {
    min-width: 124px;
    border: 1px solid #cdd9d6;
    border-radius: 6px;
    padding: 7px 10px;
    color: #18202f;
    background: #ffffff;
    font: inherit;
  }

  .sync-chip {
    min-width: 112px;
    border: 1px solid #b7d0c8;
    border-radius: 999px;
    padding: 8px 12px;
    color: #27554b;
    background: #e8f4ef;
    font-size: 0.88rem;
    font-weight: 700;
    text-align: center;
  }

  .tabs {
    display: flex;
    gap: 6px;
    padding: 14px 32px 0;
    border-bottom: 1px solid #d9e2df;
    background: #f8faf9;
  }

  .tabs button {
    min-width: 104px;
    border: 1px solid transparent;
    border-bottom: 0;
    border-radius: 8px 8px 0 0;
    padding: 12px 16px;
    color: #46565d;
    background: transparent;
    cursor: pointer;
  }

  .tabs button:hover {
    color: #19232f;
    background: #eef4f2;
  }

  .tabs button.active {
    color: #111827;
    background: #ffffff;
    border-color: #d9e2df;
    font-weight: 700;
  }

  .workspace {
    margin: 0;
    padding: 24px 32px 32px;
    background: #ffffff;
  }

  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 18px;
    border-bottom: 1px solid #e5ebe9;
  }

  .panel-heading h2 {
    font-size: 1.2rem;
  }

  .panel-heading span {
    color: #607077;
    font-size: 0.9rem;
    font-weight: 700;
  }

  .empty-state {
    display: grid;
    min-height: 320px;
    place-items: center;
    color: #637178;
    font-weight: 700;
  }

  @media (max-width: 640px) {
    .top-bar {
      align-items: flex-start;
      flex-direction: column;
      padding: 22px 18px 18px;
    }

    .header-controls {
      align-items: stretch;
      flex-direction: column;
      width: 100%;
    }

    .tabs {
      overflow-x: auto;
      padding-inline: 18px;
    }

    .workspace {
      padding: 22px 18px 28px;
    }
  }
</style>
