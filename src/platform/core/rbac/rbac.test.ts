import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isAppError, toSafeErrorPayload } from "@platform/core/errors";

import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isValidPermissionId,
  requirePermission,
} from "./index";

const GRANTS = ["studioflow.project.read", "masterdata.price.read", "bq.breakdown.edit"];

describe("permission-id namespace validation", () => {
  it("accepts exactly <owner>.<resource>.<action> lowercase segments", () => {
    assert.equal(isValidPermissionId("studioflow.project.read"), true);
    assert.equal(isValidPermissionId("platform.user.manage"), true);
    assert.equal(isValidPermissionId("masterdata.price.read"), true);
  });

  it("rejects malformed or non-namespaced ids", () => {
    const invalid = [
      "",
      "read",
      "project.read",
      "studioflow.project.read.extra",
      "StudioFlow.Project.Read",
      "studio flow.project.read",
      "studioflow..read",
      ".project.read",
      "1a.b.c",
    ];
    for (const value of invalid) {
      assert.equal(isValidPermissionId(value), false, `expected invalid: "${value}"`);
    }
  });
});

describe("hasPermission", () => {
  it("matches exact grant strings only", () => {
    assert.equal(hasPermission(GRANTS, "studioflow.project.read"), true);
    assert.equal(hasPermission(GRANTS, "studioflow.project.edit"), false);
    assert.equal(hasPermission(GRANTS, "studioflow.project.reads"), false);
    assert.equal(hasPermission(GRANTS, "bq.breakdown.edit"), true);
  });

  it("grants nothing to empty or malformed grant sets", () => {
    assert.equal(hasPermission([], "studioflow.project.read"), false);
    assert.equal(hasPermission(undefined as unknown as readonly string[], "studioflow.project.read"), false);
  });

  it("unknown permission ids grant nothing even if present in grants", () => {
    assert.equal(hasPermission(["not-a-permission"], "not-a-permission"), false);
    assert.equal(hasPermission(["STUDIOFLOW.PROJECT.READ"], "STUDIOFLOW.PROJECT.READ"), false);
  });
});

describe("all/any semantics", () => {
  it("all([]) === true explicitly", () => {
    assert.equal(hasAllPermissions(GRANTS, []), true);
    assert.equal(hasAllPermissions([], []), true);
  });

  it("any([]) === false explicitly", () => {
    assert.equal(hasAnyPermission(GRANTS, []), false);
    assert.equal(hasAnyPermission([], []), false);
  });

  it("requires every permission for all()", () => {
    assert.equal(
      hasAllPermissions(GRANTS, ["studioflow.project.read", "bq.breakdown.edit"]),
      true,
    );
    assert.equal(
      hasAllPermissions(GRANTS, ["studioflow.project.read", "studioflow.project.edit"]),
      false,
    );
    assert.equal(hasAllPermissions([], ["studioflow.project.read"]), false);
  });

  it("requires at least one matching permission for any()", () => {
    assert.equal(hasAnyPermission(GRANTS, ["studioflow.project.edit", "bq.breakdown.edit"]), true);
    assert.equal(hasAnyPermission(GRANTS, ["studioflow.project.edit", "masterdata.brand.edit"]), false);
  });

  it("treats malformed requirements as unmet", () => {
    assert.equal(hasAllPermissions(GRANTS, ["studioflow.project.read", "BAD"]), false);
    assert.equal(hasAnyPermission(GRANTS, ["BAD"]), false);
  });
});

describe("requirePermission", () => {
  it("passes silently when the base permission is present", () => {
    assert.doesNotThrow(() => requirePermission(GRANTS, "masterdata.price.read"));
  });

  it("throws shared FORBIDDEN when absent", () => {
    try {
      requirePermission(GRANTS, "masterdata.brand.delete");
      assert.fail("expected FORBIDDEN");
    } catch (error) {
      assert.ok(isAppError(error));
      const payload = toSafeErrorPayload(error);
      assert.equal(payload.kind, "FORBIDDEN");
      assert.equal(payload.code, "PERMISSION_DENIED");
    }
  });

  it("keeps authorization failure distinct from authentication failure kinds", () => {
    try {
      requirePermission([], "studioflow.project.read");
    } catch (error) {
      assert.equal(toSafeErrorPayload(error).kind, "FORBIDDEN");
      assert.notEqual(toSafeErrorPayload(error).kind, "UNAUTHENTICATED");
    }
  });
});
