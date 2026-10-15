import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";

import { createSaveQueue } from "./save-queue";

const ok = { ok: true as const, data: {} };
const settle = () => new Promise((resolve) => setImmediate(resolve));

function queue(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const states: [number, number][] = [];
  const failures: string[] = [];
  const saves = createSaveQueue({ onChange: (waiting, heavy) => states.push([waiting, heavy]), onFail: (message) => failures.push(message) });
  return { saves, states, failures };
}

describe("save queue", () => {
  it("saves repeated changes of one thing once, with the last value, after the delay", async (t) => {
    const { saves, states } = queue(t);
    const sent: number[] = [];
    for (const value of [10, 20, 30]) saves.later("image:focusX", async () => { sent.push(value); return ok; }, 400);
    assert.deepEqual(states.at(-1), [1, 0]);
    t.mock.timers.tick(399);
    await settle();
    assert.deepEqual(sent, []);
    t.mock.timers.tick(1);
    await settle();
    assert.deepEqual(sent, [30]);
    assert.deepEqual(states.at(-1), [0, 0]);
  });

  it("keeps the order changes were made in: delayed saves go before a later queued one", async (t) => {
    const { saves } = queue(t);
    const sent: string[] = [];
    saves.later("slide:layout", async () => { sent.push("layout"); return ok; }, 300);
    saves.run(async () => { sent.push("upload"); return ok; }, { heavy: true });
    await settle(); await settle();
    assert.deepEqual(sent, ["layout", "upload"]);
  });

  it("runs one save at a time and hands a heavy result back", async (t) => {
    const { saves, states } = queue(t);
    let release: () => void = () => undefined;
    const order: string[] = [];
    let data: unknown;
    saves.run(() => new Promise((resolve) => { release = () => { order.push("first"); resolve(ok); }; }), {});
    saves.run(async () => { order.push("second"); return { ok: true as const, data: { annotationId: "a1" } }; }, { heavy: true, after: (value) => { data = value; } });
    await settle();
    assert.deepEqual(order, []);
    assert.deepEqual(states.at(-1), [2, 1]);
    release();
    await settle(); await settle();
    assert.deepEqual(order, ["first", "second"]);
    assert.deepEqual(data, { annotationId: "a1" });
    assert.deepEqual(states.at(-1), [0, 0]);
  });

  it("reports a refusal or a thrown save, and keeps going", async (t) => {
    const { saves, failures } = queue(t);
    saves.run(async () => ({ ok: false as const, error: { code: "X", safeMessage: "Refused." } }) as never, {});
    saves.run(async () => { throw new Error("network"); }, {});
    saves.run(async () => undefined, {});
    await settle(); await settle(); await settle();
    assert.deepEqual(failures, ["Refused.", "The change could not be saved. Please try again."]);
  });

  it("flush starts every delayed save at once", async (t) => {
    const { saves } = queue(t);
    const sent: string[] = [];
    saves.later("a", async () => { sent.push("a"); return ok; }, 5000);
    saves.later("b", async () => { sent.push("b"); return ok; }, 5000);
    saves.flush();
    await settle(); await settle();
    assert.deepEqual(sent, ["a", "b"]);
  });
});
