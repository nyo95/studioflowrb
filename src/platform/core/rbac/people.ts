import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@platform/core/errors";

import { getPermissionRegistry } from "./registry";

/**
 * Minimal people directory for app assignment pickers (CORE.md §4).
 *
 * Apps store plain user ids (assignee, PIC, owner) and need display names
 * plus the list of people who may be assigned a piece of work. The full
 * access directory (`listUsers`) is an administration surface guarded by
 * `platform.user.read`; this port exposes only id + display name + active
 * flag, never email, roles, or grants. Deciding WHO may read it and which
 * permission defines eligibility stays with the calling app.
 */
export type PersonSummary = {
  id: string;
  displayName: string;
  active: boolean;
};

export type PeopleDirectory = {
  /** Active users holding `permissionId` through at least one live role, ordered by name. */
  listHolders(permissionId: string): Promise<PersonSummary[]>;
  /** Resolves stored ids (including disabled users) for historical display. */
  resolve(userIds: readonly string[]): Promise<PersonSummary[]>;
};

export function createPeopleDirectory(db: PrismaClient): PeopleDirectory {
  return {
    async listHolders(permissionId) {
      if (!getPermissionRegistry().has(permissionId)) {
        throw new AppError("VALIDATION", "UNKNOWN_PERMISSION", "The requested permission is not registered.");
      }
      const rows = await db.user.findMany({
        where: {
          status: "ACTIVE",
          user_roles: { some: { role: { archived_at: null, role_permissions: { some: { permission_id: permissionId } } } } },
        },
        select: { id: true, display_name: true },
        orderBy: [{ display_name: "asc" }, { id: "asc" }],
      });
      return rows.map((row) => ({ id: row.id, displayName: row.display_name, active: true }));
    },

    async resolve(userIds) {
      const ids = [...new Set(userIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
      if (ids.length === 0) return [];
      const rows = await db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, display_name: true, status: true },
      });
      return rows.map((row) => ({ id: row.id, displayName: row.display_name, active: row.status === "ACTIVE" }));
    },
  };
}
