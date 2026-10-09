import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { isAppError } from "@platform/core/errors";

import { initializeModuleRegistry, resetModuleRegistryForTests } from "./manifest";
import { enabledModuleIds, isModuleEnabled, listModuleOverview, requireModuleEnabled, synchronizeModuleVersions } from "./state";

const manifests = [
  { id: "studioflow", name: "StudioFlow", version: "1.0.0", kind: "core" as const, requires: [] },
  { id: "ideas", name: "Ideas", version: "1.1.0", kind: "optional" as const, parent: "studioflow", requires: ["studioflow"] },
];

describe("module runtime state", () => {
  beforeEach(() => initializeModuleRegistry(manifests));
  afterEach(resetModuleRegistryForTests);

  it("defaults optional modules to enabled and reports enabled ids", async () => {
    const db = { moduleState: { findMany: async () => [] } } as never;
    assert.equal(await isModuleEnabled("ideas", db), true);
    assert.deepEqual(await enabledModuleIds(db), ["platform", "studioflow", "ideas"]);
  });

  it("refuses a disabled module with MODULE_DISABLED", async () => {
    const db = { moduleState: { findMany: async () => [{ module_id: "ideas", state: "DISABLED" }] } } as never;
    assert.equal(await isModuleEnabled("ideas", db), false);
    await assert.rejects(() => requireModuleEnabled("ideas", db), (error: unknown) => isAppError(error) && error.code === "MODULE_DISABLED");
  });

  it("lists every module read-only with its own switch and the effective result", async () => {
    const db = { moduleState: { findMany: async () => [{ module_id: "ideas", state: "DISABLED" }] } } as never;
    assert.deepEqual(await listModuleOverview(db), [
      { id: "platform", name: "Platform", version: "1.0.0", kind: "core", parent: null, state: "ENABLED", enabled: true },
      { id: "studioflow", name: "StudioFlow", version: "1.0.0", kind: "core", parent: null, state: "ENABLED", enabled: true },
      { id: "ideas", name: "Ideas", version: "1.1.0", kind: "optional", parent: "studioflow", state: "DISABLED", enabled: false },
    ]);
  });

  it("records the running version while preserving an existing state", async () => {
    const calls: unknown[] = [];
    const db = { moduleState: {
      findMany: async () => [],
      upsert: async (input: unknown) => { calls.push(input); return {}; },
      update: async (input: unknown) => { calls.push(input); return {}; },
    } } as never;
    await synchronizeModuleVersions(db);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      where: { module_id: "ideas" },
      create: { module_id: "ideas", state: "ENABLED", last_version: "1.1.0", updated_by: "system-boot" },
      update: { last_version: "1.1.0" },
    });
  });
});
