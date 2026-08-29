import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPageMeta,
  calcOffset,
  normalizePage,
  normalizePageSize,
  normalizeSortDirection,
} from "./index";

describe("normalizePage", () => {
  it("accepts positive integers", () => {
    assert.equal(normalizePage(1), 1);
    assert.equal(normalizePage(42), 42);
  });
  it("falls back to the caller-supplied default for invalid input", () => {
    assert.equal(normalizePage(undefined, { defaultPage: 3 }), 3);
    assert.equal(normalizePage(0), 1);
    assert.equal(normalizePage(-2), 1);
    assert.equal(normalizePage(1.5), 1);
    assert.equal(normalizePage("4"), 1);
    assert.equal(normalizePage(Number.NaN), 1);
  });
});

describe("normalizePageSize", () => {
  it("clamps to the caller-supplied maximum", () => {
    assert.equal(normalizePageSize(500, { defaultSize: 20, maxSize: 100 }), 100);
    assert.equal(normalizePageSize(50, { defaultSize: 20, maxSize: 100 }), 50);
  });
  it("falls back to the caller-supplied default for invalid input", () => {
    assert.equal(normalizePageSize(undefined, { defaultSize: 20, maxSize: 100 }), 20);
    assert.equal(normalizePageSize(0, { defaultSize: 20, maxSize: 100 }), 20);
    assert.equal(normalizePageSize(-1, { defaultSize: 20, maxSize: 100 }), 20);
    assert.equal(normalizePageSize("20", { defaultSize: 20, maxSize: 100 }), 20);
  });
  it("keeps an invalid default within the maximum", () => {
    assert.equal(normalizePageSize(undefined, { defaultSize: 0, maxSize: 25 }), 25);
    assert.equal(normalizePageSize(undefined, { defaultSize: 1000, maxSize: 25 }), 25);
  });
});

describe("calcOffset", () => {
  it("computes zero-based offsets", () => {
    assert.equal(calcOffset(1, 20), 0);
    assert.equal(calcOffset(2, 20), 20);
    assert.equal(calcOffset(7, 10), 60);
  });
  it("falls back to the first page for invalid input", () => {
    assert.equal(calcOffset(0, 20), 0);
    assert.equal(calcOffset(-3, 20), 0);
  });
});

describe("buildPageMeta", () => {
  it("reports bounded metadata for a middle page", () => {
    assert.deepEqual(buildPageMeta(2, 20, 55), {
      page: 2,
      pageSize: 20,
      total: 55,
      pageCount: 3,
      outOfRange: false,
    });
  });
  it("reports zero page count for an empty total", () => {
    assert.deepEqual(buildPageMeta(1, 20, 0), {
      page: 1,
      pageSize: 20,
      total: 0,
      pageCount: 0,
      outOfRange: false,
    });
  });
  it("flags out-of-range pages instead of clamping silently", () => {
    assert.equal(buildPageMeta(4, 20, 55).outOfRange, true);
    assert.equal(buildPageMeta(4, 20, 55).pageCount, 3);
    assert.equal(buildPageMeta(4, 20, 55).page, 4);
  });
  it("treats non-finite or negative totals as zero", () => {
    assert.equal(buildPageMeta(1, 20, -5).total, 0);
    assert.equal(buildPageMeta(1, 20, Number.NaN).total, 0);
    assert.equal(buildPageMeta(1, 20, Number.POSITIVE_INFINITY).total, 0);
  });
});

describe("normalizeSortDirection", () => {
  it("keeps asc/desc and defaults everything else to asc", () => {
    assert.equal(normalizeSortDirection("asc"), "asc");
    assert.equal(normalizeSortDirection("desc"), "desc");
    assert.equal(normalizeSortDirection("DESC"), "asc");
    assert.equal(normalizeSortDirection(undefined), "asc");
    assert.equal(normalizeSortDirection("descending"), "asc");
  });
});
