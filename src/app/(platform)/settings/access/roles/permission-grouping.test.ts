import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { composePermissionRegistry } from "@platform/core/rbac/registry";

import {
  appLabelOf,
  expandRolePermissionSelection,
  friendlyPermissionLabels,
  groupPermissionsByApp,
} from "./permission-grouping";

const registry = composePermissionRegistry([
  {
    appId: "masterdata",
    version: "1.0.0",
    kind: "core",
    requires: [],
    name: "Master Data",
    rootPath: "/masterdata",
    permissions: ["masterdata.access", "masterdata.brand.read", "masterdata.brand.manage"],
  },
  {
    appId: "studioflow",
    version: "1.0.0",
    kind: "core",
    requires: [],
    name: "StudioFlow",
    rootPath: "/studioflow",
    permissions: [
      "studioflow.access",
      "studioflow.project.read",
      "studioflow.project.manage",
      "studioflow.project.override",
      "studioflow.project.pic-designer",
      "studioflow.project.pic-drafter",
      "studioflow.phase.work",
      "studioflow.mom.manage",
      "studioflow.schedule.manage",
    ],
    positions: [
      { permission: "studioflow.project.pic-designer", label: "Designer" },
      { permission: "studioflow.project.pic-drafter", label: "Drafter" },
    ],
  },
]);

describe("task-based role matrix", () => {
  it("uses registered app names", () => {
    assert.equal(appLabelOf("masterdata", registry), "Master Data");
    assert.equal(appLabelOf("unknown", registry), "unknown");
  });

  it("hides owner-only Platform permissions and technical app access", () => {
    const grouped = groupPermissionsByApp(registry.permissions, registry);
    assert.deepEqual(grouped.map((group) => group.appLabel), ["Master Data", "StudioFlow"]);
    const allIds = grouped.flatMap((app) => [
      ...app.positions.map((position) => position.id),
      ...app.resources.flatMap((resource) => resource.permissions.map((permission) => permission.id)),
    ]);
    assert.equal(allIds.some((id) => id.startsWith("platform.")), false);
    assert.equal(allIds.some((id) => id.endsWith(".access")), false);
  });

  it("keeps job positions separate from authority", () => {
    const studioflow = groupPermissionsByApp(registry.permissions, registry).find((group) => group.appLabel === "StudioFlow")!;
    assert.deepEqual(studioflow.positions.map((position) => position.actionLabel), ["Designer", "Drafter"]);
    assert.ok(studioflow.positions.every((position) => position.description?.includes("PIC")));
  });

  it("separates Studio Manager operations from Platform Owner override authority", () => {
    const studioflow = groupPermissionsByApp(registry.permissions, registry).find((group) => group.appLabel === "StudioFlow")!;
    const manage = studioflow.resources.flatMap((resource) => resource.permissions).find((permission) => permission.id === "studioflow.project.manage")!;
    const override = studioflow.resources.flatMap((resource) => resource.permissions).find((permission) => permission.id === "studioflow.project.override")!;
    assert.equal(manage.actionLabel, "Run StudioFlow operations");
    assert.match(manage.description ?? "", /Studio Manager/u);
    assert.equal(override.actionLabel, "Override project workflow");
    assert.equal(override.caution, true);
    assert.match(override.description ?? "", /Platform Owner/u);
  });

  it("adds technical app and read dependencies without turning a position into access", () => {
    assert.deepEqual(expandRolePermissionSelection(["studioflow.mom.manage"], registry), [
      "studioflow.access",
      "studioflow.mom.manage",
      "studioflow.project.read",
    ]);
    assert.deepEqual(expandRolePermissionSelection(["studioflow.project.override"], registry), [
      "studioflow.access",
      "studioflow.project.manage",
      "studioflow.project.override",
      "studioflow.project.read",
    ]);
    assert.deepEqual(expandRolePermissionSelection(["masterdata.brand.manage"], registry), [
      "masterdata.access",
      "masterdata.brand.manage",
      "masterdata.brand.read",
    ]);
    assert.deepEqual(expandRolePermissionSelection(["studioflow.project.pic-designer"], registry), ["studioflow.project.pic-designer"]);
  });

  it("summarizes friendly capabilities without raw access grants", () => {
    assert.deepEqual(friendlyPermissionLabels([
      "studioflow.access",
      "studioflow.project.pic-designer",
      "studioflow.project.override",
    ], registry), ["Designer", "Override project workflow"]);
  });
});
