import { randomUUID } from "node:crypto";

import { CHECKLIST_SORT_STEP } from "../domain/checklist";
import type { TxClient } from "../shared";

/**
 * Template → project checklist generation (legacy
 * `executeSyncProjectChecklists`). Identity is (template_id, phase_id), so a
 * user task with the same label is never swallowed and a renamed template is
 * never duplicated. New rows append after the existing roots of their bucket.
 * Returns the number of rows created.
 */
export async function seedChecklistFromTemplates(tx: TxClient, projectId: string, userId: string | null): Promise<number> {
  const [phases, templates, existing, roots] = await Promise.all([
    tx.sfPhase.findMany({ where: { project_id: projectId }, select: { id: true, key: true } }),
    tx.sfChecklistTemplate.findMany({ where: { is_active: true }, orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }] }),
    tx.sfChecklistItem.findMany({ where: { project_id: projectId, template_id: { not: null } }, select: { phase_id: true, template_id: true } }),
    tx.sfChecklistItem.groupBy({ by: ["phase_id"], where: { project_id: projectId, parent_id: null }, _max: { sort_order: true } }),
  ]);
  const have = new Set(existing.map((row) => `${row.phase_id ?? "GENERAL"}::${row.template_id}`));
  const nextSort = new Map<string, number>(roots.map((row) => [row.phase_id ?? "GENERAL", row._max.sort_order ?? 0]));
  const phaseByKey = new Map(phases.map((phase) => [phase.key, phase.id]));
  const rows: Array<{ id: string; project_id: string; phase_id: string | null; label: string; template_id: string; sort_order: number; created_by_id: string | null }> = [];
  for (const template of templates) {
    const phaseId = template.phase_key ? phaseByKey.get(template.phase_key) ?? undefined : null;
    if (phaseId === undefined) continue;
    const bucket = phaseId ?? "GENERAL";
    const key = `${bucket}::${template.id}`;
    if (have.has(key)) continue;
    have.add(key);
    const sort = (nextSort.get(bucket) ?? 0) + CHECKLIST_SORT_STEP;
    nextSort.set(bucket, sort);
    rows.push({ id: randomUUID(), project_id: projectId, phase_id: phaseId, label: template.label, template_id: template.id, sort_order: sort, created_by_id: userId });
  }
  if (rows.length > 0) await tx.sfChecklistItem.createMany({ data: rows });
  return rows.length;
}
