/**
 * Image upload rules shared by StudioFlow modules (MOM photos, schedule
 * option photos). Pure: no storage or framework imports.
 */

/** Accepted content types and the object-key extension each one gets. */
export const STUDIOFLOW_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Magic-byte check so a renamed file cannot pose as an image. */
export function sniffImage(body: Uint8Array, contentType: string): boolean {
  const b = body;
  if (contentType === "image/png") return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (contentType === "image/jpeg") return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (contentType === "image/webp") {
    return b.length > 12 && String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP";
  }
  return false;
}
