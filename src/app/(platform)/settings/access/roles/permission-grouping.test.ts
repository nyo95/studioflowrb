import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { composePermissionRegistry } from "@platform/core/rbac/registry";

import { appLabelOf, groupPermissionsByApp } from "./permission-grouping";

const registry = composePermissionRegistry([
  {
    appId: "masterdata",
    version: "1.0.0",
    kind: "core",
    requires: [],
    name: "Master Data",
    rootPath: "/masterdata",
    permissions: ["masterdata.access", "masterdata.brand.read", "masterdata.brand.manage", "masterdata.price-material.read"],
  },
  {
    appId: "studioflow",
    version: "1.0.0",
    kind: "core",
    requires: [],
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

describe("groupPermissionsByApp positions", () => {
  const withPositions = composePermissionRegistry([
    {
      appId: "studioflow",
      version: "1.0.0",
      kind: "core",
      requires: [],
      name: "StudioFlow",
      rootPath: "/studioflow",
      permissions: ["studioflow.access", "studioflow.project.read", "studioflow.project.pic-designer", "studioflow.project.pic-drafter"],
      positions: [
        { permission: "studioflow.project.pic-designer", label: "Designer" },
        { permission: "studioflow.project.pic-drafter", label: "Drafter" },
      ],
    },
  ]);
  const grouped = groupPermissionsByApp(withPositions.permissions.filter((id) => id.startsWith("studioflow.")), withPositions);

  it("lists position permissions apart from the resource rows", () => {
    const app = grouped[0];
    assert.deepEqual(app.positions, [
      { id: "studioflow.project.pic-designer", actionLabel: "Designer" },
      { id: "studioflow.project.pic-drafter", actionLabel: "Drafter" },
    ]);
    assert.deepEqual(app.resources.find((r) => r.resourceLabel === "Project")!.permissions.map((p) => p.actionLabel), ["Read"]);
  });

  it("rejects a position that is not a registered permission", () => {
    assert.throws(() => composePermissionRegistry([
      { appId: "x", version: "1.0.0", kind: "core", requires: [], name: "X", rootPath: "/x", permissions: ["x.access"], positions: [{ permission: "x.thing.work", label: "Y" }] },
    ]));
  });
});
