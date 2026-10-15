import assert from "node:assert/strict";
import { it } from "node:test";
import { isPinDrag, nudgePin, pinAtPoint } from "./pin-geometry";
import { boardConfirmation, imageConfirmation, pinConfirmation, slideConfirmation } from "./destructive-confirmation";

it("maps the full image frame, including cropped overflow, to bounded percentages", () => {
  const frame = { left: -100, top: 20, width: 400, height: 200 };
  assert.deepEqual(pinAtPoint({ x: 0, y: 120 }, frame), { pinX: 25, pinY: 50 });
  assert.deepEqual(pinAtPoint({ x: -500, y: 500 }, frame), { pinX: 0, pinY: 100 });
  assert.deepEqual(pinAtPoint({ x: 500, y: -20 }, frame), { pinX: 100, pinY: 0 });
  assert.equal(pinAtPoint({ x: 0, y: 0 }, { ...frame, width: 0 }), null);
});
it("distinguishes clicks from movement of at least three pixels", () => {
  const start = { x: 10, y: 20 };
  assert.equal(isPinDrag(start, { x: 12, y: 22 }), false);
  assert.equal(isPinDrag(start, { x: 13, y: 20 }), true);
  assert.equal(isPinDrag(start, { x: 10, y: 16 }), true);
});
it("nudges one or five percent and clamps every edge without handling other keys", () => {
  const position = { pinX: 99, pinY: 1 };
  assert.deepEqual(nudgePin(position, "ArrowRight", false), { pinX: 100, pinY: 1 });
  assert.deepEqual(nudgePin(position, "ArrowLeft", true), { pinX: 94, pinY: 1 });
  assert.deepEqual(nudgePin(position, "ArrowUp", true), { pinX: 99, pinY: 0 });
  assert.deepEqual(nudgePin(position, "ArrowDown", false), { pinX: 99, pinY: 2 });
  assert.equal(nudgePin(position, "Enter", false), null);
});
it("confirms actual image, pin, slide and board counts, including empty and singular cases", () => {
  const empty = { annotations: [] };
  const one = { annotations: ["pin"] };
  assert.equal(imageConfirmation(empty, true).description, "Its 0 pins will be deleted.");
  assert.equal(imageConfirmation(one, false).description, "Its 1 pin will be deleted.");
  assert.equal(slideConfirmation({ images: [empty, one, { annotations: [1, 2] }] }).description, "Its 3 images and 3 pins will be deleted.");
  assert.equal(slideConfirmation({ images: [one] }).description, "Its 1 image and 1 pin will be deleted.");
  assert.equal(boardConfirmation([{ images: [] }]).description, "Its 1 slide will be deleted.");
  assert.equal(pinConfirmation(4).title, "Delete pin 4?");
});
