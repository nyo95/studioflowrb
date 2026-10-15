import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

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

const version = (page: Page, number: number) => page.getByRole("listitem").filter({ hasText: new RegExp(`Version ${number}(?: \\(newest\\))?`) });

test("deliverable versions remain stable in the browser after pruning and deletion", async ({ page }) => {
  await page.goto(`/studioflow/projects/${sf.notes}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Deliverables", { exact: true })).toBeVisible();

  await upload(page, "version.pdf");
  await expect(version(page, 1)).toContainText("Version 1 (newest)");
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
  await expect(version(page, 4)).toHaveCount(0);
  await expect(version(page, 3)).toContainText("Version 3 (newest)");
  await upload(page, "version.pdf");
  await expect(version(page, 5)).toContainText("Version 5 (newest)");
  await expect(version(page, 1)).toContainText("Final · kept");
  await expect(version(page, 3)).toContainText("Version 3");

  await upload(page, "another.pdf");
  await expect(page.getByRole("listitem").filter({ hasText: "another.pdf" })).toContainText("Version 1 (newest)");
});
