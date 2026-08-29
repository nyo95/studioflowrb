import type { Prisma } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditWriter } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";

import { hashPassword, isValidPasswordLength } from "./password";
import { PLATFORM_PERMISSIONS } from "../rbac/registry";

/**
 * One-time first-owner bootstrap command (CORE.md §3, Foundation F0 §6).
 *
 * - server-side command only — never an HTTP/public route;
 * - accepts email, display name, and password through non-logged command
 *   input; never prints or returns the password or its hash;
 * - refuses while any ACTIVE user exists;
 * - creates the `platform-owner` system Role with explicit grants from the
 *   current code registry, the owner User, the assignment, and the audit
 *   event in ONE transaction;
 * - if the system role already exists (e.g. recreated after a lost owner),
 *   its grants are reused untouched — bootstrap never overwrites later
 *   grant customization.
 */

export const PLATFORM_OWNER_ROLE_CODE = "platform-owner";

export type BootstrapInput = {
  email: string;
  displayName: string;
  password: string;
};

export type BootstrapResult = {
  userId: string;
  roleId: string;
  email: string;
};

export type BootstrapPorts = {
  runTransaction: <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
  auditWriter: AuditWriter;
  now: () => Date;
  generateId: () => string;
};

export async function bootstrapFirstOwner(
  ports: BootstrapPorts,
  input: BootstrapInput,
): Promise<BootstrapResult> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (email.length === 0 || displayName.length === 0) {
    throw new AppError("VALIDATION", "BOOTSTRAP_INPUT_INVALID", "Email and display name are required.");
  }
  if (!isValidPasswordLength(input.password)) {
    throw new AppError("VALIDATION", "PASSWORD_POLICY", "The password must contain between 12 and 128 characters.");
  }

  const { runTransaction, auditWriter, now, generateId } = ports;

  const result = await runTransaction(async (tx) => {
    const activeUsers = await tx.user.count({ where: { status: "ACTIVE" } });
    if (activeUsers > 0) {
      throw new AppError(
        "CONFLICT",
        "BOOTSTRAP_REFUSED",
        "Bootstrap is refused because an active platform user already exists.",
      );
    }

    let role = await tx.role.findUnique({ where: { code: PLATFORM_OWNER_ROLE_CODE } });
    if (!role) {
      role = await tx.role.create({
        data: {
          id: generateId(),
          code: PLATFORM_OWNER_ROLE_CODE,
          name: "Platform Owner",
          description: "Initial owner role created by bootstrap with explicit registry grants.",
          is_system: true,
          role_permissions: {
            create: PLATFORM_PERMISSIONS.map((permission_id) => ({ id: generateId(), permission_id })),
          },
        },
      });
    }

    const passwordHash = await hashPassword(input.password);
    const user = await tx.user.create({
      data: {
        id: generateId(),
        email,
        display_name: displayName,
        password_hash: passwordHash,
        status: "ACTIVE",
        user_roles: { create: { id: generateId(), role_id: role.id } },
      },
    });

    await auditWriter.write(
      prepareAuditEvent({
        appId: "platform",
        action: "bootstrap.first_owner",
        entityType: "user",
        entityId: user.id,
        actor: { kind: "SYSTEM", label: "bootstrap" },
        metadata: { roleId: role.id, roleCode: PLATFORM_OWNER_ROLE_CODE },
      }, { now }),
      tx,
    );

    return { userId: user.id, roleId: role.id, email };
  });

  // Only non-secret result fields are returned; password/hash never leave.
  return result;
}
