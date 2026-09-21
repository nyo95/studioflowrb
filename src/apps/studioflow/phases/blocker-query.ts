import type { PhaseBlockerCounts } from "../domain/blockers";
import type { Db, TxClient } from "../shared";

/** Reads the counts behind the single blocker projection (contract §6.4). */
export async function readBlockerCounts(client: Db | TxClient, phaseId: string): Promise<PhaseBlockerCounts> {
  const active = await client.sfRevision.findFirst({ where: { phase_id: phaseId, status: "ACTIVE" }, select: { id: true } });
  const [openRevisionActivities, openRootChecklistItems] = await Promise.all([
    // V2-D1: SfActivity is FEEDBACK-only; mode filter removed
    active ? client.sfActivity.count({ where: { revision_id: active.id, status: "OPEN" } }) : 0,
    client.sfChecklistItem.count({ where: { phase_id: phaseId, parent_id: null, is_checked: false } }),
  ]);
  return { openRevisionActivities, openRootChecklistItems };
}
