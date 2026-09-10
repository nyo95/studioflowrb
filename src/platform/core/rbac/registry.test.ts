import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isAppError } from "@platform/core/errors";

import {
  PLATFORM_PERMISSIONS,
  composePermissionRegistry,
} from "./registry";

const MASTERDATA_REGISTRATION = {
  appId: "masterdata",
  name: "Master Data",
  rootPath: "/masterdata",
  permissions: [
    "masterdata.access",
    "masterdata.party.read",
    "masterdata.party.manage",
    "masterdata.price.read",
  ],
};

describe("composePermissionRegistry", () => {
  it("composes platform permissions with registered app permissions", () => {
    const registry = composePermissionRegistry([MASTERDATA_REGISTRATION]);
    assert.deepEqual(registry.platformPermissions, [...PLATFORM_PERMISSIONS]);
    assert.equal(registry.has("platform.user.manage"), true);
    assert.equal(registry.has("masterdata.party.read"), true);
    assert.equal(registry.has("masterdata.access"), true);
    assert.equal(registry.has("bq.breakdown.edit"), false);
    assert.equal(registry.permissions.length, PLATFORM_PERMISSIONS.length + 4);
  });

  it("finds apps by access permission and id", () => {
    const registry = composePermissionRegistry([MASTERDATA_REGISTRATION]);
    const app = registry.findAppByAccessPermission("masterdata.access");
    assert.equal(app?.appId, "masterdata");
    assert.equal(app?.rootPath, "/masterdata");
    assert.equal(registry.findAppById("masterdata")?.name, "Master Data");
    assert.equal(registry.findAppByAccessPermission("bq.access"), undefined);
  });

  it("rejects malformed permission ids", () => {
    assert.throws(
      () => composePermissionRegistry([{ ...MASTERDATA_REGISTRATION, permissions: ["masterdata.access", "NOT VALID"] }]),
      (error: unknown) => isAppError(error) && error.code === "REGISTRY_MALFORMED_PERMISSION",
    );
  });

  it("rejects duplicate permissions across apps and platform collisions", () => {
    assert.throws(
      () => composePermissionRegistry([MASTERDATA_REGISTRATION, { ...MASTERDATA_REGISTRATION, appId: "bq", name: "BQ", rootPath: "/bq", permissions: ["bq.access", "masterdata.party.read"] }]),
      (error: unknown) => isAppError(error) && error.code === "REGISTRY_DUPLICATE_PERMISSION",
    );
    assert.throws(
      () => composePermissionRegistry([{ ...MASTERDATA_REGISTRATION, permissions: [...MASTERDATA_REGISTRATION.permissions, "platform.user.manage"] }]),
      (error: unknown) => isAppError(error) && error.code === "REGISTRY_DUPLICATE_PERMISSION",
    );
  });

  it("rejects duplicate app registrations and invalid ids/names/paths", () => {
    assert.throws(
      () => composePermissionRegistry([MASTERDATA_REGISTRATION, MASTERDATA_REGISTRATION]),
      (error: unknown) => isAppError(error) && error.code === "REGISTRY_DUPLICATE_APP",
    );
    assert.throws(
      () => composePermissionRegistry([{ ...MASTERDATA_REGISTRATION, appId: "MasterData" }]),
      (error: unknown) => isAppError(error) && error.code === "REGISTRY_INVALID_APP_ID",
    );
    assert.throws(
      () => composePermissionRegistry([{ ...MASTERDATA_REGISTRATION, name: "  " }]),
      (error: unknown) => isAppError(error) && error.code === "REGISTRY_INVALID_APP_NAME",
    );
    assert.throws(
      () => composePermissionRegistry([{ ...MASTERDATA_REGISTRATION, rootPath: "masterdata" }]),
      (error: unknown) => isAppError(error) && error.code === "REGISTRY_INVALID_APP_PATH",
    );
  });

  it("requires the exact <appId>.access permission", () => {
    assert.throws(
      () => composePermissionRegistry([{ ...MASTERDATA_REGISTRATION, permissions: ["masterdata.party.read"] }]),
      (error: unknown) => isAppError(error) && error.code === "REGISTRY_MISSING_ACCESS_PERMISSION",
    );
  });

  it("accepts an empty registration list with platform permissions only", () => {
    const registry = composePermissionRegistry([]);
    assert.equal(registry.apps.length, 0);
    assert.equal(registry.permissions.length, PLATFORM_PERMISSIONS.length);
  });
  it("rejects launcher loops and external or non-canonical app roots", () => {
    for (const rootPath of ["/", "//example.com", "/../", "/bq?next=/", "/bq#root", "/bq\\other"]) {
      assert.throws(() => composePermissionRegistry([{ ...MASTERDATA_REGISTRATION, rootPath }]),
        (error: unknown) => isAppError(error) && error.code === "REGISTRY_INVALID_APP_PATH");
    }
  });
});
