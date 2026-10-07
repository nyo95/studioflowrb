import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { startAssetSweep } from "./asset-sweep";
import { removeUnreferenced } from "./asset-cleanup";
import { FakeObjectStorage } from "@platform/core/storage";
import type { Db } from "./shared";

it("sweep defaults off outside production, unrefs both timers, and catches run errors", async () => {
  const source = readFileSync("src/apps/studioflow/asset-sweep.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [environment, enabled] of [
    [{ NODE_ENV: "development" }, false], [{ NODE_ENV: "test" }, false], [{ NODE_ENV: "production" }, true],
    [{ NODE_ENV: "production", STUDIOFLOW_ASSET_SWEEP: "off" }, false], [{ NODE_ENV: "test", STUDIOFLOW_ASSET_SWEEP: "on" }, true],
  ] as const) {
    const callbacks: Array<() => void> = [];
    const delays: number[] = [];
    const logs: string[] = [];
    let unrefs = 0;
    const timer = (callback: () => void, delay: number) => { callbacks.push(callback); delays.push(delay); return { unref: () => { unrefs++; } }; };
    const exports = {} as { startAssetSweep: typeof startAssetSweep };
    runInNewContext(compiled, { exports, setTimeout: timer, setInterval: timer, clearTimeout() {}, clearInterval() {}, console: { error: (message: string) => logs.push(message) } });
    let calls = 0;
    exports.startAssetSweep(async () => { calls++; throw Error("private filename and secret"); }, environment);
    assert.deepEqual(delays, enabled ? [10_000, 86_400_000] : []);
    assert.equal(unrefs, enabled ? 2 : 0);
    for (const callback of callbacks) { callback(); await new Promise<void>((resolve) => setImmediate(resolve)); }
    assert.equal(calls, enabled ? 2 : 0);
    assert.deepEqual(logs, enabled ? ["StudioFlow asset cleanup failed.", "StudioFlow asset cleanup failed."] : []);
  }
});

it("shared cleanup protects all six live key owners and deduplicates removal candidates", async () => {
  const owners = ["sfDeliverable", "sfMomImage", "sfIterationImage", "sfScheduleOption", "sfScheduleTemplateItem", "sfClient"];
  for (const owner of owners) {
    const db = Object.fromEntries(owners.map((name) => [name, { count: async () => name === owner ? 1 : 0 }])) as unknown as Db;
    const storage = new FakeObjectStorage();
    await storage.put({ key: "shared", contentType: "image/png", body: new Uint8Array([1]), bytes: 1 });
    assert.deepEqual(await removeUnreferenced(db, storage, ["shared", "shared", null]), { blobsRemoved: 0, blobsKeptShared: 1, blobFailures: 0 });
    assert.ok(storage.objects.has("shared"));
  }
});

it("instrumentation starts cleanup only on Node and catches startup/import failure", async () => {
  const compiled = ts.transpileModule(readFileSync("src/instrumentation.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const runtime of ["edge", "nodejs"]) {
    const imports: string[] = [];
    const logs: string[] = [];
    const exports = {} as { register: () => Promise<void> };
    runInNewContext(compiled, { exports, process: { env: { NEXT_RUNTIME: runtime } }, console: { error: (message: string) => logs.push(message) }, require: (id: string) => {
      imports.push(id);
      if (id.endsWith("asset-signing")) return { assertAssetSigningConfigured() {} };
      if (id.endsWith("storage-root")) return { async assertStorageRootConfigured() {} };
      if (id.endsWith("registry")) return { initializePermissionRegistry() {} };
      if (id.endsWith("app-registrations")) return { APP_REGISTRATIONS: [] };
      throw Error("private import failure details");
    } });
    await exports.register();
    assert.equal(imports.length, runtime === "nodejs" ? 6 : 0);
    assert.deepEqual(logs, runtime === "nodejs" ? ["StudioFlow asset cleanup startup failed.", "Notification retention startup failed."] : []);
  }
});

it("sweep drains full batches, stops on a short one, and never exceeds ten batches per run", async () => {
  const source = readFileSync("src/apps/studioflow/asset-sweep.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  async function callsFor(results: unknown[], batchSize = 25) {
    const callbacks: Array<() => void> = [];
    const timer = (callback: () => void) => { callbacks.push(callback); return { unref() {} }; };
    const exports = {} as { startAssetSweep: typeof startAssetSweep };
    runInNewContext(compiled, { exports, setTimeout: timer, setInterval: timer, clearTimeout() {}, clearInterval() {}, console: { error() {} } });
    let calls = 0;
    exports.startAssetSweep(async () => results[Math.min(calls++, results.length - 1)], { NODE_ENV: "production" }, batchSize);
    callbacks[0]();
    await new Promise<void>((resolve) => setImmediate(resolve));
    return calls;
  }
  assert.equal(await callsFor([{ projectsPurged: 3 }]), 1, "a short first batch stops at once");
  assert.equal(await callsFor([{ projectsPurged: 25 }, { projectsPurged: 25 }, { projectsPurged: 3 }]), 3, "full batches continue until a short one");
  assert.equal(await callsFor([{ projectsPurged: 25 }]), 10, "an endless backlog is capped at ten batches per run");
  assert.equal(await callsFor([{ projectsPurged: 5 }], 5), 10, "the batch size is the injected one");
  assert.equal(await callsFor([undefined]), 1, "a runner that reports nothing stops after one call");
});
