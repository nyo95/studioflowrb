import type { ModuleManifest } from "@platform/core/modules/manifest";

/**
 * Schedule Assistant (WO-SCHEDULE-ASSISTANT-01): AI clients compose one project's Product Schedule through the
 * integration door. It starts off on every server and only the Developer switches it on and lists who may use it (not RBAC). No stored data in v1.
 */
export const SCHEDULE_ASSISTANT_MODULE_MANIFEST = Object.freeze({
  id: "schedule-assistant",
  name: "Schedule Assistant",
  version: "1.3.0",
  kind: "optional",
  parent: "studioflow",
  requires: Object.freeze(["studioflow"]),
  developerAccess: true,
  initialState: "DISABLED",
} satisfies ModuleManifest);
