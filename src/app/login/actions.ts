"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import {
  performLogin,
  setSessionCookie,
  requirePrincipalGrants,
} from "@platform/core/auth";
import { prisma } from "@platform/core/db";
import { createPostgresLoginLimiter } from "@platform/core/auth/limiter-postgres";
import { getPermissionRegistry } from "@platform/core/rbac/registry";
import { runSafeAction, type ActionResult } from "@platform/core/actions";

/**
 * The only public server action. Rate limits are consumed BEFORE credential
 * verification; every credential failure is the identical generic payload;
 * success sets the revocable session cookie inside this Server Function and
 * redirects to the sole accessible app (or the launcher). `redirect()` throws
 * framework control flow, which the safe-action boundary rethrows untouched.
 */

const postgresLoginLimiter = createPostgresLoginLimiter();

async function forwardedHeaderValue(): Promise<string | null> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for");
}

export async function loginAction(_prev: ActionResult<{ redirectTo: string }> | null, formData: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  return runSafeAction(async () => {
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const networkKeySource = { forwardedClientIp: await forwardedHeaderValue() };

    const outcome = await performLogin(
      { db: prisma, limiter: postgresLoginLimiter },
      { email, password, networkKeySource },
    );

    // Cookie mutation happens inside this Server Function (CORE.md §3).
    await setSessionCookie(outcome.session.rawToken, outcome.session.cookieExpiresAt);

    const { grants } = await requirePrincipalGrants();
    const accessible = getPermissionRegistry().apps.filter((app) => grants.includes(app.accessPermission));
    redirect(accessible.length === 1 ? accessible[0].rootPath : "/");
  });
}
