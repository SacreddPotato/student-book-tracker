<script lang="ts">
  import { onMount } from "svelte";
  import { educationStages, type EducationStage } from "@app/shared";

  import { initializeLocalDatabase, type SqlDatabase } from "$lib/db/local-db";
  import { runLocalTransaction } from "$lib/db/local-transaction";
  import { listBooks, upsertBook, type BookRow } from "$lib/db/repositories/books";
  import { enqueueSyncCommand } from "$lib/db/repositories/outbox";
  import { getTranslation, language, type TranslationKey } from "$lib/i18n";
  import { addBookStock } from "$lib/services/inventory-service";
  import { requestDesktopSync } from "$lib/sync/sync-runner";
  import AddStockDialog from "./AddStockDialog.svelte";
  import BookForm, { type BookFormValue } from "./BookForm.svelte";

  type StageFilter = EducationStage | "all";

  type Props = {
    database?: SqlDatabase;
    createId?: () => string;
    now?: () => string;
    deviceId?: string;
  };

  const {
    database,
    createId = () => crypto.randomUUID(),
    now = () => new Date().toISOString(),
    deviceId = "local-device",
  }: Props = $props();

  let activeDatabase = $state<SqlDatabase | null>(null);
  let books = $state<BookRow[]>([]);
  let loading = $state(true);
  let showCreateForm = $state(false);
  let editingBook = $state<BookRow | null>(null);
  let stockBook = $state<BookRow | null>(null);
  let selectedStage = $state<StageFilter>("all");
  let errorKey = $state<TranslationKey | null>(null);
  let actionErrorKey = $state<TranslationKey | null>(null);
  let stockErrorKey = $state<TranslationKey | null>(null);
  let savingBook = $state(false);
  let savingStock = $state(false);

  const visibleBooks = $derived(
    selectedStage === "all"
      ? books
      : books.filter((book) => book.educationStage === selectedStage),
  );

  function t(key: TranslationKey): string {
    return getTranslation($language, key);
  }

  function stageLabel(stage: EducationStage): string {
    return t(`stages.${stage}`);
  }

  async function getDatabase(): Promise<SqlDatabase> {
    if (activeDatabase) {
      return activeDatabase;
    }

    if (database) {
      activeDatabase = database;
      return activeDatabase;
    }

    activeDatabase ??= await initializeLocalDatabase();
    return activeDatabase;
  }

  async function refreshBooks(): Promise<void> {
    const db = await getDatabase();
    books = await listBooks(db);
    loading = false;
  }

  onMount(() => {
    void refreshBooks().catch(() => {
      loading = false;
      errorKey = "errors.booksLoadFailed";
    });
  });

  async function persistBook(value: BookFormValue): Promise<void> {
    const db = await getDatabase();
    const timestamp = now();
    const currentBook = editingBook;
    const bookId = currentBook?.id ?? createId();

    await runLocalTransaction(db, async (transaction) => {
      await upsertBook(transaction, {
        id: bookId,
        scopeId: currentBook?.scopeId ?? "global",
        name: value.name,
        educationStage: value.educationStage,
        quantity: currentBook?.quantity ?? 0,
        createdAt: currentBook?.createdAt ?? timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      });
      await enqueueSyncCommand(
        transaction,
        {
          id: crypto.randomUUID(),
          type: "UPSERT_BOOK",
          deviceId,
          occurredAt: timestamp,
          book: {
            id: bookId,
            name: value.name,
            educationStage: value.educationStage,
          },
        },
        timestamp,
      );
    });

    showCreateForm = false;
    editingBook = null;
    await refreshBooks();
    if (!database) {
      void requestDesktopSync(db);
    }
  }

  async function saveBook(value: BookFormValue): Promise<void> {
    if (savingBook) return;
    savingBook = true;
    try {
      await persistBook(value);
      actionErrorKey = null;
    } catch {
      actionErrorKey = "errors.saveFailed";
    } finally {
      savingBook = false;
    }
  }

  async function confirmAddStock(quantity: number): Promise<void> {
    if (!stockBook) {
      return;
    }

    if (savingStock) return;
    savingStock = true;
    stockErrorKey = null;
    try {
      const db = await getDatabase();
      await addBookStock(
        {
          bookId: stockBook.id,
          quantity,
        },
        {
          database: db,
          createId,
          now,
          deviceId,
        },
      );

      stockBook = null;
      await refreshBooks();
      if (!database) {
        void requestDesktopSync(db);
      }
    } catch {
      stockErrorKey = "errors.saveFailed";
    } finally {
      savingStock = false;
    }
  }

  function cancelForm(): void {
    showCreateForm = false;
    editingBook = null;
    actionErrorKey = null;
  }
