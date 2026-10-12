import { mkdirSync } from "node:fs";
import { Client } from "pg";

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

test("access terminology distinguishes Platform Owner from Developer", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/settings/modules");
  await expect(page.getByText("Changed only by the Developer.", { exact: true })).toBeVisible();

  await open(page, "/settings/access/roles");
  await expect(page.getByText("Platform Owner", { exact: true }).first()).toBeVisible();
  const ownerRow = page.getByRole("row").filter({ hasText: "platform-owner" });
  await expect(ownerRow.getByText("All Developer-enabled access", { exact: true })).toBeVisible();
  await expect(ownerRow.getByText("Locked", { exact: true })).toBeVisible();
  await expect(ownerRow.getByRole("button", { name: /Actions for/ })).toHaveCount(0);
});

test("Role matrix follows the Developer module ceiling without hiding core apps", async ({ page }) => {
  const connectionString = process.env.PLATFORM_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("PLATFORM_TEST_DATABASE_URL is required.");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`DELETE FROM platform."RolePermission" WHERE role_id IN (SELECT id FROM platform."Role" WHERE code = 'e2e-project-manager')`);
    await client.query(`DELETE FROM platform."Role" WHERE code = 'e2e-project-manager'`);
    await client.query(`INSERT INTO platform.module_state (module_id, state, last_version, updated_by)
      VALUES ('ideas', 'ENABLED', '1.0.0', 'e2e')
      ON CONFLICT (module_id) DO UPDATE SET state = EXCLUDED.state, updated_by = EXCLUDED.updated_by`);
    await open(page, "/settings/access/roles");
    await page.getByRole("button", { name: "New role" }).click();
    await expect(page.locator('input[value="studioflow.ideas.manage"]')).toHaveCount(1);
    await expect(page.locator('input[value^="platform."]')).toHaveCount(0);
    await expect(page.locator('input[value$=".access"]')).toHaveCount(0);
    await expect(page.getByText("Manage every project", { exact: true })).toBeVisible();
    await expect(page.getByText("Can change projects even when the user is not assigned as PIC.", { exact: true })).toBeVisible();
    await page.getByLabel("Code").fill("e2e-project-manager");
    await page.getByLabel("Name").fill("E2E Project Manager");
    await page.getByLabel("Manage every project").check();
    await page.getByRole("button", { name: "Create role" }).click();
    await expect(page.getByText("E2E Project Manager", { exact: true })).toBeVisible();
    const stored = await client.query<{ permission_id: string }>(`SELECT rp.permission_id
      FROM platform."RolePermission" rp
      JOIN platform."Role" r ON r.id = rp.role_id
      WHERE r.code = 'e2e-project-manager'
      ORDER BY rp.permission_id`);
    expect(stored.rows.map((row) => row.permission_id)).toEqual([
      "studioflow.access",
      "studioflow.project.manage",
      "studioflow.project.override",
      "studioflow.project.read",
    ]);

    await client.query(`UPDATE platform.module_state SET state = 'DISABLED', updated_by = 'e2e' WHERE module_id = 'ideas'`);
    await page.reload();
    await page.getByRole("button", { name: "New role" }).click();
    await expect(page.locator('input[value="studioflow.ideas.manage"]')).toHaveCount(0);
    await expect(page.locator('input[value="studioflow.access"]')).toHaveCount(0);
    await expect(page.locator('input[value="studioflow.presentation.manage"]')).toHaveCount(1);
  } finally {
    await client.query(`DELETE FROM platform."RolePermission" WHERE role_id IN (SELECT id FROM platform."Role" WHERE code = 'e2e-project-manager')`);
    await client.query(`DELETE FROM platform."Role" WHERE code = 'e2e-project-manager'`);
    await client.query(`UPDATE platform.module_state SET state = 'ENABLED', updated_by = 'e2e-cleanup' WHERE module_id = 'ideas'`);
    await client.end();
  }
});
