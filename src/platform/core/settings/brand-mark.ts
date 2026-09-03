import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { AppError } from "@platform/core/errors";

const MAX_BRAND_MARK_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export async function saveBrandMarkPng(file: File): Promise<string> {
  if (file.size === 0 || file.size > MAX_BRAND_MARK_BYTES) throw new AppError("VALIDATION", "platform.brand-mark.size", "Brand mark must be a PNG up to 2 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) throw new AppError("VALIDATION", "platform.brand-mark.format", "Brand mark must be a valid PNG file");
  const directory = join(process.cwd(), "public", "uploads", "brand-marks");
  await mkdir(directory, { recursive: true });
  const filename = `${randomUUID()}.png`;
  await writeFile(join(directory, filename), bytes, { flag: "wx" });
  return `/uploads/brand-marks/${filename}`;
}
