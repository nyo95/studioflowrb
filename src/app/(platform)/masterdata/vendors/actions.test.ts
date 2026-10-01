import assert from "node:assert/strict";
import { it } from "node:test";
import { parseOptionalContactsJson } from "../action-input";

it("rejects malformed contact JSON and distinguishes an absent field from an explicit empty list", () => {
  assert.equal(parseOptionalContactsJson(null), undefined);
  assert.deepEqual(parseOptionalContactsJson("[]"), []);
  assert.throws(() => parseOptionalContactsJson("{bad"), (error: unknown) => typeof error === "object" && error !== null && (error as { code?: string }).code === "CONTACTS_JSON_INVALID");
});
