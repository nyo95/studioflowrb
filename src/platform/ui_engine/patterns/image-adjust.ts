/** Pure helpers for the ImageWorkspace colour tweak and size compression; no DOM, so they are unit-tested directly. */

export type ColorAdjust = { hue: number; saturation: number; brightness: number };

export const NEUTRAL_ADJUST: ColorAdjust = { hue: 0, saturation: 100, brightness: 100 };

/** Deliberately narrow ranges: these are touch-ups, not a photo editor. */
export const ADJUST_LIMITS = {
  hue: { min: -30, max: 30, step: 1, unit: "°" },
  saturation: { min: 70, max: 130, step: 1, unit: "%" },
  brightness: { min: 80, max: 120, step: 1, unit: "%" },
} as const;

export function isNeutral(adjust: ColorAdjust): boolean {
  return adjust.hue === NEUTRAL_ADJUST.hue && adjust.saturation === NEUTRAL_ADJUST.saturation && adjust.brightness === NEUTRAL_ADJUST.brightness;
}

/** A CSS / canvas `filter` value; `none` when nothing was changed so untouched images are byte-for-byte unaffected. */
export function colorFilter(adjust: ColorAdjust): string {
  if (isNeutral(adjust)) return "none";
  return `hue-rotate(${adjust.hue}deg) saturate(${adjust.saturation}%) brightness(${adjust.brightness}%)`;
}

export type CompressionStep = { scale: number; quality: number };

/**
 * The attempts made, in order, until the encoded image fits the target. The first attempt is exactly the
 * caller's own settings, so an image that already fits is encoded once, as before. Later attempts lower the
 * JPEG quality first (barely visible), then shrink the pixels a little.
 */
export function compressionSteps(outputType: "image/png" | "image/jpeg", quality: number): CompressionStep[] {
  const steps: CompressionStep[] = [{ scale: 1, quality }];
  if (outputType === "image/jpeg") {
    for (const lower of [0.78, 0.7, 0.62]) if (lower < quality) steps.push({ scale: 1, quality: lower });
    const floor = Math.min(quality, 0.7);
    for (const scale of [0.85, 0.72, 0.6, 0.5]) steps.push({ scale, quality: floor });
  } else {
    for (const scale of [0.85, 0.72, 0.6, 0.5]) steps.push({ scale, quality });
  }
  return steps;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
