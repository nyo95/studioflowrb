import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { isAppError } from "@platform/core/errors";

import { changeModuleState } from "./admin";
import { initializeModuleRegistry, resetModuleRegistryForTests } from "./manifest";

describe("Developer module state command", () => {
  beforeEach(() => initializeModuleRegistry([
    { id: "studioflow", name: "StudioFlow", version: "1.0.0", kind: "core", requires: [] },
    { id: "ideas", name: "Ideas", version: "1.0.0", kind: "optional", parent: "studioflow", requires: ["studioflow"] },
  ]));
  afterEach(resetModuleRegistryForTests);

  it("changes optional state and writes one SYSTEM audit event", async () => {
    const writes: unknown[] = [];
    const audits: unknown[] = [];
    const tx = { moduleState: {
      findUnique: async () => null,
      upsert: async (input: unknown) => { writes.push(input); return {}; },
    } };
    const result = await changeModuleState({
      moduleId: "ideas",
      state: "DISABLED",
      runTransaction: async (work) => work(tx as never),
      auditWriter: { write: async (event) => { audits.push(event); } },
      now: () => new Date("2026-10-09T00:00:00.000Z"),
    });
    assert.deepEqual(result, { changed: true, state: "DISABLED" });
    assert.equal(writes.length, 1);
    assert.equal(audits.length, 1);
    assert.deepEqual((audits[0] as { actor: unknown; action: string }).actor, { kind: "SYSTEM", label: "developer-cli" });
    assert.equal((audits[0] as { action: string }).action, "platform.module.disabled");
  });

  it("refuses state rows for core modules", async () => {
    await assert.rejects(() => changeModuleState({
      moduleId: "studioflow",
      state: "DISABLED",
      runTransaction: async (work) => work({} as never),
      auditWriter: { write: async () => undefined },
    }), (error: unknown) => isAppError(error) && error.code === "MODULE_CORE_STATE_REFUSED");
  });

  it("attributes web console changes to the Developer web actor", async () => {
    const writes: Array<{ actor?: unknown }> = [];
    await changeModuleState({
      moduleId: "ideas",
      state: "DISABLED",
      actorLabel: "developer-web",
      runTransaction: async (work) => work({ moduleState: {
        findUnique: async () => null,
        upsert: async () => ({}),
      } } as never),
      auditWriter: { write: async (event) => { writes.push(event); } },
    });
    assert.deepEqual(writes[0]?.actor, { kind: "SYSTEM", label: "developer-web" });
  });
});
