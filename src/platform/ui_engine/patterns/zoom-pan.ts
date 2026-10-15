/**
 * View-only zoom and pan for a picture shown inside a frame (the image viewer, image markup). The content is the
 * picture fitted into the frame at zoom 1; `x`, `y` place its top-left corner in frame pixels. Nothing here changes
 * what is saved: callers that mark the picture keep their marks in picture coordinates.
 */
export type Size = { width: number; height: number };
export type ZoomView = { zoom: number; x: number; y: number };
export type FramePoint = { x: number; y: number };

export const MIN_VIEW_ZOOM = 1;
export const MAX_VIEW_ZOOM = 8;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The picture's size when it fits the frame whole (never enlarged past the frame, never cropped). */
export function fitSize(natural: Size, frame: Size): Size {
  if (natural.width <= 0 || natural.height <= 0 || frame.width <= 0 || frame.height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(frame.width / natural.width, frame.height / natural.height);
  return { width: natural.width * scale, height: natural.height * scale };
}

/** Keeps the zoomed picture over the frame: centred on an axis where it is smaller, no blank edge where it is larger. */
export function clampView(view: ZoomView, content: Size, frame: Size): ZoomView {
  const zoom = clamp(view.zoom, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM);
  const axis = (position: number, length: number, room: number) => {
    const scaled = length * zoom;
    return scaled <= room ? (room - scaled) / 2 : clamp(position, room - scaled, 0);
  };
  return { zoom, x: axis(view.x, content.width, frame.width), y: axis(view.y, content.height, frame.height) };
}

/** The fitted, centred view. */
export function initialView(content: Size, frame: Size): ZoomView {
  return clampView({ zoom: 1, x: 0, y: 0 }, content, frame);
}

/** Zooms to `zoom` keeping the picture point under `at` (frame pixels) under it. */
export function zoomAround(view: ZoomView, at: FramePoint, zoom: number, content: Size, frame: Size): ZoomView {
  const next = clamp(zoom, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM);
  const ratio = next / view.zoom;
  return clampView({ zoom: next, x: at.x - (at.x - view.x) * ratio, y: at.y - (at.y - view.y) * ratio }, content, frame);
}

/** Moves the picture by a pointer movement in frame pixels. */
export function panBy(view: ZoomView, delta: FramePoint, content: Size, frame: Size): ZoomView {
  return clampView({ ...view, x: view.x + delta.x, y: view.y + delta.y }, content, frame);
}

/** Two fingers: the distance ratio zooms and the midpoint carries the picture along. */
export function pinchView(view: ZoomView, before: readonly [FramePoint, FramePoint], after: readonly [FramePoint, FramePoint], content: Size, frame: Size): ZoomView {
  const mid = (pair: readonly [FramePoint, FramePoint]) => ({ x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 });
  const distance = (pair: readonly [FramePoint, FramePoint]) => Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
  const from = mid(before), to = mid(after);
  const zoomed = zoomAround(view, from, view.zoom * (distance(before) > 0 ? distance(after) / distance(before) : 1), content, frame);
  return panBy(zoomed, { x: to.x - from.x, y: to.y - from.y }, content, frame);
}

/** A frame point as a fraction (0–1) of the picture, for marks that must stay on the same spot of the picture. */
export function toPicture(view: ZoomView, at: FramePoint, content: Size): FramePoint {
  return {
    x: clamp((at.x - view.x) / (content.width * view.zoom), 0, 1),
    y: clamp((at.y - view.y) / (content.height * view.zoom), 0, 1),
  };
}
