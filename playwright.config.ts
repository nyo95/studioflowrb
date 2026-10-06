import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

loadEnv({ path: ".env.test.local" });
loadEnv({ path: ".env.test" });

/**
 * Screen-size regression checks (DESIGN v2 §12). `npm run test:e2e` starts its own Next dev server on port 3101
 * with a separate build folder (`.next-e2e`) against the disposable test database only, so it never touches the
 * owner's dev server (:3001) or dev database. `e2e/global-setup.ts` seeds that database and refuses any other.
 */
const PORT = 3101;
const testDatabaseUrl = process.env.PLATFORM_TEST_DATABASE_URL ?? "";

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./e2e/global-setup.ts",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "e2e/.tmp/results",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    storageState: "e2e/.tmp/state.json",
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: testDatabaseUrl,
      PLATFORM_TEST_DATABASE_URL: testDatabaseUrl,
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
