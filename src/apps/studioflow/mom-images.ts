import { AppError } from "@platform/core/errors";

export const MOM_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MOM_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

function hasKnownImageSignature(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "image/png") {
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  }
  if (contentType === "image/webp") {
    return bytes.length >= 12 && new TextDecoder("ascii").decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder("ascii").decode(bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

/** StudioFlow MOM's locked image policy; this is not a shared image policy. */
export function validateMomImage(input: { bytes: Uint8Array; contentType: string }): void {
  if (!MOM_IMAGE_TYPES.includes(input.contentType as (typeof MOM_IMAGE_TYPES)[number])) {
    throw new AppError("VALIDATION", "studioflow.mom.image-type", "Use a PNG, JPEG, or WebP image.");
  }
  if (input.bytes.length === 0 || input.bytes.length > MOM_IMAGE_MAX_BYTES) {
    throw new AppError("VALIDATION", "studioflow.mom.image-size", "MOM images must be non-empty and no larger than 10 MB.");
  }
  if (!hasKnownImageSignature(input.bytes, input.contentType)) {
    throw new AppError("VALIDATION", "studioflow.mom.image-signature", "The selected file is not a valid image.");
  }
}
