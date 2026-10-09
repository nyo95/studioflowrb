import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

/**
 * Presentation boards: a large photo is shrunk to the server's 3 MB limit and appears as a slide; a failed upload
 * says why instead of staying silent (owner report 2026-10-09: "cannot upload a file", nothing shown).
 */
const { projectId } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { projectId: string };

/** A noisy JPEG well over 3 MB, built in the page so no binary fixture is committed. */
async function bigJpeg(page: import("@playwright/test").Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 3200; canvas.height = 2400;
    const context = canvas.getContext("2d")!;
    const image = context.createImageData(canvas.width, canvas.height);
    for (let index = 0; index < image.data.length; index += 4) {
      image.data[index] = Math.random() * 255; image.data[index + 1] = Math.random() * 255; image.data[index + 2] = Math.random() * 255; image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/jpeg", 1));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return btoa(binary);
  });
  return Buffer.from(base64, "base64");
}

test("P.1 a large photo is shrunk and becomes a slide", async ({ page }) => {
  await page.goto(`/studioflow/projects/${projectId}/presentation`);
  await page.getByLabel("New board").fill("ZZ-Test Upload");
  await page.getByRole("button", { name: /Create|Add|New/ }).first().click();
  await expect(page.getByLabel("Board title")).toHaveValue("ZZ-Test Upload");
  const photo = await bigJpeg(page);
  expect(photo.byteLength).toBeGreaterThan(3 * 1024 * 1024);
  await page.locator('input[type="file"]').setInputFiles({ name: "big-photo.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.getByRole("button", { name: "Slide 1" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/smaller than 3 MB|too large|could not be uploaded/)).toHaveCount(0);
});

test("P.2 a file that is not an image says why", async ({ page }) => {
  await page.goto(`/studioflow/projects/${projectId}/presentation`);
  await page.getByLabel("New board").fill("ZZ-Test Bad File");
  await page.getByRole("button", { name: /Create|Add|New/ }).first().click();
  await expect(page.getByLabel("Board title")).toHaveValue("ZZ-Test Bad File");
  await page.locator('input[type="file"]').setInputFiles({ name: "note.png", mimeType: "image/png", buffer: Buffer.from("this is not an image") });
  await expect(page.getByText("This file is not a valid image.")).toBeVisible({ timeout: 30_000 });
});
