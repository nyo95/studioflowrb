import type { ModuleManifest } from "@platform/core/modules/manifest";

export const IDEAS_MODULE_MANIFEST = Object.freeze({
  id: "ideas",
  name: "Ideas Board",
  version: "1.0.0",
  kind: "optional",
  parent: "studioflow",
  requires: Object.freeze(["studioflow"]),
} satisfies ModuleManifest);

export const PRESENTATION_MODULE_MANIFEST = Object.freeze({
  id: "presentation",
  name: "Presentation",
  version: "1.0.0",
  kind: "optional",
  parent: "studioflow",
  requires: Object.freeze(["studioflow"]),
} satisfies ModuleManifest);
