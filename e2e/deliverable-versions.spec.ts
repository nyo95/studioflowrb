import { readFileSync } from "node:fs";

import { expect, test, type Page, type Route } from "@playwright/test";

const { sf } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { sf: Record<string, string> };
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

async function upload(page: Page, name: string) {
  // The project Deliverables table renders one upload input per phase the user may work in; the active phase is first.
  const file = page.locator('input[type="file"][id^="deliverable-upload-"]').first();
  await Promise.all([
    page.waitForEvent("load"),
    file.setInputFiles({ name, mimeType: "application/pdf", buffer: PDF }),
  ]);
  await page.waitForLoadState("networkidle");
}

async function refuseNextAction(page: Page) {
  let refused = false;
  const handler = async (route: Route) => {
    // Shell polling (unread counts) also posts Server Actions, always without arguments; refuse only the user's command.
    if (!refused && route.request().method() === "POST" && route.request().headers()["next-action"] && route.request().postData() !== "[]") {
      refused = true;
      await route.abort("failed");
    } else await route.continue();
  };
  await page.route("**/*", handler);
  return () => page.unroute("**/*", handler);
}

test("a phase keeps one file and confirms its deletion", async ({ page }) => {
  await page.goto(`/studioflow/projects/${sf.notes}/deliverables`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Deliverables" })).toBeVisible();

  await upload(page, "draft.pdf");
  await expect(page.getByRole("row").filter({ hasText: "draft.pdf" })).toHaveCount(1);
  await upload(page, "issued.pdf");
  await expect(page.getByRole("row").filter({ hasText: "draft.pdf" })).toHaveCount(0);
  const current = page.getByRole("row").filter({ hasText: "issued.pdf" });
  await expect(current).toHaveCount(1);
  await expect(current).toContainText("Current");

  await current.getByRole("button", { name: "Delete issued.pdf" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete issued.pdf?" });
  await expect(dialog).toContainText("permanently deletes the file for this phase");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(current).toBeVisible();

  const release = await refuseNextAction(page);
  await current.getByRole("button", { name: "Delete issued.pdf" }).click();
  await page.getByRole("alertdialog", { name: "Delete issued.pdf?" }).getByRole("button", { name: "Delete file" }).click();
  await expect(page.getByText("The action could not be completed. Please try again.", { exact: true })).toBeVisible();
  await expect(current).toBeVisible();
  await release();

  await current.getByRole("button", { name: "Delete issued.pdf" }).click();
  await page.getByRole("alertdialog", { name: "Delete issued.pdf?" }).getByRole("button", { name: "Delete file" }).click();
  await expect(current).toHaveCount(0);

  await page.setViewportSize({ width: 375, height: 812 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
