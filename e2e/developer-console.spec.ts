import { Client } from "pg";
import { expect, test } from "@playwright/test";

import { decodeBase32, encryptTotpSecret, totpAt } from "../src/platform/core/developer-access/crypto";

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

test("Developer remains outside app RBAC and controls only optional modules", async ({ page }) => {
  const connectionString = process.env.PLATFORM_TEST_DATABASE_URL;
  const sessionSecret = process.env.SESSION_SECRET ?? "playwright-developer-console-secret";
  if (!connectionString) throw new Error("PLATFORM_TEST_DATABASE_URL is required.");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("DELETE FROM platform.developer_session");
    await client.query("DELETE FROM platform.developer_recovery_code");
    await client.query("DELETE FROM platform.developer_access");

    // The Playwright storage state is a fully privileged Platform Owner app
    // session. It must still land on the independent Developer login.
    await page.goto("/system");
    await expect(page).toHaveURL(/\/system\/login$/u);
    await expect(page.getByText("Developer access is not set up.")).toBeVisible();

    await client.query(
      `INSERT INTO platform.developer_access (id, totp_secret_enc, enrolled_at)
       VALUES ('developer', $1, now())`,
      [encryptTotpSecret(SECRET, sessionSecret)],
    );
    await page.reload();
    const code = totpAt(decodeBase32(SECRET), Date.now()).code;
    await page.getByLabel("Authenticator code").fill(code);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/system$/u);
    await expect(page.getByRole("heading", { name: "Developer console" })).toBeVisible();

    const ideasRow = page.getByRole("row").filter({ hasText: "Ideas Board" });
    await ideasRow.getByRole("button", { name: "Turn off" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText(/Existing data and role selections are kept/u)).toBeVisible();
    await dialog.getByRole("button", { name: "Turn off" }).click();
    await expect(ideasRow.getByRole("button", { name: "Turn on" })).toBeVisible();
    const disabled = await client.query<{ state: string }>("SELECT state FROM platform.module_state WHERE module_id = 'ideas'");
    expect(disabled.rows[0]?.state).toBe("DISABLED");

    await ideasRow.getByRole("button", { name: "Turn on" }).click();
    await expect(ideasRow.getByRole("button", { name: "Turn off" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/system\/login$/u);
  } finally {
    await client.query("UPDATE platform.module_state SET state = 'ENABLED', updated_by = 'e2e-cleanup' WHERE module_id = 'ideas'");
    await client.query("DELETE FROM platform.developer_session");
    await client.query("DELETE FROM platform.developer_recovery_code");
    await client.query("DELETE FROM platform.developer_access");
    await client.end();
  }
});
