import { compressionSteps } from "./image-adjust";

export type ShrinkImageOptions = {
  /** The largest the stored file may be. A file already this small is returned untouched. */
  maxBytes: number;
  /** Longest side, in pixels, of a re-encoded photo. */
  maxDimension?: number;
  /** First JPEG quality tried; later attempts follow `compressionSteps`. */
  quality?: number;
};

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/**
 * Makes a dropped, pasted or picked image fit an upload limit without a crop step: a file that already fits
 * is kept as it is (screenshots stay sharp PNGs); a larger one is re-encoded as JPEG, longest side capped,
 * stepping quality and size down with the same `compressionSteps` as `ImageWorkspace` until it fits.
 * Rejects when even the smallest attempt is too big. Browser only.
 */
export async function shrinkImageFile(file: File, { maxBytes, maxDimension = 2400, quality = 0.86 }: ShrinkImageOptions): Promise<File> {
  if (file.size <= maxBytes) return file;
  const image = await decode(file);
  try {
    const fit = Math.min(1, maxDimension / Math.max(image.width, image.height));
    for (const step of compressionSteps("image/jpeg", quality)) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * fit * step.scale));
      canvas.height = Math.max(1, Math.round(image.height * fit * step.scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image preparation is not supported in this browser.");
      // JPEG has no transparency: a transparent screenshot would otherwise turn black.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Image preparation failed."))), "image/jpeg", step.quality));
      if (blob.size <= maxBytes) return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    }
    throw new Error("This image is too large even after shrinking.");
  } finally {
    image.close();
  }
}
