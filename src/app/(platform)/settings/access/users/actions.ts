"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { displayNameSchema, identityEmailSchema, passwordSchema, requirePrincipalGrants } from "@platform/core/auth";
import { platformAccess } from "@platform/runtime";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";

function revalidateUsers(): void {
  revalidatePath("/settings/access/users");
  revalidatePath("/settings/access/roles");
}

const CreateUserSchema = z.object({
  email: identityEmailSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});

export async function createUserAction(_prev: ActionResult<{ changed?: boolean; userId?: string }> | null, formData: FormData): Promise<ActionResult<{ userId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = CreateUserSchema.safeParse({
      email: String(formData.get("email") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    if (!parsed.success) throw validationError(parsed.error);
    const roleIds = formData.getAll("roleIds").map(String).filter(Boolean);
    const result = await platformAccess.createUser({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      password: parsed.data.password,
      roleIds,
    });
    revalidateUsers();
    return result;
  });
}

export async function updateUserDisplayNameAction(
  _prev: ActionResult<{ changed?: boolean; userId?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ changed: boolean }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = z
      .object({ userId: z.string().uuid(), displayName: displayNameSchema })
      .safeParse({
        userId: String(formData.get("userId") ?? ""),
        displayName: String(formData.get("displayName") ?? ""),
      });
    if (!parsed.success) throw validationError(parsed.error);
    const result = await platformAccess.updateUserDisplayName({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      userId: parsed.data.userId,
      displayName: parsed.data.displayName,
    });
    revalidateUsers();
    return result;
  });
}

const SetPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: passwordSchema,
});

export async function setUserPasswordAction(
  _prev: ActionResult<{ changed?: boolean; userId?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ changed: boolean }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = SetPasswordSchema.safeParse({
      userId: String(formData.get("userId") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    if (!parsed.success) throw validationError(parsed.error);
    const result = await platformAccess.setUserPassword({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      userId: parsed.data.userId,
      password: parsed.data.password,
    });
    revalidateUsers();
    return result;
  });
}

export async function disableUserAction(userId: string): Promise<ActionResult<{ changed: boolean }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const result = await platformAccess.disableUser({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      userId,
    });
    revalidateUsers();
    return result;
  });
}

export async function restoreUserAction(userId: string): Promise<ActionResult<{ changed: boolean }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const result = await platformAccess.restoreUser({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      userId,
    });
    revalidateUsers();
    return result;
  });
}

export async function assignRoleAction(userId: string, roleId: string): Promise<ActionResult<{ changed: boolean }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const result = await platformAccess.assignUserRole({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      userId,
      roleId,
    });
    revalidateUsers();
    return result;
  });
}

export async function removeRoleAction(userId: string, roleId: string): Promise<ActionResult<{ changed: boolean }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const result = await platformAccess.removeUserRole({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      userId,
      roleId,
    });
    revalidateUsers();
    return result;
  });
}
