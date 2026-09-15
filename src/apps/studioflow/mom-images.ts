import { AppError } from "@platform/core/errors";

/** MOM images must be non-empty and no larger than 10 MB (archived rebuild limit). */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, true> = {
  "image/jpeg": true,
  "image/png": true,
  "image/webp": true,
};

export function validateMomImage({ bytes, contentType }: { bytes: Uint8Array; contentType: string }): void {
  if (bytes.byteLength === 0) {
    throw new AppError("VALIDATION", "MOM_IMAGE_EMPTY", "Image file is empty.");
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new AppError("VALIDATION", "MOM_IMAGE_TOO_LARGE", "Image must be no larger than 10 MB.");
  }
  if (!ALLOWED_TYPES[contentType]) {
    throw new AppError("VALIDATION", "MOM_IMAGE_TYPE", "Only JPEG, PNG, and WebP images are accepted.");
  }
}
