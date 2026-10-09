import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

/**
 * Template-first imports (owner, 2026-10-09): download a plain template, fill it in, upload (checked at once), save.
 * Rows with a problem are skipped and listed; the valid rows are saved.
 */
async function openImport(page: import("@playwright/test").Page) {
  await page.goto("/masterdata/workbook");
  await expect(page.getByRole("heading", { name: "Import & export prices" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test("I.1 the price database template downloads, and an upload saves the valid rows and lists the skipped one", async ({ page }) => {
  await openImport(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download template (CSV)" }).last().click(),
  ]);
  const template = readFileSync(await download.path(), "utf8").replace(/^﻿/, "");
  expect(template.split(/\r?\n/)[0]).toBe("Category,Item,Unit,Supplier,Price,Notes");

  const csv = [
    "Category,Item,Unit,Supplier,Price,Notes",
    "ZZ-Test Work,ZZ-Test Import Item,m2,ZZ-Test Labor,5000,from the template",
    "ZZ-Test Work,ZZ-Test Odd Item,kontainer,ZZ-Test Labor,7000,unknown unit",
  ].join("\n");
  await page.getByLabel("Suppliers and work prices: file to upload").setInputFiles({ name: "prices.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("1 new prices")).toBeVisible();
  await expect(page.getByText("1 with problems")).toBeVisible();
  await expect(page.getByRole("cell", { name: /kontainer/ })).toBeVisible();
  await page.getByRole("button", { name: "Save 1 row" }).click();
  await expect(page.getByText("Saved: 1 new and 0 changed prices; 1 problem skipped.")).toBeVisible();

  // The same file again changes nothing: the saved row is now unchanged and only the skipped row is still a problem.
  await page.getByLabel("Suppliers and work prices: file to upload").setInputFiles({ name: "prices.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Suppliers and work prices" }) });
  await expect(card.getByText("1 unchanged")).toBeVisible();
  await expect(card.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});

test("I.2 the SKU price template downloads, and an upload saves the valid SKU and lists the skipped one", async ({ page }) => {
  await openImport(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download template (Excel)" }).first().click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

  const header = "SKU ID,Code,Name,Brand,Category,Base unit,Purchase unit,Length,Width,Thickness,Dimension unit,Notes,Price ID,Supplier,Amount,Currency,Price notes";
  const csv = [
    header,
    ",ZZ-IMP-1,ZZ-Test Import SKU,,ZZ-Test Product,pcs,,,,,,,,ZZ-Test Mat A,1500,IDR,",
    ",ZZ-IMP-2,ZZ-Test Bad SKU,,No such category,pcs,,,,,,,,ZZ-Test Mat A,1500,IDR,",
  ].join("\n");
  await page.getByLabel("SKU prices: file to upload").setInputFiles({ name: "skus.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("1 new", { exact: true })).toBeVisible();
  await expect(page.getByText("1 with problems")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Product category was not found/ })).toBeVisible();
  await page.getByRole("button", { name: "Save 1 row" }).click();
  await expect(page.getByText("Saved: 1 new and 0 changed; 1 problem skipped.")).toBeVisible();
});

test("I.3 a file that is not made from the template is refused", async ({ page }) => {
  await openImport(page);
  // A file without the template's columns (the old company layout had Nama Material, Spesifikasi ...) is refused, naming what is missing.
  await page.getByLabel("Suppliers and work prices: file to upload").setInputFiles({ name: "old.csv", mimeType: "text/csv", buffer: Buffer.from("No,Nama Material,Spesifikasi\n1,Screeding,-") });
  await expect(page.getByText(/Missing required column/)).toBeVisible();
});
