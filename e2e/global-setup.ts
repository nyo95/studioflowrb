import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { chromium, type FullConfig } from "@playwright/test";

/** Seeds the disposable test database, then signs the test owner in once and keeps the session for every spec. */
export default async function globalSetup(config: FullConfig) {
  const seeded = spawnSync(process.execPath, ["--import", "tsx", "e2e/seed.ts"], { stdio: "inherit", env: process.env });
  if (seeded.status !== 0) throw new Error("e2e seed failed; see the output above.");
  const { email, password } = JSON.parse(readFileSync("e2e/.tmp/owner.json", "utf8")) as { email: string; password: string };

  const baseURL = config.projects[0]!.use.baseURL!;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseURL}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 120_000 });
  await page.context().storageState({ path: "e2e/.tmp/state.json" });
  await browser.close();
  // The e2e dev server points next-env.d.ts at its own build folder (.next-e2e); point it back at .next afterwards
  // so a test run leaves the owner's tree clean.
  return async () => writeFileSync("next-env.d.ts", readFileSync("next-env.d.ts", "utf8").replaceAll("./.next-e2e/", "./.next/"));
}
