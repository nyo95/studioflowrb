"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { platformAccess } from "@platform/runtime";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";

function revalidateRoles(): void {
  revalidatePath("/settings/access/roles");
  revalidatePath("/settings/access/users");
}

const RoleDetailsSchema = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9-]{0,63}$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
});

export async function createRoleAction(_prev: ActionResult<{ changed?: boolean; roleId?: string }> | null, formData: FormData): Promise<ActionResult<{ roleId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = RoleDetailsSchema.safeParse({
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
    });
    if (!parsed.success) throw validationError(parsed.error);
    const permissionIds = formData.getAll("permissionIds").map(String).filter(Boolean);
    const result = await platformAccess.createRole({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description || null,
      permissionIds,
    });
    revalidateRoles();
    return result;
  });
}

export async function updateRoleAction(_prev: ActionResult<{ changed?: boolean; roleId?: string }> | null, formData: FormData): Promise<ActionResult<{ changed: boolean }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = z
      .object({
        roleId: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).optional(),
      })
      .safeParse({
        roleId: String(formData.get("roleId") ?? ""),
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
      });
    if (!parsed.success) throw validationError(parsed.error);
    const result = await platformAccess.updateRole({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      roleId: parsed.data.roleId,
      name: parsed.data.name,
      description: parsed.data.description || null,
    });
    revalidateRoles();
    return result;
  });
}

export async function replaceRoleGrantsAction(
  _prev: ActionResult<{ changed?: boolean; roleId?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ changed: boolean }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const roleId = z.string().uuid().safeParse(String(formData.get("roleId") ?? ""));
    if (!roleId.success) throw validationError(roleId.error);
    const permissionIds = formData.getAll("permissionIds").map(String).filter(Boolean);
    const result = await platformAccess.replaceRoleGrants({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      roleId: roleId.data,
      permissionIds,
    });
    revalidateRoles();
    return result;
  });
}

export async function archiveRoleAction(roleId: string): Promise<ActionResult<{ changed: boolean }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const result = await platformAccess.archiveRole({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      roleId,
    });
    revalidateRoles();
    return result;
  });
}
