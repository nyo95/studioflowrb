import { mkdirSync, readFileSync } from "node:fs";

import { expect, test, type Locator, type Page } from "@playwright/test";

const SHOTS = "e2e/.tmp/stage-2";
const { projectId } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { projectId: string };
const PROJECT = "2026-999 E2E Long Project Name For Phone Width Checks At The Breeze BSD Phase 2";

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

function row(page: Page, name: string): Locator {
  return page.getByRole("row").filter({ hasText: name });
}

async function search(page: Page, value: string) {
  await page.getByRole("searchbox").fill(value);
}

async function status(page: Page, value: "ACTIVE" | "ARCHIVED" | "ALL") {
  await page.getByRole("combobox", { name: "Status" }).selectOption(value);
}

async function archiveNamed(page: Page, route: string, name: string, entity: "supplier" | "brand") {
  await page.goto(route);
  await search(page, name);
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: `Archive ${entity}` }).click();
  await expect(dialog).toBeHidden();
}

async function restoreNamed(page: Page, route: string, name: string, entity: "supplier" | "brand") {
  await page.goto(route);
  await status(page, "ARCHIVED");
  await search(page, name);
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Restore" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: `Restore ${entity}` }).click();
  await expect(dialog).toBeHidden();
}

async function skuAction(page: Page, name: string, action: "Archive" | "Restore") {
  await page.goto("/masterdata/skus");
  if (action === "Restore") await status(page, "ARCHIVED");
  await search(page, name);
  await row(page, name).getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: action }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: `${action} SKU` }).click();
  await expect(dialog).toBeHidden();
}

