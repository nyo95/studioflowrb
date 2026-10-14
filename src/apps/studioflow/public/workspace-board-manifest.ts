import type { ModuleManifest } from "@platform/core/modules/manifest";

/**
 * The Workspace board (owner 2026-10-14): the free canvas on the project Phases page. Without it the page shows the
 * simple per-phase Notes stream; both read the same StudioFlow notes, so switching never loses anything. It starts
 * off on every server and only the Developer switches it on. A feature module of StudioFlow (MODULES-DECISION D10):
 * its code and data stay in StudioFlow, so it has no app folder, route, schema or permission of its own.
 */
export const WORKSPACE_BOARD_MODULE_MANIFEST = Object.freeze({
  id: "workspace-board",
  name: "Workspace board",
  version: "1.0.0",
  kind: "optional",
  parent: "studioflow",
  requires: Object.freeze(["studioflow"]),
  initialState: "DISABLED",
} satisfies ModuleManifest);
