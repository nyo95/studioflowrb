import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AppError } from "@platform/core/errors";

import { requireRupiah } from "./currency";

describe("requireRupiah", () => {
  it("accepts IDR case-insensitively after trimming and returns the canonical code", () => {
    assert.equal(requireRupiah("IDR"), "IDR");
    assert.equal(requireRupiah(" idr "), "IDR");
    assert.equal(requireRupiah("Idr"), "IDR");
  });

  it("refuses non-Rupiah values with the documented error code", () => {
    for (const value of ["USD", "", "RP"]) {
      assert.throws(
        () => requireRupiah(value),
        (error: unknown) => error instanceof AppError && error.code === "bq.currency.rupiah-only",
      );
    }
  });
});
