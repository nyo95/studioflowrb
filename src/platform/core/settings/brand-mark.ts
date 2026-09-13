import { AppError } from "@platform/core/errors";
import { createPrivateObjectKey, type ObjectStorage } from "@platform/core/storage";

const MAX_BRAND_MARK_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(bytes: Uint8Array): boolean {
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return false;
  let offset = PNG_SIGNATURE.length;
  let sawHeader = false;
  while (offset + 12 <= bytes.length) {
    const length = (bytes[offset] * 2 ** 24) + (bytes[offset + 1] * 2 ** 16) + (bytes[offset + 2] * 2 ** 8) + bytes[offset + 3];
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (end > bytes.length) return false;
    if (!sawHeader && (type !== "IHDR" || length !== 13)) return false;
    if (type === "IHDR") sawHeader = true;
    if (type === "IEND") return sawHeader && length === 0 && end === bytes.length;
    offset = end;
  }
  return false;
}

/** Platform General Settings' server-side PNG policy and upload boundary. */
export async function uploadBrandMarkPng(file: File, storage: ObjectStorage): Promise<string> {
  if (file.size === 0 || file.size > MAX_BRAND_MARK_BYTES) throw new AppError("VALIDATION", "platform.brand-mark.size", "Brand mark must be a PNG up to 2 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPng(bytes)) throw new AppError("VALIDATION", "platform.brand-mark.format", "Brand mark must be a valid PNG file");
  const key = createPrivateObjectKey("brand-marks", "png");
  await storage.put({ key, body: bytes, bytes: bytes.length, contentType: "image/png" });
  return key;
}
