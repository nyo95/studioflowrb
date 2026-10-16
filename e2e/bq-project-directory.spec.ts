import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const PROJECT_TITLE = "E2E Long BQ Project Title For Phone Width Checks At The Breeze BSD Phase 2";
const { bqProjectId } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { bqProjectId: string };

test("BQ project lifecycle actions and audit metadata live in the project directory", async ({ page }) => {
  await page.goto("/bq");
  await page.locator("main").first().waitFor();
  await page.waitForLoadState("networkidle");

  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText(["Project", "Client", "Grand Total", "Created", "Updated", "Actions"]);
  await expect(table.getByRole("columnheader", { name: "Estimator" })).toHaveCount(0);

  const row = table.getByRole("row").filter({ hasText: PROJECT_TITLE });
  await expect(row).toBeVisible();
  await expect(row.getByText("by Eka Tester", { exact: true })).toHaveCount(2);

  await row.getByRole("button", { name: `Actions for ${PROJECT_TITLE}` }).click();
  await expect(page.getByRole("menuitem", { name: "Kunci project" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Arsipkan project" })).toBeVisible();
  await page.keyboard.press("Escape");

  await row.getByRole("link", { name: PROJECT_TITLE }).click();
  await expect(page).toHaveURL(`/bq/${bqProjectId}`);
  await expect(page.getByRole("button", { name: "Detail quotation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quotation", exact: true })).toBeVisible();
  for (const lifecycleAction of ["Kunci project", "Arsipkan", "Buka kunci", "Pulihkan project", "Ajukan penghapusan"]) {
    await expect(page.getByRole("button", { name: lifecycleAction, exact: true })).toHaveCount(0);
  }
});
