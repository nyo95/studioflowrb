import { mkdirSync, readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/**
 * WO-E2E-ACCEPT-01, Stage 4 (walk sections 0 and 1 plus the platform and Ideas features of 2026-10-09).
 * The owner account has its guides marked done in the seed; the guide spec walks them as a second, fresh account.
 */
const { limited, sf } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { limited: { email: string; password: string }; sf: Record<string, string> };
const SHOTS = "e2e/.tmp/stage-4";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

async function signInAsLimited(browser: import("@playwright/test").Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, baseURL: "http://localhost:3101" });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(limited.email);
  await page.getByLabel("Password").fill(limited.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
  return page;
}

test.describe.serial("first-use guide (one fresh account, in order)", () => {
  test("1.1 the first-use guide asks for a language, walks through, and does not come back", async ({ browser }) => {
    const page = await signInAsLimited(browser);
    await page.goto("/studioflow");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("dialog", { name: "Start from Home" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/1.1-guide-step-1.png` });
    for (let step = 0; step < 8 && !(await page.getByRole("button", { name: "Done", exact: true }).isVisible()); step += 1) {
      await page.getByRole("button", { name: "Next", exact: true }).click();
    }
    await page.getByRole("button", { name: "Done", exact: true }).click();
    // Done is saved by a request; give it the moment a person would, instead of reloading in the same instant.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.locator("main").first().waitFor();
    await page.waitForTimeout(3000);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.context().close();
  });

  test("1.4 Help: replay guide plays it again without asking for a language", async ({ browser }) => {
    // Runs after 1.1 for the same account: the language was chosen and the guide finished there.
    const page = await signInAsLimited(browser);
    await page.goto("/studioflow");
    await page.locator("main").first().waitFor();
    await page.getByRole("button", { name: "Help: replay guide" }).click();
    await expect(page.getByRole("dialog", { name: "Start from Home" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.context().close();
  });
});

test("P.3 a person without the integration permission does not see the token section", async ({ browser }) => {
  const page = await signInAsLimited(browser);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "My preferences" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Integration tokens" })).toHaveCount(0);
  await page.context().close();
});

test("P.4 a token is shown once when created, listed, and revoked", async ({ page }) => {
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Integration tokens" })).toBeVisible();
  await page.getByLabel("Name").last().fill("ZZ-Test SketchUp office");
  await page.getByRole("checkbox", { name: "Run the connection test" }).check();
  await page.getByRole("button", { name: "Create token" }).click();
  await expect(page.getByText(/sfk_[a-f0-9]{12}_/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/P.4-token-created.png` });
  await expect(page.getByRole("row", { name: /ZZ-Test SketchUp office/ })).toContainText("Active");
  await page.getByRole("row", { name: /ZZ-Test SketchUp office/ }).getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("row", { name: /ZZ-Test SketchUp office/ })).toContainText("Revoked");
  // The secret is not kept anywhere: after a reload only the prefix remains.
  await page.reload();
  await expect(page.getByText(/sfk_[a-f0-9]{12}_[A-Za-z0-9_-]{20,}/)).toHaveCount(0);
});

test("P.5 an image dropped on the Ideas board becomes a card that can go to a project's moodboard", async ({ page }) => {
  await page.goto("/studioflow/ideas");
  await page.locator("main").first().waitFor();
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "idea.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("button", { name: /actions/i }).first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/P.5-idea-card.png` });
  await page.getByRole("button", { name: /actions/i }).first().click();
  await page.getByRole("menuitem", { name: /Add to moodboard/ }).click();
  const dialog = page.getByRole("dialog", { name: "Add to moodboard" });
  await dialog.getByRole("combobox").selectOption({ label: "ZZ-Test SF Aside" });
  await dialog.getByRole("button", { name: "Add to moodboard" }).click();
  await expect(page.getByText(/Moodboard board of ZZ-Test SF Aside/)).toBeVisible();
  await page.goto(`/studioflow/projects/${sf.aside}/presentation`);
  await expect(page.getByText("Moodboard", { exact: true }).first()).toBeVisible();
});

test("0.3 Home, Pricing and a project page open without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !/Failed to load resource|favicon/i.test(message.text())) errors.push(message.text()); });
  for (const route of ["/studioflow", "/masterdata/pricing", `/studioflow/projects/${sf.aside}`]) {
    await page.goto(route);
    await page.locator("main").first().waitFor();
    await page.waitForLoadState("networkidle");
  }
  expect(errors).toEqual([]);
});
