import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixtures = () => JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")).masterData as { sku1: string };

test("Brand creation keeps one draft across profile and supplier-contact tabs", async ({ page }) => {
  await page.goto("/masterdata/brands");
  await page.getByRole("button", { name: "New brand", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Create catalog brand", exact: true });
  await editor.getByLabel("Brand name").fill("UX tabbed brand");
  await editor.getByRole("tab", { name: "Suppliers & contacts", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Owner supplier", exact: true })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Add contact", exact: true })).toBeDisabled();
  await expect(editor.getByRole("button", { name: "Hashtags", exact: true })).toBeHidden();
  await editor.getByRole("tab", { name: "Profile", exact: true }).click();
  await editor.getByPlaceholder("example.com or https://...").fill("https://example.test/ux-brand");
  await editor.getByRole("button", { name: "Add", exact: true }).click();
  await expect(editor.getByLabel("Brand name")).toHaveValue("UX Tabbed Brand");
  await expect(editor.getByText("WEBSITE: https://example.test/ux-brand", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Create brand", exact: true }).click();
  await expect(editor).toBeHidden();
  await page.getByRole("button", { name: "UX Tabbed Brand", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "UX Tabbed Brand", exact: true }).getByRole("link", { name: "Web", exact: true })).toHaveAttribute("href", "https://example.test/ux-brand");
});

test("Supplier creation preserves identity across its tabs", async ({ page }) => {
  await page.goto("/masterdata/vendors");
  await page.getByRole("button", { name: "New supplier", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Create supplier", exact: true });
  await editor.getByLabel("Supplier name").fill("UX tabbed supplier");
  await editor.getByLabel("Legal entity name").fill("PT Test Supplier");
  await editor.getByRole("tab", { name: "Brands & categories", exact: true }).click();
  await expect(editor.getByLabel("Legal entity name")).toBeHidden();
  await editor.getByRole("tab", { name: "Contacts (0)", exact: true }).click();
  await editor.getByRole("button", { name: "Add contact", exact: true }).click();
  await editor.getByLabel("Contact name").fill("UX sales");
  await editor.getByLabel("Email address").fill("invalid-email");
  await editor.getByRole("tab", { name: "Profile & types", exact: true }).click();
  await expect(editor.getByLabel("Legal entity name")).toHaveValue("PT Test Supplier");
  await editor.getByRole("button", { name: "Create supplier", exact: true }).click();
  await expect(editor.getByLabel("Email address")).toBeVisible();
  await expect(editor.getByRole("tab", { name: "Contacts (1)", exact: true })).toHaveAttribute("data-state", "active");
  await editor.getByLabel("Email address").fill("sales@example.test");
  await editor.getByRole("button", { name: "Create supplier", exact: true }).click();
  await expect(editor).toBeHidden();
  await page.getByRole("button", { name: "UX Tabbed Supplier", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "UX Tabbed Supplier", exact: true })).toContainText("UX Sales");
});

test("directory filters apply live, remain visible and can be removed without reopening the panel", async ({ page }) => {
  await page.goto("/masterdata/brands");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Filters", exact: true });
  await panel.getByRole("button", { name: "Supplier", exact: true }).click();
  await page.getByRole("option", { name: "ZZ-Test Mat B", exact: true }).click();
  await panel.getByRole("button", { name: "Show results" }).click();
  await expect(page.getByRole("button", { name: "Remove Supplier filter" })).toContainText("ZZ-Test Mat B");
  await expect(page.getByRole("button", { name: "Filters, 1 active" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Supplier filter" }).click();
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ZZ-Test Brand", exact: true })).toBeVisible();
});

for (const [route, name, edit] of [
  ["brands", "ZZ-Test Brand", "Edit brand"],
  ["vendors", "ZZ-Test Mat A", "Edit supplier"],
  ["skus", "ZZ-Test SKU 1", "Edit SKU"],
] as const) {
  test(`${route} shows readable detail before editing`, async ({ page }) => {
    await page.goto(`/masterdata/${route}`);
    await page.getByRole("button", { name, exact: true }).click();
    const detail = page.getByRole("dialog", { name, exact: true });
    await expect(detail).toBeVisible();
    await expect(detail.getByRole("textbox")).toHaveCount(0);
    await detail.getByRole("button", { name: edit, exact: true }).click();
    await expect(page.getByRole("dialog", { name: new RegExp(`^${edit}`) })).toBeVisible();
    await expect(page.getByRole("textbox").first()).toBeVisible();
  });
}

test("several-supplier prices protect a draft on Cancel and close", async ({ page }) => {
  await page.goto("/masterdata/pricing");
  await page.getByRole("button", { name: "New price", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "New price", exact: true });
  await dialog.getByRole("button", { name: "Labor", exact: true }).click();
  await dialog.getByRole("button", { name: "Several suppliers", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "New price", exact: true });
  await dialog.getByRole("button", { name: "Pricing category", exact: true }).click();
  await page.getByRole("option", { name: "ZZ-Test Work", exact: true }).click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const warning = page.getByRole("alertdialog", { name: "Discard this price draft?" });
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog.getByRole("button", { name: "Pricing category", exact: true })).toContainText("ZZ-Test Work");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(dialog).toBeHidden();
});

test("editing the SKU from a changed price protects its unsaved amount", async ({ page }) => {
  await page.goto("/masterdata/pricing");
  const row = page.getByRole("row").filter({ hasText: "ZZ-Test SKU 1" }).first();
  await row.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit price · ZZ-Test SKU 1", exact: true });
  await editor.getByRole("textbox", { name: "Amount", exact: true }).fill("42000");
  await editor.getByRole("button", { name: "Edit SKU profile", exact: true }).click();
  const warning = page.getByRole("alertdialog", { name: "Discard changes?" });
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: "Keep editing" }).click();
  await expect(editor.getByRole("textbox", { name: "Amount", exact: true })).toHaveValue("42.000");
  await editor.getByRole("button", { name: "Edit SKU profile", exact: true }).click();
  await warning.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/masterdata/skus\\?edit=${fixtures().sku1}`));
  await expect(page.getByRole("dialog", { name: "Edit SKU ZZ-Test SKU 1" })).toBeVisible();
});

test("a new SKU keeps its explicit Brand when the search filter changes", async ({ page }) => {
  await page.goto("/masterdata/pricing");
  await page.getByRole("button", { name: "New price", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "New price", exact: true });
  await editor.getByRole("button", { name: "Brand", exact: true }).click();
  await page.getByRole("option", { name: "ZZ-Test Brand", exact: true }).click();
  await editor.getByRole("button", { name: "SKU, row 1", exact: true }).click();
  await page.getByPlaceholder("Search SKU name, code, or brand…").fill("UX draft SKU");
  await page.getByRole("button", { name: /Create SKU “UX draft SKU”/ }).click();
  await expect(editor.getByRole("button", { name: "Brand of the new SKU, row 1", exact: true })).toContainText("ZZ-Test Brand");
  await editor.getByRole("button", { name: "Brand", exact: true }).click();
  await page.getByRole("option", { name: "All brands", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Brand of the new SKU, row 1", exact: true })).toContainText("ZZ-Test Brand");
});

test("new Supplier returns to the material row where it was requested", async ({ page }) => {
  await page.goto("/masterdata/pricing");
  await page.getByRole("button", { name: "New price", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "New price", exact: true });
  await editor.getByRole("button", { name: "Add row", exact: true }).click();
  await editor.getByRole("button", { name: "Supplier, row 2", exact: true }).click();
  const name = `UX supplier ${Date.now()}`;
  await page.getByPlaceholder("Search supplier…").fill(name);
  await page.getByRole("button", { name: new RegExp(`Add “${name}” as a new supplier`) }).click();
  const quick = page.getByRole("dialog", { name: "Add supplier", exact: true });
  await quick.getByRole("combobox", { name: /Supplier type/ }).selectOption({ label: "E2E Material" });
  await quick.getByRole("button", { name: "Add supplier", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Supplier, row 2", exact: true })).toContainText(name);
  await expect(editor.getByRole("button", { name: "Supplier, row 1", exact: true })).not.toContainText(name);
  await expect(editor.getByRole("status")).toContainText("remains in the directory");
});

test("a Brand can be created from Pricing without losing the price draft", async ({ page }) => {
  await page.goto("/masterdata/pricing");
  await page.getByRole("button", { name: "New price", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "New price", exact: true });
  await editor.getByLabel("Amount, row 1").fill("15000");
  await editor.getByRole("button", { name: "Brand", exact: true }).click();
  const name = `UX Pricing Brand ${Date.now()}`;
  await page.getByPlaceholder("Search brands…").fill(name);
  await page.getByRole("button", { name: new RegExp(`Create brand “${name}”`) }).click();
  await expect(editor.getByRole("button", { name: "Brand", exact: true })).toContainText(name);
  await expect(editor.getByLabel("Amount, row 1")).toHaveValue("15.000");
  await expect(editor.getByRole("status")).toContainText("remains in the catalog");
});

for (const route of ["brands", "vendors", "skus", "pricing"]) {
  test(`${route} filters and details fit a narrow screen`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/masterdata/${route}`);
    await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Filters", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
