/**
 * StudioFlow public boundary.
 *
 * Only this module may be imported by other apps or the platform shell.
 * Importing from @/apps/studioflow/service or deeper is cross-app internal
 * and is forbidden by the dependency law (studioflow.md §4).
 */
import { STUDIOFLOW_PERMISSIONS } from "../service";

export { STUDIOFLOW_PERMISSIONS };
