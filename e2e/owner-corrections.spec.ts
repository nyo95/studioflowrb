import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const { sf, viewer } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as {
  sf: Record<string, string>;
  viewer: { email: string; password: string };
};

test("Notes identifies both senders and places my messages on the left", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/studioflow/projects/${sf.notesChat}`);
  const log = page.getByRole("log", { name: "Notes" });
  const mine = log.getByRole("article").filter({ hasText: "ZZ-Test General note edit check" });
  const theirs = log.getByRole("article").filter({ hasText: "ZZ-Test note from Lia" });
  await expect(mine).toContainText("Eka Tester");
  await expect(theirs).toContainText("Lia Limited");
  const myBox = await mine.boundingBox();
  const theirBox = await theirs.boundingBox();
  expect(myBox && theirBox && myBox.x < theirBox.x).toBeTruthy();
});

test("a non-PIC override viewer sees four read-only sections and cannot open hidden work sections", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, baseURL: "http://localhost:3101" });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email").fill(viewer.email);
    await page.getByLabel("Password").fill(viewer.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await page.goto(`/studioflow/projects/${sf.notesChat}/schedule`);
    const sections = page.getByRole("navigation", { name: "Project sections" });
    await expect(sections.getByRole("link", { name: /^Schedule/ })).toBeVisible();
    await expect(sections.getByRole("link", { name: "Presentation" })).toBeVisible();
    await expect(sections.getByRole("link", { name: "Timeline" })).toBeVisible();
    await expect(sections.getByRole("link", { name: "History" })).toBeVisible();
    await expect(sections.getByRole("link", { name: "Phases" })).toHaveCount(0);
    await expect(sections.getByRole("link", { name: "MOM" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Add item|New item|Create entry/ })).toHaveCount(0);
    await page.goto(`/studioflow/projects/${sf.notesChat}`);
    await expect(page).toHaveURL(new RegExp(`/studioflow/projects/${sf.notesChat}/schedule$`));
    await page.goto(`/studioflow/projects/${sf.notesChat}/mom`);
    await expect(page).toHaveURL(new RegExp(`/studioflow/projects/${sf.notesChat}/schedule$`));
  } finally {
    await context.close();
  }
});

test("staff corrects a SKU Brand through Edit and sees the source-link consequence", async ({ page }) => {
  await page.goto("/masterdata/skus");
  await page.getByRole("searchbox").fill("ZZ-Test Brand Correction SKU");
  const row = page.getByRole("row").filter({ hasText: "ZZ-Test Brand Correction SKU" });
  await expect(row).toContainText("ZZ-Test Wrong Brand");
  await expect(row).toContainText(/26[.,]000/);
  await row.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit SKU ZZ-Test Brand Correction SKU" });
  await dialog.getByRole("button", { name: "SKU brand" }).click();
  await page.getByPlaceholder("Search brands…").last().fill("ZZ-Test Correct Brand");
  await page.getByRole("option", { name: "ZZ-Test Correct Brand" }).click();
  await expect(dialog).toContainText("1 price source link from the old Brand will be removed");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole("searchbox").fill("ZZ-Test Brand Correction SKU");
  await expect(row).toContainText("ZZ-Test Correct Brand");
  await expect(row).toContainText(/26[.,]000/);
});
