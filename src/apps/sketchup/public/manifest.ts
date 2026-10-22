import type { ModuleManifest } from "@platform/core/modules/manifest";

/**
 * SketchUp (WO-SKETCHUP-01 rev 2): the Berkah Studio SketchUp plugin takes its material codes from the Product Schedule
 * through the integration door. It starts off on every server and only the Developer switches it on and lists who may use it (not RBAC). No stored data:
 * the link between a SketchUp material and its schedule item lives in the SketchUp model.
 */
export const SKETCHUP_MODULE_MANIFEST = Object.freeze({
  id: "sketchup",
  name: "SketchUp",
  version: "1.1.0",
  kind: "optional",
  parent: "studioflow",
  requires: Object.freeze(["studioflow"]),
  developerAccess: true,
  initialState: "DISABLED",
} satisfies ModuleManifest);
