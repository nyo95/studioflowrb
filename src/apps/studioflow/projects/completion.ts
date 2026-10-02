import { conflict, hasPermission, P, requiredText, type CommandContext, type TxClient } from "../shared";

/** The one completion gate used by both explicit project-completion paths. */
export async function assertProjectCompletionReady(
  tx: TxClient,
  input: CommandContext & { projectId: string; overrideReason?: string | null },
): Promise<{ overrideReason: string | null }> {
  const [unfinishedPhases, openChecklist, openFeedback] = await Promise.all([
    tx.sfPhase.count({ where: { project_id: input.projectId, status: { not: "DONE" } } }),
    tx.sfChecklistItem.count({ where: { project_id: input.projectId, is_checked: false, dismissed_at: null } }),
    tx.sfActivity.count({ where: { project_id: input.projectId, status: "OPEN", mode: "FEEDBACK" } }),
  ]);
  if (unfinishedPhases === 0 && openChecklist === 0 && openFeedback === 0) return { overrideReason: null };

  if (!hasPermission(input.grants, P.projectManage)) {
    throw conflict("PROJECT_COMPLETION_NOT_READY", "Finish every phase and clear all open checklist items and feedback before completing this project.");
  }
  return {
    overrideReason: requiredText(input.overrideReason, "PROJECT_COMPLETION_OVERRIDE_REASON_REQUIRED", "A completion override reason", 500),
  };
}
