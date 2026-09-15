import type { PhaseBlockerCounts } from "../domain/blockers";
import type { Db, TxClient } from "../shared";

/** Reads the counts behind the single blocker projection (contract §6.4). */
export async function readBlockerCounts(client: Db | TxClient, phaseId: string): Promise<PhaseBlockerCounts> {
  const active = await client.sfRevision.findFirst({ where: { phase_id: phaseId, status: "ACTIVE" }, select: { id: true } });
  const [openRevisionActivities, openRevisionTodos, openDeferredActivities, openDeferredTodos, openRootChecklistItems] = await Promise.all([
    active ? client.sfActivity.count({ where: { revision_id: active.id, status: "OPEN" } }) : 0,
    active ? client.sfActivity.count({ where: { revision_id: active.id, status: "OPEN", mode: "TODO" } }) : 0,
    client.sfActivity.count({ where: { phase_id: phaseId, revision_id: null, status: "OPEN" } }),
    client.sfActivity.count({ where: { phase_id: phaseId, revision_id: null, status: "OPEN", mode: "TODO" } }),
    client.sfChecklistItem.count({ where: { phase_id: phaseId, parent_id: null, is_checked: false } }),
  ]);
  return { openRevisionActivities, openRevisionTodos, openDeferredActivities, openDeferredTodos, openRootChecklistItems };
}
