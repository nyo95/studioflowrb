export type PinPosition = { pinX: number; pinY: number };
export type PinFrame = { left: number; top: number; width: number; height: number };
export type ClientPoint = { x: number; y: number };
const percent = (value: number) => Math.max(0, Math.min(100, value));

/** The full image frame can extend outside a cropped box; never use the visible box's bounds. */
export function pinAtPoint(point: ClientPoint, frame: PinFrame): PinPosition | null {
  if (frame.width <= 0 || frame.height <= 0) return null;
  return { pinX: percent((point.x - frame.left) / frame.width * 100), pinY: percent((point.y - frame.top) / frame.height * 100) };
}

export function isPinDrag(start: ClientPoint, point: ClientPoint): boolean {
  return Math.hypot(point.x - start.x, point.y - start.y) >= 3;
}

export function nudgePin(position: PinPosition, key: string, shift: boolean): PinPosition | null {
  const step = shift ? 5 : 1;
  switch (key) {
    case "ArrowLeft": return { ...position, pinX: percent(position.pinX - step) };
    case "ArrowRight": return { ...position, pinX: percent(position.pinX + step) };
    case "ArrowUp": return { ...position, pinY: percent(position.pinY - step) };
    case "ArrowDown": return { ...position, pinY: percent(position.pinY + step) };
    default: return null;
  }
}