</script>

<section class="books-tab" aria-label={t("books.inventory")}>
  <div class="books-toolbar">
    <label>
      <span>{t("books.stageFilter")}</span>
      <select bind:value={selectedStage}>
        <option value="all">{t("books.allStages")}</option>
        {#each educationStages as stage}
          <option value={stage}>{stageLabel(stage)}</option>
        {/each}
      </select>
    </label>

    <button
      type="button"
      onclick={() => {
        editingBook = null;
        actionErrorKey = null;
        showCreateForm = true;
      }}
    >
      {t("books.addBook")}
    </button>
  </div>

  {#if errorKey || actionErrorKey}
    <p class="status-message" role="alert">{t(errorKey ?? actionErrorKey!)}</p>
  {/if}

  {#if showCreateForm}
    <BookForm onCancel={cancelForm} onSave={saveBook} saving={savingBook} />
  {/if}

  {#if editingBook}
    {#key editingBook.id}
      <BookForm book={editingBook} onCancel={cancelForm} onSave={saveBook} saving={savingBook} />
    {/key}
  {/if}

  {#if loading}
    <p class="status-message">{t("books.loading")}</p>
  {:else if visibleBooks.length === 0}
    <p class="status-message">
      {books.length === 0 ? t("emptyStates.books") : t("books.noMatchingStage")}
    </p>
  {:else}
    <div class="books-table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">{t("forms.bookName")}</th>
            <th scope="col">{t("forms.educationStage")}</th>
            <th scope="col" class="numeric">{t("forms.quantity")}</th>
            <th scope="col">{t("books.status")}</th>
            <th scope="col">{t("books.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each visibleBooks as book}
            <tr data-stock-state={book.quantity === 0 ? "zero" : "available"}>
              <td>
                <strong>{book.name}</strong>
              </td>
              <td>{stageLabel(book.educationStage)}</td>
              <td class="numeric">{book.quantity}</td>
              <td>
                {#if book.quantity === 0}
                  <span class="stock-warning">{t("warnings.zeroStock")}</span>
                {:else}
                  <span class="stock-ok">{t("books.inStock")}</span>
                {/if}
              </td>
              <td>
                <div class="row-actions">
                  <button
                    type="button"
                    class="secondary"
                    aria-label={`${t("books.editBook")} ${book.name}`}
                    onclick={() => {
                      showCreateForm = false;
                      editingBook = book;
                    }}
                  >
                    {t("buttons.edit")}
                  </button>
                  <button
                    type="button"
                    aria-label={`${t("books.addStockTo")} ${book.name}`}
                    onclick={() => (stockBook = book)}
                  >
                    {t("buttons.addStock")}
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if stockBook}
    <AddStockDialog
      book={stockBook}
      onCancel={() => {
        stockBook = null;
        stockErrorKey = null;
      }}
      onConfirm={confirmAddStock}
      saving={savingStock}
      errorKey={stockErrorKey}
    />
  {/if}
</section>

<style>
  .books-tab {
    display: grid;
    gap: 16px;
  }

  .books-toolbar {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 0;
    border-bottom: 1px solid #e3ebe8;
  }

  label {
    display: grid;
    gap: 6px;
    min-width: 210px;
    color: #42535a;
    font-size: 0.84rem;
    font-weight: 700;
  }

  select {
    border: 1px solid #cbd8d5;
    border-radius: 6px;
    padding: 9px 10px;
    color: #17212f;
    background: #ffffff;
    font: inherit;
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
    white-space: nowrap;
  }

  button.secondary {
    color: #42535a;
    background: #ffffff;
    border-color: #cbd8d5;
  }

  .status-message {
    margin: 0;
    padding: 28px 0;
    color: #637178;
    font-weight: 700;
    text-align: center;
  }

  .books-table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 720px;
  }

  th,
  td {
    border-bottom: 1px solid #e4ebe9;
    padding: 12px 10px;
    color: #24313c;
    text-align: start;
    vertical-align: middle;
  }

  th {
    color: #607077;
    background: #f7faf9;
    font-size: 0.78rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .numeric {
    text-align: end;
  }

  tbody tr[data-stock-state="zero"] {
    background: #fff8ed;
  }

  .stock-warning,
  .stock-ok {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .stock-warning {
    color: #8a3d10;
    background: #ffead2;
  }

  .stock-ok {
    color: #27554b;
    background: #e8f4ef;
  }

  .row-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  @media (max-width: 760px) {
    .books-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    label {
      min-width: 0;
    }

    .row-actions {
      justify-content: flex-start;
    }
  }
</style>
