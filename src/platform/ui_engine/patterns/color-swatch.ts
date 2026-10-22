/** Pure helpers for the colour-swatch alternative to an uploaded picture; no DOM, so they are unit-tested directly. */

/** A few neutral starting points for interior finishes; the native picker covers everything else. */
export const SWATCH_PRESETS = ["#ffffff", "#f5f0e6", "#d8cbb5", "#a68a64", "#6b4f3a", "#8a8f87", "#3f4a3c", "#1f2937", "#111111"];

/** `#abc`, `abc`, `#AABBCC` or `aabbcc` → `#aabbcc`; anything else → null. */
export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) return `#${raw.split("").map((digit) => digit + digit).join("")}`;
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return null;
}

/** Pixel size of a solid swatch: the longer side is `longSide`, the other follows `aspect` (width / height). */
export function swatchSize(aspect: number | undefined, longSide: number): { width: number; height: number } {
  const ratio = aspect && aspect > 0 ? aspect : 1;
  const side = Math.max(1, Math.round(longSide));
  return ratio >= 1 ? { width: side, height: Math.max(1, Math.round(side / ratio)) } : { width: Math.max(1, Math.round(side * ratio)), height: side };
}

/** File name that keeps the chosen colour readable wherever the picture is listed. */
export function swatchFileName(hex: string, outputType: "image/png" | "image/jpeg"): string {
  return `color-${hex.replace(/^#/, "")}.${outputType === "image/jpeg" ? "jpg" : "png"}`;
}
