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
  // notes-chat.spec edits this seeded note's text, so match its stable prefix rather than the original body.
  const mine = log.getByRole("article").filter({ hasText: "ZZ-Test General note" });
  const theirs = log.getByRole("article").filter({ hasText: "ZZ-Test note from Lia" });
  await expect(mine).toContainText("Eka Tester");
  await expect(theirs).toContainText("Lia Limited");
  const myBox = await mine.boundingBox();
  const theirBox = await theirs.boundingBox();
  expect(myBox && theirBox && myBox.x < theirBox.x).toBeTruthy();
});

test("a non-PIC Designer sees the project list but cannot open project detail", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, baseURL: "http://localhost:3101" });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email").fill(viewer.email);
    await page.getByLabel("Password").fill(viewer.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await page.goto("/studioflow/projects");
    const row = page.getByRole("row").filter({ hasText: "ZZ-Test SF Notes Chat" });
    await expect(row).toContainText("Project list only");
    await expect(row.getByRole("link", { name: /ZZ-Test SF Notes Chat/ })).toHaveCount(0);
    await page.goto(`/studioflow/projects/${sf.notesChat}`);
    await expect(page).toHaveURL(/\/studioflow\/projects$/);
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
