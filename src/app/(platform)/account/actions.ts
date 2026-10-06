"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@platform/core/errors";
import { displayNameSchema, passwordSchema, requirePrincipal, requirePrincipalGrants, revokeSessionById, setSessionCookie } from "@platform/core/auth";
import { prisma } from "@platform/core/db";
import { platformAccount, storageUsage, userPreferences } from "@platform/runtime";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";

const DisplayNameSchema = z.object({ displayName: displayNameSchema });

export async function updateDisplayNameAction(
  _prev: ActionResult<{ changed: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ changed: boolean }>> {
  return runSafeAction(async () => {
    const principal = await requirePrincipal();
    const parsed = DisplayNameSchema.safeParse({ displayName: String(formData.get("displayName") ?? "") });
    if (!parsed.success) throw validationError(parsed.error);
    const result = await platformAccount.updateOwnDisplayName({
      userId: principal.userId,
      displayName: parsed.data.displayName,
    });
    revalidatePath("/account");
    return result;
  });
}

const PasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export async function changePasswordAction(
  _prev: ActionResult<{ changed: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ changed: boolean }>> {
  return runSafeAction(async () => {
    const principal = await requirePrincipal();
    const parsed = PasswordSchema.safeParse({
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
    });
    if (!parsed.success) throw validationError(parsed.error);
    const { rotated } = await platformAccount.changeOwnPassword({
      userId: principal.userId,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
    // Rotate the current browser session after the revocation transaction.
    await setSessionCookie(rotated.rawToken, rotated.cookieExpiresAt);
    return { changed: true };
  });
}

export async function revokeSessionAction(sessionId: string): Promise<ActionResult<{ revoked: boolean }>> {
  return runSafeAction(async () => {
    const principal = await requirePrincipal();
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      throw new AppError("VALIDATION", "SESSION_ID_REQUIRED", "Select a session to revoke.");
    }
    // Fail closed: a user may only revoke their own sessions.
    const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { user_id: true } });
    if (!session || session.user_id !== principal.userId) {
      throw new AppError("NOT_FOUND", "SESSION_NOT_FOUND", "That session no longer exists.");
    }
    const revoked = await revokeSessionById(prisma, sessionId);
    revalidatePath("/account");
    return { revoked };
  });
}

const PreferenceInput = z.strictObject({
  theme: z.enum(["system", "light", "dark"]).nullable().optional(),
  locale: z.string().max(80).nullable().optional(),
  timezone: z.string().max(120).nullable().optional(),
  startPage: z.string().max(300).nullable().optional(),
});

/** Personal-only boundary: the browser never supplies a user id. */
export async function updateMyPreferencesAction(input: z.infer<typeof PreferenceInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = PreferenceInput.safeParse(input);
    if (!parsed.success) throw validationError(parsed.error);
    const result = await userPreferences.update({ userId: principal.userId, grants, ...parsed.data });
    revalidatePath("/account");
    revalidatePath("/", "layout");
    return result;
  });
}

export async function getMyPreferences() {
  const principal = await requirePrincipal();
  return userPreferences.get({ userId: principal.userId });
}

export async function getStorageUsageAction(): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const { grants } = await requirePrincipalGrants();
    return storageUsage.getStorageUsage({ grants });
  });
}
