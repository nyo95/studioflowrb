"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { runSafeAction, type ActionResult } from "@platform/core/actions";
import {
  clearDeveloperSessionCookie,
  developerAccess,
  getDeveloperSessionCookie,
  setDeveloperSessionCookie,
} from "@platform/core/developer-access";
import { AppError } from "@platform/core/errors";

export async function developerSignInAction(
  _previous: ActionResult<{ signedIn: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ signedIn: true }>> {
  return runSafeAction(async () => {
    const headerList = await headers();
    const result = await developerAccess.signIn({
      code: String(formData.get("code") ?? ""),
      recovery: formData.get("method") === "recovery",
      ip: headerList.get("x-forwarded-for"),
      userAgent: headerList.get("user-agent"),
    });
    await setDeveloperSessionCookie(result.rawToken, result.expiresAt);
    redirect("/system");
  }, { context: "developer_sign_in" });
}

async function requiredToken(): Promise<string> {
  const rawToken = await getDeveloperSessionCookie();
  if (!rawToken) throw new AppError("UNAUTHENTICATED", "DEVELOPER_SESSION_REQUIRED", "Sign in as Developer to continue.");
  await developerAccess.requireSession(rawToken);
  return rawToken;
}

export async function changeDeveloperModuleStateAction(
  moduleId: string,
  state: "ENABLED" | "DISABLED",
): Promise<ActionResult<{ changed: boolean; state: "ENABLED" | "DISABLED" }>> {
  return runSafeAction(async () => {
    if (state !== "ENABLED" && state !== "DISABLED") {
      throw new AppError("VALIDATION", "MODULE_STATE_INVALID", "Choose On or Off.");
    }
    const rawToken = await requiredToken();
    const result = await developerAccess.setModuleState(rawToken, moduleId, state);
    revalidatePath("/system");
    revalidatePath("/settings/modules");
    revalidatePath("/settings/access/roles");
    return result;
  }, { context: "developer_module_state" });
}

export async function changeIntegrationAccessAction(
  moduleId: string,
  userId: string,
  allowed: boolean,
): Promise<ActionResult<{ changed: boolean }>> {
  return runSafeAction(async () => {
    const rawToken = await requiredToken();
    const result = await developerAccess.setIntegrationAccess(rawToken, moduleId, userId, allowed === true);
    revalidatePath("/system");
    revalidatePath("/account");
    return result;
  }, { context: "developer_integration_access" });
}

export async function developerSignOutAction(): Promise<void> {
  const rawToken = await requiredToken();
  await developerAccess.signOut(rawToken);
  await clearDeveloperSessionCookie();
  redirect("/system/login");
}
