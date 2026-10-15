import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

/** Destructive Presentation commands must wait for an explicit confirmation. */
const { sf } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { sf: Record<string, string> };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("Presentation replacements and deletions wait for confirmation and Cancel preserves the board", async ({ page }) => {
  await page.goto(`/studioflow/projects/${sf.notesChat}/presentation`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("New board").fill("ZZ-Test Confirmation");
  await page.getByRole("button", { name: "Create board" }).click();
  await expect(page.getByLabel("Board title")).toHaveValue("ZZ-Test Confirmation");
  const boardUrl = page.url();

  await page.locator('input[type="file"][multiple]').setInputFiles({ name: "original.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("button", { name: "Slide 1" })).toBeVisible();
  const image = page.locator('section[aria-label="Slide"] img').first();
  await expect(image).toBeVisible();
  await image.click();
  await image.click();
  await expect(page.getByRole("button", { name: "Pin 1", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Delete pin" }).click();
  const pinDialog = page.getByRole("alertdialog", { name: "Delete pin 1?" });
  await expect(pinDialog).toContainText("This cannot be undone.");
  await pinDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Pin 1", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back to image" }).click();
  await page.getByRole("button", { name: "Replace image" }).click();
  await page.locator('input[type="file"]:not([multiple])').setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: PNG });
  const replaceDialog = page.getByRole("alertdialog", { name: "Replace this image?" });
  await expect(replaceDialog).toContainText("1 pin");
  await replaceDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Pin 1", exact: true })).toBeVisible();

  await image.evaluate((target, base64) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], "dropped.png", { type: "image/png" }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, PNG.toString("base64"));
  const dropDialog = page.getByRole("alertdialog", { name: "Replace this image?" });
  await expect(dropDialog).toContainText("1 pin");
  await dropDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Pin 1", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Remove from slide" }).click();
  const imageDialog = page.getByRole("alertdialog", { name: "Remove this image?" });
  await expect(imageDialog).toContainText("1 pin");
  await imageDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(image).toBeVisible();

  await page.getByRole("button", { name: "Delete slide" }).click();
  const slideDialog = page.getByRole("alertdialog", { name: "Delete this slide?" });
  await expect(slideDialog).toContainText("1 image and 1 pin");
  await slideDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Slide 1" })).toBeVisible();

  await page.getByRole("button", { name: "Delete board" }).click();
  const boardDialog = page.getByRole("alertdialog", { name: "Delete this board?" });
  await expect(boardDialog).toContainText("1 slide");
  await boardDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(boardUrl);

  await page.reload();
  await expect(page.getByRole("button", { name: "Slide 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pin 1", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Pin 1", exact: true }).click();
  await page.getByRole("button", { name: "Delete pin" }).click();
  await page.getByRole("alertdialog", { name: "Delete pin 1?" }).getByRole("button", { name: "Delete pin" }).click();
  await expect(page.getByRole("button", { name: "Pin 1", exact: true })).toHaveCount(0);

  await image.click();
  await page.getByRole("button", { name: "Replace image" }).click();
  await page.locator('input[type="file"]:not([multiple])').setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("alertdialog", { name: "Replace this image?" }).getByRole("button", { name: "Replace image" }).click();
  await expect(image).toBeVisible();

  await image.click();
  await page.getByRole("button", { name: "Remove from slide" }).click();
  await page.getByRole("alertdialog", { name: "Remove this image?" }).getByRole("button", { name: "Remove from slide" }).click();
  await expect(page.locator('section[aria-label="Slide"] img')).toHaveCount(0);

  await page.getByRole("button", { name: "Delete slide" }).click();
  await page.getByRole("alertdialog", { name: "Delete this slide?" }).getByRole("button", { name: "Delete slide" }).click();
  await expect(page.getByRole("button", { name: "Slide 1" })).toHaveCount(0);

  await page.getByRole("button", { name: "Delete board" }).click();
  await page.getByRole("alertdialog", { name: "Delete this board?" }).getByRole("button", { name: "Delete board" }).click();
  await expect(page).toHaveURL(`/studioflow/projects/${sf.notesChat}/presentation`);
});
