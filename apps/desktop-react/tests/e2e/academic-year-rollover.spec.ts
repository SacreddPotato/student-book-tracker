import { expect, test } from "@playwright/test";

import { createPrimaryBook, createPrimaryStudent, openFixture } from "./app-fixture";

test("advances students while preserving a read-only prior year and global books", async ({ page }) => {
  await openFixture(page);
  await createPrimaryStudent(page, "Mona Ahmed");
  await createPrimaryBook(page, "Primary Math");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advance to 2026-2027" }).click();
  const dialog = page.getByRole("dialog", { name: "Advance academic year?" });
  await dialog.getByLabel("Type 2026-2027 to confirm").fill("2026-2027");
  await dialog.getByRole("button", { name: "Advance academic year" }).click();

  await page.getByRole("button", { name: "Students" }).click();
  await expect(page.getByText("Mona Ahmed")).toBeVisible();
  await expect(page.getByRole("row", { name: /Mona Ahmed/ })).toContainText("2nd Primary");
  await page.getByRole("combobox", { name: "Academic year" }).click();
  await page.getByRole("option", { name: "2025-2026" }).click();
  await expect(page.getByText("This academic year is archived and read only.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add student" })).toHaveCount(0);

  await page.getByRole("button", { name: "Books" }).click();
  await expect(page.getByText("Primary Math")).toBeVisible();
  await page.getByRole("button", { name: "Logs" }).click();
  await expect(page.getByText("No inventory history yet.")).toBeVisible();
});
