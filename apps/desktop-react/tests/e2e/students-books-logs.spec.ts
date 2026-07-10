import { expect, test } from "@playwright/test";

import { createPrimaryBook, createPrimaryStudent, openFixture } from "./app-fixture";

test("student, stock, issuance, export, history, and reversal flow", async ({ page }) => {
  await openFixture(page);
  await createPrimaryStudent(page);
  await createPrimaryBook(page);

  await page.getByRole("button", { name: "Add stock to Primary Math" }).click();
  const stockDialog = page.getByRole("dialog", { name: "Add stock to Primary Math" });
  await stockDialog.getByLabel("Quantity").fill("2");
  await stockDialog.getByRole("button", { name: "Add stock" }).click();
  await expect(page.getByRole("row", { name: /Primary Math/ })).toContainText("2");

  await page.getByRole("button", { name: "Students" }).click();
  await page.getByRole("button", { name: "Select student Mona Ahmed" }).click();
  await page.getByRole("checkbox", { name: /Primary Math/ }).click();
  await page.getByRole("button", { name: "Issue selected books" }).click();
  await expect(page.getByText("Books issued.")).toBeVisible();

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
