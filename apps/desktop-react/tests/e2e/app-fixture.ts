import { expect, type Page } from "@playwright/test";

export async function openFixture(page: Page, scenario?: "conflict" | "update") {
  const suffix = scenario ? `&scenario=${scenario}` : "";
  await page.goto(`/?runtime=fixture${suffix}`);
  const setup = page.getByRole("dialog");
  if (await setup.isVisible()) {
    await setup.getByPlaceholder("2025-2026").fill("2025-2026");
    await setup.getByPlaceholder("2025-2026").press("Enter");
    await expect(setup).toBeHidden();
  }
  await page.getByRole("button", { name: "EN" }).click();
  await expect(page.getByRole("button", { name: "Students" })).toBeVisible();
}

export async function createPrimaryStudent(page: Page, name = "Mona Ahmed") {
  await page.getByRole("button", { name: "Add student" }).click();
  const sheet = page.getByRole("dialog", { name: "Add student" });
  await sheet.getByLabel("Student name").fill(name);
  await sheet.getByLabel("Government ID").fill("29801011234567");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(name)).toBeVisible();
}

export async function createPrimaryBook(page: Page, name = "Primary Math") {
  await page.getByRole("button", { name: "Books" }).click();
  await page.getByRole("button", { name: "Add book" }).click();
  const sheet = page.getByRole("dialog", { name: "Add book" });
  await sheet.getByLabel("Book name").fill(name);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(name)).toBeVisible();
}
