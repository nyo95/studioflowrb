import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  carriedBrandNames,
  compareAmounts,
  groupLowestRows,
  groupPriceRows,
  lowestPriceByCurrencyUnit,
  lowestPricesByCurrencyUnit,
  matchesDirectoryStatus,
  normalizeIndonesiaPhone,
  sizeText,
  suppliedByNames,
  tabCountLabel,
} from "./directory-findability";

const price = (id: string, amount: string, currency = "IDR", unit = "M2", archived = false, item = "Tile A") => ({ id, item, amount, currency, unit: { code: unit }, deleted_at: archived ? new Date() : null });

describe("directory status filter", () => {
  it("keeps active and archived filtering explicit", () => {
    assert.equal(matchesDirectoryStatus(null, "ACTIVE"), true);
    assert.equal(matchesDirectoryStatus(new Date(), "ACTIVE"), false);
    assert.equal(matchesDirectoryStatus(new Date(), "ARCHIVED"), true);
    assert.equal(matchesDirectoryStatus(null, "ARCHIVED"), false);
    assert.equal(matchesDirectoryStatus(new Date(), "ALL"), true);
  });
});

describe("phone normalization", () => {
  it("only returns a WhatsApp number for plausible digits", () => {
    assert.equal(normalizeIndonesiaPhone("0812-3456-7890"), "6281234567890");
    assert.equal(normalizeIndonesiaPhone("+62 812 3456 7890"), "6281234567890");
    assert.equal(normalizeIndonesiaPhone("62812 3456 7890"), "6281234567890");
    assert.equal(normalizeIndonesiaPhone("1234567"), null);
    assert.equal(normalizeIndonesiaPhone("1234567890123456"), null);
    assert.equal(normalizeIndonesiaPhone("abc"), null);
    assert.equal(normalizeIndonesiaPhone(null), null);
  });
});

describe("brand supplier composition", () => {
  it("keeps the owner first and marked", () => {
    assert.deepEqual(suppliedByNames({ name: "Owner" }, [{ name: "Linked" }]), ["Owner (owner)", "Linked"]);
    assert.deepEqual(suppliedByNames(null, [{ name: "Linked" }]), ["Linked"]);
    assert.deepEqual(suppliedByNames(null, []), []);
  });
});

describe("brands a supplier carries", () => {
  it("lists owned brands first, then linked ones, each once", () => {
    assert.deepEqual(carriedBrandNames([{ id: "1", name: "Carta" }], [{ brand: { id: "2", name: "Taco" } }, { brand: { id: "1", name: "Carta" } }]), ["Carta", "Taco"]);
    assert.deepEqual(carriedBrandNames([], []), []);
  });
});

describe("price comparison", () => {
  it("compares amounts as decimals, not floating point", () => {
    assert.equal(compareAmounts("0.30", "0.3"), 0);
    assert.equal(compareAmounts("9007199254740993", "9007199254740992"), 1);
    assert.equal(compareAmounts("2", "10"), -1);
  });

  it("lowest price: one per currency and unit, never across them", () => {
    const rows = [price("a", "20"), price("b", "10"), price("c", "5", "USD"), price("d", "3", "IDR", "M")];
    assert.equal(lowestPriceByCurrencyUnit(rows.slice(0, 2))?.id, "b");
    assert.deepEqual(lowestPricesByCurrencyUnit(rows).map((row) => row.id).sort(), ["b", "c", "d"]);
    assert.equal(lowestPriceByCurrencyUnit([]), null);
  });

  it("marks Lowest only for two or more active prices in one currency and unit", () => {
    assert.deepEqual([...groupLowestRows([price("a", "10")])], [], "a single price is not compared");
    assert.deepEqual([...groupLowestRows([price("a", "10"), price("b", "12")])], ["a"]);
    assert.deepEqual([...groupLowestRows([price("a", "10"), price("b", "10")])].sort(), ["a", "b"], "ties are all marked");
    assert.deepEqual([...groupLowestRows([price("a", "10"), price("b", "12", "USD")])], [], "mixed currency: no badge");
    assert.deepEqual([...groupLowestRows([price("a", "10"), price("b", "12", "IDR", "M")])], [], "mixed unit: no badge");
    assert.deepEqual([...groupLowestRows([price("a", "1", "IDR", "M2", true), price("b", "12")])], [], "an archived price is neither counted nor marked");
    assert.deepEqual([...groupLowestRows([price("a", "1", "IDR", "M2", true), price("b", "12"), price("c", "11")])], ["c"]);
  });
});

describe("group by item", () => {
  const rows = [
    price("t2", "30", "IDR", "M2", false, "Tile B"),
    price("a2", "12", "IDR", "M2", false, "Tile A"),
    price("a-archived", "1", "IDR", "M2", true, "Tile A"),
    price("a1", "10", "IDR", "M2", false, "Tile A"),
  ];
  const groups = groupPriceRows(rows, (row) => row.item, (row) => row.item);

  it("orders groups by item name and rows by price, archived last", () => {
    assert.deepEqual(groups.map((group) => group.label), ["Tile A", "Tile B"]);
    assert.deepEqual(groups[0].rows.map((row) => row.id), ["a1", "a2", "a-archived"]);
  });

  it("badges the cheapest active row of a comparable group and nothing else", () => {
    assert.deepEqual([...groups[0].lowestIds], ["a1"]);
    assert.deepEqual([...groups[1].lowestIds], [], "a group of one is not compared");
  });

  it("does not badge a group that mixes currencies", () => {
    const mixed = groupPriceRows([price("x", "10", "IDR", "M2", false, "Tile C"), price("y", "1", "USD", "M2", false, "Tile C")], (row) => row.item, (row) => row.item);
    assert.deepEqual([...mixed[0].lowestIds], []);
    const ordered = groupPriceRows([price("idr", "850000", "IDR", "M2", false, "Paint"), price("usd", "45", "USD", "M2", false, "Paint")], (row) => row.item, (row) => row.item);
    assert.deepEqual(ordered[0].rows.map((row) => row.id), ["idr", "usd"], "ordered by currency first, never by raw amount across currencies");
  });
});

describe("small display helpers", () => {
  it("builds the size text", () => {
    assert.equal(sizeText({ length: "60", width: "60", thickness: "1", unitCode: "cm" }), "60 × 60 × 1 cm");
    assert.equal(sizeText({ length: "240", width: "120", thickness: null, unitCode: "cm" }), "240 × 120 cm");
    assert.equal(sizeText({ length: null, width: null, thickness: null, unitCode: "cm" }), "");
  });
  it("labels a tab with the number of rows the filters show", () => {
    assert.equal(tabCountLabel("Labor Only", 3), "Labor Only (3)");
  });
});
