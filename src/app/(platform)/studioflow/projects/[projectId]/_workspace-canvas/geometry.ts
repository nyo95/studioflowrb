/**
 * Workspace canvas geometry (WO-SF-WORKSPACE-03 rules, owner-accepted R8.529 prototype). Pure functions so the
 * layout and the snapping can be tested without a browser.
 *
 * Frames are placed in canvas coordinates. A card's position is relative to its frame's top-left corner, so moving
 * a frame is one stored change. A card's height is never stored: it is measured from its content. An item with no
 * stored position is "not placed yet" and is laid out here, deterministically, from the stored order.
 */

export const GRID = 8;
export const SNAP = 10;
export const GAP = 16;
export const FRAME_PAD = 16;
export const FRAME_HEAD = 44;
export const FRAME_GAP = 32;
export const CARD_TOP = FRAME_HEAD + 12;
export const DEFAULT_FRAME = { w: 384, h: 240 };
export const DEFAULT_CARD_W = 256;
export const MIN_CARD_W = 180;
export const MIN_FRAME = { w: 260, h: 120 };
export const ESTIMATED_CARD_H = 96;

export type Rect = { x: number; y: number; w: number; h: number };
export type CardSlot = { x: number; y: number; w: number };
export type LayoutInput = {
  id: string;
  canvas: Rect | null;
  cards: { id: string; canvas: CardSlot | null }[];
}[];
export type BoardLayout = {
  /** Each frame's drawn rectangle: its stored size grown to hold its cards. */
  frames: Map<string, Rect>;
  /** Each card's place inside its frame, and its width. */
  cards: Map<string, CardSlot>;
};

export const snapToGrid = (value: number) => Math.round(value / GRID) * GRID;

/** Lays out the board: stored geometry where it exists, the stacking rule where it does not. */
export function layoutBoard(sections: LayoutInput, heights: ReadonlyMap<string, number>): BoardLayout {
  const frames = new Map<string, Rect>();
  const cards = new Map<string, CardSlot>();
  let right = sections.reduce((max, section) => (section.canvas ? Math.max(max, section.canvas.x + section.canvas.w) : max), 0);
  for (const section of sections) {
    let frame: Rect;
    if (section.canvas) {
      frame = { ...section.canvas };
    } else {
      // An unplaced frame goes to the right of everything placed so far, in stored order.
      frame = { x: right === 0 ? FRAME_GAP : right + FRAME_GAP, y: FRAME_GAP, ...DEFAULT_FRAME };
      right = frame.x + frame.w;
    }
    let bottom = CARD_TOP - GAP;
    for (const card of section.cards) {
      if (!card.canvas) continue;
      cards.set(card.id, { ...card.canvas });
      bottom = Math.max(bottom, card.canvas.y + (heights.get(card.id) ?? ESTIMATED_CARD_H));
    }
    // Unplaced cards stack under the frame's lowest card, in stored order.
    for (const card of section.cards) {
      if (card.canvas) continue;
      const slot = { x: FRAME_PAD, y: snapToGrid(bottom + GAP), w: DEFAULT_CARD_W };
      cards.set(card.id, slot);
      bottom = slot.y + (heights.get(card.id) ?? ESTIMATED_CARD_H);
    }
    frames.set(section.id, grownFrame(frame, section.cards.map((card) => ({ slot: cards.get(card.id)!, h: heights.get(card.id) ?? ESTIMATED_CARD_H }))));
  }
  return { frames, cards };
}

/** A frame is drawn at least as large as its stored size, and large enough to hold every card in it. */
export function grownFrame(frame: Rect, contents: { slot: CardSlot; h: number }[]): Rect {
  let w = frame.w;
  let h = frame.h;
  for (const { slot, h: cardH } of contents) {
    w = Math.max(w, snapToGrid(slot.x + slot.w + FRAME_PAD));
    h = Math.max(h, snapToGrid(slot.y + cardH + FRAME_PAD));
  }
  return { ...frame, w, h };
}

export type Snapped = { x: number; y: number; guideX: number | null; guideY: number | null };

/**
 * Snaps a moving rectangle: an edge within SNAP of another rectangle's edge (left, right, top, bottom, or one GAP
 * beside or under it) locks to it and reports a guide line; otherwise the position lands on the grid.
 * `inset` adds the inner edges of the frame being dropped into. Positions never go below `min`.
 */
export function snapMove(item: { w: number; h: number }, rawX: number, rawY: number, others: readonly Rect[], inset?: { x: number; y: number }, min = 0): Snapped {
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
  if (inset) { tryX(inset.x, inset.x); tryY(inset.y, null); }
  const x = bestX.d <= SNAP ? bestX.value : snapToGrid(rawX);
  const y = bestY.d <= SNAP ? bestY.value : snapToGrid(rawY);
  return { x: Math.max(min, x), y: Math.max(min, y), guideX: bestX.d <= SNAP ? bestX.guide : null, guideY: bestY.d <= SNAP ? bestY.guide : null };
}

/** The frame whose rectangle contains a canvas point, the topmost (last drawn) first. */
export function frameAt(frames: ReadonlyMap<string, Rect>, x: number, y: number): string | null {
  let found: string | null = null;
  for (const [id, frame] of frames) if (x >= frame.x && x <= frame.x + frame.w && y >= frame.y && y <= frame.y + frame.h) found = id;
  return found;
}

/** Where a new frame goes: right of every frame on the board. */
export function nextFramePlace(frames: ReadonlyMap<string, Rect>): Rect {
  const right = [...frames.values()].reduce((max, frame) => Math.max(max, frame.x + frame.w), 0);
  return { x: snapToGrid(right + FRAME_GAP), y: FRAME_GAP, ...DEFAULT_FRAME };
}

/** The scale that fits every frame into a viewport width, between 0.4 and 1. */
export function fitZoom(frames: ReadonlyMap<string, Rect>, viewportWidth: number): number {
  const right = [...frames.values()].reduce((max, frame) => Math.max(max, frame.x + frame.w), 0);
  if (right <= 0) return 1;
  return Math.max(0.4, Math.min(1, (viewportWidth - 48) / right));
}
