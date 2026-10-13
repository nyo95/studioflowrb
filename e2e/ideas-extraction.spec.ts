import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("Ideas keeps its card workflow and responsive route after module extraction", async ({ page }) => {
  const fixture = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { projectId: string };
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/studioflow/ideas");
  await expect(page.getByRole("heading", { name: "Ideas", exact: true })).toBeVisible();
  await expect(page.getByText("No ideas yet", { exact: true })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({ name: "idea-review.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Untitled", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Idea actions" }).click();
  await page.getByRole("menuitem", { name: "Edit details" }).click();
  await page.getByLabel("Title").fill("E2E module idea");
  await page.getByLabel("Note").fill("Created during the extraction acceptance test.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("E2E module idea", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Idea actions" }).click();
  await page.getByRole("menuitem", { name: "Use in schedule…" }).click();
  const projectPicker = page.getByLabel("Project *", { exact: true });
  if (await projectPicker.count()) await projectPicker.selectOption(fixture.projectId);
  else await expect(page.getByRole("group", { name: "Destination project" })).toBeVisible();
  // Wait for both lookup actions before intercepting the placement request.
  await page.getByRole("radio", { name: /Option on an existing item/ }).check();
  await expect(page.getByLabel("Item *", { exact: true })).toBeEnabled();
  await page.getByRole("radio", { name: /New item/ }).check();
  await page.getByLabel("Category *", { exact: true }).fill("E2E Ideas");
  let releaseRequest!: () => void;
  let requestStarted!: () => void;
  const held = new Promise<void>((resolve) => { releaseRequest = resolve; });
  const started = new Promise<void>((resolve) => { requestStarted = resolve; });
  await page.route("**/studioflow/ideas", async (route) => {
    if (route.request().method() !== "POST") { await route.continue(); return; }
    requestStarted();
    await held;
    await route.abort();
  });
  try {
    await page.getByRole("button", { name: "Add to schedule" }).click();
    await started;
    const dialog = page.getByRole("dialog");
    await expect(page.getByLabel("Product name *", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Category *", { exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  } finally {
    releaseRequest();
  }
  await expect(page.getByText("The image could not be added. Try again; a retry will not add a second copy.", { exact: true })).toBeVisible();
  await page.unroute("**/studioflow/ideas");
  await expect(page.getByRole("button", { name: "Add to schedule" })).toBeEnabled();
  await page.getByRole("button", { name: "Add to schedule" }).click();
  await expect(page.getByRole("heading", { name: "Added to the schedule" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByRole("list", { name: "Used in" })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 800 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByText("E2E module idea", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Idea actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete idea" }).click();
  await expect(page.getByText("No ideas yet", { exact: true })).toBeVisible();
});
