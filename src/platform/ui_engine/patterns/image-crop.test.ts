import assert from "node:assert/strict";
import { it } from "node:test";
import { cropPreview, cropRect, panCrop, pinchCrop, zoomCrop, type CropInput, type CropPoint } from "./image-crop";

function previousExport(input: CropInput) {
  let baseWidth = input.naturalWidth;
  let baseHeight = input.naturalHeight;
  if (input.aspect && input.aspect > 0) {
    if (baseWidth / baseHeight > input.aspect) baseWidth = baseHeight * input.aspect;
    else baseHeight = baseWidth / input.aspect;
  }
  const width = baseWidth / input.zoom;
  const height = baseHeight / input.zoom;
  return { x: (input.naturalWidth - width) * (input.panX / 100), y: (input.naturalHeight - height) * (input.panY / 100), width, height };
}
const close = (a: number, b: number, tolerance = 0.000001) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const initial = { naturalWidth: 1600, naturalHeight: 900, aspect: 4 / 3, zoom: 1, panX: 50, panY: 50 };
const viewport = { width: 400, height: 300 };
function sourcePoint(input: CropInput, point: CropPoint) {
  const rect = cropRect(input);
  return { x: rect.x + point.x / viewport.width * rect.width, y: rect.y + point.y / viewport.height * rect.height };
}

it("matches the previous export formula exactly and reconstructs every crop from preview percentages", () => {
  for (const [naturalWidth, naturalHeight] of [[1600, 900], [900, 1600], [1000, 1000]]) {
    for (const aspect of [4 / 5, 4 / 3, undefined]) for (const zoom of [1, 2, 3]) {
      for (const panX of [0, 50, 100]) for (const panY of [0, 50, 100]) {
        const input = { naturalWidth, naturalHeight, aspect, zoom, panX, panY };
        const rect = cropRect(input), preview = cropPreview(input);
        assert.deepEqual(rect, previousExport(input));
        close(naturalWidth / (preview.width / 100), rect.width);
        close(naturalHeight / (preview.height / 100), rect.height);
        close(-preview.left / 100 * rect.width, rect.x);
        close(-preview.top / 100 * rect.height, rect.y);
        if (!aspect) close(rect.width / rect.height, naturalWidth / naturalHeight);
      }
    }
  }
});

it("shows the left and right 1600×900/4:3 crops instead of always centring the preview", () => {
  assert.deepEqual(cropRect({ ...initial, panX: 0 }), { x: 0, y: 0, width: 1200, height: 900 });
  assert.deepEqual(cropRect({ ...initial, panX: 100 }), { x: 400, y: 0, width: 1200, height: 900 });
  close(cropPreview({ ...initial, panX: 100 }).left, -100 / 3);
});

it("moves the picture one screen pixel per drag pixel using its real overflow, with no blank edges", () => {
  const next = panCrop(initial, viewport, { x: 20, y: 50 });
  close((cropRect({ ...initial, ...next }).x - cropRect(initial).x) * viewport.width / cropRect(initial).width, -20);
  assert.equal(next.panY, initial.panY, "zero vertical overflow stays still");
  assert.deepEqual(panCrop({ ...initial, aspect: undefined }, viewport, { x: 100, y: -100 }), { zoom: 1, panX: 50, panY: 50 });
  assert.deepEqual(panCrop(initial, viewport, { x: 10000, y: -10000 }), { zoom: 1, panX: 0, panY: 50 });
});

it("keeps the cursor's source point within half a pixel through zoom and clamps every bound", () => {
  for (const point of [{ x: 40, y: 40 }, { x: 200, y: 150 }, { x: 360, y: 260 }]) {
    const anchor = sourcePoint(initial, point);
    const next = zoomCrop(initial, viewport, point, point, 2);
    const saved = sourcePoint({ ...initial, ...next }, point);
    close(saved.x, anchor.x, 0.5); close(saved.y, anchor.y, 0.5);
  }
  for (const requested of [-10, 20]) {
    const next = zoomCrop(initial, viewport, { x: 0, y: 0 }, { x: 10000, y: -10000 }, requested);
    assert.ok(next.panX >= 0 && next.panX <= 100 && next.panY >= 0 && next.panY <= 100);
    assert.equal(next.zoom, requested < 1 ? 1 : 3);
  }
  assert.deepEqual(zoomCrop(initial, { width: 0, height: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, 2), { zoom: 1, panX: 50, panY: 50 });
});

it("pinches by distance around a moving midpoint in either tool, including a coincident pair", () => {
  const before: [CropPoint, CropPoint] = [{ x: 150, y: 150 }, { x: 250, y: 150 }];
  const after: [CropPoint, CropPoint] = [{ x: 120, y: 130 }, { x: 320, y: 130 }];
  const next = pinchCrop(initial, viewport, before, after);
  assert.equal(next.zoom, 2);
  const anchor = sourcePoint(initial, { x: 200, y: 150 });
  const moved = sourcePoint({ ...initial, ...next }, { x: 220, y: 130 });
  close(moved.x, anchor.x, 0.5); close(moved.y, anchor.y, 0.5);
  assert.equal(pinchCrop(initial, viewport, [before[0], before[0]], after).zoom, 1);
  assert.equal(pinchCrop({ ...initial, zoom: 3 }, viewport, before, after).zoom, 3);
});
