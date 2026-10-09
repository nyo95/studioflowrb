import type { AppPermissionRegistrationInput } from "@platform/core/rbac/registry";
import type { ModuleManifest } from "@platform/core/modules/manifest";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/public";
import { BQ_PERMISSIONS } from "@/apps/bq/public";
import { IDEAS_MODULE_MANIFEST, PRESENTATION_MODULE_MANIFEST, STUDIOFLOW_PERMISSIONS, STUDIOFLOW_POSITIONS } from "@/apps/studioflow/public";

/**
 * App registrations for the platform permission registry and app launcher
 * (CORE.md §3/§4, Foundation F0 deferred registry: "app registry/launcher —
 * ADD NOW; registrations contain metadata/routes, not permissions policy").
 *
 * This composition root lives OUTSIDE platform on purpose: platform never
 * imports app code. Each app owns its permission vocabulary in its public
 * boundary; this file only hands the platform registry the already-public
 * lists plus launcher metadata.
 */
export const APP_REGISTRATIONS: readonly AppPermissionRegistrationInput[] = [
  {
    appId: "masterdata",
    version: "1.0.0",
    kind: "core",
    requires: [],
    name: "Master Data",
    rootPath: "/masterdata",
    icon: "database",
    permissions: Object.values(MASTERDATA_PERMISSIONS),
  },
  {
    appId: "bq",
    version: "1.0.0",
    kind: "core",
    requires: ["masterdata"],
    name: "Bill of Quantity",
    rootPath: "/bq",
    icon: "calculator",
    permissions: Object.values(BQ_PERMISSIONS),
  },
  {
    appId: "studioflow",
    version: "1.0.0",
    kind: "core",
    requires: ["masterdata"],
    name: "StudioFlow",
    rootPath: "/studioflow",
    icon: "layout-dashboard",
    permissions: Object.values(STUDIOFLOW_PERMISSIONS),
    positions: STUDIOFLOW_POSITIONS,
  },
];

export const MODULE_MANIFESTS: readonly ModuleManifest[] = [
  ...APP_REGISTRATIONS.map(({ appId: id, name, version, kind, requires }) => ({ id, name, version, kind, requires })),
  IDEAS_MODULE_MANIFEST,
  PRESENTATION_MODULE_MANIFEST,
];
