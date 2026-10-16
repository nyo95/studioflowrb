import { readFileSync } from "node:fs";

import { expect, test, type Page, type Route } from "@playwright/test";

const { sf } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { sf: Record<string, string> };
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

async function upload(page: Page, name: string) {
  const file = page.locator('input[type="file"][id^="deliverable-upload-"]');
  await Promise.all([
    page.waitForEvent("load"),
    file.setInputFiles({ name, mimeType: "application/pdf", buffer: PDF }),
  ]);
  await page.waitForLoadState("networkidle");
}

const version = (page: Page, number: number, name = "version.pdf") => page
  .getByRole("listitem")
  .filter({ hasText: name })
  .filter({ hasText: new RegExp(`Version ${number}(?: \\(newest\\))?`) });
const actionError = (page: Page) => page.getByText("The action could not be completed. Please try again.", { exact: true });

async function refuseNextAction(page: Page) {
  let refused = false;
  const handler = async (route: Route) => {
    if (!refused && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      refused = true;
      await route.abort("failed");
    } else await route.continue();
  };
  await page.route("**/*", handler);
  return () => page.unroute("**/*", handler);
}

test("deliverable versions remain stable in the browser after pruning and deletion", async ({ page }) => {
  await page.goto(`/studioflow/projects/${sf.notes}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Deliverables", { exact: true })).toBeVisible();

  await upload(page, "version.pdf");
  await expect(version(page, 1)).toContainText("Version 1 (newest)");
  let release = await refuseNextAction(page);
  await version(page, 1).getByRole("button", { name: "Mark final" }).click();
  await expect(actionError(page)).toBeVisible();
  await expect(version(page, 1).getByRole("button", { name: "Mark final" })).toBeVisible();
  await release();
  await version(page, 1).getByRole("button", { name: "Mark final" }).click();
  await expect(version(page, 1)).toContainText("Final · kept");

  await upload(page, "version.pdf");
  await upload(page, "version.pdf");
  await upload(page, "version.pdf");
  await expect(version(page, 1)).toContainText("Version 1");
  await expect(version(page, 2)).toHaveCount(0);
  await expect(version(page, 3)).toContainText("Version 3");
  await expect(version(page, 4)).toContainText("Version 4 (newest)");

  await version(page, 4).getByRole("button", { name: "Delete version.pdf" }).click();
  let dialog = page.getByRole("alertdialog", { name: "Delete version.pdf?" });
  await expect(dialog).toContainText("Version 4 will be permanently deleted.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(version(page, 4)).toBeVisible();

  release = await refuseNextAction(page);
  await version(page, 4).getByRole("button", { name: "Delete version.pdf" }).click();
  await page.getByRole("alertdialog", { name: "Delete version.pdf?" }).getByRole("button", { name: "Delete file" }).click();
  await expect(actionError(page)).toBeVisible();
  await expect(version(page, 4)).toBeVisible();
  await release();
  await version(page, 4).getByRole("button", { name: "Delete version.pdf" }).click();
  await page.getByRole("alertdialog", { name: "Delete version.pdf?" }).getByRole("button", { name: "Delete file" }).click();
  await expect(version(page, 4)).toHaveCount(0);
  await expect(version(page, 3)).toContainText("Version 3 (newest)");

  release = await refuseNextAction(page);
  await version(page, 3).getByRole("button", { name: "Extend" }).click();
  await expect(actionError(page)).toBeVisible();
  await release();
  await version(page, 3).getByRole("button", { name: "Extend" }).click();
  await expect(actionError(page)).toHaveCount(0);

  await upload(page, "version.pdf");
  await expect(version(page, 5)).toContainText("Version 5 (newest)");
  await expect(version(page, 1)).toContainText("Final · kept");
  await expect(version(page, 3)).toContainText("Version 3");

  await upload(page, "another.pdf");
  await expect(page.getByRole("listitem").filter({ hasText: "another.pdf" })).toContainText("Version 1 (newest)");

  await version(page, 1).getByRole("button", { name: "Delete version.pdf" }).click();
  dialog = page.getByRole("alertdialog", { name: "Delete final file version.pdf?" });
  await expect(dialog).toContainText("Version 1 is the Final file.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(version(page, 1)).toContainText("Final · kept");
  await version(page, 1).getByRole("button", { name: "Delete version.pdf" }).click();
  await page.getByRole("alertdialog", { name: "Delete final file version.pdf?" }).getByRole("button", { name: "Delete file" }).click();
  await expect(version(page, 1)).toHaveCount(0);

  await page.setViewportSize({ width: 375, height: 812 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
