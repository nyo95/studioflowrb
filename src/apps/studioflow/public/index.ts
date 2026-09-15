/**
 * StudioFlow public boundary. Other apps and the composition root may import
 * only from here; everything else under `src/apps/studioflow` is private.
 */
export { STUDIOFLOW_PERMISSIONS } from "../permissions";
export type { StudioFlowPermission } from "../permissions";
export * from "./nav";
