import type { Prisma } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditWriter } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";

import { hashPassword, verifyPassword } from "./password";
import { parseDisplayName, parsePassword } from "./identity-validation";
import { createSession, type CreatedSession, type DbClient } from "./session-service";

/**
 * Self-service account commands (CORE.md §3, Foundation F0 §8).
 *
 * Any authenticated user may change their own display name and password; no
 * permission grant is involved. A password change verifies the current
 * password, writes a new hash, and revokes all prior sessions atomically —
 * the fresh rotating session is created only after the transaction succeeds.
 */

export type AccountPorts = {
  db: DbClient;
  runTransaction: <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
  auditWriter: AuditWriter;
  now: () => Date;
  generateId: () => string;
};

export type AccountService = ReturnType<typeof createPlatformAccountService>;

export function createPlatformAccountService(ports: AccountPorts) {
  const { db, runTransaction, auditWriter, now, generateId } = ports;

  return {
    /** Updates the caller's own display name. Unchanged values are a safe no-op. */
    async updateOwnDisplayName(input: {
      userId: string;
      displayName: string;
    }): Promise<{ changed: boolean }> {
      return runTransaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: input.userId },
          select: { id: true, display_name: true, status: true },
        });
        if (!user || user.status !== "ACTIVE") {
          throw new AppError("UNAUTHENTICATED", "NO_SESSION", "Please sign in to continue.");
        }
        const displayName = parseDisplayName(input.displayName);
        if (user.display_name === displayName) return { changed: false };
        await tx.user.update({ where: { id: user.id }, data: { display_name: displayName } });
        await auditWriter.write(
          prepareAuditEvent({
            appId: "platform",
            action: "account.display_name_update",
            entityType: "user",
            entityId: user.id,
            actor: { kind: "USER", userId: user.id, label: displayName },
            changes: { display_name: { from: user.display_name, to: displayName } },
          }, { now }),
          tx,
        );
        return { changed: true };
      });
    },

    /**
     * Changes the caller's own password: verifies the current password,
     * revokes every prior session atomically, then — only after commit —
     * creates the fresh rotating session. Returns the new session for the
     * caller to set on the cookie.
     */
    async changeOwnPassword(input: {
      userId: string;
      currentPassword: string;
      newPassword: string;
    }): Promise<{ rotated: CreatedSession }> {
      const newPassword = parsePassword(input.newPassword);
      const committed = await runTransaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: input.userId },
          select: { id: true, password_hash: true, status: true },
        });
        if (!user || user.status !== "ACTIVE") {
          throw new AppError("UNAUTHENTICATED", "NO_SESSION", "Please sign in to continue.");
        }
        const verified = await verifyPassword(user.password_hash, input.currentPassword);
        if (!verified) {
          throw new AppError("VALIDATION", "CURRENT_PASSWORD_INCORRECT", "Your current password is incorrect.");
        }
        const passwordHash = await hashPassword(newPassword);
        await tx.user.update({ where: { id: user.id }, data: { password_hash: passwordHash } });
        const revoked = await tx.session.updateMany({
          where: { user_id: user.id, revoked_at: null },
          data: { revoked_at: now() },
        });
        await auditWriter.write(
          prepareAuditEvent({
            appId: "platform",
            action: "account.password_change",
            entityType: "user",
            entityId: user.id,
            actor: { kind: "USER", userId: user.id, label: "self" },
            metadata: { sessionsRevoked: revoked.count },
          }, { now }),
          tx,
        );
        return true;
      });
      if (!committed) {
        throw new AppError("INFRASTRUCTURE", "PASSWORD_CHANGE_FAILED", "The password could not be changed.");
      }
      const rotated = await createSession(db, { userId: input.userId });
      return { rotated };
    },
  };
}
