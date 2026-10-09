import { mkdirSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/** WO-E2E-ACCEPT-01, Stage 1.  Records every screenshot beside the isolated run. */
const SHOTS = "e2e/.tmp/stage-1";

async function openPricing(page: Page) {
  await page.goto("/masterdata/pricing");
  await expect(page.getByRole("button", { name: "New price" })).toBeVisible();
}

async function chooseSearch(page: Page, label: string, choice: string) {
  const dialog = page.getByRole("dialog", { name: "New price" });
  await dialog.getByRole("button", { name: label, exact: true }).click();
  await page.getByPlaceholder(/search/i).last().fill(choice);
  await page.getByRole("option", { name: new RegExp(`^${choice}(?:\\s|$)`) }).click();
}

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test("2.1 material price links a new supplier to the Brand", async ({ page }) => {
  await openPricing(page);
  await page.getByRole("button", { name: "New price" }).click();
  await chooseSearch(page, "Brand", "ZZ-Test Brand");
  await chooseSearch(page, "SKU, row 1", "ZZ-Test SKU 1");
  await chooseSearch(page, "Supplier, row 1", "ZZ-Test Mat B");
  await expect(page.getByText("This supplier will be added as a supplier of ZZ-Test Brand when you save.")).toBeVisible();
  await page.getByLabel("Amount, row 1").fill("12000");
  await page.getByRole("button", { name: /Create 1 price/ }).click();
  await expect(page.getByRole("dialog", { name: "New price" })).toBeHidden();
  await page.goto("/masterdata/brands");
  await expect(page.getByText("ZZ-Test Brand", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Actions for ZZ-Test Brand" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(page.getByLabel("Suppliers")).toContainText("ZZ-Test Mat B");
});

test("2.3 quoted text material amount saves as text", async ({ page }) => {
  await openPricing(page);
  await page.getByRole("button", { name: "New price" }).click();
  await chooseSearch(page, "Brand", "ZZ-Test Brand");
  await chooseSearch(page, "SKU, row 1", "ZZ-Test SKU 2");
  await chooseSearch(page, "Supplier, row 1", "ZZ-Test Mat B");
  await page.getByLabel("Amount, row 1").fill('"By Request"');
  await page.getByRole("button", { name: /Create 1 price/ }).click();
  await expect(page.getByText("By Request", { exact: true })).toBeVisible();
});

test("2.4 valid material rows save while incomplete and duplicate rows remain", async ({ page }) => {
  await openPricing(page);
  await page.getByRole("button", { name: "New price" }).click();
  await chooseSearch(page, "Brand", "ZZ-Test Brand");
  await chooseSearch(page, "SKU, row 1", "ZZ-Test SKU 2");
  await chooseSearch(page, "Supplier, row 1", "ZZ-Test Mat B");
  await page.getByLabel("Amount, row 1").fill("13000");
  await page.getByRole("button", { name: "Add row" }).click();
  await chooseSearch(page, "SKU, row 2", "ZZ-Test SKU 2");
  await chooseSearch(page, "Supplier, row 2", "ZZ-Test Both");
  await page.getByLabel("Amount, row 2").fill("14000");
  await page.getByRole("button", { name: "Add row" }).click();
  await chooseSearch(page, "SKU, row 3", "ZZ-Test SKU 1");
  await chooseSearch(page, "Supplier, row 3", "ZZ-Test Mat A");
  await page.getByLabel("Amount, row 3").fill("10000");
  await page.getByRole("button", { name: "Add row" }).click();
  await chooseSearch(page, "SKU, row 4", "ZZ-Test SKU 1");
  await chooseSearch(page, "Supplier, row 4", "ZZ-Test Mat B");
  await page.getByRole("button", { name: /Create 4 prices/ }).click();
  await page.screenshot({ path: `${SHOTS}/2.4-save-valid-rows.png` });
  await expect(page.getByRole("alert").filter({ hasText: "2 saved. 2 rows need fixing and are still here." })).toBeVisible();
});

test("3.1 labor and material + labor show only eligible suppliers", async ({ page }) => {
  await openPricing(page);
  await page.getByRole("button", { name: "New price" }).click();
  const dialog = page.getByRole("dialog", { name: "New price" });
  await dialog.getByRole("button", { name: "Labor", exact: true }).click();
  await dialog.getByRole("button", { name: "Supplier", exact: true }).click();
  const laborSuppliers = page.getByRole("listbox", { name: "Supplier" });
  await expect(laborSuppliers.getByRole("option", { name: "ZZ-Test Labor", exact: true })).toBeVisible();
  await expect(laborSuppliers.getByRole("option", { name: "ZZ-Test Both", exact: true })).toBeVisible();
  await expect(laborSuppliers.getByRole("option", { name: "ZZ-Test Mat A", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Material + labor", exact: true }).click();
  await dialog.getByRole("button", { name: "Supplier", exact: true }).click();
  const materialLaborSuppliers = page.getByRole("listbox", { name: "Supplier" });
  await expect(materialLaborSuppliers.getByRole("option", { name: "ZZ-Test Mat A", exact: true })).toBeVisible();
  await expect(materialLaborSuppliers.getByRole("option", { name: "ZZ-Test Labor", exact: true })).toBeVisible();
});

test("3.3 several-suppliers mode is reachable with its real label", async ({ page }) => {
  await openPricing(page);
  await page.getByRole("button", { name: "New price" }).click();
  const dialog = page.getByRole("dialog", { name: "New price" });
  await dialog.getByRole("button", { name: "Material + labor", exact: true }).click();
  await dialog.getByRole("button", { name: "Several suppliers", exact: true }).click();
  await expect(page.getByText("Several suppliers: one item per row and one amount per supplier.")).toBeVisible();
});

test("4.1 duplicate Brand link and hashtag input normalizes on save", async ({ page }) => {
  await page.goto("/masterdata/brands");
  await page.getByRole("button", { name: "New brand" }).click();
  await page.getByLabel("Brand name").fill("ZZ-Test Duplicate Input");
  await page.getByRole("button", { name: "Hashtags", exact: true }).click();
  await page.keyboard.type("#zz-test");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Hashtags", exact: true }).click();
  await page.keyboard.type("#zz-test");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  const brandDialog = page.getByRole("dialog", { name: "Create catalog brand" });
  await brandDialog.getByPlaceholder("example.com or https://...").fill("https://example.test/zz");
  await brandDialog.getByRole("button", { name: "Add", exact: true }).click();
  await brandDialog.getByPlaceholder("example.com or https://...").fill("https://example.test/zz");
  await brandDialog.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Create brand" }).click();
  await expect(page.getByText("ZZ-Test Duplicate Input", { exact: true })).toBeVisible();
});
