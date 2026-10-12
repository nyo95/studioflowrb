import type { ModuleManifest } from "@platform/core/modules/manifest";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/public";

export const IDEAS_MODULE_MANIFEST = Object.freeze({
  id: "ideas",
  name: "Ideas Board",
  version: "1.0.0",
  kind: "optional",
  parent: "studioflow",
  requires: Object.freeze(["studioflow"]),
  permissionIds: Object.freeze([STUDIOFLOW_PERMISSIONS.ideasManage]),
} satisfies ModuleManifest);
