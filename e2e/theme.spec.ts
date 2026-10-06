import { mkdirSync, readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/**
 * Per-person theme (owner, 2026-10-06): System / Light / Dark in My preferences, applied at once, stamped on
 * <html> by the server on every later page, and never on paper (print/document pages stay light).
 * Screenshots in e2e/.tmp/theme are for the visual QA pass.
 */
const SHOTS = "e2e/.tmp/theme";
const { projectId, bqProjectId } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { projectId: string; bqProjectId: string };

async function open(page: Page, route: string) {
  await page.goto(route);
  await page.locator("main, .ui-document").first().waitFor();
  await page.waitForLoadState("networkidle");
}
const themeAttr = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
// The CSS build may shorten #FFFFFF to #FFF; compare the expanded value.
const surface = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ui-surface").trim().toUpperCase().replace(/^#([0-9A-F])([0-9A-F])([0-9A-F])$/, "#$1$1$2$2$3$3"));
const LIGHT_SURFACE = "#FFFFFF";
const DARK_SURFACE = "#1C1A18";

async function choose(page: Page, label: "System" | "Light" | "Dark") {
  await open(page, "/account");
  const radio = page.getByRole("radio", { name: new RegExp(`^${label}`) });
  await radio.click();
  await expect(radio).toBeChecked();
  // The group is disabled while the choice saves; wait for the save before navigating away.
  await expect(radio).toBeEnabled();
  await page.waitForLoadState("networkidle");
}

test.describe.configure({ mode: "serial" });
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));
test.afterAll(async ({ browser }) => {
  // Leave the shared e2e owner on the default so other specs see the light/system tokens they expect.
  const page = await browser.newPage();
  await choose(page, "System");
  await page.close();
});

test("an unset preference follows the device", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await open(page, "/account");
  expect(await themeAttr(page)).toBeNull();
  expect(await surface(page)).toBe(LIGHT_SURFACE);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await surface(page)).toBe(DARK_SURFACE);
});

test("Dark applies at once, persists, and is stamped by the server on the next page", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await choose(page, "Dark");
  expect(await themeAttr(page)).toBe("dark");
  expect(await surface(page)).toBe(DARK_SURFACE);
  await page.waitForLoadState("networkidle");
  await open(page, "/studioflow");
  expect(await themeAttr(page)).toBe("dark");
  await page.reload();
  expect(await themeAttr(page)).toBe("dark");
});

test("dark-mode screens for visual QA", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [name, route] of [
    ["studioflow-home", "/studioflow"],
    ["project", `/studioflow/projects/${projectId}`],
    ["schedule", `/studioflow/projects/${projectId}/schedule`],
    ["library", "/studioflow/library"],
    ["masterdata", "/masterdata"],
    ["pricing", "/masterdata/pricing"],
    ["bq", "/bq"],
    ["bq-project", `/bq/${bqProjectId}`],
    ["settings-general", "/settings/general"],
    ["settings-users", "/settings/access/users"],
    ["account", "/account"],
  ] as const) {
    await open(page, route);
    expect(await themeAttr(page)).toBe("dark");
    await page.screenshot({ path: `${SHOTS}/dark-${name}.png` });
  }
  await open(page, "/studioflow/projects");
  await page.getByRole("button", { name: /new project/i }).first().click().catch(() => undefined);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/dark-dialog.png` });
});

test("paper stays light while the person uses Dark", async ({ page }) => {
  await open(page, `/studioflow/print/projects/${projectId}/schedule`);
  expect(await themeAttr(page)).toBe("dark");
  expect(await surface(page)).toBe(LIGHT_SURFACE);
  await page.screenshot({ path: `${SHOTS}/dark-print-schedule.png` });
});

test("Light wins over a dark device, and System hands back to the device", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await choose(page, "Light");
  expect(await themeAttr(page)).toBe("light");
  expect(await surface(page)).toBe(LIGHT_SURFACE);
  await page.reload();
  expect(await surface(page)).toBe(LIGHT_SURFACE);
  await choose(page, "System");
  expect(await themeAttr(page)).toBeNull();
  expect(await surface(page)).toBe(DARK_SURFACE);
});
