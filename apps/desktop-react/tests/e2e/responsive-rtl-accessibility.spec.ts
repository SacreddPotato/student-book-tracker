import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { openFixture } from "./app-fixture";

test("desktop and narrow RTL shells remain labelled and accessible", async ({ page }) => {
  await openFixture(page);
  let results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await page.getByRole("button", { name: "AR" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "الطلاب" })).toBeVisible();
  await expect(page.locator(".sync-status-button")).toBeVisible();
  results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
