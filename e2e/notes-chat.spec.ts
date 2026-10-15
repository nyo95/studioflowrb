import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

/**
 * Notes as one project chat (owner 2026-10-14, WO-SF-NOTES-CHAT-01): `#` topic tags, `@HT1` Product Schedule links,
 * replies, images sent together as one album, and a stream with its own scroll. Runs with the Workspace board module
 * off (its default), in its own seeded project.
 */
test.describe.configure({ mode: "serial" });
const { sf } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { sf: Record<string, string> };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("the project notes chat tags, links, replies and groups an album", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/studioflow/projects/${sf.notesChat}`);
  await page.locator("main").first().waitFor();
  await page.waitForLoadState("networkidle");
  const log = page.getByRole("log", { name: "Notes" });
  await expect(log).toBeVisible();

  // # and @ open suggestions; the picked item is linked and the topic tag is stored.
  const editor = page.getByRole("textbox", { name: "New note" });
  for (const name of ["Add images", "Send"]) {
    const button = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(button?.width).toBe(44);
    expect(button?.height).toBe(44);
  }
  await editor.click();
  await page.keyboard.type("#");
  const tags = page.getByRole("listbox", { name: "Tags" });
  await expect(tags).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tags).toBeHidden();
  await expect(editor).toHaveText("#");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("Lantai pantry pakai  untuk area #pantry");
  await expect(tags).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tags).toBeHidden();
  await page.keyboard.press("Control+Home");
  for (let index = 0; index < "Lantai pantry pakai ".length; index++) await page.keyboard.press("ArrowRight");
  await page.keyboard.type("@");
  const items = page.getByRole("listbox", { name: "Schedule items" });
  await expect(items).toBeVisible();
  await expect(items.getByRole("option")).not.toHaveCount(0);
  await expect(items).toContainText("HT-01");
  await expect(editor).toHaveAttribute("aria-controls", await items.getAttribute("id") as string);
  const caretToken = await editor.locator(".rte-token-active").boundingBox();
  const popup = await items.locator("..").boundingBox();
  expect(popup && caretToken && popup.y + popup.height).toBeLessThan(caretToken!.y);
  expect(popup!.x).toBeGreaterThanOrEqual(0);
  expect(popup!.x + popup!.width).toBeLessThanOrEqual(1440);
  await page.keyboard.type("HT");
  await expect(items.getByRole("option")).toHaveCount(1);
  await expect(items.getByRole("option")).toContainText("HT-01");
  await expect(editor).toHaveAttribute("aria-activedescendant", await items.getByRole("option").getAttribute("id") as string);
  await page.keyboard.press("Enter");
  await expect(editor).toContainText("Lantai pantry pakai @HT-01 untuk area #pantry");
  await expect(items).toBeHidden();
  await page.keyboard.press("Control+End");
  await expect(tags).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  const first = log.getByRole("article").filter({ hasText: "Lantai pantry" });
  await expect(first).toBeVisible();
  const chip = first.getByRole("button", { name: "@HT-01", exact: true });
  await expect(chip).toBeVisible();
  await expect(first.getByRole("list", { name: "Linked schedule items" })).toHaveCount(0);
  await expect(first.getByRole("button", { name: "#pantry" })).toBeVisible();

  // Reply to it, as client feedback.
  await first.getByRole("button", { name: "Note actions" }).click();
  await page.getByRole("menuitem", { name: "Reply" }).click();
  await expect(page.getByText(/^Replying to/)).toBeVisible();
  await editor.click();
  await page.keyboard.type("Klien minta nat lebih tipis #feedback");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const reply = log.getByRole("article").filter({ hasText: "Klien minta nat" });
  await expect(reply.getByRole("link").first()).toContainText("Lantai pantry");
  await expect(reply).toContainText("#feedback");

  // Five images sent together read as one album of four tiles saying "+1".
  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').last().setInputFiles(
    [1, 2, 3, 4, 5].map((n) => ({ name: `site-${n}.png`, mimeType: "image/png", buffer: PNG })),
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const album = log.getByRole("article", { name: /^5 images from/ });
  await expect(album).toBeVisible();
  await expect(album.getByRole("button", { name: /more$/ })).toHaveAccessibleName("Open image 4, 1 more");

  // A topic tag filters the stream.
  await first.getByRole("button", { name: "#pantry" }).click();
  await expect(log.getByRole("article")).toHaveCount(1);

  // The page does not grow with the notes: the stream scrolls inside its own box.
  const box = await log.boundingBox();
  expect(box && box.y + box.height).toBeLessThanOrEqual(900);

  // Hover/focus previews stay inline; Enter engages the card and its deep link opens the actual entry.
  await chip.hover();
  const preview = page.getByRole("dialog", { name: "HT-01 · Product Schedule" });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("ZZ-Test Teraso abu");
  await page.keyboard.press("Escape");
  await chip.focus();
  await expect(preview).toBeVisible();
  await chip.press("Enter");
  const openItem = preview.getByRole("link", { name: "Open item →" });
  await expect(openItem).toBeFocused();
  const href = await openItem.getAttribute("href");
  expect(href).toMatch(/\/schedule\?entry=.+/);
  await openItem.click();
  await expect(page).toHaveURL(href!);
  await expect(page.getByRole("dialog").filter({ hasText: "HT-01" })).toBeVisible();
  await page.goto(`/studioflow/projects/${sf.notesChat}/schedule?entry=deleted-item`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Product Schedule", exact: true })).toBeVisible();
});

test("removing a Schedule mention from an edited note removes its link after reload", async ({ page }) => {
  await page.goto(`/studioflow/projects/${sf.notesChat}`);
  const log = page.getByRole("log", { name: "Notes" });
  const composer = page.getByRole("textbox", { name: "New note" });
  await composer.fill("Mention removal check @HT-01");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const note = log.getByRole("article").filter({ hasText: "Mention removal check" });
  await expect(note.getByRole("button", { name: "@HT-01" })).toBeVisible();
  await note.getByRole("button", { name: "Note actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByRole("textbox", { name: "Edit note" }).fill("Mention removal check without a linked item");
  await note.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Edit note" })).toHaveCount(0);
  await expect(note).toContainText("Mention removal check without a linked item");
  await expect(note.getByRole("button", { name: "@HT-01" })).toHaveCount(0);
  await expect(note.getByRole("list", { name: "Linked schedule items" })).toHaveCount(0);

  await page.reload();
  await expect(note).toContainText("Mention removal check without a linked item");
  await expect(note.getByRole("button", { name: "@HT-01" })).toHaveCount(0);
  await expect(note.getByRole("list", { name: "Linked schedule items" })).toHaveCount(0);
});

test("an existing General note stays editable when the board is off", async ({ page }) => {
  await page.goto(`/studioflow/projects/${sf.notesChat}`);
  await page.waitForLoadState("networkidle");
  const note = page.getByRole("log", { name: "Notes" }).getByRole("article").filter({ hasText: "ZZ-Test General note" });
  await expect(note).toBeVisible();
  await note.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await note.getByRole("button", { name: "Note actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByRole("textbox", { name: "Edit note" }).fill("ZZ-Test General note edited with board off");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Edit note" })).toHaveCount(0);
  await expect(note).toContainText("ZZ-Test General note edited with board off");
  await page.reload();
  await expect(note).toContainText("ZZ-Test General note edited with board off");
});

test("Schedule suggestions show an empty state and recover from a failed lookup", async ({ page }) => {
  await page.goto(`/studioflow/projects/${sf.notesChat}`);
  await page.waitForLoadState("networkidle");
  const editor = page.getByRole("textbox", { name: "New note" });
  await editor.fill("@ZZZZ");
  await expect(page.getByRole("status").filter({ hasText: "No suggestions found." })).toBeVisible();
  await expect(editor).toHaveText("@ZZZZ");

  let refused = false;
  await page.route("**/*", async (route) => {
    if (!refused && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      refused = true;
      await route.abort("failed");
    } else await route.continue();
  });
  await editor.fill("@HT");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(editor).toHaveText("@HT");
  await page.unrouteAll({ behavior: "wait" });
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("listbox", { name: "Schedule items" }).getByRole("option")).toContainText("HT-01");
  await expect(editor).toHaveText("@HT");
});

test("a Notes tag filter survives a phase change refreshing the page", async ({ page }) => {
  await page.goto(`/studioflow/projects/${sf.notesChat}`);
  await page.waitForLoadState("networkidle");
  const log = page.getByRole("log", { name: "Notes" });
  await page.getByRole("textbox", { name: "New note" }).fill("Filter persistence #keepme");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const tagged = log.getByRole("article").filter({ hasText: "Filter persistence" });
  await expect(tagged).toBeVisible();
  await tagged.getByRole("button", { name: "#keepme" }).click();
  await expect(log.getByRole("article")).toHaveCount(1);

  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rename iteration" }).click();
  const rename = page.getByRole("dialog", { name: "Rename iteration" });
  await rename.getByRole("textbox", { name: "Name" }).fill("Filter refresh proof");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(rename).toHaveCount(0);
  await expect(page.getByText("Filter refresh proof").first()).toBeVisible();
  await expect(log.getByRole("article")).toHaveCount(1);
  await expect(tagged).toBeVisible();
});

test("an image opens zoomable and a marked-up copy is sent as a reply, leaving the original as it was", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`/studioflow/projects/${sf.notesChat}`);
  await page.waitForLoadState("networkidle");
  const log = page.getByRole("log", { name: "Notes" });
  // Its own picture, so the test does not depend on the previous one.
  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').last().setInputFiles({ name: "plan.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const images = log.locator("img");
  await expect.poll(() => images.count()).toBeGreaterThan(0);
  const before = await images.count();
  await log.getByRole("button", { name: /^Open image 1/ }).last().click();
  const viewer = page.getByRole("dialog", { name: /^Image 1 of/ });
  await viewer.getByRole("button", { name: "Zoom in" }).click();
  await expect(viewer.getByText("125%")).toBeVisible();

  await viewer.getByRole("button", { name: "Mark up" }).click();
  const markup = page.getByRole("dialog", { name: "Mark up a copy" });
  const picture = markup.getByRole("group", { name: /^Picture to mark up/ });
  const box = (await picture.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await markup.getByRole("button", { name: "Send as reply" }).click();
  await expect(markup).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect.poll(() => images.count()).toBeGreaterThan(before);
  await expect(log.getByText(/Replying to|^Image$/).first()).toBeVisible();
});
