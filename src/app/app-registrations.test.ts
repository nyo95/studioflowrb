import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { composePermissionRegistry } from "@platform/core/rbac/registry";

import { composeModuleRegistry } from "@platform/core/modules/manifest";
import { APP_REGISTRATIONS, MODULE_MANIFESTS } from "./app-registrations";

describe("application permission registration", () => {
  it("boots with each app permission registered by exactly one owner", () => {
    const registry = composePermissionRegistry(APP_REGISTRATIONS);

    assert.deepEqual(registry.apps.map((app) => app.appId), ["masterdata", "bq", "studioflow"]);
    assert.equal(registry.permissions.filter((permission) => permission === "masterdata.promotion.approve").length, 1);
    assert.equal(registry.has("masterdata.promotion.approve"), true);
    assert.equal(registry.permissions.some((permission) => permission.includes("module")), false);
  });

  it("registers versioned core apps and the optional StudioFlow modules", () => {
    assert.deepEqual(APP_REGISTRATIONS.map(({ appId, version, kind, requires }) => ({ appId, version, kind, requires })), [
      { appId: "masterdata", version: "1.0.0", kind: "core", requires: [] },
      { appId: "bq", version: "1.0.0", kind: "core", requires: ["masterdata"] },
      { appId: "studioflow", version: "1.0.0", kind: "core", requires: ["masterdata"] },
    ]);
    const modules = composeModuleRegistry(MODULE_MANIFESTS);
    assert.deepEqual(modules.modules.map((module) => module.id), ["platform", "masterdata", "bq", "studioflow", "ideas", "presentation"]);
    assert.deepEqual(modules.find("ideas"), { id: "ideas", name: "Ideas Board", version: "1.0.0", kind: "optional", parent: "studioflow", requires: ["studioflow"] });
  });
});
