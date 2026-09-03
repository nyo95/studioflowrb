import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeBrandLinks, normalizeBrandLinkUrl } from "./brand-link-input";

describe("Brand external-link input", () => {
  it("accepts a domain entered without its protocol", () => {
    assert.deepEqual(normalizeBrandLinkUrl("taco.com/catalog"), { ok: true, value: "https://taco.com/catalog" });
  });

  it("rejects non-web protocols before the user can save a draft", () => {
    assert.deepEqual(normalizeBrandLinkUrl("ftp://taco.com/catalog"), { ok: false, error: "Use an HTTP(S) website address." });
  });

  it("normalizes every saved link, including drafts added before the validation fix", () => {
    assert.deepEqual(normalizeBrandLinks([{ kind: "WEBSITE", url: "taco.com", label: " TACO " }]), {
      ok: true,
      value: [{ kind: "WEBSITE", url: "https://taco.com/", label: "TACO" }],
    });
  });
});
