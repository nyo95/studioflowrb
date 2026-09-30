/**
 * StudioFlow permission vocabulary (STUDIOFLOW-REWORK-CONTRACT.md §3).
 * `src/app/app-registrations.ts` registers exactly this set.
 */
export const STUDIOFLOW_PERMISSIONS = {
  access: "studioflow.access",
  projectRead: "studioflow.project.read",
  projectManage: "studioflow.project.manage",
  projectOverride: "studioflow.project.override",
  projectPicDesigner: "studioflow.project.pic-designer",
  projectPicDrafter: "studioflow.project.pic-drafter",
  phaseWork: "studioflow.phase.work",
  phaseReview: "studioflow.phase.review",
  phaseOverride: "studioflow.phase.override",
  taskManage: "studioflow.task.manage",
  settingsManage: "studioflow.settings.manage",
  momManage: "studioflow.mom.manage",
  scheduleManage: "studioflow.schedule.manage",
  presentationManage: "studioflow.presentation.manage",
} as const;

/** Who a member is in StudioFlow (a PIC seat), listed apart from what they may do in the role editor. */
export const STUDIOFLOW_POSITIONS = [
  { permission: STUDIOFLOW_PERMISSIONS.projectPicDesigner, label: "Designer" },
  { permission: STUDIOFLOW_PERMISSIONS.projectPicDrafter, label: "Drafter" },
] as const;

export type StudioFlowPermission = (typeof STUDIOFLOW_PERMISSIONS)[keyof typeof STUDIOFLOW_PERMISSIONS];
