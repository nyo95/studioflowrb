import type { AppPermissionRegistrationInput } from "@platform/core/rbac/registry";

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
    name: "Master Data",
    rootPath: "/masterdata",
    permissions: [
      "masterdata.access",
      "masterdata.brand.read",
      "masterdata.brand.manage",
      "masterdata.vendor.read",
      "masterdata.vendor.manage",
      "masterdata.dictionary.read",
      "masterdata.dictionary.manage",
      "masterdata.sku.read",
      "masterdata.sku.manage",
      "masterdata.price-material.read",
      "masterdata.price-material.manage",
      "masterdata.price-work.read",
      "masterdata.price-work.manage",
      "masterdata.deletion.approve",
    ],
  },
  {
    appId: "bq",
    name: "Bill of Quantity",
    rootPath: "/bq",
    permissions: [
      "bq.access",
      "bq.project.read",
      "bq.project.manage",
      "bq.library.read",
      "bq.library.manage",
      "bq.library.promote",
      "bq.library.promote.approve",
    ],
  },
];
