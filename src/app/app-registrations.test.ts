import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { composePermissionRegistry } from "@platform/core/rbac/registry";

import { APP_REGISTRATIONS } from "./app-registrations";

describe("application permission registration", () => {
  it("boots with each app permission registered by exactly one owner", () => {
    const registry = composePermissionRegistry(APP_REGISTRATIONS);

    assert.deepEqual(registry.apps.map((app) => app.appId), ["masterdata", "bq", "studioflow"]);
    assert.equal(registry.permissions.filter((permission) => permission === "masterdata.promotion.approve").length, 1);
    assert.equal(registry.has("masterdata.promotion.approve"), true);
  });
});
