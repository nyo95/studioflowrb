import { STUDIOFLOW_PERMISSIONS as P, type StudioFlowPermission } from "./permissions";

export type StudioFlowRoleProfile = {
  code: "designer" | "drafter" | "studio-manager";
  name: "Designer" | "Drafter" | "Manager";
  description: string;
  permissionIds: readonly StudioFlowPermission[];
};

const DESIGNER_PERMISSION_IDS = [
  P.access,
  P.projectRead,
  P.projectPicDesigner,
  P.phaseWork,
  P.phaseReview,
  P.taskManage,
  P.momManage,
  P.scheduleManage,
  P.presentationManage,
] as const satisfies readonly StudioFlowPermission[];

const DRAFTER_PERMISSION_IDS = [
  P.access,
  P.projectRead,
  P.projectPicDrafter,
  P.phaseWork,
  P.phaseReview,
  P.taskManage,
  P.momManage,
  P.scheduleManage,
  P.presentationManage,
] as const satisfies readonly StudioFlowPermission[];

/**
 * Manager (owner, 2026-10-24, replaces the 2026-10-19 definition): everything a Designer can do on any project, so a
 * Manager can stand in for a PIC who is away and update status without the Platform Owner, plus the templates and
 * settings and the client and project operations. Not himself a PIC: the position permission is left out, so he is
 * eligible as a PIC only when also given the Designer or Drafter profile. `phase.override` (the hard reset of a
 * phase's history) stays with the Platform Owner.
 */
const MANAGER_PERMISSION_IDS = [
  ...DESIGNER_PERMISSION_IDS.filter((permission) => permission !== P.projectPicDesigner),
  P.projectManage,
  P.projectOverride,
  P.settingsManage,
] as const satisfies readonly StudioFlowPermission[];

/** Owner-approved StudioFlow job profiles. Authorization remains permission and PIC-fact based. */
export const STUDIOFLOW_ROLE_PROFILES = [
  {
    code: "designer",
    name: "Designer",
    description: "Designer PIC for assigned project work. Junior and Mid use this same profile.",
    permissionIds: DESIGNER_PERMISSION_IDS,
  },
  {
    code: "drafter",
    name: "Drafter",
    description: "Drafter PIC for assigned project work.",
    permissionIds: DRAFTER_PERMISSION_IDS,
  },
  {
    code: "studio-manager",
    name: "Manager",
    description: "Runs StudioFlow templates and operations and acts for an absent PIC. Not a PIC: holds no Designer or Drafter position.",
    permissionIds: MANAGER_PERMISSION_IDS,
  },
] as const satisfies readonly StudioFlowRoleProfile[];
