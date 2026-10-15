import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HoverCard } from "./overlays";

describe("HoverCard", () => {
  it("renders only its trigger, wired as a popup button, until it is opened", () => {
    const out = renderToStaticMarkup(<HoverCard label="Item preview" content={<a href="/item">Open item</a>}><button type="button">@HT1</button></HoverCard>);
    assert.match(out, /<button[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"[^>]*>@HT1<\/button>/);
    assert.doesNotMatch(out, /Open item/);
  });
});
