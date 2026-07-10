import { expect, test } from "@playwright/test";

import { openFixture } from "./app-fixture";

test("sync conflict detail remains reviewable and can be acknowledged", async ({ page }) => {
  await openFixture(page, "conflict");
  await page.getByRole("button", { name: /Needs review/ }).click();
  const dialog = page.getByRole("dialog", { name: "Sync conflicts" });
  await expect(dialog.getByText("Mona Ahmed")).toBeVisible();
  await expect(dialog.getByText("Primary Math")).toBeVisible();
  await dialog.getByRole("button", { name: "Acknowledge" }).click();
  await expect(dialog.getByText("Mona Ahmed")).not.toBeVisible();
});

test("update notice routes to explicit download and install controls", async ({ page }) => {
  await openFixture(page, "update");
  const notice = page.getByLabel("Update available");
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "View update" }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 2 })).toBeVisible();
  await page.getByRole("button", { name: "Download update" }).click();
  await expect(page.getByText("The update is ready to install.")).toBeVisible();
  await page.getByRole("button", { name: "Install update" }).click();
  await expect(page.getByRole("button", { name: /Installing update/ })).toBeDisabled();
});
