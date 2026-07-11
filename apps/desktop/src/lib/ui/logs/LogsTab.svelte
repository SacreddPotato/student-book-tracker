<script lang="ts">
  import { onMount } from "svelte";
  import { formatCairoDateTime } from "@app/shared";

  import { initializeLocalDatabase, type SqlDatabase } from "$lib/db/local-db";
  import { listBooks, type BookRow } from "$lib/db/repositories/books";
  import { listStudents, type StudentRow } from "$lib/db/repositories/students";
  import {
    listInventoryTransactionItems,
    listInventoryTransactions,
    type InventoryTransactionItemRow,
    type InventoryTransactionRow,
  } from "$lib/db/repositories/transactions";
  import { getTranslation, language, type TranslationKey } from "$lib/i18n";
  import { reverseTransaction } from "$lib/services/inventory-service";
  import { requestDesktopSync } from "$lib/sync/sync-runner";
  import LogGroup, { type LogEntryView } from "./LogGroup.svelte";
  import ReverseTransactionDialog from "./ReverseTransactionDialog.svelte";

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
  let entries = $state<LogEntryView[]>([]);
  let pendingReverseEntry = $state<LogEntryView | null>(null);
  let loading = $state(true);
  let errorKey = $state<TranslationKey | null>(null);
  let reversing = $state(false);

  function t(key: TranslationKey): string {
    return getTranslation($language, key);
  }

  async function getDatabase(): Promise<SqlDatabase> {
    if (activeDatabase) {
      return activeDatabase;
    }

    if (database) {
      activeDatabase = database;
      return activeDatabase;
    }

    activeDatabase = await initializeLocalDatabase();
    return activeDatabase;
  }

  async function refreshLogs(): Promise<void> {
    const db = await getDatabase();
    const [transactions, books, students] = await Promise.all([
      listInventoryTransactions(db),
      listBooks(db),
      listStudents(db),
    ]);
    const itemGroups = await Promise.all(
      transactions.map(async (transaction) => ({
        transactionId: transaction.id,
        items: await listInventoryTransactionItems(db, transaction.id),
      })),
    );

    const itemsByTransaction = new Map(
      itemGroups.map(({ transactionId, items }) => [transactionId, items]),
    );
    const booksById = new Map(books.map((book) => [book.id, book]));
    const studentsById = new Map(students.map((student) => [student.id, student]));

    entries = transactions.map((transaction) =>
      buildEntry({
        transaction,
        items: itemsByTransaction.get(transaction.id) ?? [],
        booksById,
        studentsById,
      }),
    );
    loading = false;
  }

  function buildEntry({
    transaction,
    items,
    booksById,
    studentsById,
  }: {
    transaction: InventoryTransactionRow;
    items: InventoryTransactionItemRow[];
    booksById: Map<string, BookRow>;
    studentsById: Map<string, StudentRow>;
  }): LogEntryView {
    const firstBook = booksById.get(items[0]?.bookId ?? "");
    const student = transaction.studentId ? studentsById.get(transaction.studentId) : null;

    return {
      id: transaction.id,
      title: getEntryTitle(transaction, firstBook, student),
      typeLabel: getTransactionTypeLabel(transaction.type),
      occurredAt: formatCairoDateTime(transaction.occurredAt),
      items: items.map((item) => ({
        id: item.id,
        bookName: booksById.get(item.bookId)?.name ?? t("logs.unknownBook"),
        quantityDelta: formatQuantityDelta(item.quantityDelta),
        quantityAfter: t("logs.quantityAfter").replace("{count}", String(item.quantityAfter)),
      })),
      canReverse: transaction.type !== "reversal" && !transaction.reversedByTransactionId,
      isReversed: transaction.type === "reversal" || Boolean(transaction.reversedByTransactionId),
    };
  }

  function getEntryTitle(
    transaction: InventoryTransactionRow,
    firstBook: BookRow | undefined,
    student: StudentRow | null | undefined,
  ): string {
    if (transaction.type === "stock_increase") {
      return firstBook?.name ?? t("logs.unknownBook");
    }

    if (transaction.type === "student_issue") {
      return student?.name ?? t("logs.unknownStudent");
    }

    return t("logs.reversal");
  }

  function getTransactionTypeLabel(type: string): string {
    if (type === "stock_increase") {
      return t("logs.shipmentIncrease");
    }

    if (type === "student_issue") {
      return t("logs.studentIssue");
    }

    return t("logs.reversal");
  }

  function formatQuantityDelta(quantityDelta: number): string {
    return quantityDelta > 0 ? `+${quantityDelta}` : String(quantityDelta);
  }

  onMount(() => {
    void refreshLogs().catch(() => {
      loading = false;
      errorKey = "errors.logsLoadFailed";
    });
  });

  function requestReverse(entry: LogEntryView): void {
    pendingReverseEntry = entry;
  }

  async function confirmReverse(): Promise<void> {
    if (!pendingReverseEntry) {
      return;
    }

    if (reversing) return;
    reversing = true;
    try {
      const db = await getDatabase();
      const transactionId = pendingReverseEntry.id;
      await reverseTransaction(
        { transactionId },
        {
          database: db,
          createId,
          now,
          deviceId,
        },
      );
      pendingReverseEntry = null;
      await refreshLogs();
      if (!database) {
        void requestDesktopSync(db);
      }
      errorKey = null;
    } catch {
      errorKey = "errors.saveFailed";
    } finally {
      reversing = false;
    }
  }
</script>

<section class="logs-tab" aria-label={t("logs.inventoryHistory")}>
  {#if errorKey}
    <p class="status-message">{t(errorKey)}</p>
  {/if}

  {#if loading}
    <p class="status-message">{t("logs.loading")}</p>
  {:else if entries.length === 0}
    <p class="status-message">{t("logs.noLogs")}</p>
  {:else}
    <div class="logs-list">
      {#each entries as entry}
        <LogGroup {entry} onReverse={requestReverse} />
      {/each}
    </div>
  {/if}

  {#if pendingReverseEntry}
    <ReverseTransactionDialog
      title={pendingReverseEntry.title}
      onCancel={() => (pendingReverseEntry = null)}
      onConfirm={confirmReverse}
      saving={reversing}
    />
  {/if}
</section>

<style>
  .logs-tab {
    display: grid;
    gap: 16px;
  }

  .logs-list {
    display: grid;
  }

  .status-message {
    margin: 0;
    padding: 28px 0;
    color: #637178;
    font-weight: 700;
    text-align: center;
  }
</style>
