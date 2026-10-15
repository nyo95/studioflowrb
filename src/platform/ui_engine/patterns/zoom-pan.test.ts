import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clampView, fitSize, initialView, MAX_VIEW_ZOOM, panBy, pinchView, toPicture, zoomAround } from "./zoom-pan";

const frame = { width: 800, height: 600 };
const content = fitSize({ width: 1600, height: 900 }, frame); // 800 × 450

describe("zoom-pan", () => {
  it("fits the picture whole and centres it", () => {
    assert.deepEqual(content, { width: 800, height: 450 });
    assert.deepEqual(initialView(content, frame), { zoom: 1, x: 0, y: 75 });
    assert.deepEqual(fitSize({ width: 0, height: 10 }, frame), { width: 0, height: 0 });
  });

  it("keeps the picture point under the cursor while zooming, within bounds", () => {
    const start = initialView(content, frame);
    const at = { x: 600, y: 300 };
    const before = toPicture(start, at, content);
    const zoomed = zoomAround(start, at, 3, content, frame);
    const after = toPicture(zoomed, at, content);
    assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
    assert.equal(zoomAround(start, at, 99, content, frame).zoom, MAX_VIEW_ZOOM);
    assert.deepEqual(zoomAround(zoomed, at, 0.2, content, frame), initialView(content, frame));
  });

  it("pans without showing a blank edge and centres a smaller axis", () => {
    const zoomed = zoomAround(initialView(content, frame), { x: 400, y: 300 }, 2, content, frame);
    const far = panBy(zoomed, { x: 5000, y: 5000 }, content, frame);
    assert.deepEqual([far.x, far.y], [0, 0]);
    const other = panBy(zoomed, { x: -5000, y: -5000 }, content, frame);
    assert.deepEqual([other.x, other.y], [800 - 1600, 600 - 900]);
    assert.equal(clampView({ zoom: 1, x: 300, y: -40 }, content, frame).y, 75);
  });

  it("pinches around the midpoint and carries the picture with it", () => {
    const start = initialView(content, frame);
    const pinched = pinchView(start, [{ x: 300, y: 300 }, { x: 500, y: 300 }], [{ x: 200, y: 300 }, { x: 600, y: 300 }], content, frame);
    assert.equal(pinched.zoom, 2);
    assert.ok(Math.abs(toPicture(pinched, { x: 400, y: 300 }, content).x - toPicture(start, { x: 400, y: 300 }, content).x) < 1e-9);
  });

  it("maps frame points to picture fractions, clamped to the picture", () => {
    const view = initialView(content, frame);
    assert.deepEqual(toPicture(view, { x: 400, y: 300 }, content), { x: 0.5, y: 0.5 });
    assert.deepEqual(toPicture(view, { x: -10, y: 900 }, content), { x: 0, y: 1 });
  });
});
