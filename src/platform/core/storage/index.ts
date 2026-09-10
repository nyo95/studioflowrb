import { randomUUID } from "node:crypto";

import { AppError } from "@platform/core/errors";

export type StoredObject = {
  key: string;
  contentType: string;
  bytes: number;
};

export type PutObjectInput = StoredObject & {
  body: Uint8Array;
};

/** Domain-neutral private-object boundary. Callers own file policy and keys. */
export interface ObjectStorage {
  put(input: PutObjectInput): Promise<StoredObject>;
  remove(key: string): Promise<void>;
  createSignedReadUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export const MOM_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MOM_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const SAFE_PREFIX = /^[a-z0-9][a-z0-9/_-]{0,120}$/;

export function createPrivateObjectKey(prefix: string, extension: string): string {
  if (!SAFE_PREFIX.test(prefix) || prefix.includes("..") || prefix.endsWith("/")) {
    throw new AppError("INVARIANT", "storage.invalid-prefix", "The storage destination is invalid.");
  }
  const safeExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!safeExtension || safeExtension.length > 5) {
    throw new AppError("VALIDATION", "storage.invalid-extension", "The image file type is not supported.");
  }
  return `${prefix}/${randomUUID()}.${safeExtension}`;
}

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

export class FakeObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, PutObjectInput>();

  async put(input: PutObjectInput): Promise<StoredObject> {
    this.objects.set(input.key, { ...input, body: input.body.slice() });
    return { key: input.key, contentType: input.contentType, bytes: input.bytes };
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async createSignedReadUrl(key: string, expiresInSeconds: number): Promise<string> {
    if (!this.objects.has(key)) throw new AppError("NOT_FOUND", "storage.object-not-found", "The image is unavailable.");
    return `https://storage.invalid/${encodeURIComponent(key)}?expires=${expiresInSeconds}`;
  }
}
