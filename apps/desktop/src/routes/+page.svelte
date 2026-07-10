<script lang="ts">
  import {
    getTranslation,
    language,
    setLanguage,
    type Language,
    type TranslationKey,
  } from "$lib/i18n";
  import { appTabs } from "$lib/ui/app-tabs";
  import { requestedAppScreen, type AppScreenId } from "$lib/ui/app-navigation";
  import BooksTab from "$lib/ui/books/BooksTab.svelte";
  import LogsTab from "$lib/ui/logs/LogsTab.svelte";
  import SettingsTab from "$lib/ui/settings/SettingsTab.svelte";
  import StudentsTab from "$lib/ui/students/StudentsTab.svelte";
  import UnsavedBookSelectionDialog from "$lib/ui/students/UnsavedBookSelectionDialog.svelte";

  type ScreenId = AppScreenId;

  let activeTab = $state<ScreenId>("students");
  let studentsHaveDraftSelections = $state(false);
  let pendingTab = $state<ScreenId | null>(null);

  const panelTitleKeys: Record<ScreenId, TranslationKey> = {
    students: "tabs.students",
    books: "tabs.books",
    logs: "tabs.logs",
    settings: "tabs.settings",
  };

  function t(key: TranslationKey): string {
    return getTranslation($language, key);
  }

  function selectLanguage(nextLanguage: Language): void {
    setLanguage(nextLanguage);
  }

  function requestTabChange(nextTab: ScreenId): void {
    if (activeTab === "students" && nextTab !== "students" && studentsHaveDraftSelections) {
      pendingTab = nextTab;
      return;
    }

    activeTab = nextTab;
  }

  function cancelTabChange(): void {
    pendingTab = null;
  }

  function discardSelectionAndChangeTab(): void {
    if (!pendingTab) {
      return;
    }

    studentsHaveDraftSelections = false;
    activeTab = pendingTab;
    pendingTab = null;
  }

  $effect(() => {
    const requestedScreen = $requestedAppScreen;
    if (!requestedScreen) {
      return;
    }

    requestTabChange(requestedScreen);
    requestedAppScreen.set(null);
  });
</script>

<svelte:head>
  <title>{t("app.title")}</title>
</svelte:head>

