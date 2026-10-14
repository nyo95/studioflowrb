import assert from "node:assert/strict";
import { it } from "node:test";

import { findExactOption } from "./creatable-options";

it("finds the option a query names exactly, by label or by one of its exact names", () => {
  const options = [
    { id: "a", label: "SKU-01 Marble Statuario (Brand A)", exactNames: ["Marble Statuario", "SKU-01"] },
    { id: "b", label: "Oak veneer" },
  ];
  assert.equal(findExactOption(options, "  marble statuario ")?.id, "a", "a SKU's own name inside a longer label");
  assert.equal(findExactOption(options, "sku-01")?.id, "a");
  assert.equal(findExactOption(options, "Oak Veneer")?.id, "b");
  assert.equal(findExactOption(options, "Marble"), null, "a part of a name is not exact, so creating stays possible");
  assert.equal(findExactOption(options, "   "), null);
});
