import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractBrandImageUrl } from "./brand-image";

describe("StudioFlow Library brand image utility", () => {
  it("prefers JSON-LD logo over social banners", () => {
    const html = '<script type="application/ld+json">{"@type":"Organization","logo":{"url":"/logo.svg"}}</script><meta property="og:image" content="/hero.jpg">';
    assert.equal(extractBrandImageUrl(html, "https://brand.example.com/catalog"), "https://brand.example.com/logo.svg");
  });

  it("prefers a header logo and touch icon before social fallback", () => {
    assert.equal(extractBrandImageUrl('<header><img alt="Brand logo" src="/mark.png"></header><meta property="og:image" content="/hero.jpg">', "https://brand.example.com"), "https://brand.example.com/mark.png");
    assert.equal(extractBrandImageUrl('<link rel="apple-touch-icon" sizes="180x180" href="/touch.png"><meta property="og:image" content="/hero.jpg">', "https://brand.example.com"), "https://brand.example.com/touch.png");
  });

  it("ignores missing, malformed, and unsafe image URLs", () => {
    assert.equal(extractBrandImageUrl('<img class="hero logo" src="/hero-logo.jpg"><meta property="og:image" content="/og.jpg">', "https://brand.example.com"), "https://brand.example.com/og.jpg");
    assert.equal(extractBrandImageUrl('<script type="application/ld+json">bad</script><img alt="logo" src="javascript:alert(1)"><meta property="og:image" content="javascript:alert(1)">', "https://brand.example.com"), null);
    assert.equal(extractBrandImageUrl("<html></html>", "https://brand.example.com"), null);
  });
});
