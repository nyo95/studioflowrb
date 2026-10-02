import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractBrandImageUrl } from "./brand-image";

describe("StudioFlow Library brand image utility", () => {
  it("prefers Open Graph image and resolves a relative URL", () => {
    const html = '<meta property="og:image" content="/brand/logo.png"><meta name="twitter:image" content="https://cdn.example.com/fallback.png">';
    assert.equal(extractBrandImageUrl(html, "https://brand.example.com/catalog"), "https://brand.example.com/brand/logo.png");
  });

  it("falls back to a website icon", () => {
    const html = '<link rel="icon" href="/favicon.svg">';
    assert.equal(extractBrandImageUrl(html, "https://brand.example.com"), "https://brand.example.com/favicon.svg");
  });

  it("ignores missing, malformed, and unsafe image URLs", () => {
    assert.equal(extractBrandImageUrl('<meta property="og:image" content="javascript:alert(1)">', "https://brand.example.com"), null);
    assert.equal(extractBrandImageUrl("<html></html>", "https://brand.example.com"), null);
  });
});