<main class="app-shell">
  <aside class="app-sidebar">
    <header class="top-bar">
      <div class="brand-mark" aria-hidden="true"></div>
      <h1>{t("app.title")}</h1>
    </header>

    <nav class="tabs" aria-label={t("app.primarySections")}>
      {#each appTabs as tab}
        <button
          type="button"
          data-tab={tab.id}
          class:active={activeTab === tab.id}
          aria-pressed={activeTab === tab.id}
          onclick={() => requestTabChange(tab.id)}
        >
          {t(tab.labelKey)}
        </button>
      {/each}
    </nav>

    <div class="sidebar-bottom">
      <button
        type="button"
        data-tab="settings"
        class="sidebar-link"
        class:active={activeTab === "settings"}
        aria-pressed={activeTab === "settings"}
        onclick={() => requestTabChange("settings")}
      >
        {t("tabs.settings")}
      </button>

      <div class="language-toggle" role="group" aria-label={t("app.language")}>
        <button
        type="button"
        aria-pressed={$language === "en"}
        class:active={$language === "en"}
        onclick={() => selectLanguage("en")}
      >
        EN
        </button>
        <button
        type="button"
        aria-pressed={$language === "ar"}
        class:active={$language === "ar"}
        onclick={() => selectLanguage("ar")}
      >
        AR
        </button>
      </div>
    </div>
  </aside>

  <section class="workspace" aria-labelledby="active-tab-heading">
    <div class="panel-heading">
      <div>
        <span>{t("app.title")}</span>
        <h2 id="active-tab-heading">{t(panelTitleKeys[activeTab])}</h2>
      </div>
    </div>

    {#if activeTab === "students"}
      <StudentsTab onDraftSelectionChange={(hasDraft) => (studentsHaveDraftSelections = hasDraft)} />
    {:else if activeTab === "books"}
      <BooksTab />
    {:else if activeTab === "logs"}
      <LogsTab />
    {:else}
      <SettingsTab />
    {/if}
  </section>

  {#if pendingTab}
    <UnsavedBookSelectionDialog
      onCancel={cancelTabChange}
      onDiscard={discardSelectionAndChangeTab}
    />
  {/if}
</main>

<style>
  :global(:root) {
    font-family:
      "Segoe UI", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      sans-serif;
    color: #1b2435;
    background: #f4f7fb;
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  :global(body) {
    min-width: 320px;
    margin: 0;
  }

  .app-shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 252px minmax(0, 1fr);
    background:
      radial-gradient(circle at 85% 0%, #e0f4ef 0, transparent 28rem),
      #f4f7fb;
  }

  .app-sidebar {
    display: flex;
    position: sticky;
    top: 0;
    height: 100vh;
    box-sizing: border-box;
    flex-direction: column;
    padding: 30px 18px 20px;
    color: #eaf2f4;
    background: #172638;
  }

  .top-bar {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 0 12px 36px;
  }

  .brand-mark {
    width: 31px;
    height: 31px;
    flex: 0 0 auto;
    border-radius: 10px;
    background:
      linear-gradient(145deg, transparent 37%, #172638 38% 45%, transparent 46%),
      linear-gradient(145deg, #55c6a9, #b4f0d3);
    box-shadow: 0 7px 16px rgb(0 0 0 / 0.2);
  }

  h1,
  h2 {
    margin: 0;
  }

  h1 {
    max-width: 155px;
    color: #ffffff;
    font-size: 1.04rem;
    font-weight: 750;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .tabs {
    display: grid;
    gap: 7px;
  }

  .tabs button {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    border: 0;
    border-radius: 10px;
    padding: 12px;
    color: #aebdca;
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 0.92rem;
    font-weight: 650;
    text-align: start;
  }

  .tabs button::before {
    display: grid;
    width: 26px;
    height: 26px;
    place-items: center;
    border-radius: 8px;
    color: #80d8c2;
    background: rgb(255 255 255 / 0.06);
    font-size: 0.76rem;
    font-weight: 800;
    content: "01";
  }

  .tabs button[data-tab="books"]::before {
    content: "02";
  }

  .tabs button[data-tab="logs"]::before {
    content: "03";
  }

  .tabs button:hover {
    color: #ffffff;
    background: rgb(255 255 255 / 0.06);
  }

  .tabs button.active {
    color: #ffffff;
    background: #285065;
    box-shadow: inset 3px 0 #65d3b4;
  }

  .tabs button.active::before {
    color: #173447;
    background: #99e5cf;
  }

  .sidebar-bottom {
    display: grid;
    gap: 14px;
    margin-top: auto;
    padding: 0 12px;
  }

  .sidebar-link {
    display: flex;
    align-items: center;
    width: 100%;
    border: 0;
    border-radius: 10px;
    padding: 10px 12px;
    color: #aebdca;
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 0.88rem;
    font-weight: 700;
    text-align: start;
  }

  .sidebar-link:hover,
  .sidebar-link.active {
    color: #ffffff;
    background: rgb(255 255 255 / 0.08);
  }

  .language-toggle {
    display: flex;
    width: fit-content;
    gap: 3px;
    margin: 0;
    padding: 3px;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 9px;
    background: rgb(255 255 255 / 0.06);
  }

  .language-toggle button {
    min-width: 42px;
    border: 0;
    border-radius: 6px;
    padding: 7px 9px;
    color: #b5c5d0;
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 800;
  }

  .language-toggle button.active {
    color: #173447;
    background: #9be4cf;
  }

  .workspace {
    width: min(1440px, 100%);
    box-sizing: border-box;
    margin: 0 auto;
    padding: 48px clamp(24px, 5vw, 72px) 56px;
  }

  .panel-heading {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 28px;
  }

  .panel-heading h2 {
    color: #172638;
    font-size: clamp(1.7rem, 3vw, 2.25rem);
    line-height: 1.12;
    letter-spacing: -0.045em;
  }

  .panel-heading span {
    display: block;
    margin-bottom: 6px;
    color: #6d7d90;
    font-size: 0.73rem;
    font-weight: 800;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  :global(.app-shell button),
  :global(.app-shell input),
  :global(.app-shell select) {
    font-family: inherit;
  }

  :global(.app-shell button:not(.tabs button):not(.sidebar-link):not(.language-toggle button)) {
    min-height: 40px;
    border: 1px solid #173447;
    border-radius: 9px;
    padding: 8px 14px;
    color: #ffffff;
    background: #173447;
    box-shadow: 0 2px 0 rgb(7 28 40 / 0.12);
    font-weight: 750;
    transition: transform 140ms ease, background 140ms ease, box-shadow 140ms ease;
  }

  :global(.app-shell button:not(.tabs button):not(.sidebar-link):not(.language-toggle button):hover:not(:disabled)) {
    background: #285065;
    box-shadow: 0 5px 12px rgb(23 52 71 / 0.16);
    transform: translateY(-1px);
  }

  :global(.app-shell button.secondary) {
    border-color: #d7e0e9;
    color: #405267;
    background: #ffffff;
    box-shadow: none;
  }

  :global(.app-shell button:disabled) {
    cursor: not-allowed;
    opacity: 0.48;
    transform: none;
  }

  :global(.app-shell input),
  :global(.app-shell select) {
    border: 1px solid #d6e0e8;
    border-radius: 9px;
    padding: 10px 11px;
    color: #1d2b3c;
    background: #ffffff;
    box-shadow: 0 1px 1px rgb(23 52 71 / 0.025);
  }

  :global(.app-shell input:focus),
  :global(.app-shell select:focus) {
    outline: 3px solid rgb(101 211 180 / 0.24);
    outline-offset: 1px;
    border-color: #54b99f;
  }

  :global(.app-shell .students-toolbar),
  :global(.app-shell .books-toolbar) {
    align-items: end;
    border: 1px solid #e1e8ef;
    border-radius: 15px;
    padding: 18px;
    background: rgb(255 255 255 / 0.88);
    box-shadow: 0 10px 26px rgb(36 57 80 / 0.055);
  }

  :global(.app-shell .student-form),
  :global(.app-shell .book-form) {
    margin-top: 16px;
    border: 1px solid #e1e8ef;
    border-radius: 15px;
    padding: 18px;
    background: #ffffff;
    box-shadow: 0 10px 26px rgb(36 57 80 / 0.055);
  }

  :global(.app-shell label) {
    color: #506176;
    font-size: 0.77rem;
    font-weight: 800;
    letter-spacing: 0.025em;
  }

  :global(.app-shell .students-layout) {
    gap: 22px;
    align-items: stretch;
  }

  :global(.app-shell .students-list),
  :global(.app-shell .books-table-wrap),
  :global(.app-shell .student-book-panel),
  :global(.app-shell .student-book-placeholder),
  :global(.app-shell .log-group) {
    border: 1px solid #e1e8ef;
    border-radius: 15px;
    background: rgb(255 255 255 / 0.9);
    box-shadow: 0 10px 26px rgb(36 57 80 / 0.055);
  }

  :global(.app-shell .students-list),
  :global(.app-shell .books-table-wrap) {
    overflow: hidden;
  }

  :global(.app-shell .students-table-wrap) {
    overflow-x: auto;
  }

  :global(.app-shell table) {
    border-collapse: separate;
    border-spacing: 0;
  }

  :global(.app-shell th),
  :global(.app-shell td) {
    border-bottom-color: #edf1f5;
    padding: 14px 16px;
  }

  :global(.app-shell th) {
    color: #758497;
    background: #f7f9fb;
    font-size: 0.7rem;
    letter-spacing: 0.065em;
  }

  :global(.app-shell tbody tr:last-child td) {
    border-bottom: 0;
  }

  :global(.app-shell tbody tr.active) {
    background: #eefaf6;
  }

  :global(.app-shell tbody tr[data-stock-state="zero"]) {
    background: #fff8f0;
  }

  :global(.app-shell .student-book-panel) {
    padding: 22px;
  }

  :global(.app-shell .student-book-placeholder) {
    display: grid;
    min-height: 150px;
    place-items: center;
    padding: 20px;
    text-align: center;
  }

  :global(.app-shell .status-message) {
    border: 1px dashed #d5e0e9;
    border-radius: 15px;
    padding: 38px 20px;
    color: #708094;
    background: rgb(255 255 255 / 0.5);
  }

  :global(.app-shell .stock-warning),
  :global(.app-shell .stock-ok),
  :global(.app-shell .book-meta) {
    border-radius: 6px;
  }

  :global(.app-shell .logs-list) {
    gap: 14px;
  }

  :global(.app-shell .log-group) {
    padding: 20px;
  }

  :global(.app-shell .log-group button) {
    border-color: #a5522a;
    background: #a5522a;
  }

  :global(.app-shell .item-list li) {
    border-color: #e4ebf1;
    border-radius: 9px;
    background: #f8fafc;
  }

  :global(.app-shell .dialog-shell) {
    z-index: 20;
    background: rgb(14 27 42 / 0.46);
    backdrop-filter: blur(4px);
  }

  :global(.app-shell .dialog) {
    border: 1px solid #e0e8ee;
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 24px 64px rgb(12 31 49 / 0.25);
  }

  :global(.app-shell .dialog button:not(.secondary)) {
    border-color: #a5522a;
    background: #a5522a;
  }

  @media (max-width: 900px) {
    .app-shell {
      grid-template-columns: 1fr;
    }

    .app-sidebar {
      position: static;
      height: auto;
      padding: 18px 18px 14px;
    }

    .top-bar {
      padding: 0 6px 16px;
    }

    .tabs {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }

    .tabs button {
      justify-content: center;
      padding: 9px;
    }

    .sidebar-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 16px;
      padding: 0 6px;
    }

    .sidebar-link {
      width: auto;
    }

    .language-toggle {
      margin: 0;
    }

    .workspace {
      padding-top: 34px;
    }
  }

  @media (max-width: 540px) {
    .tabs button {
      font-size: 0;
    }

    .tabs button::before {
      font-size: 0.72rem;
    }

    .workspace {
      padding-inline: 16px;
      padding-bottom: 32px;
    }

    .panel-heading {
      margin-bottom: 20px;
    }

    :global(.app-shell .students-toolbar),
    :global(.app-shell .books-toolbar),
    :global(.app-shell .student-form),
    :global(.app-shell .book-form) {
      padding: 14px;
    }
  }
</style>
