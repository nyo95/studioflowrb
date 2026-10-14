/**
 * Slide layouts (owner 2026-10-14, "mini PowerPoint", option A): a slide is one of these grids of image boxes. Pure,
 * shared by the editor, the print and the service. Boxes are numbered from 0 in reading order.
 */
export const PRESENTATION_LAYOUTS = ["one", "two-side", "two-stack", "one-two", "three", "four"] as const;
export type PresentationLayout = (typeof PRESENTATION_LAYOUTS)[number];

export type LayoutBox = { column: string; row: string };
export type LayoutSpec = { label: string; slots: number; columns: string; rows: string; boxes: LayoutBox[] };

export const LAYOUT_SPECS: Record<PresentationLayout, LayoutSpec> = {
  one: { label: "1 gambar", slots: 1, columns: "1fr", rows: "1fr", boxes: [{ column: "1", row: "1" }] },
  "two-side": { label: "2 berdampingan", slots: 2, columns: "1fr 1fr", rows: "1fr", boxes: [{ column: "1", row: "1" }, { column: "2", row: "1" }] },
  "two-stack": { label: "2 atas-bawah", slots: 2, columns: "1fr", rows: "1fr 1fr", boxes: [{ column: "1", row: "1" }, { column: "1", row: "2" }] },
  "one-two": { label: "1 besar + 2 kecil", slots: 3, columns: "1.6fr 1fr", rows: "1fr 1fr", boxes: [{ column: "1", row: "1 / span 2" }, { column: "2", row: "1" }, { column: "2", row: "2" }] },
  three: { label: "3 berjajar", slots: 3, columns: "1fr 1fr 1fr", rows: "1fr", boxes: [{ column: "1", row: "1" }, { column: "2", row: "1" }, { column: "3", row: "1" }] },
  four: { label: "Grid 4", slots: 4, columns: "1fr 1fr", rows: "1fr 1fr", boxes: [{ column: "1", row: "1" }, { column: "2", row: "1" }, { column: "1", row: "2" }, { column: "2", row: "2" }] },
};

export function isPresentationLayout(value: string): value is PresentationLayout {
  return (PRESENTATION_LAYOUTS as readonly string[]).includes(value);
}

/** The layout of a stored slide; an unknown value (never written by this code) reads as one box. */
export function layoutSpec(value: string): LayoutSpec {
  return isPresentationLayout(value) ? LAYOUT_SPECS[value] : LAYOUT_SPECS.one;
}

export type PresentationImageFit = "cover" | "contain";
