/**
 * StudioFlow permission vocabulary (STUDIOFLOW-REWORK-CONTRACT.md §3).
 * `src/app/app-registrations.ts` registers exactly this set.
 */
export const STUDIOFLOW_PERMISSIONS = {
  access: "studioflow.access",
  projectRead: "studioflow.project.read",
  projectManage: "studioflow.project.manage",
  phaseWork: "studioflow.phase.work",
  phaseReview: "studioflow.phase.review",
  phaseOverride: "studioflow.phase.override",
  taskManage: "studioflow.task.manage",
  settingsManage: "studioflow.settings.manage",
  momManage: "studioflow.mom.manage",
  scheduleManage: "studioflow.schedule.manage",
} as const;

export type StudioFlowPermission = (typeof STUDIOFLOW_PERMISSIONS)[keyof typeof STUDIOFLOW_PERMISSIONS];
