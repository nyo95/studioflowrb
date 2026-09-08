/**
 * StudioFlow service — permissions and domain logic.
 *
 * SF-WO-1: permissions only. Service functions are added in SF-WO-2 onward.
 *
 * Permission vocabulary: studioflow.md §3. Eight first-slice permissions;
 * Schedule/MoM proposals (studioflow.schedule.*, studioflow.mom.*) remain
 * unregistered until those domains are approved and activated.
 */

export const STUDIOFLOW_PERMISSIONS = {
  access: "studioflow.access",
  projectRead: "studioflow.project.read",
  projectManage: "studioflow.project.manage",
  projectDeletionApprove: "studioflow.project-deletion.approve",
  iterationManage: "studioflow.iteration.manage",
  iterationReview: "studioflow.iteration.review",
  phaseOverride: "studioflow.phase.override",
  taskManage: "studioflow.task.manage",
} as const;
