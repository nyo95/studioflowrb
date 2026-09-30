import type { PrismaClient } from "@/generated/prisma/client";
import { prepareNotification, type NotificationInput, type NotificationTransactionContext, type NotificationView, type NotificationWriter } from "./index";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;
const MAX_MARK_IDS = 100;

/** Read notifications are removed this many days after they were read (owner, 2026-09-30). Unread ones are never removed automatically. */
export const READ_NOTIFICATION_RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;

/** Adapter for the platform Notification store. Writes only; reading is per user, below. */
export function createNotificationWriter(): NotificationWriter {
  return {
    async notify(input: NotificationInput, tx: NotificationTransactionContext): Promise<number> {
      const prepared = prepareNotification(input);
      if (prepared.recipientUserIds.length === 0) return 0;
      const result = await tx.notification.createMany({
        data: prepared.recipientUserIds.map((recipient) => ({
          recipient_user_id: recipient,
          app_id: prepared.appId,
          kind: prepared.kind,
          title: prepared.title,
          body: prepared.body,
          href: prepared.href,
          entity_type: prepared.entityType,
          entity_id: prepared.entityId,
        })),
      });
      return result.count;
    },
  };
}

/**
 * A person's own inbox. Every operation is scoped to `userId`, which the caller takes from the signed-in
 * session; no operation can read or change anyone else's notifications, so it needs no permission of its own.
 */
export function createNotificationCenter(db: PrismaClient, options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  return {
    /** Newest first. Unusable limits fall back to the default; usable ones are capped. */
    async list(input: { userId: string; unreadOnly?: boolean; limit?: number }): Promise<NotificationView[]> {
      const requested = Math.trunc(input.limit ?? Number.NaN);
      const limit = Number.isFinite(requested) && requested >= 1 ? Math.min(requested, MAX_LIST_LIMIT) : DEFAULT_LIST_LIMIT;
      const rows = await db.notification.findMany({
        where: { recipient_user_id: input.userId, ...(input.unreadOnly ? { read_at: null } : {}) },
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
        take: limit,
      });
      return rows.map((row) => ({
        id: row.id, appId: row.app_id, kind: row.kind, title: row.title, body: row.body, href: row.href, createdAt: row.created_at, readAt: row.read_at,
      }));
    },

    async countUnread(input: { userId: string }): Promise<number> {
      return db.notification.count({ where: { recipient_user_id: input.userId, read_at: null } });
    },

    /** Marks the given items read, but only the caller's own and only those still unread. Returns how many changed. */
    async markRead(input: { userId: string; ids: readonly string[] }): Promise<number> {
      const ids = [...new Set(input.ids)].slice(0, MAX_MARK_IDS);
      if (ids.length === 0) return 0;
      const result = await db.notification.updateMany({ where: { recipient_user_id: input.userId, id: { in: ids }, read_at: null }, data: { read_at: now() } });
      return result.count;
    },

    async markAllRead(input: { userId: string }): Promise<number> {
      const result = await db.notification.updateMany({ where: { recipient_user_id: input.userId, read_at: null }, data: { read_at: now() } });
      return result.count;
    },
  };
}

/** Housekeeping for the whole store (not one person's inbox): drops notifications that were read long enough ago. */
export function createNotificationRetention(db: PrismaClient, options: { now?: () => Date; retentionDays?: number } = {}) {
  const now = options.now ?? (() => new Date());
  const retentionDays = options.retentionDays ?? READ_NOTIFICATION_RETENTION_DAYS;
  return {
    /** Deletes notifications read more than `retentionDays` ago and returns how many went. Unread items stay. */
    async purgeReadNotifications(): Promise<number> {
      const cutoff = new Date(now().getTime() - retentionDays * DAY_MS);
      const result = await db.notification.deleteMany({ where: { read_at: { not: null, lt: cutoff } } });
      return result.count;
    },
  };
}

export type NotificationCenter = ReturnType<typeof createNotificationCenter>;
