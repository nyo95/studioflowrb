import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BOARD_PAD, DEFAULT_CARD_W, GAP, boardExtent, layoutElements, snapMove } from "./geometry";

describe("Workspace board layout", () => {
  it("keeps stored places and stacks unplaced elements under the lowest placed one, in stored order", () => {
    const slots = layoutElements([
      { id: "placed", canvas: { x: 400, y: 56, w: 300 } },
      { id: "new1", canvas: null },
      { id: "new2", canvas: null },
    ], new Map([["placed", 100], ["new1", 40]]));
    assert.deepEqual(slots.get("placed"), { x: 400, y: 56, w: 300 });
    assert.deepEqual(slots.get("new1"), { x: BOARD_PAD, y: 176, w: DEFAULT_CARD_W });
    assert.deepEqual(slots.get("new2"), { x: BOARD_PAD, y: 232, w: DEFAULT_CARD_W });
  });

  it("starts an empty board's first element at the board padding", () => {
    assert.deepEqual(layoutElements([{ id: "only", canvas: null }], new Map()).get("only"), { x: BOARD_PAD, y: BOARD_PAD, w: DEFAULT_CARD_W });
  });

  it("measures the board around its elements, never smaller than the minimum", () => {
    const slots = new Map([["a", { x: 1500, y: 900, w: 200 }]]);
    assert.deepEqual(boardExtent(slots, new Map([["a", 100]])), { w: 1500 + 200 + BOARD_PAD, h: 900 + 100 + BOARD_PAD });
    assert.deepEqual(boardExtent(new Map(), new Map()), { w: 1200, h: 800 });
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
});
