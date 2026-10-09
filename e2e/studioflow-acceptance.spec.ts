import { mkdirSync, readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/**
 * WO-E2E-ACCEPT-01, Stage 3 (walk sections 7 and 8, plus the Lead's new StudioFlow features).
 * Every test works in its own seeded project, so none depends on another test's changes.
 */
const { sf } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { sf: Record<string, string> };
const SHOTS = "e2e/.tmp/stage-3";

/** A 1x1 PNG, built in code so no binary fixture is committed. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

async function openProject(page: Page, projectId: string, route = "") {
  await page.goto(`/studioflow/projects/${projectId}${route}`);
  await page.locator("main").first().waitFor();
  // Let the page hydrate before touching it: a file chosen too early is lost because its handler is not attached yet.
  await page.waitForLoadState("networkidle");
}

const notes = (page: Page) => page.getByRole("log", { name: "Notes" });

async function postImageNote(page: Page, projectId: string) {
  await openProject(page, projectId);
  await page.locator('input[type="file"][accept*="image"]').first().setInputFiles({ name: "ref.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(notes(page).getByRole("list", { name: "Images" })).toBeVisible();
  await notes(page).getByRole("list", { name: "Images" }).getByRole("button").first().click();
}

test("7.1 a note keeps bold text and a bullet list that Enter continues", async ({ page }) => {
  await openProject(page, sf.noteFormat);
  const editor = page.getByRole("textbox", { name: "New note" });
  await editor.click();
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type("Heads up");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.press("Shift+Enter");
  await page.getByRole("button", { name: "Bullet list" }).click();
  await page.keyboard.type("first point");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second point");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(notes(page).getByText("Heads up")).toBeVisible();
  await expect(notes(page).getByRole("listitem")).toHaveCount(2);
  await expect(notes(page).locator("strong", { hasText: "Heads up" })).toBeVisible();
});

test("7.2 a note takes a PNG and refuses a PDF", async ({ page }) => {
  await openProject(page, sf.notes);
  const input = page.locator('input[type="file"][accept*="image"]').first();
  await input.setInputFiles({ name: "paper.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByText(/PNG|JPEG|WebP|image/i).filter({ hasNotText: "Add images" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await input.setInputFiles({ name: "ref.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(notes(page).getByRole("list", { name: "Images" }).getByRole("button")).toHaveCount(1);
});

test("8.5 the requirements and files column can be hidden and stays hidden after a reload", async ({ page }) => {
  await openProject(page, sf.aside);
  await expect(page.getByRole("heading", { name: "Requirements" })).toBeVisible();
  await page.getByRole("button", { name: "Hide requirements & files" }).click();
  await expect(page.getByRole("heading", { name: "Requirements" })).toBeHidden();
  await page.reload();
  await page.locator("main").first().waitFor();
  await expect(page.getByRole("button", { name: "Show requirements & files" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Requirements" })).toBeHidden();
  await page.getByRole("button", { name: "Show requirements & files" }).click();
  await expect(page.getByRole("heading", { name: "Requirements" })).toBeVisible();
});

test("7.6 a note image can be saved to Ideas, put on the moodboard and used in the schedule", async ({ page }) => {
  await postImageNote(page, sf.noteImage);
  const viewer = page.getByRole("dialog");
  await viewer.getByRole("button", { name: "Save to Ideas" }).click();
  await expect(viewer.getByRole("button", { name: "Saved to Ideas" })).toBeVisible();
  await viewer.getByRole("button", { name: "Add to moodboard" }).click();
  await expect(viewer.getByRole("button", { name: "Added to moodboard" })).toBeVisible();
  await viewer.getByRole("button", { name: "Use in schedule" }).click();
  const use = page.getByRole("dialog", { name: "Use in schedule" });
  await use.getByLabel("Category").fill("Stone");
  await use.getByLabel("Product name").fill("ZZ-Test From Note");
  await use.getByRole("button", { name: "Add to schedule" }).click();
  await expect(page.getByText(/option A/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/7.6-note-image-actions.png` });

  await page.goto("/studioflow/ideas");
  await expect(page.getByText("From the notes of ZZ-Test SF Note Image").first()).toBeVisible();
  await page.goto(`/studioflow/projects/${sf.noteImage}/presentation`);
  await expect(page.getByText("Moodboard", { exact: true }).first()).toBeVisible();
  await page.goto(`/studioflow/projects/${sf.noteImage}/schedule`);
  await expect(page.getByText("ZZ-Test From Note").first()).toBeVisible();
});

test("8.6 a deleted last code is not handed out again", async ({ page }) => {
  await openProject(page, sf.codes, "/schedule");
  await page.getByRole("button", { name: /ST-02/ }).first().click();
  await page.getByRole("button", { name: "Actions for ST-02" }).click();
  await page.getByRole("menuitem", { name: /Delete/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete item" }).click();
  await expect(page.getByRole("button", { name: /^NO IMAGE ST-02/ })).toHaveCount(0);
  // The add button promises the code the server will really give: ST-02 stays retired.
  await expect(page.getByRole("button", { name: "Add ST-03" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add ST-02" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Quick add to Stone" }).fill("ZZ-Test Code Three");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^NO IMAGE ST-03/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^NO IMAGE ST-02/ })).toHaveCount(0);
});

test("8.7 Add item can start from a product of a past project", async ({ page }) => {
  await openProject(page, sf.reuse, "/schedule");
  await page.getByRole("button", { name: "Add item" }).click();
  const panel = page.getByRole("dialog", { name: /Add item/ });
  await panel.getByRole("button", { name: "Category", exact: true }).click();
  await page.getByPlaceholder(/search|type/i).last().fill("Stone");
  await page.keyboard.press("Enter");
  await panel.getByRole("button", { name: "Search", exact: true }).click();
  await panel.getByPlaceholder("Brand, product, SKU, color…").fill("Past Marble");
  await panel.getByRole("button", { name: "Search", exact: true }).click();
  await panel.getByRole("button", { name: "Use as start" }).click();
  await page.screenshot({ path: `${SHOTS}/8.7-from-past-project.png` });
  await panel.getByRole("button", { name: "Save item" }).click();
  await expect(page.getByRole("button", { name: /ZZ-Test Past Marble/ }).first()).toBeVisible();
});

test("8.3 an iteration goes to the client, comes back answered, and a revision opens the next one", async ({ page }) => {
  await openProject(page, sf.round);
  await page.getByRole("button", { name: "Send to client" }).click();
  await page.getByRole("button", { name: "Client answered" }).click();
  const answer = page.getByRole("dialog", { name: /the client answered/ });
  await answer.getByRole("textbox").last().click();
  await page.keyboard.type("Client wants a warmer palette");
  await answer.getByRole("button", { name: "Revision" }).click();
  await expect(page.getByRole("heading", { name: "MB2", level: 3 })).toBeVisible();
  await expect(page.getByText("Moodboard 1 needs a revision")).toBeVisible();
  await expect(notes(page).getByText("Client wants a warmer palette")).toBeVisible();
});

test("8.1 the project Timeline tab leads to the Dates & plan dialog, which saves", async ({ page }) => {
  await openProject(page, sf.notes, "/timeline");
  await page.getByRole("link", { name: "Edit dates and plan" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/8.1-dates-and-plan.png` });
  await dialog.getByRole("button", { name: /^Save$/ }).click();
  await expect(dialog).toBeHidden();
});
