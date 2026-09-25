import type { PhaseBlockerCounts } from "../domain/blockers";
import type { Db, TxClient } from "../shared";

/** Reads the counts behind the single blocker projection (contract §6.4). */
export async function readBlockerCounts(client: Db | TxClient, phaseId: string): Promise<PhaseBlockerCounts> {
  const active = await client.sfRevision.findFirst({ where: { phase_id: phaseId, status: "ACTIVE" }, select: { id: true } });
  const [openRevisionActivities, openRootChecklistItems] = await Promise.all([
    // V2-D1: SfActivity is FEEDBACK-only; mode filter removed
    active ? client.sfActivity.count({ where: { revision_id: active.id, status: "OPEN" } }) : 0,
    // Only blocking root items gate approval; warning-only items (the former requirements)
    // are counted separately as warnings.
    client.sfChecklistItem.count({ where: { phase_id: phaseId, parent_id: null, is_checked: false, is_blocking: true } }),
  ]);
  return { openRevisionActivities, openRootChecklistItems };
}

export type BlockerItems = {
  activityItems: { id: string; content: string }[];
  checklistItems: { id: string; label: string }[];
};

/** Fetches the actual blocker items (IDs + labels) for interactive display. */
export async function readBlockerItems(
  client: Db | TxClient,
  phaseId: string,
  activeRevisionId: string | null,
  counts: PhaseBlockerCounts,
): Promise<BlockerItems> {
  const [activityItems, checklistItems] = await Promise.all([
    counts.openRevisionActivities > 0 && activeRevisionId
      ? client.sfActivity.findMany({ where: { revision_id: activeRevisionId, status: "OPEN" }, select: { id: true, content: true }, orderBy: { created_at: "asc" } })
      : [],
    counts.openRootChecklistItems > 0
      ? client.sfChecklistItem.findMany({ where: { phase_id: phaseId, parent_id: null, is_checked: false, is_blocking: true }, select: { id: true, label: true }, orderBy: { sort_order: "asc" } })
      : [],
  ]);
  return { activityItems, checklistItems };
}
