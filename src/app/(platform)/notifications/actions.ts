"use server";

import { z } from "zod";

import { runSafeAction } from "@platform/core/actions";
import { requirePrincipal } from "@platform/core/auth";
import { validationError } from "@platform/core/validation";
import { notificationCenter } from "@platform/runtime";

/**
 * A person's own notification inbox. Every action acts for the signed-in user only: none accepts a user id,
 * so there is nothing for a browser to spoof. Nothing here revalidates pages; the bell polls these.
 */

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

const Limit = z.number().int().min(1).max(100).optional();
const Ids = z.array(z.uuid()).max(100);

export async function getUnreadNotificationCountAction() {
  return runSafeAction(async () => {
    const principal = await requirePrincipal();
    return { unread: await notificationCenter.countUnread({ userId: principal.userId }) };
  });
}

export async function listNotificationsAction(limit?: number) {
  return runSafeAction(async () => {
    const principal = await requirePrincipal();
    return notificationCenter.list({ userId: principal.userId, limit: parse(Limit, limit) });
  });
}

export async function markNotificationsReadAction(ids: string[]) {
  return runSafeAction(async () => {
    const principal = await requirePrincipal();
    return { marked: await notificationCenter.markRead({ userId: principal.userId, ids: parse(Ids, ids) }) };
  });
}

export async function markAllNotificationsReadAction() {
  return runSafeAction(async () => {
    const principal = await requirePrincipal();
    return { marked: await notificationCenter.markAllRead({ userId: principal.userId }) };
  });
}
