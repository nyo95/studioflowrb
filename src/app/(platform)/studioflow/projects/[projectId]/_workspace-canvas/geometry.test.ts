import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CARD_TOP, DEFAULT_CARD_W, FRAME_GAP, FRAME_PAD, GAP, ESTIMATED_CARD_H, fitZoom, frameAt, layoutBoard, nextFramePlace, snapMove } from "./geometry";

describe("Workspace canvas layout", () => {
  it("keeps stored frames and puts unplaced frames to their right in stored order", () => {
    const layout = layoutBoard([
      { id: "a", canvas: { x: 40, y: 32, w: 400, h: 300 }, cards: [] },
      { id: "b", canvas: null, cards: [] },
      { id: "c", canvas: null, cards: [] },
    ], new Map());
    assert.deepEqual(layout.frames.get("a"), { x: 40, y: 32, w: 400, h: 300 });
    assert.deepEqual(layout.frames.get("b"), { x: 440 + FRAME_GAP, y: FRAME_GAP, w: 384, h: 240 });
    assert.equal(layout.frames.get("c")!.x, 440 + FRAME_GAP + 384 + FRAME_GAP);
  });

  it("stacks unplaced cards under the frame's lowest placed card using measured heights", () => {
    const layout = layoutBoard([{ id: "f", canvas: null, cards: [
      { id: "placed", canvas: { x: 16, y: 56, w: 300 } },
      { id: "new1", canvas: null },
      { id: "new2", canvas: null },
    ] }], new Map([["placed", 100], ["new1", 40]]));
    assert.deepEqual(layout.cards.get("placed"), { x: 16, y: 56, w: 300 });
    assert.deepEqual(layout.cards.get("new1"), { x: FRAME_PAD, y: 176, w: DEFAULT_CARD_W });
    assert.deepEqual(layout.cards.get("new2"), { x: FRAME_PAD, y: 232, w: DEFAULT_CARD_W });
  });

  it("starts an empty frame's first card under the header and grows the frame to hold its cards", () => {
    const layout = layoutBoard([{ id: "f", canvas: { x: 0, y: 0, w: 260, h: 120 }, cards: [{ id: "only", canvas: null }] }], new Map());
    assert.equal(layout.cards.get("only")!.y, CARD_TOP);
    const frame = layout.frames.get("f")!;
    assert.ok(frame.w >= FRAME_PAD + DEFAULT_CARD_W + FRAME_PAD, "wide enough for the default card");
    assert.ok(frame.h >= CARD_TOP + ESTIMATED_CARD_H + FRAME_PAD, "tall enough for the card");
  });

  it("locks to a neighbour's edge or a gap within the snap distance, otherwise to the grid", () => {
    const neighbour = { x: 100, y: 100, w: 200, h: 80 };
    const lockedLeft = snapMove({ w: 200, h: 60 }, 107, 300, [neighbour]);
    assert.equal(lockedLeft.x, 100);
    assert.equal(lockedLeft.guideX, 100);
    const stacked = snapMove({ w: 200, h: 60 }, 400, 100 + 80 + GAP + 6, [neighbour]);
    assert.equal(stacked.y, 196);
    const free = snapMove({ w: 200, h: 60 }, 613, 517, [neighbour]);
    assert.deepEqual([free.x, free.y, free.guideX, free.guideY], [616, 520, null, null]);
    assert.equal(snapMove({ w: 10, h: 10 }, -30, -2, []).x, 0, "never below the minimum");
  });

  it("finds the frame under a point, places a new frame on the right, and fits the zoom", () => {
    const frames = new Map([["a", { x: 0, y: 0, w: 400, h: 300 }], ["b", { x: 432, y: 0, w: 400, h: 300 }]]);
    assert.equal(frameAt(frames, 500, 50), "b");
    assert.equal(frameAt(frames, 420, 50), null);
    assert.equal(nextFramePlace(frames).x, 864);
    assert.equal(fitZoom(frames, 2000), 1);
    assert.equal(fitZoom(frames, 464), 0.5);
  });
});
