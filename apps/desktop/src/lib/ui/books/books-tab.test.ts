// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { DatabaseSync } from "node:sqlite";
import { render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SqlDatabase, SqlValue } from "../../db/local-db";
import { runMigrations } from "../../db/migrations";
import { listBooks, upsertBook } from "../../db/repositories/books";
import { listPendingOutboxRows } from "../../db/repositories/outbox";
import { listInventoryTransactions } from "../../db/repositories/transactions";
import BooksTab from "./BooksTab.svelte";

class TestSqliteDatabase implements SqlDatabase {
  readonly db = new DatabaseSync(":memory:");

  async execute(sql: string, values: SqlValue[] = []): Promise<void> {
    this.db.prepare(sql).run(toSqliteBindings(values));
  }

  async select<T>(sql: string, values: SqlValue[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(toSqliteBindings(values)) as T[];
  }

  close(): void {
    this.db.close();
  }
}

function toSqliteBindings(values: SqlValue[]): Record<string, SqlValue> {
  return Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value]));
}

const fixedNow = "2026-07-08T10:00:00.000Z";

function createIdSequence(ids: string[]): () => string {
  let index = 0;

  return () => {
    const id = ids[index];
    index += 1;

    if (!id) {
      throw new Error("Test ran out of deterministic IDs.");
    }

    return id;
  };
}

async function seedBook(
  database: SqlDatabase,
  book: { id: string; name: string; educationStage: "kg" | "primary" | "preparatory"; quantity: number },
): Promise<void> {
  await upsertBook(database, {
    ...book,
    scopeId: "global",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
  });
}

describe("BooksTab", () => {
  let database: TestSqliteDatabase;

  beforeEach(async () => {
    database = new TestSqliteDatabase();
    await runMigrations(database);
  });

  afterEach(() => {
    database.close();
  });

  it("uses a book-specific load error instead of the generic validation message", async () => {
    render(BooksTab, {
      props: {
        database: {
          execute: async () => undefined,
          select: async () => {
            throw new Error("database unavailable");
          },
        },
      },
    });

    expect(await screen.findByText("Could not load books.")).toBeInTheDocument();
    expect(screen.queryByText("Validation failed")).not.toBeInTheDocument();
  });

  it("keeps the book form open and explains a failed save", async () => {
    const user = userEvent.setup();
    const unavailableDatabase: SqlDatabase = {
      execute: async () => {
        throw new Error("write unavailable");
      },
      select: async () => [],
    };

    render(BooksTab, { props: { database: unavailableDatabase } });

    await user.click(screen.getByRole("button", { name: "Add book" }));
    await user.type(screen.getByLabelText("Book name"), "Primary Math");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save changes.");
    expect(screen.getByRole("form", { name: "Add book" })).toBeInTheDocument();
  });

  it("updates the visible quantity after adding stock", async () => {
    const user = userEvent.setup();
    await seedBook(database, {
      id: "book-1",
      name: "Primary Math",
      educationStage: "primary",
      quantity: 2,
    });

    render(BooksTab, {
      props: {
        database,
        createId: createIdSequence(["stock-command", "stock-transaction", "stock-item"]),
        now: () => fixedNow,
        deviceId: "device-1",
      },
    });

    const row = await screen.findByRole("row", { name: /Primary Math/i });
    expect(within(row).getByText("2")).toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: /Add stock to Primary Math/i }));
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "5");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    const updatedRow = await screen.findByRole("row", { name: /Primary Math/i });
    expect(within(updatedRow).getByText("7")).toBeInTheDocument();
    expect(JSON.parse((await listPendingOutboxRows(database))[0]?.payloadJson ?? "{}")).toEqual(
      expect.objectContaining({
        type: "ADD_BOOK_STOCK",
        bookId: "book-1",
        quantity: 5,
      }),
    );
  });

  it("accepts only one add-stock submission while saving", async () => {
    const user = userEvent.setup();
    await seedBook(database, {
      id: "book-1",
      name: "Primary Math",
      educationStage: "primary",
      quantity: 2,
    });

    render(BooksTab, {
      props: {
        database,
        createId: createIdSequence(["stock-command", "stock-transaction", "stock-item"]),
        now: () => fixedNow,
      },
    });

    const row = await screen.findByRole("row", { name: /Primary Math/i });
    await user.click(within(row).getByRole("button", { name: /Add stock to Primary Math/i }));
    const confirm = screen.getByRole("button", { name: "Confirm" });
    confirm.click();
    confirm.click();

    await waitFor(() => expect(screen.getByRole("row", { name: /Primary Math/i })).toHaveTextContent("3"));
    expect(await listInventoryTransactions(database)).toHaveLength(1);
    expect(await listPendingOutboxRows(database)).toHaveLength(1);
  });

  it("displays zero-stock books with a warning label and row state", async () => {
    await seedBook(database, {
      id: "book-1",
      name: "Primary Science",
      educationStage: "primary",
      quantity: 0,
    });

    render(BooksTab, { props: { database } });

    const row = await screen.findByRole("row", { name: /Primary Science/i });
    expect(row).toHaveAttribute("data-stock-state", "zero");
    expect(within(row).getByText("Out of stock")).toBeInTheDocument();
  });

  it("creates and edits books, then filters the list by education stage", async () => {
    const user = userEvent.setup();
    render(BooksTab, {
      props: {
        database,
        createId: createIdSequence(["book-1"]),
        now: () => fixedNow,
      },
    });

    await user.click(screen.getByRole("button", { name: "Add book" }));
    await user.type(screen.getByLabelText("Book name"), "KG Alphabet");
    await user.selectOptions(screen.getByLabelText("Education stage"), "kg");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("row", { name: /KG Alphabet/i })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Stage filter"), "primary");
    expect(screen.queryByRole("row", { name: /KG Alphabet/i })).not.toBeInTheDocument();
    expect(screen.getByText("No books match this stage")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Stage filter"), "kg");
    const row = await screen.findByRole("row", { name: /KG Alphabet/i });
    await user.click(within(row).getByRole("button", { name: /Edit KG Alphabet/i }));
    await user.clear(screen.getByLabelText("Book name"));
    await user.type(screen.getByLabelText("Book name"), "Primary Reader");
    await user.selectOptions(screen.getByLabelText("Education stage"), "primary");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await user.selectOptions(screen.getByLabelText("Stage filter"), "primary");
    expect(await screen.findByRole("row", { name: /Primary Reader/i })).toBeInTheDocument();
    expect(await listBooks(database)).toEqual([
      expect.objectContaining({
        id: "book-1",
        name: "Primary Reader",
        educationStage: "primary",
        quantity: 0,
      }),
    ]);
  });
});
