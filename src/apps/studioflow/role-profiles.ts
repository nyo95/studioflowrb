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
    description: "Designer-capable StudioFlow operator for clients, projects, and PIC assignment.",
    permissionIds: [...DESIGNER_PERMISSION_IDS, P.projectManage],
  },
] as const satisfies readonly StudioFlowRoleProfile[];
