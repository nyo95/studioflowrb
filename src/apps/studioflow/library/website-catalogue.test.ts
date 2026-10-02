import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractWebsiteCatalogue } from "./website-catalogue";

describe("StudioFlow Library website catalogue utility", () => {
  it("reads product names, categories, keywords, and headings from public HTML", () => {
    const html = [
      "<h1>Architectural Windows</h1>",
      '<script type="application/ld+json">{"@type":"Product","name":"Sliding Window","category":"Window","keywords":"aluminium, kaca"}</script>',
    ].join("");
    assert.deepEqual(extractWebsiteCatalogue(html, "https://brand.example.com"), {
      sourceUrl: "https://brand.example.com",
      offerings: ["Architectural Windows", "Sliding Window", "Window", "aluminium", "kaca"],
    });
  });

  it("ignores generic navigation labels and malformed JSON-LD", () => {
    const result = extractWebsiteCatalogue('<a>Home</a><h2>About</h2><script type="application/ld+json">{bad</script>', "https://brand.example.com");
    assert.deepEqual(result.offerings, []);
  });
});
