import type { ModuleManifest } from "@platform/core/modules/manifest";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/public";

/**
 * Schedule Assistant (WO-SCHEDULE-ASSISTANT-01): AI clients compose one project's Product Schedule through the
 * integration door. It starts off on every server and only the Developer switches it on. No stored data in v1.
 */
export const SCHEDULE_ASSISTANT_MODULE_MANIFEST = Object.freeze({
  id: "schedule-assistant",
  name: "Schedule Assistant",
  version: "1.1.0",
  kind: "optional",
  parent: "studioflow",
  requires: Object.freeze(["studioflow"]),
  permissionIds: Object.freeze([STUDIOFLOW_PERMISSIONS.scheduleAssistantUse]),
  initialState: "DISABLED",
} satisfies ModuleManifest);
