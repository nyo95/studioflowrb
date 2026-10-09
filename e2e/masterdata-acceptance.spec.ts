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

async function chooseMany(page: Page, label: string, choices: string[]) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const listbox = page.getByRole("listbox", { name: label });
  for (const choice of choices) await listbox.getByRole("option", { name: choice, exact: true }).click();
  await page.keyboard.press("Escape");
}

async function openBrandEditor(page: Page, brand: string) {
  await page.goto("/masterdata/brands");
  await expect(page.getByText(brand, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Actions for ${brand}` }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  return page.getByRole("dialog", { name: `Edit brand ${brand}` });
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
  // SKU 3 keeps this spec independent: 2.4 later prices SKU 2 from Mat B and must find it free.
  await chooseSearch(page, "SKU, row 1", "ZZ-Test SKU 3");
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

test("2.5 removing a Brand supplier with live prices is refused and links to filtered prices", async ({ page }) => {
  const dialog = await openBrandEditor(page, "ZZ-Test Guard Brand");
  await dialog.getByRole("button", { name: "Remove ZZ-Test Mat B" }).click();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  const refusal = dialog.getByRole("alert");
  await expect(refusal).toContainText("Supplier link cannot be removed while 1 live material price(s) use this Brand.");
  const showPrices = refusal.getByRole("link", { name: "Show those prices" });
  await expect(showPrices).toBeVisible();
  await showPrices.click();
  await expect(page).toHaveURL(/\/masterdata\/pricing\?supplier=.*&brand=.*/);
  const filteredUrl = new URL(page.url());
  await expect(page.getByRole("combobox", { name: "Supplier" })).toHaveValue(filteredUrl.searchParams.get("supplier")!);
  await expect(page.getByRole("combobox", { name: "Brand" })).toHaveValue(filteredUrl.searchParams.get("brand")!);
  await expect(page.getByText("ZZ-Test Guard SKU", { exact: true })).toBeVisible();
});

test("2.6 changing a Brand owner keeps the former priced owner as a supplier", async ({ page }) => {
  const dialog = await openBrandEditor(page, "ZZ-Test Brand");
  await dialog.getByRole("button", { name: "Owner supplier", exact: true }).click();
  await page.getByRole("option", { name: "ZZ-Test Mat B", exact: true }).click();
  await dialog.getByRole("button", { name: "Remove ZZ-Test Mat A" }).click();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog.getByRole("alert")).toContainText("The current owner has 3 live material price(s) for this Brand. Keep it as a supplier of the Brand before changing the owner.");
  await chooseMany(page, "Suppliers", ["ZZ-Test Mat A"]);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();

  const saved = await openBrandEditor(page, "ZZ-Test Brand");
  await expect(saved.getByRole("button", { name: "Owner supplier", exact: true })).toContainText("ZZ-Test Mat B");
  await expect(saved.getByRole("button", { name: "Suppliers", exact: true })).toContainText("ZZ-Test Mat A");
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

test("3.2 a material-only supplier can save a Material + labor price", async ({ page }) => {
  await openPricing(page);
  await page.getByRole("button", { name: "New price" }).click();
  const dialog = page.getByRole("dialog", { name: "New price" });
  await dialog.getByRole("button", { name: "Material + labor", exact: true }).click();
  await chooseSearch(page, "Supplier", "ZZ-Test Mat A");
  await chooseSearch(page, "Pricing category", "ZZ-Test Work");
  await dialog.getByLabel("Name, row 1").fill("ZZ-Test 3.2 Install");
  await dialog.getByLabel("Unit, row 1").selectOption({ label: "pcs" });
  await dialog.getByLabel("Amount, row 1").fill("21000");
  await dialog.getByRole("button", { name: "Create 1 price" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /Material \+ Labor/ }).click();
  await expect(page.getByText("ZZ-Test 3.2 Install", { exact: true })).toBeVisible();
});

test("3.3 several-suppliers mode is reachable with its real label", async ({ page }) => {
  await openPricing(page);
  await page.getByRole("button", { name: "New price" }).click();
  const dialog = page.getByRole("dialog", { name: "New price" });
  await dialog.getByRole("button", { name: "Material + labor", exact: true }).click();
  await dialog.getByRole("button", { name: "Several suppliers", exact: true }).click();
  await expect(page.getByText("Several suppliers: one item per row and one amount per supplier.")).toBeVisible();
});

test("3.4 several suppliers saves valid cells and keeps only the failing cell", async ({ page }) => {
  await openPricing(page);
  await page.getByRole("button", { name: "New price" }).click();
  const dialog = page.getByRole("dialog", { name: "New price" });
  await dialog.getByRole("button", { name: "Material + labor", exact: true }).click();
  await dialog.getByRole("button", { name: "Several suppliers", exact: true }).click();
  await chooseSearch(page, "Pricing category", "ZZ-Test Work");
  await chooseMany(page, "Suppliers", ["ZZ-Test Both", "ZZ-Test Labor"]);

  await dialog.getByLabel("Name, row 1").fill("ZZ-Test Matrix Good");
  await dialog.getByLabel("ZZ-Test Both, row 1").fill("22000");
  await dialog.getByLabel("ZZ-Test Labor, row 1").fill("23000");
  await dialog.getByRole("button", { name: "Add row" }).click();
  await dialog.getByLabel("Name, row 2").fill("ZZ-Test Matrix Sparse");
  await dialog.getByLabel("ZZ-Test Both, row 2").fill("24000");
  await dialog.getByRole("button", { name: "Add row" }).click();
  await dialog.getByLabel("Name, row 3").fill("ZZ-Test Existing Matrix");
  await dialog.getByLabel("ZZ-Test Labor, row 3").fill("25000");

  await dialog.getByRole("button", { name: "Create 4 prices" }).click();
  await page.screenshot({ path: `${SHOTS}/3.4-save-valid-cells.png` });
  await expect(dialog.getByRole("alert").filter({ hasText: "3 saved. 1 cell needs fixing and is still here." })).toBeVisible();
  await expect(dialog.getByLabel("Name, row 1")).toHaveValue("ZZ-Test Existing Matrix");
  await expect(dialog.getByLabel("ZZ-Test Both, row 1")).toHaveValue("");
  await expect(dialog.getByLabel("ZZ-Test Labor, row 1")).toHaveValue("25.000");
  await expect(dialog.getByRole("alert").filter({ hasText: "ZZ-Test Labor: This supplier already has a price with this name." })).toBeVisible();
});

test("3.5 pasting an Excel-style block fills the several-suppliers grid", async ({ page }) => {
  await openPricing(page);
  await page.getByRole("button", { name: "New price" }).click();
  const dialog = page.getByRole("dialog", { name: "New price" });
  await dialog.getByRole("button", { name: "Material + labor", exact: true }).click();
  await dialog.getByRole("button", { name: "Several suppliers", exact: true }).click();
  await chooseSearch(page, "Pricing category", "ZZ-Test Work");
  await chooseMany(page, "Suppliers", ["ZZ-Test Both", "ZZ-Test Labor"]);
  const block = "ZZ-Test Paste One\tSpec one\t31000\t32000\nZZ-Test Paste Two\tSpec two\t33000\t-";
  await dialog.getByLabel("Name, row 1").evaluate((element, text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData }));
  }, block);
  await expect(dialog.getByText("Pasted 2 item(s). Check the unit of each row.")).toBeVisible();
  await expect(dialog.getByLabel("Name, row 1")).toHaveValue("ZZ-Test Paste One");
  await expect(dialog.getByLabel("Notes, row 1")).toHaveValue("Spec one");
  await expect(dialog.getByLabel("ZZ-Test Both, row 1")).toHaveValue("31.000");
  await expect(dialog.getByLabel("ZZ-Test Labor, row 1")).toHaveValue("32.000");
  await expect(dialog.getByLabel("Name, row 2")).toHaveValue("ZZ-Test Paste Two");
  await expect(dialog.getByLabel("Notes, row 2")).toHaveValue("Spec two");
  await expect(dialog.getByLabel("ZZ-Test Both, row 2")).toHaveValue("33.000");
  await expect(dialog.getByLabel("ZZ-Test Labor, row 2")).toHaveValue("");
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

test("4.2 a Supplier type cannot be selected twice and the Supplier saves", async ({ page }) => {
  await page.goto("/masterdata/vendors");
  await page.getByRole("button", { name: "New supplier" }).click();
  const dialog = page.getByRole("dialog", { name: "Create supplier" });
  await dialog.getByLabel("Supplier name").fill("ZZ-Test Duplicate Type");
  await chooseMany(page, "Supplier types", ["E2E Material"]);
  await dialog.getByRole("button", { name: "Supplier types", exact: true }).click();
  await expect(page.getByRole("listbox", { name: "Supplier types" }).getByRole("option", { name: "E2E Material", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Create supplier" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("ZZ-Test Duplicate Type", { exact: true })).toBeVisible();
});
