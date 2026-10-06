import { mkdirSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/**
 * Settings ownership (owner, 2026-10-06): platform, StudioFlow and Master Data each have their own settings
 * area whose sidebar never links into another one; every settings page has a breadcrumb back; old URLs land.
 */
const SHOTS = "e2e/.tmp/settings";

async function open(page: Page, route: string) {
  await page.goto(route);
  await page.locator("main").first().waitFor();
  await page.waitForLoadState("networkidle");
}

async function sidebarHrefs(page: Page) {
  return page.locator('main nav[aria-label="Settings navigation"] a').evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
}

const AREAS = [
  { route: "/settings/general", prefix: "/settings/", back: "Home" },
  { route: "/settings/access/users", prefix: "/settings/", back: "Home" },
  { route: "/studioflow/settings/phases", prefix: "/studioflow/settings/", back: "StudioFlow" },
  { route: "/studioflow/settings/checklists", prefix: "/studioflow/settings/", back: "StudioFlow" },
  { route: "/studioflow/settings/schedule", prefix: "/studioflow/settings/", back: "StudioFlow" },
  { route: "/studioflow/settings/archived-files", prefix: "/studioflow/settings/", back: "StudioFlow" },
  { route: "/masterdata/settings/units", prefix: "/masterdata/settings/", back: "Master Data" },
  { route: "/masterdata/settings/bq-approvals", prefix: "/masterdata/settings/", back: "Master Data" },
];

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

for (const area of AREAS) {
  test(`${area.route}: own sidebar only, with a way back`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, area.route);
    const hrefs = await sidebarHrefs(page);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href.startsWith(area.prefix), `${href} leaks out of ${area.prefix}`).toBe(true);
    await expect(page.locator('main nav[aria-label="Breadcrumb"] a', { hasText: area.back }).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/${area.route.replaceAll("/", "_")}.png`, fullPage: true });
  });
}

test("old settings URLs land on their new pages", async ({ page }) => {
  for (const [from, to] of [
    ["/settings", "/settings/general"],
    ["/settings/general/masterdata", "/masterdata/settings/units"],
    ["/masterdata/units", "/masterdata/settings/units"],
    ["/studioflow/schedule-templates", "/studioflow/settings/schedule"],
    ["/studioflow/settings", "/studioflow/settings/phases"],
  ] as const) {
    await page.goto(from);
    await expect(page).toHaveURL(new RegExp(`${to.replaceAll("/", "\\/")}$`));
  }
});

test("My preferences is personal: no settings sidebar, display preferences present", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/account");
  await expect(page.locator('main nav[aria-label="Settings navigation"]')).toHaveCount(0);
  await expect(page.getByLabel("Timezone")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/_account.png`, fullPage: true });
});

test("app rails link to their own settings", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/studioflow");
  await expect(page.locator('a[href="/studioflow/settings"]').first()).toBeVisible();
  await open(page, "/masterdata");
  await expect(page.locator('a[href="/masterdata/settings"]').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/_masterdata-rail.png` });
});
