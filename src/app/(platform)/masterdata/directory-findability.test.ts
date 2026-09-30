import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupLowestRows, lowestPriceByCurrencyUnit, matchesDirectoryStatus, normalizeIndonesiaPhone, suppliedByNames } from "./directory-findability";

describe("directory findability helpers", () => {
  it("keeps active and archived filtering explicit", () => {
    assert.equal(matchesDirectoryStatus(null, "ACTIVE"), true);
    assert.equal(matchesDirectoryStatus(new Date(), "ACTIVE"), false);
    assert.equal(matchesDirectoryStatus(new Date(), "ARCHIVED"), true);
  });
  it("only returns a normalized WhatsApp number for valid digits", () => {
    assert.equal(normalizeIndonesiaPhone("0812-3456-7890"), "6281234567890");
    assert.equal(normalizeIndonesiaPhone("+62 812 3456 7890"), "6281234567890");
    assert.equal(normalizeIndonesiaPhone("1234567"), null);
    assert.equal(normalizeIndonesiaPhone("1234567890123456"), null);
    assert.equal(normalizeIndonesiaPhone("abc"), null);
  });
  it("keeps owner first and only badges comparable active group lows", () => {
    assert.deepEqual(suppliedByNames({ name: "Owner" }, [{ name: "Linked" }]), ["Owner (owner)", "Linked"]);
    const rows = [{ id: "a", amount: "10", currency: "IDR", unit: { code: "M" }, deleted_at: null }, { id: "b", amount: "10", currency: "IDR", unit: { code: "M" }, deleted_at: null }, { id: "c", amount: "1", currency: "USD", unit: { code: "M" }, deleted_at: null }];
    assert.deepEqual([...groupLowestRows(rows)], []);
    assert.deepEqual([...groupLowestRows(rows.slice(0, 2))], ["a", "b"]);
  });
  it("picks the lowest comparable display price", () => {
    assert.equal(lowestPriceByCurrencyUnit([{ amount: "20", currency: "IDR", unit: { code: "M" } }, { amount: "10", currency: "IDR", unit: { code: "M" } }])?.amount, "10");
  });
});
