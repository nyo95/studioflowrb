import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveUnit } from "./unit-alias";

const UNITS = ["ls", "m", "m2", "point", "pcs", "unit"];

describe("BQ quick entry units", () => {
  it("maps office units to studio units", () => {
    assert.deepEqual(resolveUnit("titik", UNITS), { unit: "point", note: '"titik" dibaca sebagai point' });
    assert.deepEqual(resolveUnit("m'", UNITS), { unit: "m", note: `"m'" dibaca sebagai m` });
    assert.deepEqual(resolveUnit("M2", UNITS), { unit: "m2", note: null });
    assert.equal(resolveUnit("roll", UNITS).note, 'Satuan "roll" belum ada di Master Data');
    assert.equal(resolveUnit("", UNITS).unit, "ls");
  });
});
