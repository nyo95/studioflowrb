/**
 * Workspace board geometry (WO-SF-WORKSPACE-04: one board, standalone elements). Pure functions so the layout and the
 * snapping can be tested without a browser.
 *
 * Elements are placed in board coordinates. An element's height is never stored: text follows its content and an
 * image its own proportions, so it is measured. An element with no stored position is "not placed yet" and is
 * stacked here, deterministically and in stored order, under everything placed.
 */

export const GRID = 8;
export const SNAP = 10;
export const GAP = 16;
export const BOARD_PAD = 32;
export const DEFAULT_CARD_W = 256;
export const MIN_CARD_W = 120;
export const ESTIMATED_CARD_H = 96;

export type Rect = { x: number; y: number; w: number; h: number };
export type CardSlot = { x: number; y: number; w: number };

export const snapToGrid = (value: number) => Math.round(value / GRID) * GRID;

/** Every element's place: stored where it exists; unplaced ones stack under the lowest placed element. */
export function layoutElements(items: readonly { id: string; canvas: CardSlot | null }[], heights: ReadonlyMap<string, number>): Map<string, CardSlot> {
  const slots = new Map<string, CardSlot>();
  let bottom = BOARD_PAD - GAP;
  for (const item of items) {
    if (!item.canvas) continue;
    slots.set(item.id, { ...item.canvas });
    bottom = Math.max(bottom, item.canvas.y + (heights.get(item.id) ?? ESTIMATED_CARD_H));
  }
  for (const item of items) {
    if (item.canvas) continue;
    const slot = { x: BOARD_PAD, y: snapToGrid(bottom + GAP), w: DEFAULT_CARD_W };
    slots.set(item.id, slot);
    bottom = slot.y + (heights.get(item.id) ?? ESTIMATED_CARD_H);
  }
  return slots;
}

/** The rectangle every element fits in, from the board's origin (at least `minimum`). */
export function boardExtent(slots: ReadonlyMap<string, CardSlot>, heights: ReadonlyMap<string, number>, minimum = { w: 1200, h: 800 }) {
  let w = minimum.w;
  let h = minimum.h;
  for (const [id, slot] of slots) {
    w = Math.max(w, slot.x + slot.w + BOARD_PAD);
    h = Math.max(h, slot.y + (heights.get(id) ?? ESTIMATED_CARD_H) + BOARD_PAD);
  }
  return { w, h };
}

export type Snapped = { x: number; y: number; guideX: number | null; guideY: number | null };

/**
 * Snaps a moving rectangle: an edge within SNAP of another rectangle's edge (left, right, top, bottom, or one GAP
 * beside or under it) locks to it and reports a guide line; otherwise the position lands on the grid.
 * Positions never go below `min`.
 */
export function snapMove(item: { w: number; h: number }, rawX: number, rawY: number, others: readonly Rect[], min = 0): Snapped {
  let bestX = { d: SNAP + 1, value: 0, guide: null as number | null };
  let bestY = { d: SNAP + 1, value: 0, guide: null as number | null };
  const tryX = (value: number, guide: number | null) => { const d = Math.abs(rawX - value); if (d < bestX.d) bestX = { d, value, guide }; };
  const tryY = (value: number, guide: number | null) => { const d = Math.abs(rawY - value); if (d < bestY.d) bestY = { d, value, guide }; };
  for (const other of others) {
    tryX(other.x, other.x);
    tryX(other.x + other.w - item.w, other.x + other.w);
    tryX(other.x + other.w + GAP, other.x + other.w + GAP);
    tryY(other.y, other.y);
    tryY(other.y + other.h + GAP, other.y + other.h + GAP);
    tryY(other.y + other.h - item.h, other.y + other.h);
  }
  const x = bestX.d <= SNAP ? bestX.value : snapToGrid(rawX);
  const y = bestY.d <= SNAP ? bestY.value : snapToGrid(rawY);
  return { x: Math.max(min, x), y: Math.max(min, y), guideX: bestX.d <= SNAP ? bestX.guide : null, guideY: bestY.d <= SNAP ? bestY.guide : null };
}
