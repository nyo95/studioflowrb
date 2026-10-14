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
  await editor.click();
  await page.keyboard.type("Lantai pantry pakai @HO1");
  const items = page.getByRole("listbox", { name: "Schedule items" });
  await expect(items.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await page.keyboard.type("untuk area #pantry");
  await expect(page.getByRole("listbox", { name: "Tags" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  const first = log.getByRole("article").filter({ hasText: "Lantai pantry" });
  await expect(first).toBeVisible();
  await expect(first.getByRole("list", { name: "Linked schedule items" })).toContainText("HO-01");
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
});
