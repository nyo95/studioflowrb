import type { PhaseBlockerCounts } from "../domain/blockers";
import type { Db, TxClient } from "../shared";

const OPEN_ROOT = { parent_id: null, is_checked: false, is_blocking: true } as const;

/** Same projection as the single-phase reader, in one statement for any batch. */
export async function readBlockerCountsBatch(client: Db | TxClient, phaseIds: string[]): Promise<Map<string, PhaseBlockerCounts>> {
  const checklist = await client.sfChecklistItem.groupBy({
    by: ["phase_id"],
    where: { phase_id: { in: phaseIds }, ...OPEN_ROOT },
    _count: { _all: true },
  });
  const counts = new Map(phaseIds.map((id) => [id, { openRootChecklistItems: 0 }]));
  for (const row of checklist) counts.get(row.phase_id!)!.openRootChecklistItems = row._count._all;
  return counts;
}

/** Reads the counts behind the open-checklist projection (contract §6.4). */
export async function readBlockerCounts(client: Db | TxClient, phaseId: string): Promise<PhaseBlockerCounts> {
  return { openRootChecklistItems: await client.sfChecklistItem.count({ where: { phase_id: phaseId, ...OPEN_ROOT } }) };
}

export type BlockerItems = { checklistItems: { id: string; label: string }[] };

/** Fetches the open checklist items (IDs + labels) for interactive display. */
export async function readBlockerItems(client: Db | TxClient, phaseId: string, counts: PhaseBlockerCounts): Promise<BlockerItems> {
  const checklistItems = counts.openRootChecklistItems > 0
    ? await client.sfChecklistItem.findMany({ where: { phase_id: phaseId, ...OPEN_ROOT }, select: { id: true, label: true }, orderBy: { sort_order: "asc" } })
    : [];
  return { checklistItems };
}
