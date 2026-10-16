import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const { projectId } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { projectId: string };

async function choose(page: Page, label: string, search: string, option: RegExp) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByPlaceholder(/search/i).last().fill(search);
  await page.getByRole("option", { name: option }).click();
}

test("R9.99: new SKU size reaches SKU details while supplier price units stay separate", async ({ page }) => {
  const name = "ZZ-Test HPL Size Handoff";
  await page.goto("/masterdata/pricing");
  await page.getByRole("button", { name: "New price" }).click();
  await choose(page, "Brand", "ZZ-Test Brand", /^ZZ-Test Brand$/);
  await page.getByRole("button", { name: "SKU, row 1" }).click();
  await page.getByPlaceholder("Search SKU name, code, or brand…").fill(name);
  await page.getByRole("button", { name: `Create SKU “${name}”` }).click();
  await choose(page, "Category of the new SKU, row 1", "ZZ-Test Product", /^ZZ-Test Product$/);
  await page.getByLabel("Size of the new SKU, row 1 (optional)").fill("1220 × 2440 × 0.7");
  await choose(page, "Supplier, row 1", "ZZ-Test Mat A", /^ZZ-Test Mat A$/);
  await page.getByLabel("Purchase unit, row 1").selectOption({ label: "sheet" });
  await page.getByLabel("Amount, row 1").fill("15000");
  await page.getByRole("button", { name: /Create 1 price/ }).click();
  await expect(page.getByRole("dialog", { name: "New price" })).toBeHidden();

  await page.getByRole("button", { name: "New price" }).click();
  await choose(page, "Brand", "ZZ-Test Brand", /^ZZ-Test Brand$/);
  await choose(page, "SKU, row 1", name, new RegExp(name));
  await choose(page, "Supplier, row 1", "ZZ-Test Mat B", /^ZZ-Test Mat B/);
  await page.getByLabel("Purchase unit, row 1").selectOption({ label: "box" });
  await page.getByLabel("Amount, row 1").fill("20000");
  await page.getByRole("button", { name: /Create 1 price/ }).click();
  await expect(page.getByRole("dialog", { name: "New price" })).toBeHidden();

  await page.goto("/masterdata/skus");
  await page.getByRole("searchbox").fill(name);
  const sku = page.getByRole("row").filter({ hasText: name });
  await expect(sku).toContainText("1220 × 2440 × 0.7 mm");
  await expect(sku).toContainText("/ sheet");
  await expect(sku).toContainText("/ box");
  await expect(sku).toContainText("2 prices");
  await sku.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const editor = page.getByRole("dialog", { name: `Edit SKU ${name}` });
  await expect(editor.getByLabel("Length")).toHaveValue("1220");
  await expect(editor.getByLabel("Width")).toHaveValue("2440");
  await expect(editor.getByLabel("Thickness")).toHaveValue("0.7");
  await expect(editor.getByLabel("Dimension unit")).toContainText("mm");
  await editor.getByLabel("Length").fill("1230");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor).toBeHidden();
  await page.reload();
  await page.getByRole("searchbox").fill(name);
  const corrected = page.getByRole("row").filter({ hasText: name });
  await expect(corrected).toContainText("1230 × 2440 × 0.7 mm");
  await expect(corrected).toContainText("/ sheet");
  await expect(corrected).toContainText("/ box");
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(corrected).toBeVisible();
  await corrected.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const mobileEditor = page.getByRole("dialog", { name: `Edit SKU ${name}` });
  await expect(mobileEditor.getByLabel("Length")).toBeVisible();
  await expect(mobileEditor.getByLabel("Dimension unit")).toBeVisible();
  await expect(mobileEditor.getByRole("button", { name: "Save changes" })).toBeVisible();
  await mobileEditor.getByRole("button", { name: "Cancel" }).click();
  await page.goto("/masterdata/pricing");
  await page.getByRole("button", { name: "New price" }).click();
  await expect(page.getByRole("button", { name: "SKU, row 1" })).toBeVisible();
  await expect(page.getByLabel("Purchase unit, row 1")).toBeVisible();
  await expect(page.getByLabel("Amount, row 1")).toBeVisible();
  await expect(page.getByLabel("Size of the new SKU, row 1 (optional)")).toHaveCount(0);
});

