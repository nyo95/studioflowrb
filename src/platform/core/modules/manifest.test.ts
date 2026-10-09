import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { isAppError } from "@platform/core/errors";

import { composeModuleRegistry, initializeModuleRegistry, resetModuleRegistryForTests, type ModuleManifest } from "./manifest";

const STUDIOFLOW = { id: "studioflow", name: "StudioFlow", version: "1.0.0", kind: "core", requires: [] } as const satisfies ModuleManifest;
const IDEAS = { id: "ideas", name: "Ideas", version: "1.0.0", kind: "optional", parent: "studioflow", requires: ["studioflow"] } as const satisfies ModuleManifest;

describe("module manifest registry", () => {
  afterEach(resetModuleRegistryForTests);

  it("registers implicit Platform plus core and optional modules", () => {
    const registry = composeModuleRegistry([STUDIOFLOW, IDEAS]);
    assert.deepEqual(registry.modules.map((module) => module.id), ["platform", "studioflow", "ideas"]);
    assert.equal(registry.find("ideas")?.parent, "studioflow");
  });

  it("initializes idempotently only for the same graph", () => {
    const first = initializeModuleRegistry([STUDIOFLOW, IDEAS]);
    assert.equal(initializeModuleRegistry([STUDIOFLOW, IDEAS]), first);
    assert.throws(() => initializeModuleRegistry([STUDIOFLOW]), (error: unknown) => isAppError(error) && error.code === "MODULE_REGISTRY_ALREADY_INITIALIZED");
  });

  it("rejects duplicate ids, malformed semver and a core parent", () => {
    assert.throws(() => composeModuleRegistry([STUDIOFLOW, STUDIOFLOW]), (error: unknown) => isAppError(error) && error.code === "MODULE_DUPLICATE_ID");
    assert.throws(() => composeModuleRegistry([{ ...STUDIOFLOW, version: "1.0" }]), (error: unknown) => isAppError(error) && error.code === "MODULE_INVALID_VERSION");
    assert.throws(() => composeModuleRegistry([{ ...STUDIOFLOW, parent: "platform" }]), (error: unknown) => isAppError(error) && error.code === "MODULE_CORE_PARENT");
  });

  it("rejects unknown parents, unknown requirements and dependency cycles", () => {
    assert.throws(() => composeModuleRegistry([{ ...IDEAS, parent: "missing", requires: [] }]), (error: unknown) => isAppError(error) && error.code === "MODULE_UNKNOWN_PARENT");
    assert.throws(() => composeModuleRegistry([{ ...STUDIOFLOW, requires: ["missing"] }]), (error: unknown) => isAppError(error) && error.code === "MODULE_UNKNOWN_REQUIREMENT");
    const a = { id: "a", name: "A", version: "1.0.0", kind: "optional", requires: ["b"] } as const satisfies ModuleManifest;
    const b = { id: "b", name: "B", version: "1.0.0", kind: "optional", requires: ["a"] } as const satisfies ModuleManifest;
    assert.throws(() => composeModuleRegistry([a, b]), (error: unknown) => isAppError(error) && error.code === "MODULE_DEPENDENCY_CYCLE");
  });
});
