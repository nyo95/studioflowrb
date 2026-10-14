import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

/**
 * R9.07 Workspace board regression (owner 2026-10-14: harden the board before adding features), and R9.09: the board
 * is a Developer-switched module that starts off, so the Phases page shows the Notes stream until it is switched on.
 * The tests run in file order and each works in its own seeded project.
 */
test.describe.configure({ mode: "serial" });
const { sf } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { sf: Record<string, string> };

/** A 1x1 PNG, built in code so no binary fixture is committed. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function openBoard(page: Page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`/studioflow/projects/${sf.workspace}`);
  await page.locator("main").first().waitFor();
  // Let the page hydrate before touching it: a file chosen too early is lost because its handler is not attached yet.
  await page.waitForLoadState("networkidle");
  const board = page.getByLabel("Workspace board");
  await expect(board).toBeVisible();
  return board;
}

const element = (page: Page, text: string) => page.getByRole("article").filter({ hasText: text });

/** The Developer switch, set directly in the disposable test database (the console has its own spec). */
async function setBoard(state: "ENABLED" | "DISABLED") {
  const connectionString = process.env.PLATFORM_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("PLATFORM_TEST_DATABASE_URL is required.");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`INSERT INTO platform.module_state (module_id, state, last_version, updated_by) VALUES ('workspace-board', $1, '1.0.0', 'e2e')
      ON CONFLICT (module_id) DO UPDATE SET state = EXCLUDED.state, updated_by = EXCLUDED.updated_by`, [state]);
  } finally {
    await client.end();
  }
}

test("without the board module the Phases page is the phase's Notes stream", async ({ page }) => {
  await setBoard("DISABLED");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/studioflow/projects/${sf.notesMode}`);
  await page.locator("main").first().waitFor();
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("Workspace board")).toHaveCount(0);
  const log = page.getByRole("log", { name: "Notes" });
  await expect(log).toBeVisible();

  const editor = page.getByRole("textbox", { name: "New note" });
  await editor.click();
  await expect(editor).toBeFocused();
  await page.keyboard.type("E2E notes mode text");
  await page.getByRole("button", { name: "+ #feedback" }).click();
  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').last().setInputFiles({ name: "notes.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  // The text and the image are two messages, both client feedback.
  await expect(log.getByRole("article").filter({ hasText: "E2E notes mode text" })).toBeVisible();
  await expect(log.getByRole("article", { name: /^Image from/ })).toHaveCount(1);
  await expect(log.getByRole("article").filter({ hasText: "#feedback" })).toHaveCount(2);

  // A hand-marked message can be switched back.
  const text = log.getByRole("article").filter({ hasText: "E2E notes mode text" });
  await text.getByRole("button", { name: "Note actions" }).click();
  await page.getByRole("menuitem", { name: "Not client feedback" }).click();
  await expect(log.getByRole("article").filter({ hasText: "#feedback" })).toHaveCount(1);
});

test("the Workspace board writes, autosaves in order, takes images, and keeps a recorded answer fixed", async ({ page }) => {
  await setBoard("ENABLED");
  test.info().annotations.push({ type: "cleanup", description: "the board module is switched off again at the end" });
  try {
    await boardJourney(page);
  } finally {
    await setBoard("DISABLED");
  }
});

async function boardJourney(page: Page) {
  const board = await openBoard(page);

  // 1. Double-click empty board to write a text there; leaving it creates the element.
  const box = (await board.boundingBox())!;
  await page.mouse.dblclick(box.x + 120, box.y + 80);
  const draft = page.getByRole("textbox", { name: "New text" });
  // The editor loads on demand: type only once it holds the caret.
  await expect(draft).toBeFocused();
  await page.keyboard.type("E2E board text");
  await page.keyboard.press("Tab");
  await expect(element(page, "E2E board text")).toBeVisible();

  // 2. Saves one after another: a slow server must not turn the second save into a false "someone else changed it".
  await page.route("**/studioflow/projects/**", async (route) => {
    if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await element(page, "E2E board text").getByText("E2E board text").click();
  const editor = page.getByRole("textbox", { name: "Text", exact: true });
  await expect(editor).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.type(" one");
  // The autosave starts after 700 ms; type again while it is still on its way, then leave the text.
  await page.waitForTimeout(950);
  await page.keyboard.type(" two");
  await page.keyboard.press("Tab");
  // The text closes only once both saves went through, in order, with no conflict shown on the way.
  await expect(editor).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText("Someone else changed this text")).toHaveCount(0);
  await expect(element(page, "E2E board text one two")).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(element(page, "E2E board text one two")).toBeVisible();

  // 3. A photo chosen from the toolbar becomes its own image element.
  const images = page.getByRole("article", { name: /^Image/ });
  // The board's own file input, not the Files panel beside it (R9.62).
  await page.locator('input[type="file"][accept*=".pdf"]:not(aside *)').setInputFiles({ name: "board.png", mimeType: "image/png", buffer: PNG });
  await expect(images).toHaveCount(1);

  // 4. A quick note sent as client feedback with an image: the text and the image are two elements, both feedback.
  await page.getByRole("button", { name: "Quick note" }).click();
  await expect(page.getByRole("textbox", { name: "New card" })).toBeFocused();
  await page.keyboard.type("E2E quick feedback");
  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').last().setInputFiles({ name: "feedback.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("checkbox", { name: "Client feedback" }).check();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(element(page, "E2E quick feedback")).toBeVisible();
  await expect(images).toHaveCount(2);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("article").filter({ hasText: "Client feedback" })).toHaveCount(3);

  // 5. The recorded client answer offers no way to change its origin or phase; it can still be edited.
  const recorded = element(page, "ZZ-Test recorded client answer");
  await expect(recorded).toHaveAccessibleName(/recorded by the phase step/);
  await recorded.hover();
  await recorded.getByRole("button", { name: "Element actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /client feedback/i })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: /phase label/i })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // A note marked by hand still offers the switch.
  const manual = element(page, "E2E quick feedback");
  await manual.hover();
  await manual.getByRole("button", { name: "Element actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Not client feedback" })).toBeVisible();
  await page.keyboard.press("Escape");
}
