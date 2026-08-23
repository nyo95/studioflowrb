import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

import { isAppError, toSafeErrorPayload } from "@platform/core/errors";

import { DateOnlySchema, IsoInstantSchema, UuidSchema, toValidationIssues, validationError } from "./index";

describe("shared scalar schemas", () => {
  it("accepts only UUIDs", () => {
    assert.equal(UuidSchema.safeParse("123e4567-e89b-42d3-a456-426614174000").success, true);
    assert.equal(UuidSchema.safeParse("not-a-uuid").success, false);
    assert.equal(UuidSchema.safeParse("").success, false);
    assert.equal(UuidSchema.safeParse(123).success, false);
  });

  it("accepts UTC ISO instants including fractional seconds", () => {
    assert.equal(IsoInstantSchema.safeParse("0000-01-01T00:00:00Z").success, true);
    assert.equal(IsoInstantSchema.safeParse("2026-08-23T10:00:00Z").success, true);
    assert.equal(IsoInstantSchema.safeParse("2026-08-23T10:00:00.123Z").success, true);
  });

  it("rejects date-only values and explicit offsets as instants", () => {
    assert.equal(IsoInstantSchema.safeParse("2026-08-23").success, false);
    assert.equal(IsoInstantSchema.safeParse("2026-08-23T10:00:00+02:00").success, false);
    assert.equal(IsoInstantSchema.safeParse("yesterday").success, false);
  });

  it("accepts only strict YYYY-MM-DD date-only values", () => {
    assert.equal(DateOnlySchema.safeParse("0099-12-31").success, true);
    assert.equal(DateOnlySchema.safeParse("2026-08-23").success, true);
    assert.equal(DateOnlySchema.safeParse("2026-08-23T10:00:00Z").success, false);
    assert.equal(DateOnlySchema.safeParse("2026-8-23").success, false);
    assert.equal(DateOnlySchema.safeParse("23-08-2026").success, false);
  });

  it("keeps instant and date-only handling distinct in both directions", () => {
    const value = "2026-08-23";
    assert.equal(IsoInstantSchema.safeParse(value).success, false);
    assert.equal(DateOnlySchema.safeParse(value).success, true);

    const instant = "2026-08-23T10:00:00Z";
    assert.equal(DateOnlySchema.safeParse(instant).success, false);
    assert.equal(IsoInstantSchema.safeParse(instant).success, true);
  });
});

describe("zod issue mapping", () => {
  it("maps issues to string paths and messages", () => {
    const schema = z.strictObject({
      nested: z.strictObject({ value: z.string().min(3) }),
    });
    const result = schema.safeParse({ nested: { value: "ab" } });
    assert.equal(result.success, false);
    if (!result.success) {
      const issues = toValidationIssues(result.error);
      assert.deepEqual(issues[0].path, ["nested", "value"]);
      assert.equal(typeof issues[0].message, "string");
    }
  });

  it("maps validation failures into AppError VALIDATION payloads at the boundary", () => {
    const result = IsoInstantSchema.safeParse("nope");
    assert.ok(!result.success);
    if (!result.success) {
      const error = validationError(result.error);
      assert.ok(isAppError(error));
      const payload = toSafeErrorPayload(error);
      assert.equal(payload.kind, "VALIDATION");
      assert.equal(payload.code, "VALIDATION_FAILED");
      assert.ok(Array.isArray(payload.details?.issues));
    }
  });

  it("reports unknown mutation keys instead of passing them through", () => {
    const schema = z.strictObject({ id: UuidSchema });
    const result = schema.safeParse({ id: "123e4567-e89b-42d3-a456-426614174000", extra: true });
    assert.equal(result.success, false);
    if (!result.success) {
      const issues = toValidationIssues(result.error);
      assert.equal(issues.length > 0, true);
      assert.ok(JSON.stringify(issues).includes("extra"));
    }
  });

  it("keeps omitted keys and explicit null distinct for clearable fields", () => {
    const schema = z.strictObject({
      dueAt: IsoInstantSchema.nullable().optional(),
    });

    const omitted = schema.parse({});
    assert.equal("dueAt" in omitted, false);

    const cleared = schema.parse({ dueAt: null });
    assert.equal("dueAt" in cleared, true);
    assert.equal(cleared.dueAt, null);
  });
});