async function sampleMenu(page: Page, label: string, item: string) {
  await page.getByRole("button", { name: `Actions for ${label}` }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

test("5.1 supplier ownership and listed-supplier fixtures expose the full cascade", async ({ page }) => {
  await page.goto("/masterdata/vendors");
  await search(page, "ZZ-Test 5.1 Supplier");
  await expect(row(page, "ZZ-Test 5.1 Supplier")).toContainText("ZZ-Test 5.1 Owned Brand");
  await expect(row(page, "ZZ-Test 5.1 Supplier")).toContainText("ZZ-Test 5.1 Linked Brand");
  await page.goto("/masterdata/skus");
  await search(page, "ZZ-Test 5.1 Owned SKU");
  await expect(row(page, "ZZ-Test 5.1 Owned SKU")).toContainText("ZZ-Test 5.1 Owned Brand");
  await expect(row(page, "ZZ-Test 5.1 Owned SKU")).not.toContainText("No price");
});

test("5.2 archiving a supplier cascades owned Brand, SKU and price but not a linked Brand", async ({ page }) => {
  await archiveNamed(page, "/masterdata/vendors", "ZZ-Test 5.2 Supplier", "supplier");
  await expect.soft(row(page, "ZZ-Test 5.2 Supplier")).toHaveCount(0);
  await page.goto("/masterdata/brands");
  await search(page, "ZZ-Test 5.2");
  await expect.soft(row(page, "ZZ-Test 5.2 Owned Brand")).toHaveCount(0);
  await expect.soft(row(page, "ZZ-Test 5.2 Linked Brand")).toBeVisible();
  await page.goto("/masterdata/skus");
  await search(page, "ZZ-Test 5.2 Owned SKU");
  await expect.soft(row(page, "ZZ-Test 5.2 Owned SKU")).toHaveCount(0);
  await page.goto("/masterdata/pricing");
  await search(page, "ZZ-Test 5.2 Owned SKU");
  await expect.soft(row(page, "ZZ-Test 5.2 Owned SKU")).toHaveCount(0);
});

test("5.3 restoring a supplier restores its cascade", async ({ page }) => {
  await restoreNamed(page, "/masterdata/vendors", "ZZ-Test 5.3 Supplier", "supplier");
  await page.goto("/masterdata/brands");
  await search(page, "ZZ-Test 5.3 Owned Brand");
  await expect.soft(row(page, "ZZ-Test 5.3 Owned Brand")).toBeVisible();
  await page.goto("/masterdata/skus");
  await search(page, "ZZ-Test 5.3 Owned SKU");
  await expect.soft(row(page, "ZZ-Test 5.3 Owned SKU")).not.toContainText("No price");
  await page.goto("/masterdata/pricing");
  await search(page, "ZZ-Test 5.3 Owned SKU");
  await expect.soft(row(page, "ZZ-Test 5.3 Owned SKU")).toBeVisible();
});

test("5.4 a directly archived Brand stays archived across supplier archive and restore", async ({ page }) => {
  await archiveNamed(page, "/masterdata/vendors", "ZZ-Test 5.4 Supplier", "supplier");
  await expect.soft(row(page, "ZZ-Test 5.4 Supplier")).toHaveCount(0);
  await status(page, "ARCHIVED");
  await search(page, "ZZ-Test 5.4 Supplier");
  if (await page.getByRole("button", { name: "Actions for ZZ-Test 5.4 Supplier" }).count()) {
    await page.getByRole("button", { name: "Actions for ZZ-Test 5.4 Supplier" }).click();
    await page.getByRole("menuitem", { name: "Restore" }).click();
    await page.getByRole("button", { name: "Restore supplier" }).click();
  }
  await page.goto("/masterdata/brands");
  await status(page, "ARCHIVED");
  await search(page, "ZZ-Test 5.4 Direct Brand");
  await expect(page.getByText("ZZ-Test 5.4 Direct Brand", { exact: true })).toBeVisible();
});

test("5.5 restoring an archived Brand refuses a live naming conflict", async ({ page }) => {
  await page.goto("/masterdata/brands");
  await status(page, "ARCHIVED");
  await search(page, "ZZ-Test 5.5 Conflict Brand");
  await page.getByRole("button", { name: "Actions for ZZ-Test 5.5 Conflict Brand" }).click();
  await page.getByRole("menuitem", { name: "Restore" }).click();
  await page.getByRole("button", { name: "Restore brand" }).click();
  await expect(page.getByRole("alertdialog", { name: /Restore brand/ }).getByRole("alert")).toContainText("A live Brand already uses this identity.");
  await expect(page.getByText("ZZ-Test 5.5 Conflict Brand", { exact: true })).toBeVisible();
});

test("6.1 Add sample creates a price-less SKU and shelves it", async ({ page }) => {
  await page.goto("/masterdata/samples");
  await page.getByRole("button", { name: "Add sample" }).click();
  await page.getByRole("button", { name: "SKU", exact: true }).click();
  await page.getByPlaceholder("Search SKUs…").fill("ZZ-Test 6.1 New Shelf SKU");
  await page.getByRole("button", { name: /New SKU.*ZZ-Test 6\.1 New Shelf SKU.*no price yet/ }).click();
  const skuDialog = page.getByRole("dialog", { name: "New SKU for this sample" });
  await skuDialog.getByLabel("Code").fill("ZZ61");
  await skuDialog.getByRole("button", { name: "Brand", exact: true }).click();
  await page.getByRole("option", { name: "ZZ-Test Brand", exact: true }).click();
  await skuDialog.getByRole("button", { name: "Product category", exact: true }).click();
  await page.getByRole("option", { name: "ZZ-Test Product", exact: true }).click();
  await skuDialog.getByRole("button", { name: "Create SKU" }).click();
  const sampleDialog = page.getByRole("dialog", { name: "Add a sample" });
  await sampleDialog.getByRole("button", { name: "Rack", exact: true }).click();
  await page.getByPlaceholder("Search racks…").fill("NEW61");
  await page.getByRole("button", { name: /New rack.*NEW61/i }).click();
  await sampleDialog.getByRole("textbox", { name: "Box", exact: true }).fill("1");
  await sampleDialog.getByRole("textbox", { name: "Where in the box", exact: true }).fill("Top tray");
  await sampleDialog.getByRole("button", { name: "Add to the shelf" }).click();
  await expect(page.getByText("ZZ-Test 6.1 New Shelf SKU", { exact: false })).toBeVisible();
});

test("6.2 a price-less shelf SKU appears in the SKU directory with No price", async ({ page }) => {
  await page.goto("/masterdata/skus");
  await search(page, "ZZ-Test 6.2 Price-less SKU");
  await expect(row(page, "ZZ-Test 6.2 Price-less SKU")).toContainText("No price");
});

test("6.3 a price-less SKU and its Brand archive and restore normally", async ({ page }) => {
  await skuAction(page, "ZZ-Test 6.3 Price-less SKU", "Archive");
  await skuAction(page, "ZZ-Test 6.3 Price-less SKU", "Restore");
  await archiveNamed(page, "/masterdata/brands", "ZZ-Test 6.3 Price-less Brand", "brand");
  await page.goto("/masterdata/skus");
  await search(page, "ZZ-Test 6.3 Price-less SKU");
  await expect(page.getByText("ZZ-Test 6.3 Price-less SKU", { exact: true })).toHaveCount(0);
  await restoreNamed(page, "/masterdata/brands", "ZZ-Test 6.3 Price-less Brand", "brand");
  await page.goto("/masterdata/skus");
  await search(page, "ZZ-Test 6.3 Price-less SKU");
  await expect(row(page, "ZZ-Test 6.3 Price-less SKU")).toContainText("No price");
});

test("6.4 sample shelf supports movement, statuses, history, context menu and filters", async ({ page }) => {
  const main = "ZZ641 · ZZ-Test 6.4 Main Sample";
  const lost = "ZZ642 · ZZ-Test 6.4 Lost Sample";
  const discarded = "ZZ643 · ZZ-Test 6.4 Discard Sample";
  const held = "ZZ644 · ZZ-Test 6.4 Held Sample";
  await page.goto("/masterdata/samples");
  await page.getByRole("button", { name: "List" }).click();
  await search(page, "ZZ-Test 6.4 Main Sample");
  await sampleMenu(page, main, "Move or edit");
  const move = page.getByRole("dialog", { name: "Move or edit sample" });
  await move.getByRole("button", { name: "Rack", exact: true }).click();
  await page.getByPlaceholder("Search racks…").fill("S2M");
  await page.getByRole("button", { name: /New rack.*S2M/i }).click();
  await move.getByRole("textbox", { name: "Box", exact: true }).fill("9");
  await move.getByRole("button", { name: "Save", exact: true }).click();
  await sampleMenu(page, main, "Change status");
  let dialog = page.getByRole("dialog", { name: "Sample status" });
  await dialog.getByRole("button", { name: "Borrowed", exact: true }).click();
  await dialog.getByLabel("Who has it").fill("Dina Designer");
  await dialog.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: PROJECT, exact: true }).click();
  await dialog.getByRole("button", { name: "Save status" }).click();
  await sampleMenu(page, main, "Change status");
  dialog = page.getByRole("dialog", { name: "Sample status" });
  await dialog.getByRole("button", { name: "With a client", exact: true }).click();
  await dialog.getByLabel("Who has it").fill("E2E Client");
  await dialog.getByRole("button", { name: "Save status" }).click();
  await sampleMenu(page, main, "Change status");
  dialog = page.getByRole("dialog", { name: "Sample status" });
  await dialog.getByRole("button", { name: "On the shelf", exact: true }).click();
  await dialog.getByRole("button", { name: "Save status" }).click();
  await sampleMenu(page, main, "History");
  const history = page.getByRole("dialog", { name: "Sample history" });
  await expect(history.getByText("Put on the shelf")).toBeVisible();
  await expect(history.getByText("Moved")).toBeVisible();
  await expect(history.getByText("Went out")).toHaveCount(2);
  await expect(history.getByText("Back on the shelf")).toBeVisible();
  await page.keyboard.press("Escape");

  await search(page, "ZZ-Test 6.4 Lost Sample");
  await sampleMenu(page, lost, "Change status");
  dialog = page.getByRole("dialog", { name: "Sample status" });
  await dialog.getByRole("button", { name: "Lost", exact: true }).click();
  await dialog.getByRole("button", { name: "Save status" }).click();
  await search(page, "ZZ-Test 6.4 Discard Sample");
  await sampleMenu(page, discarded, "Change status");
  dialog = page.getByRole("dialog", { name: "Sample status" });
  await dialog.getByRole("button", { name: "Discarded", exact: true }).click();
  await dialog.getByRole("button", { name: "Save status" }).click();

  await search(page, "ZZ-Test 6.4 Held Sample");
  await page.getByRole("button", { name: `Actions for ${held}` }).click();
  await expect(page.getByRole("menuitem", { name: "Remove (return it first)" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await row(page, "ZZ-Test 6.4 Held Sample").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "History" })).toBeVisible();
  await page.keyboard.press("Escape");
  await search(page, "");
  await page.getByRole("button", { name: /Borrowed/ }).click();
  await expect(row(page, "ZZ-Test 6.4 Held Sample")).toBeVisible();
  await page.getByRole("button", { name: /Lost or discarded/ }).click();
  await expect(row(page, "ZZ-Test 6.4 Lost Sample")).toBeVisible();
  await expect(row(page, "ZZ-Test 6.4 Discard Sample")).toBeVisible();
});

