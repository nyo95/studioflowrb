import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { FormattedText, toggleCheckItem } from "./formatted-text";

const html = (text: string) => renderToStaticMarkup(<FormattedText text={text} />);

describe("FormattedText", () => {
  it("shows plain text as before, keeping line breaks", () => {
    const out = html("Warmer palette\nKeep the marble");
    assert.match(out, /<p class="m-0">Warmer palette<br\/>Keep the marble<\/p>/);
    assert.doesNotMatch(out, /<ul|<ol|<strong|<em/);
  });

  it("turns bold and italic marks into real emphasis", () => {
    const out = html("Use **marble** at the *reception*");
    assert.match(out, /<strong class="font-semibold">marble<\/strong>/);
    assert.match(out, /<em>reception<\/em>/);
    assert.doesNotMatch(out, /\*/);
  });

  it("groups bullet and numbered lines into lists, numbering from the first number", () => {
    const out = html("Client asked:\n- warmer palette\n- bigger sofa\n3. Glassblock\n4. Convex mirror");
    assert.match(out, /<ul[^>]*><li>warmer palette<\/li><li>bigger sofa<\/li><\/ul>/);
    assert.match(out, /<ol start="3"[^>]*><li>Glassblock<\/li><li>Convex mirror<\/li><\/ol>/);
  });

  it("shows headings and check items from the rich editor", () => {
    const out = html("## Plan\n\n- [ ] Check marble\n- [x] Order sample\n- plain bullet");
    assert.match(out, /<p class="m-0 font-semibold">Plan<\/p>/);
    assert.match(out, /<input[^>]*type="checkbox"[^>]*\/><span>Check marble<\/span>/);
    assert.match(out, /checked=""[^>]*\/><span class="text-ink-tertiary line-through">Order sample<\/span>/);
    assert.match(out, /<ul[^>]*><li>plain bullet<\/li><\/ul>/);
    assert.doesNotMatch(out, /\[ \]|\[x\]|##/);
  });

  it("never renders typed HTML", () => {
    const out = html("<script>alert(1)</script> **<b>x</b>**");
    assert.doesNotMatch(out, /<script>|<b>/);
    assert.match(out, /&lt;script&gt;/);
  });

  it("leaves a lone asterisk and multiplication alone", () => {
    const out = html("Size 60 * 60 cm, note *");
    assert.match(out, /Size 60 \* 60 cm, note \*/);
  });

  it("ticks check items in place when asked, and flips exactly the item it is given", () => {
    const text = "Intro\n- [ ] first\n- [x] second\n\n- [ ] third";
    assert.match(renderToStaticMarkup(<FormattedText text={text} onToggleCheck={() => undefined} />), /aria-label="Mark as done"/);
    assert.match(html(text), /readonly=""/i);
    assert.equal(toggleCheckItem(text, 0), "Intro\n- [x] first\n- [x] second\n\n- [ ] third");
    assert.equal(toggleCheckItem(text, 1), "Intro\n- [ ] first\n- [ ] second\n\n- [ ] third");
    assert.equal(toggleCheckItem(text, 2), "Intro\n- [ ] first\n- [x] second\n\n- [x] third");
    assert.equal(toggleCheckItem(text, 5), text);
  });

  it("shows characters the rich editor escaped as typed, without the backslash", () => {
    const out = html("\\[TES\\] warna lantai \\*bukan miring\\* **\\[tebal\\]**");
    assert.match(out, /\[TES\] warna lantai \*bukan miring\* <strong class="font-semibold">\[tebal\]<\/strong>/);
    assert.doesNotMatch(out, /\\/);
  });
});
