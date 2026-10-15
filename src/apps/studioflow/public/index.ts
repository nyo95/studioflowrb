/**
 * StudioFlow public boundary. Other apps and the composition root may import
 * only from here; everything else under `src/apps/studioflow` is private.
 */
export { STUDIOFLOW_PERMISSIONS, STUDIOFLOW_POSITIONS } from "../permissions";
export type { StudioFlowPermission } from "../permissions";
export * from "./nav";
export { createStudioFlowSampleRequestRead } from "./sample-request-read";
export type { SampleRequestRead, StudioFlowSampleRequestRead } from "./sample-request-read";
export { STUDIOFLOW_TOUR } from "./tour";
export { WORKSPACE_BOARD_MODULE_MANIFEST } from "./workspace-board-manifest";
export { readStudioFlowDocumentIdentity } from "./document-identity";
export type { StudioFlowDocumentIdentity } from "./document-identity";
