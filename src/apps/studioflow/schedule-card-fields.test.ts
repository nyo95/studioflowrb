import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SCHEDULE_CARD_FIELD_KEYS,
  SCHEDULE_DEFAULT_CARD_FIELDS,
  SCHEDULE_EXTRA_MAX,
  extraFieldKey,
  isScheduleCardFieldKey,
  isSpecPlaceholder,
  normalizeExtraFields,
  orderCardFields,
  scheduleSearchKey,
} from "./domain/schedule";

describe("Schedule card fields", () => {
  it("has no sku key and a default that is a subset of the whole set", () => {
    assert.equal((SCHEDULE_CARD_FIELD_KEYS as readonly string[]).includes("sku"), false);
    for (const key of SCHEDULE_DEFAULT_CARD_FIELDS) {
      assert.ok((SCHEDULE_CARD_FIELD_KEYS as readonly string[]).includes(key), `${key} is a real card field`);
    }
    assert.ok(SCHEDULE_DEFAULT_CARD_FIELDS.length < SCHEDULE_CARD_FIELD_KEYS.length, "the default is a choice, not everything");
  });

  it("renders in canonical order however the boxes were ticked", () => {
    assert.deepEqual(orderCardFields(["qty", "brand", "notes", "color"]), ["brand", "color", "qty", "notes"]);
  });

  it("puts a re-ticked field back in its place instead of at the bottom", () => {
    const withoutColor = orderCardFields(["brand", "finishing", "location"]);
    assert.deepEqual(orderCardFields([...withoutColor, "color"]), ["brand", "color", "finishing", "location"]);
  });

  it("keeps extra fields after the standard ones, in option order", () => {
    const keys = [extraFieldKey("Abrasion class"), extraFieldKey("Roll width")];
    assert.deepEqual(orderCardFields([keys[1], "brand", keys[0]], keys), ["brand", keys[0], keys[1]]);
  });

  it("keeps an extra whose option no longer carries it rather than dropping the choice", () => {
    const gone = extraFieldKey("Removed later");
    assert.deepEqual(orderCardFields(["brand", gone], []), ["brand", gone]);
  });

  it("accepts standard and extra keys and rejects anything else", () => {
    assert.equal(isScheduleCardFieldKey("brand"), true);
    assert.equal(isScheduleCardFieldKey(extraFieldKey("Abrasion class")), true);
    assert.equal(isScheduleCardFieldKey("sku"), false);
    assert.equal(isScheduleCardFieldKey("x:"), false);
    assert.equal(isScheduleCardFieldKey(`x:${"a".repeat(80)}`), false);
  });
});

describe("Schedule extra spec fields", () => {
  it("drops half-filled rows, trims, and de-duplicates by label", () => {
    assert.deepEqual(
      normalizeExtraFields([
        { label: "  Abrasion   class ", value: " PEI IV " },
        { label: "Abrasion class", value: "PEI III" },
        { label: "", value: "orphan" },
        { label: "Roll width", value: "" },
        { label: "Roll width", value: "140 cm" },
      ]),
      [
        { label: "Abrasion class", value: "PEI IV" },
        { label: "Roll width", value: "140 cm" },
      ],
    );
  });

  it("caps the list and ignores non-objects", () => {
    const many = Array.from({ length: SCHEDULE_EXTRA_MAX + 5 }, (_, index) => ({ label: `Field ${index}`, value: String(index) }));
    assert.equal(normalizeExtraFields(many).length, SCHEDULE_EXTRA_MAX);
    assert.deepEqual(normalizeExtraFields(["nope", null, 3]), []);
    assert.deepEqual(normalizeExtraFields("not an array"), []);
  });
});

describe("Schedule reuse key", () => {
  it("keeps a placeholder-only row out of the reuse pool", () => {
    assert.equal(scheduleSearchKey({ brandName: "PENDING", productName: "[RESERVED]" }), "");
    assert.equal(scheduleSearchKey({ brandName: null, productName: "  " }), "");
    assert.equal(isSpecPlaceholder("n/a"), true);
  });

  it("indexes a real row, including its extra fields", () => {
    assert.equal(
      scheduleSearchKey({
        brandName: "LAMITAK",
        productName: "Nude Pro - ATS 1132 M",
        color: "Ivory White",
        finishing: "Matt",
        extra: [{ label: "Abrasion class", value: "PEI IV" }],
      }),
      "lamitak | nude pro - ats 1132 m | ivory white | matt | abrasion class | pei iv",
    );
  });

  it("still indexes a row that has a type but no brand", () => {
    assert.equal(scheduleSearchKey({ brandName: null, productName: "Nude Pro" }), "nude pro");
  });
});
