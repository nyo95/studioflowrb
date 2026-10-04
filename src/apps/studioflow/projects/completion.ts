import { conflict, hasPermission, P, requiredText, type CommandContext, type Db, type TxClient } from "../shared";

export type ProjectCompletionReadiness = {
  /** Phases that are not done yet, in project order. Each one blocks completion. */
  unfinishedPhases: Array<{ id: string; name: string }>;
  /** Open client feedback on any iteration. Blocks completion. */
  openFeedback: number;
  /** Unticked, undismissed checklist items. Reminders only: reported, never blocking. */
  openReminders: number;
  ready: boolean;
};

/**
 * What stands between a project and "completed" (owner, 2026-10-04): every phase must be done and no
 * client feedback may be open. Requirements and to-dos are reminders that never block a step, so they are
 * only counted for the confirmation; they stay on the project, ticked or not.
 */
export async function readProjectCompletionReadiness(tx: TxClient | Db, projectId: string): Promise<ProjectCompletionReadiness> {
  const [unfinishedPhases, openFeedback, openReminders] = await Promise.all([
    tx.sfPhase.findMany({ where: { project_id: projectId, status: { not: "DONE" } }, orderBy: { order_index: "asc" }, select: { id: true, name_snapshot: true } }),
    tx.sfActivity.count({ where: { project_id: projectId, status: "OPEN", mode: "FEEDBACK" } }),
    tx.sfChecklistItem.count({ where: { project_id: projectId, is_checked: false, dismissed_at: null } }),
  ]);
  return {
    unfinishedPhases: unfinishedPhases.map((phase) => ({ id: phase.id, name: phase.name_snapshot })),
    openFeedback,
    openReminders,
    ready: unfinishedPhases.length === 0 && openFeedback === 0,
  };
}

/** The one completion gate used by both explicit project-completion paths. */
export async function assertProjectCompletionReady(
  tx: TxClient,
  input: CommandContext & { projectId: string; overrideReason?: string | null },
): Promise<{ overrideReason: string | null }> {
  const readiness = await readProjectCompletionReadiness(tx, input.projectId);
  if (readiness.ready) return { overrideReason: null };

  if (!hasPermission(input.grants, P.projectManage)) {
    throw conflict("PROJECT_COMPLETION_NOT_READY", "Finish every phase and close all open client feedback before completing this project.");
  }
  return {
    overrideReason: requiredText(input.overrideReason, "PROJECT_COMPLETION_OVERRIDE_REASON_REQUIRED", "A completion override reason", 500),
  };
}
