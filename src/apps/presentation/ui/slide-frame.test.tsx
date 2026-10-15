import assert from "node:assert/strict";
import { it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SlideImageBox, type FrameImage } from "./slide-frame";

it("renders print pins as server-safe spans and editor pins with a larger hit area", () => {
  const image: FrameImage = { id: "image", slot: 0, imageUrl: null, imageRatio: 2, fit: "cover", focusX: 20, focusY: 80, pins: [{ id: "pin", number: 3, pinX: 25, pinY: 75 }] };
  const print = renderToStaticMarkup(<SlideImageBox image={image} pinClassName="print-pin" />);
  assert.match(print, /<span style="left:25%;top:75%" class="print-pin">3<\/span>/);
  assert.doesNotMatch(print, /<button/);
  const editor = renderToStaticMarkup(<SlideImageBox image={image} pinClassName="size-7" onPinClick={() => undefined} />);
  assert.match(editor, /aria-label="Pin 3"/);
  assert.match(editor, /size-11/);
  assert.match(editor, /touch-none/);
  assert.match(editor, /<span class="size-7 ">3<\/span>/);
});
