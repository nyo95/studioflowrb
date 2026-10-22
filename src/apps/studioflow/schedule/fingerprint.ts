import { createHash } from "node:crypto";

import type { Db, TxClient } from "../shared";

/** JSON with object keys sorted at every level, so equal data always hashes the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item);
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/**
 * A hash of everything a schedule batch builds on (WO-SCHEDULE-ASSISTANT-01 decision 18): the project's entries and
 * options with their last change, the active studio template items, and whether the project is archived or completed.
 * Any change to one of them changes the hash, so an approved preview cannot be applied to a different schedule.
 */
export async function scheduleFingerprint(tx: TxClient | Db, projectId: string): Promise<string> {
  const [project, entries, templates] = await Promise.all([
    tx.sfProject.findUnique({ where: { id: projectId }, select: { archived_at: true, status: true } }),
    tx.sfScheduleEntry.findMany({ where: { project_id: projectId }, orderBy: { id: "asc" }, select: { id: true, updated_at: true, options: { orderBy: { id: "asc" }, select: { id: true, updated_at: true } } } }),
    tx.sfScheduleTemplateItem.findMany({ where: { is_active: true }, orderBy: { id: "asc" }, select: { id: true, updated_at: true } }),
  ]);
  return sha256Canonical({
    project: project ? { archived: project.archived_at !== null, status: project.status } : null,
    entries: entries.map((entry) => [entry.id, entry.updated_at.toISOString(), entry.options.map((option) => [option.id, option.updated_at.toISOString()])]),
    templates: templates.map((item) => [item.id, item.updated_at.toISOString()]),
  });
}
