import { expect, test } from "@playwright/test";

import { createPrimaryBook, createPrimaryStudent, openFixture } from "./app-fixture";

test("student, stock, issuance, export, history, and reversal flow", async ({ page }) => {
  await openFixture(page);
  await createPrimaryStudent(page);
  await createPrimaryBook(page);

  await page.getByRole("button", { name: "Add first semester stock to Primary Math" }).click();
  const stockDialog = page.getByRole("dialog", { name: "Add first semester stock to Primary Math" });
  await stockDialog.getByLabel("Quantity").fill("2");
  await stockDialog.getByLabel("Issue receipt number").fill("00041");
  await stockDialog.getByLabel("Issue receipt date").fill("2026-01-14");
  await stockDialog.getByRole("button", { name: "Add stock" }).click();
  await expect(page.getByRole("row", { name: /Primary Math/ })).toContainText("2");

  await page.getByRole("button", { name: "Students" }).click();
  await page.getByRole("button", { name: "Select student Mona Ahmed" }).click();
  await page.getByRole("button", { name: "Primary Math" }).click();
  await page.getByRole("checkbox", { name: /First semester/ }).click();
  await page.getByRole("button", { name: "Issue selected books" }).click();
  await expect(page.getByText("Books issued.")).toBeVisible();

  await page.getByRole("button", { name: "Books", exact: true }).click();
  const bookRow = page.locator("tr.book-row").filter({ hasText: "Primary Math" });
  const disclosure = bookRow.locator(".book-history-toggle");
  await bookRow.locator("td").first().click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  const history = page.locator(".book-history-panel");
  await expect(history.getByText("2025-2026")).toBeVisible();
  await expect(history.getByText("Receipt 00041")).toBeVisible();
  await expect(history.getByText("2026-01-14")).toBeVisible();
  await expect(history.getByText(/Mona Ahmed/)).toBeVisible();
  await bookRow.getByRole("button", { name: "Add second semester stock to Primary Math" }).click();
  await expect(page.getByRole("dialog", { name: "Add second semester stock to Primary Math" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: "Students", exact: true }).click();
  await page.getByRole("combobox", { name: "Grade level" }).click();
  await page.getByRole("option", { name: "1st Primary" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export grade" }).click();
  expect((await download).suggestedFilename()).toBe("students-primary1.xlsx");

  await page.getByRole("button", { name: "Logs" }).click();
  await expect(page.getByText("Student issue")).toBeVisible();
  await page.getByRole("button", { name: "Reverse transaction" }).first().click();
  await page.getByRole("dialog", { name: "Reverse transaction?" }).getByRole("button", { name: "Reverse transaction" }).click();
  await expect(page.getByText("Transaction reversed.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reversal" })).toBeVisible();
});
