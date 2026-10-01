import assert from "node:assert/strict";
import { it } from "node:test";
import { parsePriceKind } from "../action-input";

it("rejects an unknown runtime price kind before routing a write", () => {
  assert.equal(parsePriceKind("material"), "material");
  assert.throws(() => parsePriceKind("unknown"));
});