test("R9.100: declining a sample updates Schedule, waiting filter, and re-request", async ({ page }) => {
  await page.goto("/masterdata/sample-requests");
  await page.getByRole("button", { name: "Actions for ZZ-Test 6.5 Requested Sample" }).click();
  await page.getByRole("menuitem", { name: "Take" }).click();
  await page.getByRole("button", { name: "Actions for ZZ-Test 6.5 Requested Sample" }).click();
  await page.getByRole("menuitem", { name: "Decline" }).click();
  const dialog = page.getByRole("dialog", { name: "Decline this sample request" });
  await dialog.getByLabel("Reason").fill("Supplier has no stock");
  await dialog.getByRole("button", { name: "Decline request" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /Notifications/ }).click();
  await expect(page.getByText("Your sample request was declined", { exact: true })).toBeVisible();
  await expect(page.getByText(/Supplier has no stock/)).toBeVisible();

  // Recreate the old committed-intake / waiting-Schedule mismatch only in the guarded disposable fixture.
  const disposableUrl = process.env.PLATFORM_TEST_DATABASE_URL;
  if (!disposableUrl || new URL(disposableUrl).pathname !== "/studioflow_rebuild_test") throw new Error("Only the disposable rebuild test database is allowed.");
  const database = new Pool({ connectionString: disposableUrl });
  let notificationsBeforeRetry = 0;
  try {
    const intake = await database.query<{ source_request_id: string }>('SELECT source_request_id FROM "master_data"."SampleRequestIntake" WHERE product_name = $1', ["ZZ-Test 6.5 Requested Sample"]);
    expect(intake.rows).toHaveLength(1);
    notificationsBeforeRetry = Number((await database.query<{ count: string }>('SELECT count(*) FROM "platform"."Notification" WHERE kind = $1', ["masterdata.sample-request.declined"])).rows[0]?.count);
    await database.query('UPDATE "studioflow"."sf_schedule_sample_request" SET status = $1 WHERE id = $2', ["REQUESTED", intake.rows[0]!.source_request_id]);
  } finally {
    await database.end();
  }
  await page.goto("/masterdata/sample-requests");
  await expect(page.getByText("Schedule still waiting")).toBeVisible();
  await page.getByRole("button", { name: "Actions for ZZ-Test 6.5 Requested Sample" }).click();
  await page.getByRole("menuitem", { name: "Update product schedule" }).click();
  await expect(page.getByText("Product schedule now shows the sample as declined.")).toBeVisible();
  const afterRetry = new Pool({ connectionString: disposableUrl });
  try {
    const count = await afterRetry.query<{ count: string }>('SELECT count(*) FROM "platform"."Notification" WHERE kind = $1', ["masterdata.sample-request.declined"]);
    expect(Number(count.rows[0]?.count)).toBe(notificationsBeforeRetry);
  } finally {
    await afterRetry.end();
  }

  await page.goto(`/studioflow/projects/${projectId}/schedule`);
  await expect(page.getByText("Sample declined", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sample waiting/ })).toContainText("0");
  await page.goto("/studioflow");
  await expect(page.getByText("Samples waiting", { exact: true }).locator("..").locator("..").getByText("0", { exact: true })).toBeVisible();
  await page.goto(`/studioflow/projects/${projectId}/schedule`);
  await page.getByRole("button", { name: /ZZ-Test 6\.5 Requested Sample/ }).click();
  await expect(page.getByText("Sample declined: Supplier has no stock")).toBeVisible();
  await page.getByRole("button", { name: "Request sample again" }).click();
  await expect(page.getByRole("button", { name: "Request sample", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(page.getByText("Sample declined: Supplier has no stock")).toBeVisible();
  await page.getByRole("button", { name: "Request sample", exact: true }).click();
  await expect(page.getByText("Sample waiting", { exact: true })).toBeVisible();
});

test("R9.99: sample-shelf SKU is usable without a price or purchase unit", async ({ page }) => {
  const name = "ZZ-Test Price-less Handoff SKU";
  await page.goto("/masterdata/samples");
  await page.getByRole("button", { name: "Add sample" }).click();
  await page.getByRole("button", { name: "SKU", exact: true }).click();
  await page.getByPlaceholder("Search SKUs…").fill(name);
  await page.getByRole("button", { name: new RegExp(`New SKU.*${name}.*no price yet`) }).click();
  const skuDialog = page.getByRole("dialog", { name: "New SKU for this sample" });
  await skuDialog.getByRole("button", { name: "Brand", exact: true }).click();
  await page.getByRole("option", { name: "ZZ-Test Brand", exact: true }).click();
  await skuDialog.getByRole("button", { name: "Product category", exact: true }).click();
  await page.getByRole("option", { name: "ZZ-Test Product", exact: true }).click();
  await skuDialog.getByRole("button", { name: "Create SKU" }).click();
  const sampleDialog = page.getByRole("dialog", { name: "Add a sample" });
  await sampleDialog.getByRole("button", { name: "Rack", exact: true }).click();
  await page.getByPlaceholder("Search racks…").fill("HANDOFF");
  await page.getByRole("button", { name: /New rack.*HANDOFF/i }).click();
  await sampleDialog.getByRole("textbox", { name: "Box", exact: true }).fill("1");
  await sampleDialog.getByRole("button", { name: "Add to the shelf" }).click();
  await page.goto("/masterdata/skus");
  await page.getByRole("searchbox").fill(name);
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText("No price");
});
