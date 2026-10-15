/** Source-pixel crop geometry shared by the image preview, export and gestures. */
export type CropPosition = { zoom: number; panX: number; panY: number };
export type CropInput = CropPosition & { naturalWidth: number; naturalHeight: number; aspect?: number };
export type CropRect = { x: number; y: number; width: number; height: number };
export type CropPoint = { x: number; y: number };
export type CropViewport = { width: number; height: number };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Keep the export formula and operation order: existing zoom/focus values save the same source pixels. */
export function cropRect({ naturalWidth, naturalHeight, aspect, zoom, panX, panY }: CropInput): CropRect {
  let baseWidth = naturalWidth;
  let baseHeight = naturalHeight;
  if (aspect && aspect > 0) {
    if (baseWidth / baseHeight > aspect) baseWidth = baseHeight * aspect;
    else baseHeight = baseWidth / aspect;
  }
  const width = baseWidth / zoom;
  const height = baseHeight / zoom;
  return { x: (naturalWidth - width) * (panX / 100), y: (naturalHeight - height) * (panY / 100), width, height };
}

export function cropPreview(input: CropInput) {
  const rect = cropRect(input);
  return { width: input.naturalWidth / rect.width * 100, height: input.naturalHeight / rect.height * 100, left: -rect.x / rect.width * 100, top: -rect.y / rect.height * 100 };
}

export function panCrop(input: CropInput, viewport: CropViewport, delta: CropPoint): CropPosition {
  const rect = cropRect(input);
  const overflowX = (input.naturalWidth - rect.width) * viewport.width / rect.width;
  const overflowY = (input.naturalHeight - rect.height) * viewport.height / rect.height;
  return { zoom: input.zoom, panX: overflowX > 0 ? clamp(input.panX - delta.x / overflowX * 100, 0, 100) : input.panX, panY: overflowY > 0 ? clamp(input.panY - delta.y / overflowY * 100, 0, 100) : input.panY };
}

/** Keep the old source point at `from` under `to` in the new crop, except where an image edge prevents it. */
export function zoomCrop(input: CropInput, viewport: CropViewport, from: CropPoint, to: CropPoint, requestedZoom: number): CropPosition {
  if (viewport.width <= 0 || viewport.height <= 0) return { zoom: input.zoom, panX: input.panX, panY: input.panY };
  const old = cropRect(input);
  const zoom = clamp(requestedZoom, 1, 3);
  const next = cropRect({ ...input, zoom });
  const x = old.x + from.x / viewport.width * old.width - to.x / viewport.width * next.width;
  const y = old.y + from.y / viewport.height * old.height - to.y / viewport.height * next.height;
  return { zoom, panX: input.naturalWidth > next.width ? clamp(x / (input.naturalWidth - next.width) * 100, 0, 100) : input.panX, panY: input.naturalHeight > next.height ? clamp(y / (input.naturalHeight - next.height) * 100, 0, 100) : input.panY };
}

/** Two points define both zoom and midpoint translation; a coincident pair only pans. */
export function pinchCrop(input: CropInput, viewport: CropViewport, before: readonly [CropPoint, CropPoint], after: readonly [CropPoint, CropPoint]): CropPosition {
  const midpoint = (pair: readonly [CropPoint, CropPoint]) => ({ x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 });
  const distance = (pair: readonly [CropPoint, CropPoint]) => Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
  const previousDistance = distance(before);
  return zoomCrop(input, viewport, midpoint(before), midpoint(after), input.zoom * (previousDistance > 0 ? distance(after) / previousDistance : 1));
}
