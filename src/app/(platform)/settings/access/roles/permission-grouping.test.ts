import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { composePermissionRegistry } from "@platform/core/rbac/registry";

import { appLabelOf, groupPermissionsByApp } from "./permission-grouping";

const registry = composePermissionRegistry([
  {
    appId: "masterdata",
    name: "Master Data",
    rootPath: "/masterdata",
    permissions: ["masterdata.access", "masterdata.brand.read", "masterdata.brand.manage", "masterdata.price-material.read"],
  },
  {
    appId: "studioflow",
    name: "StudioFlow",
    rootPath: "/studioflow",
    permissions: ["studioflow.access", "studioflow.phase.work", "studioflow.phase.review", "studioflow.phase.override"],
  },
]);

const ALL_IDS = [
  "platform.settings.read",
  "platform.settings.manage",
  "platform.user.read",
  "masterdata.access",
  "masterdata.brand.read",
  "masterdata.brand.manage",
  "masterdata.price-material.read",
  "studioflow.access",
  "studioflow.phase.work",
  "studioflow.phase.review",
  "studioflow.phase.override",
];

describe("appLabelOf", () => {
  it("labels platform.* as Platform and everything else from the registered app name", () => {
    assert.equal(appLabelOf("platform", registry), "Platform");
    assert.equal(appLabelOf("masterdata", registry), "Master Data");
    assert.equal(appLabelOf("studioflow", registry), "StudioFlow");
  });

  it("falls back to the raw appId for an unregistered prefix (integrity edge case)", () => {
    assert.equal(appLabelOf("ghost-app", registry), "ghost-app");
  });
});

describe("groupPermissionsByApp", () => {
  const grouped = groupPermissionsByApp(ALL_IDS, registry);

  it("preserves app order from the input list (Platform, then registration order) rather than alphabetizing", () => {
    assert.deepEqual(grouped.map((app) => app.appLabel), ["Platform", "Master Data", "StudioFlow"]);
  });

  it("groups a resource's read/manage pair into one row instead of two separate lines", () => {
    const masterdata = grouped.find((app) => app.appLabel === "Master Data")!;
    const brand = masterdata.resources.find((r) => r.resourceLabel === "Brand")!;
    assert.deepEqual(brand.permissions, [
      { id: "masterdata.brand.read", actionLabel: "Read" },
      { id: "masterdata.brand.manage", actionLabel: "Manage" },
    ]);
  });

  it("titlecases a hyphenated resource without mangling it", () => {
    const masterdata = grouped.find((app) => app.appLabel === "Master Data")!;
    assert.ok(masterdata.resources.some((r) => r.resourceLabel === "Price Material"));
  });

  it("labels the two-segment app-access permission distinctly from a real resource", () => {
    const masterdata = grouped.find((app) => app.appLabel === "Master Data")!;
    const access = masterdata.resources.find((r) => r.resourceLabel === "Access this app")!;
    assert.deepEqual(access.permissions, [{ id: "masterdata.access", actionLabel: "Access" }]);
  });

  it("keeps three unrelated actions on one resource as three checkboxes in declared order, not merged or dropped", () => {
    const studioflow = grouped.find((app) => app.appLabel === "StudioFlow")!;
    const phase = studioflow.resources.find((r) => r.resourceLabel === "Phase")!;
    assert.deepEqual(phase.permissions.map((p) => p.actionLabel), ["Work", "Review", "Override"]);
  });

  it("accounts for every input permission exactly once", () => {
    const flattened = grouped.flatMap((app) => app.resources.flatMap((r) => r.permissions.map((p) => p.id)));
    assert.deepEqual(flattened.sort(), [...ALL_IDS].sort());
  });
});
