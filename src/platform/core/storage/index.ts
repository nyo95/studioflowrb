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
