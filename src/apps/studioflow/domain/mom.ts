/** MOM vocabulary and pure rules (contract §10, legacy extensions/mom). */

export const MOM_LIST_STYLES = ["DECIMAL", "DISC", "DASH", "NONE"] as const;
export type MomListStyle = (typeof MOM_LIST_STYLES)[number];

export const MOM_POINT_STYLES = ["DEFAULT", "PLAIN"] as const;
export type MomPointStyle = (typeof MOM_POINT_STYLES)[number];

export const MOM_LIST_STYLE_LABELS: Record<MomListStyle, string> = {
  DECIMAL: "Numbered",
  DISC: "Bullets",
  DASH: "Dashes",
  NONE: "No markers",
};

export const MOM_POINT_STYLE_LABELS: Record<MomPointStyle, string> = {
  DEFAULT: "Normal",
  PLAIN: "Plain",
};

export const MOM_DEFAULT_TOPIC = "SITE INSPECTION REPORT";
export const MOM_IMAGE_SLOTS = [0, 1] as const;
export type MomImageSlot = (typeof MOM_IMAGE_SLOTS)[number];

export const MOM_LIMITS = {
  topic: 200,
  venue: 500,
  attendees: 5000,
  preparedBy: 200,
  pointText: 5000,
  /** Prepared (cropped JPEG) upload; must stay under the 4 MB server-action body limit. */
  imageBytes: 3 * 1024 * 1024,
} as const;

export const MOM_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Marker shown before a point. Legacy numbered only the points that carry the
 * DEFAULT style; a PLAIN point shows no marker and does not advance the count.
 */
export function pointMarkers(listStyle: MomListStyle, styles: readonly MomPointStyle[]): string[] {
  let counter = 0;
  return styles.map((style) => {
    if (listStyle === "NONE" || style === "PLAIN") return "";
    counter += 1;
    if (listStyle === "DISC") return "•";
    if (listStyle === "DASH") return "–";
    return `${counter}.`;
  });
}

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
