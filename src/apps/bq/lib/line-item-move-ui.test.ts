import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BqItemDetail, BqLineItemDetail, BqSubObjectDetail } from "../public";
import {
  buildLineItemMoveFields,
  lineItemTargetOptions,
  selectAllLineItems,
  selectionAlreadyAtTarget,
  selectionForItem,
  toggleLineItemSelection,
} from "./line-item-move-ui";

const line = (id: string): BqLineItemDetail => ({
  id, sourceType: "CUSTOM", sourceRefId: null, sourceImportedAt: null, titleSnapshot: id,
  purchaseUnitSnapshot: "pcs", baseUnitSnapshot: null, purchaseToBaseFactorSnapshot: null,
  sourcePriceSnapshot: null, hargaSnapshot: "10", currencySnapshot: "IDR", kategori: "MATERIAL",
  qty: "1", koefisien: "1", sortOrder: 0, notes: null, biayaLine: "10",
});

const group = (id: string, ids: string[]): BqSubObjectDetail => ({
  id, name: `Group ${id}`, qtyPerL1: "2", markupL2Pct: "10", sortOrder: 0, notes: null,
  lineItems: ids.map(line), subtotalL2Raw: "20", subtotalL2: "22",
});

const item = (id = "item-1"): BqItemDetail => ({
  id, name: "Work", qty: "1", unit: "pcs", hargaSnapshot: null, koefisien: "1", markupL1Pct: "0",
  priceMode: "PRICED", sortOrder: 0, notes: null, subObjects: [group("group-1", ["grouped-1", "grouped-2"])],
  lineItems: [line("direct-1"), line("direct-2")], biayaPokok: "42", rate: "42", total: "42",
});

describe("BQ Cost Component selection UI logic", () => {
  it("keeps one Work Item selected at a time and clears when its final row is unchecked", () => {
    let selection = toggleLineItemSelection(null, "item-1", "line-1", true);
    selection = toggleLineItemSelection(selection, "item-1", "line-2", true);
    assert.deepEqual(selectionForItem(selection, "item-1"), ["line-1", "line-2"]);
    selection = toggleLineItemSelection(selection, "item-2", "other", true);
    assert.deepEqual(selectionForItem(selection, "item-1"), []);
    assert.deepEqual(selectionForItem(selection, "item-2"), ["other"]);
    assert.equal(toggleLineItemSelection(selection, "item-2", "other", false), null);
  });

  it("selects every direct and grouped Cost Component in display order", () => {
    assert.deepEqual(selectAllLineItems(item(), true), {
      itemId: "item-1",
      lineItemIds: ["grouped-1", "grouped-2", "direct-1", "direct-2"],
    });
    assert.equal(selectAllLineItems(item(), false), null);
  });

  it("builds direct, existing-group and new-group menu targets with group facts", () => {
    assert.deepEqual(lineItemTargetOptions(item()), [
      { key: "direct", label: "Langsung di Work Item", target: { direct: true } },
      { key: "group-1", label: "Group group-1", description: "×2 · 10%", target: { subObjectId: "group-1" } },
      { key: "new", label: "Component Group baru…", target: { newGroup: true } },
    ]);
  });

  it("detects only an all-selected same-place move as a no-op", () => {
    const value = item();
    assert.equal(selectionAlreadyAtTarget(value, ["direct-1", "direct-2"], { direct: true }), true);
    assert.equal(selectionAlreadyAtTarget(value, ["grouped-1"], { subObjectId: "group-1" }), true);
    assert.equal(selectionAlreadyAtTarget(value, ["direct-1", "grouped-1"], { direct: true }), false);
    assert.equal(selectionAlreadyAtTarget(value, ["missing"], { direct: true }), false);
  });

  it("builds the exact preview, move and group action fields", () => {
    assert.deepEqual(buildLineItemMoveFields({
      projectId: "project", itemId: "item", lineItemIds: ["a", "b"], target: { subObjectId: "group" },
    }), {
      projectId: "project", itemId: "item", lineItemIds: '["a","b"]', target: '{"subObjectId":"group"}',
    });
    assert.deepEqual(buildLineItemMoveFields({
      projectId: "project", itemId: "item", lineItemIds: ["a"], group: { name: "New", qtyPerL1: "1", markupL2Pct: "0" },
    }), {
      projectId: "project", itemId: "item", lineItemIds: '["a"]', name: "New", qtyPerL1: "1", markupL2Pct: "0",
    });
  });
});
