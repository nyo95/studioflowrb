/** MOM vocabulary and pure rules (contract §10, legacy extensions/mom). */

import { STUDIOFLOW_IMAGE_TYPES } from "./images";

export const MOM_IMAGE_SLOTS = [0, 1] as const;
export type MomImageSlot = (typeof MOM_IMAGE_SLOTS)[number];

export const MOM_LIMITS = {
  topic: 200,
  venue: 500,
  attendees: 5000,
  preparedBy: 200,
  revisionNote: 200,
  /** One section's whole free-typed note field (owner decision, 2026-09-23: replaces the old per-point `pointText`). */
  itemContent: 20000,
  /** Prepared (cropped JPEG) upload; must stay under the 4 MB server-action body limit. */
  imageBytes: 3 * 1024 * 1024,
} as const;

export const MOM_IMAGE_TYPES: Record<string, string> = STUDIOFLOW_IMAGE_TYPES;

export function isImageSlot(value: number): value is MomImageSlot {
  return value === 0 || value === 1;
}

/** Same members, any order — the only valid reorder payload. */
export function isPermutation(current: readonly string[], requested: readonly string[]): boolean {
  if (current.length !== requested.length) return false;
  const wanted = new Set(requested);
  if (wanted.size !== requested.length) return false;
  return current.every((id) => wanted.has(id));
}

/** Move one id up/down inside an ordered list; returns null when it cannot move. */
export function moveId(ids: readonly string[], id: string, direction: "up" | "down"): string[] | null {
  const index = ids.indexOf(id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Frozen copy of a MOM's content. Images are storage-key references, never bytes. */
export type MomSnapshot = {
  topic: string;
  meetingDate: string;
  venue: string | null;
  attendees: string | null;
  preparedByName: string;
  items: Array<{
    isTextOnly: boolean;
    content: string;
    images: Array<{ slot: MomImageSlot; storageKey: string; contentType: string; bytes: number }>;
  }>;
};

type SnapshotSource = {
  topic: string;
  meetingDate: string;
  venue: string | null;
  attendees: string | null;
  preparedByName: string;
  items: ReadonlyArray<{
    isTextOnly: boolean;
    content: string;
    images: ReadonlyArray<{ slot: number; storageKey: string; contentType: string; bytes: number }>;
  }>;
};

/** Items and images must already be in display order. */
export function buildMomSnapshot(source: SnapshotSource): MomSnapshot {
  return {
    topic: source.topic,
    meetingDate: source.meetingDate,
    venue: source.venue,
    attendees: source.attendees,
    preparedByName: source.preparedByName,
    items: source.items.map((item) => ({
      isTextOnly: item.isTextOnly,
      content: item.content,
      images: item.images.map((image) => ({ slot: image.slot as MomImageSlot, storageKey: image.storageKey, contentType: image.contentType, bytes: image.bytes })),
    })),
  };
}

/**
 * Pre-2026-09-23 revisions stored an ordered `points` array (`text`/`style`)
 * plus an item-level `listStyle`, with the marker rendered outside the text.
 * Reproduces that exact marker so an old revision reads the same once
 * normalized into the current single-`content` shape (see `parseMomSnapshot`).
 */
function legacyPointsToContent(listStyle: string, points: ReadonlyArray<{ text: string; style: string }>): string {
  let counter = 0;
  return points.map(({ text, style }) => {
    if (listStyle === "NONE" || style === "PLAIN") return text;
    counter += 1;
    const prefix = listStyle === "DISC" ? "• " : listStyle === "DASH" ? "– " : `${counter}. `;
    return prefix + text;
  }).join("\n");
}

/** Key order is not stable across a JSONB round trip, so compare a canonical form. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function momSnapshotsEqual(a: MomSnapshot, b: MomSnapshot): boolean {
  return canonical(a) === canonical(b);
}

export function momSnapshotImageKeys(snapshot: MomSnapshot): string[] {
  return snapshot.items.flatMap((item) => item.images.map((image) => image.storageKey));
}

const LEGACY_LIST_STYLES = ["DECIMAL", "DISC", "DASH", "NONE"];
const LEGACY_POINT_STYLES = ["DEFAULT", "PLAIN"];

/** Snapshots come back from a JSON column; refuse anything that is not our shape. */
export function parseMomSnapshot(value: unknown): MomSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const text = (x: unknown) => typeof x === "string";
  const nullableText = (x: unknown) => x === null || typeof x === "string";
  if (!text(v.topic) || !text(v.meetingDate) || !nullableText(v.venue) || !nullableText(v.attendees) || !text(v.preparedByName) || !Array.isArray(v.items)) return null;
  const items: MomSnapshot["items"] = [];
  for (const item of v.items as unknown[]) {
    if (typeof item !== "object" || item === null) return null;
    const i = item as Record<string, unknown>;
    if (typeof i.isTextOnly !== "boolean" || !Array.isArray(i.images)) return null;
    const images: MomSnapshot["items"][number]["images"] = [];
    for (const image of i.images as unknown[]) {
      const m = image as Record<string, unknown> | null;
      if (!m || (m.slot !== 0 && m.slot !== 1) || !text(m.storageKey) || !text(m.contentType) || typeof m.bytes !== "number") return null;
      images.push({ slot: m.slot, storageKey: m.storageKey as string, contentType: m.contentType as string, bytes: m.bytes as number });
    }
    let content: string;
    if (text(i.content)) {
      content = i.content as string;
    } else if (Array.isArray(i.points) && typeof i.listStyle === "string" && LEGACY_LIST_STYLES.includes(i.listStyle)) {
      const points: Array<{ text: string; style: string }> = [];
      for (const point of i.points as unknown[]) {
        const p = point as Record<string, unknown> | null;
        if (!p || !text(p.text) || typeof p.style !== "string" || !LEGACY_POINT_STYLES.includes(p.style)) return null;
        points.push({ text: p.text as string, style: p.style });
      }
      content = legacyPointsToContent(i.listStyle, points);
    } else {
      return null;
    }
    items.push({ isTextOnly: i.isTextOnly, content, images });
  }
  return {
    topic: v.topic as string,
    meetingDate: v.meetingDate as string,
    venue: v.venue as string | null,
    attendees: v.attendees as string | null,
    preparedByName: v.preparedByName as string,
    items,
  };
}
