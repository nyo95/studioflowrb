import { readFileSync } from "node:fs";

import { expect, test, type Browser, type Page } from "@playwright/test";

const fixture = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as {
  designer: { email: string; password: string };
  manager: { email: string; password: string };
  roleProject: { projectId: string; cdPhaseId: string };
};

async function signedInPage(browser: Browser, credentials: { email: string; password: string }): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, baseURL: "http://localhost:3101" });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { page, close: () => context.close() };
}

test("Designer navigation stays personal and Construction Drawing is read-only", async ({ browser }) => {
  const session = await signedInPage(browser, fixture.designer);
  try {
    const { page } = session;
    await page.goto("/studioflow");
    const appNav = page.getByRole("group", { name: "StudioFlow navigation" });
    await expect(appNav.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(appNav.getByRole("link", { name: "Projects" })).toBeVisible();
    await expect(appNav.getByRole("link", { name: "Library" })).toBeVisible();
    await expect(appNav.getByRole("link", { name: "Clients" })).toHaveCount(0);
    await expect(appNav.getByRole("link", { name: "Timeline" })).toHaveCount(0);

    await page.goto(`/studioflow/projects/${fixture.roleProject.projectId}?phase=${fixture.roleProject.cdPhaseId}`);
    await expect(page.getByRole("heading", { name: "Construction Drawing list" })).toBeVisible();
    await expect(page.getByText("Only the assigned Drafter can change this list.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Add drawing/i })).toHaveCount(0);
    await expect(page.getByRole("log", { name: "Notes" })).toHaveCount(0);
  } finally {
    await session.close();
  }
});

test("Studio Manager sees operations and portfolio Timeline without date editing", async ({ browser }) => {
  const session = await signedInPage(browser, fixture.manager);
  try {
    const { page } = session;
    await page.goto("/studioflow/timeline");
    const appNav = page.getByRole("group", { name: "StudioFlow navigation" });
    await expect(appNav.getByRole("link", { name: "Clients" })).toBeVisible();
    await expect(appNav.getByRole("link", { name: "Timeline" })).toBeVisible();
    await expect(page.getByText(/read-only Gantt/).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(/open Dates & plan/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Dates & plan" })).toHaveCount(0);
    await page.goto(`/studioflow/projects/${fixture.roleProject.projectId}`);
    await expect(page.getByRole("heading", { name: "ZZ-Test SF Role Matrix" })).toBeVisible();
  } finally {
    await session.close();
  }
});
