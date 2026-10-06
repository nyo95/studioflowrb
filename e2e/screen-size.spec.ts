import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/**
 * DESIGN v2 §12: the content never scrolls sideways; at 840px and wider the mark cell and the rail share one
 * width and the rail expands only when its control is pressed; below 840px the rail is a strip and the account
 * menu sits in the top bar.
 */
const { projectId, bqProjectId } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { projectId: string; bqProjectId: string };
const ROUTES = [
  "/studioflow",
  `/studioflow/projects/${projectId}`,
  `/studioflow/projects/${projectId}/schedule`,
  "/masterdata",
  "/masterdata/pricing",
  "/bq",
  "/bq/library",
  `/bq/${bqProjectId}`,
  "/settings/general",
  "/settings/access/users",
  "/studioflow/settings/phases",
  "/studioflow/settings/schedule",
  "/masterdata/settings/units",
  "/account",
];
const WIDTHS = [375, 640, 839, 840, 841];

async function open(page: Page, route: string) {
  await page.goto(route);
  await page.locator("main").first().waitFor();
  await page.waitForLoadState("networkidle");
}

/**
 * Every scroll region between the viewport and the content: none may be wider than it is shown. A table's own
 * scroller (the element that directly holds a `table`) is exempt: DESIGN §12 "tables scroll horizontally inside
 * their own surface"; the containers around it and `main` are still checked.
 */
async function sidewaysOverflow(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>("main, main div.overflow-y-auto")]
    .filter((element) => !element.querySelector(":scope > table"))
    .filter((element) => element.scrollWidth > element.clientWidth + 1)
    .map((element) => `${element.tagName.toLowerCase()} ${element.clientWidth}/${element.scrollWidth}`));
}

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const route of ROUTES) {
      test(`no sideways scroll on ${route.replace(projectId, ":project").replace(bqProjectId, ":bq-project")}`, async ({ page }) => {
        await open(page, route);
        expect(await sidewaysOverflow(page)).toEqual([]);
      });
    }

    test("rail and account placement", async ({ page }) => {
      await open(page, "/studioflow");
      const rail = page.locator("aside[aria-label]");
      const brand = page.locator("[data-shell-brand]");
      const account = page.getByRole("button", { name: /^Account menu for/ });
      if (width >= 840) {
        const toggle = rail.getByRole("button", { name: /navigation$/ });
        const collapsed = (await rail.boundingBox())!.width;
        expect(Math.round((await brand.boundingBox())!.width)).toBe(Math.round(collapsed));
        await rail.hover();
        await page.waitForTimeout(300);
        expect((await rail.boundingBox())!.width).toBe(collapsed); // hover does not expand
        // Pressed from the keyboard: the Next dev indicator sits over the rail's foot in a dev server.
        await toggle.focus();
        await page.keyboard.press("Enter");
        await expect.poll(async () => (await rail.boundingBox())!.width).toBeGreaterThan(collapsed + 100);
        await page.waitForTimeout(300);
        expect(Math.round((await brand.boundingBox())!.width)).toBe(Math.round((await rail.boundingBox())!.width));
        await expect(account).toBeHidden();
      } else {
        const box = (await rail.boundingBox())!;
        expect(box.width).toBeGreaterThan(width - 2); // a strip across the screen
        expect(box.height).toBeLessThan(120);
        await expect(account).toBeVisible();
      }
    });
  });
}
