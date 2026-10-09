import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { composePermissionRegistry } from "@platform/core/rbac/registry";

import { appGroupOf, groupAndOrderRoles, groupPriority } from "./role-grouping";

const registry = composePermissionRegistry([
  { appId: "masterdata", version: "1.0.0", kind: "core", requires: [], name: "Master Data", rootPath: "/masterdata", permissions: ["masterdata.access", "masterdata.brand.manage"] },
  { appId: "bq", version: "1.0.0", kind: "core", requires: ["masterdata"], name: "Bill of Quantity", rootPath: "/bq", permissions: ["bq.access", "bq.project.manage"] },
  { appId: "studioflow", version: "1.0.0", kind: "core", requires: ["masterdata"], name: "StudioFlow", rootPath: "/studioflow", permissions: ["studioflow.access", "studioflow.schedule.manage"] },
]);

describe("appGroupOf", () => {
  it("groups a single-app role under that app's registered display name, not its code", () => {
    assert.equal(appGroupOf(["masterdata"], registry), "Master Data");
    assert.equal(appGroupOf(["studioflow"], registry), "StudioFlow");
  });

  it("groups a platform-only role under Platform", () => {
    assert.equal(appGroupOf(["platform"], registry), "Platform");
  });

  it("groups a role spanning more than one app under Multiple apps, never force-fit into one", () => {
    assert.equal(appGroupOf(["platform", "studioflow"], registry), "Multiple apps");
    assert.equal(appGroupOf(["masterdata", "bq", "studioflow"], registry), "Multiple apps");
  });

  it("labels a role with no grants yet instead of miscategorizing it", () => {
    assert.equal(appGroupOf([], registry), "No permissions yet");
  });

  it("falls back to the raw appId if a permission's app was since deregistered (integrity edge case)", () => {
    assert.equal(appGroupOf(["ghost-app"], registry), "ghost-app");
  });
});

describe("groupPriority", () => {
  it("orders Platform first, then apps in registry registration order, then cross-app, then empty last", () => {
    const order = ["Platform", "Master Data", "Bill of Quantity", "StudioFlow", "Multiple apps", "No permissions yet"];
    const priorities = order.map((group) => groupPriority(group, registry));
    assert.deepEqual(priorities, [...priorities].sort((a, b) => a - b), "priorities must already be in ascending order matching `order`");
    assert.ok(new Set(priorities).size === priorities.length, "every group gets a distinct priority");
  });
});

describe("groupAndOrderRoles", () => {
  it("assigns each role its group and sorts by group priority, then role name within a group", () => {
    const roles = [
      { id: "1", code: "sf-owner", name: "StudioFlow Owner", appIds: ["studioflow"] },
      { id: "2", code: "platform-owner", name: "Platform Owner", appIds: ["platform"] },
      { id: "3", code: "md-viewer", name: "Master Data Viewer", appIds: ["masterdata"] },
      { id: "4", code: "sf-drafter", name: "StudioFlow Drafter", appIds: ["studioflow"] },
      { id: "5", code: "cross-app-lead", name: "Cross-App Lead", appIds: ["platform", "studioflow"] },
      { id: "6", code: "unassigned", name: "Unassigned Role", appIds: [] },
    ];
    const grouped = groupAndOrderRoles(roles, registry);
    assert.deepEqual(
      grouped.map((role) => [role.name, role.appGroup]),
      [
        ["Platform Owner", "Platform"],
        ["Master Data Viewer", "Master Data"],
        ["StudioFlow Drafter", "StudioFlow"],
        ["StudioFlow Owner", "StudioFlow"],
        ["Cross-App Lead", "Multiple apps"],
        ["Unassigned Role", "No permissions yet"],
      ],
    );
  });

  it("is a pure projection — it never drops or duplicates a role", () => {
    const roles = [
      { id: "a", code: "a", name: "A", appIds: ["studioflow"] },
      { id: "b", code: "b", name: "B", appIds: [] },
    ];
    const grouped = groupAndOrderRoles(roles, registry);
    assert.deepEqual(grouped.map((role) => role.id).sort(), ["a", "b"]);
  });
});