test("6.5 shelving a request updates Schedule, location note and requester notification", async ({ page }) => {
  await page.goto("/masterdata/sample-requests");
  await page.getByRole("button", { name: "Actions for ZZ-Test 6.5 Requested Sample" }).click();
  await page.getByRole("menuitem", { name: "Put on shelf" }).click();
  const dialog = page.getByRole("dialog", { name: "Put on shelf" });
  await dialog.getByRole("button", { name: "SKU", exact: true }).click();
  await page.getByPlaceholder("Search SKUs…").fill("ZZ-Test 6.5 Requested SKU");
  await page.getByRole("option", { name: /ZZ65.*ZZ-Test 6\.5 Requested SKU/ }).click();
  await dialog.getByRole("button", { name: "Rack", exact: true }).click();
  await page.getByPlaceholder("Search racks…").fill("REQ65");
  await page.getByRole("button", { name: /New rack.*REQ65/i }).click();
  await dialog.getByRole("textbox", { name: "Box", exact: true }).fill("7");
  await dialog.getByRole("button", { name: "Put on shelf" }).click();
  await expect(page.getByText("On the shelf at REQ65 / 7. The designer now sees it as received.")).toBeVisible();
  await page.goto(`/studioflow/projects/${projectId}/schedule`);
  await expect(page.getByText("Sample received", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /ZZ-Test 6\.5 Requested Sample/ }).click();
  await expect(page.getByText("Option A · sample received", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/6.5-schedule-shelf-location.png` });
  await expect(page.getByText(/REQ65 \/ 7/)).toBeVisible();
  await page.keyboard.press("Escape"); // the option dialog sits over the header bell
  await page.getByRole("button", { name: /Notifications/ }).click();
  await expect(page.getByText("Your sample is on the shelf", { exact: true })).toBeVisible();
});
