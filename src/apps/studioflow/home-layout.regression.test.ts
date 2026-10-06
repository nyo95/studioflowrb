import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const projectCard = readFileSync("src/app/(platform)/studioflow/_components/project-card.tsx", "utf8");

describe("StudioFlow Home layout on a phone", () => {
  it("lets the phase strip scroll inside its card instead of widening the page", () => {
    // Without min-w-0 the card, a grid item, grew to the strip's 640px on a 375px phone and the page scrolled sideways.
    assert.match(projectCard, /<article aria-label=\{card\.name\} className="min-w-0">/);
  });
});
