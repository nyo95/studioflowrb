import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const { sf } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { sf: Record<string, string> };

test("Schedule crop preview and saved photo show the same right-edge pixels", async ({ page }) => {
  await page.goto(`/studioflow/projects/${sf.notesChat}/schedule`);
  await page.getByRole("button", { name: /ZZ-Test Teraso abu/ }).first().click();
  await page.getByRole("button", { name: "Add photo to option A" }).click();

  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    const context = canvas.getContext("2d")!;
    for (let x = 0; x < canvas.width; x++) {
      const red = Math.round(x / (canvas.width - 1) * 255);
      context.fillStyle = `rgb(${red}, 40, ${255 - red})`;
      context.fillRect(x, 0, 1, canvas.height);
    }
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const workspace = page.getByLabel("Schedule photo");
  await workspace.locator('input[type="file"]').setInputFiles({ name: "crop-parity.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect(workspace.getByAltText("Image preview")).toBeVisible();
  await workspace.getByLabel("Horizontal focus").fill("100");
  const viewport = workspace.locator("div.relative.overflow-hidden").first();
  const previewShot = await viewport.screenshot();
  await workspace.getByRole("button", { name: "Use prepared image" }).click();
  const photo = page.getByRole("button", { name: "Change photo of option A" }).locator("img");
  await expect(photo).toBeVisible();
  const savedUrl = await photo.getAttribute("src");
  expect(savedUrl).toBeTruthy();
  const pixels = await page.evaluate(async ({ previewData, url }) => {
    const pixel = async (source: string) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return [...context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data].slice(0, 3);
    };
    return { preview: await pixel(`data:image/png;base64,${previewData}`), saved: await pixel(new URL(url, location.href).href) };
  }, { previewData: previewShot.toString("base64"), url: savedUrl! });
  for (let channel = 0; channel < 3; channel++) expect(Math.abs(pixels.preview[channel]! - pixels.saved[channel]!)).toBeLessThan(20);
  expect(pixels.saved[0]).toBeGreaterThan(170);
});
