import { mkdirSync, readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/**
 * Presentation print: the screen shows the pages the printer will give. Same box, same picture on screen and in print, one
 * page per slide, and the legend under the image stays inside its page.
 */
const { sf } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { sf: Record<string, string> };
const SHOTS = "e2e/.tmp/presentation-print";

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

/** A soft pink-and-sage picture built in the page, so no binary fixture is committed. */
async function room(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600; canvas.height = 1000;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 1600, 1000);
    gradient.addColorStop(0, "#e9c7c0"); gradient.addColorStop(1, "#7a9a9a");
    context.fillStyle = gradient; context.fillRect(0, 0, 1600, 1000);
    context.fillStyle = "rgba(255,255,255,0.55)";
    for (let index = 0; index < 12; index += 1) context.fillRect(100 + index * 120, 600, 80, 300);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/jpeg", 0.8));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const value of bytes) binary += String.fromCharCode(value);
    return btoa(binary);
  });
  return Buffer.from(base64, "base64");
}

test("P.6 the printed presentation is the same as the screen, one slide per page", async ({ page }) => {
  await page.goto(`/studioflow/projects/${sf.past}/presentation`);
  await page.locator("main").first().waitFor();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("New board").fill("Material Funan");
  await page.getByRole("button", { name: "Create board" }).click();
  await page.getByLabel("Board title").waitFor();
  const file = page.locator('input[type="file"][multiple]');
  await file.setInputFiles({ name: "room.jpg", mimeType: "image/jpeg", buffer: await room(page) });
  await page.getByRole("button", { name: "Slide 1" }).waitFor();
  await file.setInputFiles({ name: "room-2.jpg", mimeType: "image/jpeg", buffer: await room(page) });
  await page.getByRole("button", { name: "Slide 2" }).waitFor();
  await page.getByRole("button", { name: "Slide 1" }).click();

  const notes = ["Emulsion Paint", "Blue Sand Texture", "Stone Texture"];
  const spots: Array<[number, number]> = [[0.25, 0.3], [0.7, 0.25], [0.5, 0.6], [0.85, 0.7]];
  for (const [index, [x, y]] of spots.entries()) {
    // The first click on an image chooses it; a click on the chosen image puts a pin there.
    if (index === 0) await page.locator('section[aria-label="Slide"] img').first().click();
    const box = (await page.locator('section[aria-label="Slide"] img').first().boundingBox())!;
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    // The new pin is created by a request; its panel is replaced when that returns, so wait for it before typing.
    await expect(page.getByRole("button", { name: `Pin ${index + 1}`, exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Save pin" }).waitFor();
    if (index === 0) await page.getByRole("combobox", { name: "Product Schedule" }).selectOption({ label: "ST-01 — ZZ-Test Past Marble" });
    else await page.getByRole("textbox", { name: "Note" }).fill(index < 4 ? notes[index - 1] ?? "Microcement Texture" : "");
    await page.getByRole("button", { name: "Save pin" }).click();
    await page.waitForLoadState("networkidle");
  }
  const boardUrl = page.url();
  const boardId = boardUrl.split("/").pop()!;

  await page.goto(`/studioflow/print/projects/${sf.past}/presentation/${boardId}?paper=A4&orientation=landscape`);
  const sheets = page.locator(".ui-document-page");
  await expect(sheets).toHaveCount(2);
  // A saved PDF is named after the page title: the date, the project and the board, not the address.
  await expect(page).toHaveTitle(/^\d{8} ZZ-Test SF Past Material Funan$/);
  await page.locator(".ui-document-page img").first().evaluate((image: HTMLImageElement) => image.decode());
  await expect(page.getByText("ST-01").first()).toBeVisible();
  await expect(page.getByText("Blue Sand Texture")).toBeVisible();

  const first = sheets.first();
  const onScreen = (await first.boundingBox())!;
  // A4 landscape is 297 x 210 mm; at 96 px per inch that is about 1122 x 794 px (half a millimetre is held back).
  expect(Math.round(onScreen.width)).toBe(1123);
  expect(onScreen.height).toBeGreaterThan(785);
  expect(onScreen.height).toBeLessThan(795);
  const parts = [first.locator("h1"), first.locator("img"), first.locator("ol")];
  /** Each part's place inside its page, so the comparison does not depend on where the page sits in the window. */
  const placed = async () => {
    const page0 = (await first.boundingBox())!;
    return Promise.all(parts.map(async (part) => { const box = (await part.boundingBox())!; return [box.x - page0.x, box.y - page0.y, box.width, box.height]; }));
  };
  const onScreenParts = await placed();
  await first.screenshot({ path: `${SHOTS}/page-1-screen.png` });

  await page.emulateMedia({ media: "print" });
  const printed = (await first.boundingBox())!;
  expect(Math.round(printed.width)).toBe(Math.round(onScreen.width));
  expect(Math.round(printed.height)).toBe(Math.round(onScreen.height));
  const printedParts = await placed();
  await first.screenshot({ path: `${SHOTS}/page-1-print.png` });
  // The title, the picture and the legend sit in the same places on screen and in print (within a pixel of rounding).
  printedParts.forEach((box, row) => box.forEach((value, column) => expect(Math.abs(value - onScreenParts[row][column]), `part ${row} value ${column}`).toBeLessThan(1.5)));

  // The legend stays inside its page: its bottom edge is above the page's bottom edge.
  const legend = (await page.locator(".ui-document-page ol").first().boundingBox())!;
  expect(legend.y + legend.height).toBeLessThanOrEqual(printed.y + printed.height);

  // The printer gets exactly one page per slide.
  const pdf = await page.pdf({ preferCSSPageSize: true });
  const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pageCount).toBe(2);
  await page.emulateMedia({ media: "screen" });

  // The same board on A4 portrait: a taller page, the legend still inside it, and the picture still large.
  await page.goto(`/studioflow/print/projects/${sf.past}/presentation/${boardId}?paper=A4&orientation=portrait`);
  const portrait = page.locator(".ui-document-page").first();
  await expect(portrait).toBeVisible();
  await page.locator(".ui-document-page img").first().evaluate((image: HTMLImageElement) => image.decode());
  const portraitBox = (await portrait.boundingBox())!;
  expect(Math.round(portraitBox.width)).toBe(794);
  expect(portraitBox.height).toBeGreaterThan(1115);
  const portraitLegend = (await page.locator(".ui-document-page ol").first().boundingBox())!;
  expect(portraitLegend.y + portraitLegend.height).toBeLessThanOrEqual(portraitBox.y + portraitBox.height);
  expect((await page.locator(".ui-document-page img").first().boundingBox())!.width).toBeGreaterThan(600);
  await portrait.screenshot({ path: `${SHOTS}/page-1-portrait.png` });
});

test("P.7 a long legend grows sideways, the page stays the same size and the legend stays inside it", async ({ page }) => {
  await page.goto(`/studioflow/projects/${sf.reuse}/presentation`);
  await page.locator("main").first().waitFor();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("New board").fill("Long legend");
  await page.getByRole("button", { name: "Create board" }).click();
  await page.getByLabel("Board title").waitFor();
  await page.locator('input[type="file"][multiple]').setInputFiles({ name: "room.jpg", mimeType: "image/jpeg", buffer: await room(page) });
  await page.getByRole("button", { name: "Slide 1" }).waitFor();
  const count = 26;
  for (let index = 0; index < count; index += 1) {
    // The first click on an image chooses it; a click on the chosen image puts a pin there.
    if (index === 0) await page.locator('section[aria-label="Slide"] img').first().click();
    const box = (await page.locator('section[aria-label="Slide"] img').first().boundingBox())!;
    await page.mouse.click(box.x + box.width * (0.08 + (index % 9) * 0.1), box.y + box.height * (0.12 + Math.floor(index / 9) * 0.28));
    await expect(page.getByRole("button", { name: `Pin ${index + 1}`, exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("textbox", { name: "Note" }).fill(`Item number ${index + 1} with a name`);
    await page.getByRole("button", { name: "Save pin" }).click();
    await page.waitForLoadState("networkidle");
  }
  const boardId = page.url().split("/").pop()!;
  await page.goto(`/studioflow/print/projects/${sf.reuse}/presentation/${boardId}?paper=A4&orientation=landscape`);
  const sheet = page.locator(".ui-document-page").first();
  await expect(sheet).toBeVisible();
  await page.locator(".ui-document-page img").first().evaluate((image: HTMLImageElement) => image.decode());
  const sheetBox = (await sheet.boundingBox())!;
  const legend = (await page.locator(".ui-document-page ol").first().boundingBox())!;
  expect(Math.round(sheetBox.width)).toBe(1123);
  expect(legend.y + legend.height).toBeLessThanOrEqual(sheetBox.y + sheetBox.height);
  expect((await page.locator(".ui-document-page img").first().boundingBox())!.height).toBeGreaterThan(250);
  await sheet.screenshot({ path: `${SHOTS}/page-long-legend.png` });
  await expect(page.locator(".ui-document-page")).toHaveCount(1);
});

test("P.8 a slide in a layout holds several images, on screen and on its printed page", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto(`/studioflow/projects/${sf.reuse}/presentation`);
  await page.locator("main").first().waitFor();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("New board").fill("Layout board");
  await page.getByRole("button", { name: "Create board" }).click();
  await page.getByLabel("Board title").waitFor();
  await page.getByRole("button", { name: "New slide", exact: true }).click();
  await page.getByRole("button", { name: "Slide 1" }).waitFor();
  await page.getByRole("button", { name: "Grid 4" }).click();
  await expect(page.getByRole("button", { name: "Grid 4" })).toHaveAttribute("aria-pressed", "true");
  const boxInput = page.locator('input[type="file"]:not([multiple])');
  for (const [index, name] of ["a.jpg", "b.jpg"].entries()) {
    await page.getByRole("button", { name: "Add an image or drop one here" }).first().click();
    await boxInput.setInputFiles({ name, mimeType: "image/jpeg", buffer: await room(page) });
    await expect(page.locator('section[aria-label="Slide"] img')).toHaveCount(index + 1, { timeout: 30_000 });
  }
  await page.getByLabel("Slide title").fill("Area Display");
  await page.getByLabel("Slide title").blur();
  await page.waitForLoadState("networkidle");
  await page.locator("main").first().screenshot({ path: `${SHOTS}/editor-grid-4.png` });

  const boardId = page.url().split("/").pop()!;
  await page.goto(`/studioflow/print/projects/${sf.reuse}/presentation/${boardId}?paper=A4&orientation=landscape`);
  const sheet = page.locator(".ui-document-page").first();
  await expect(sheet).toBeVisible();
  await expect(page.locator(".ui-document-page")).toHaveCount(1);
  await expect(sheet.locator("img")).toHaveCount(2);
  await expect(sheet.getByText("Area Display")).toBeVisible();
  await sheet.screenshot({ path: `${SHOTS}/page-grid-4.png` });
});

test("P.9 editing a slide changes the screen at once, re-downloads no picture and is kept after a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto(`/studioflow/projects/${sf.reuse}/presentation`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("New board").fill("Smooth board");
  await page.getByRole("button", { name: "Create board" }).click();
  await page.getByLabel("Board title").waitFor();
  await page.getByRole("button", { name: "New slide", exact: true }).click();
  await page.getByRole("button", { name: "Slide 1" }).waitFor();
  await page.getByRole("button", { name: "Add an image or drop one here" }).first().click();
  await page.locator('input[type="file"]:not([multiple])').setInputFiles({ name: "room.jpg", mimeType: "image/jpeg", buffer: await room(page) });
  await expect(page.locator('section[aria-label="Slide"] img')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.waitForLoadState("networkidle");

  // From here on no picture is fetched again and no page refresh is requested.
  const pictures: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/platform/assets/private")) pictures.push(request.url()); });
  for (const name of ["2 side by side", "Grid 4", "1 image"]) {
    await page.getByRole("button", { name, exact: true }).click();
    // The screen follows the click before any save answers.
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }
  await page.locator('section[aria-label="Slide"] img').first().click();
  await page.getByRole("button", { name: "Show whole" }).click();
  await expect(page.getByRole("button", { name: "Show whole" })).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  await expect(page.getByText("All changes saved")).toBeVisible();
  expect(pictures).toEqual([]);

  // Rapid layout changes were saved once each thing settled; a reload shows the last choice.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "1 image", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.locator('section[aria-label="Slide"] img').first().click();
  await expect(page.getByRole("button", { name: "Show whole" })).toHaveAttribute("aria-pressed", "true");
});
