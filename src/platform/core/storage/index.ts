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

export type PutStreamInput = Omit<StoredObject, "bytes"> & {
  /** A web stream so route handlers never need to materialize a whole upload. */
  stream: ReadableStream<Uint8Array>;
  maxBytes: number;
};

/** Domain-neutral private-object boundary. Callers own file policy and keys. */
export interface ObjectStorage {
  put(input: PutObjectInput): Promise<StoredObject>;
  putStream(input: PutStreamInput): Promise<StoredObject>;
  remove(key: string): Promise<void>;
  /**
   * Copies a stored object to a new key, so two owners can each hold an independent object. The source must
   * exist (`storage.object-not-found` otherwise) and the destination must not.
   */
  copy(input: { fromKey: string; toKey: string }): Promise<void>;
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

  async putStream(input: PutStreamInput): Promise<StoredObject> {
    const reader = input.stream.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > input.maxBytes) {
          throw new AppError("VALIDATION", "DELIVERABLE_SIZE", "File exceeds the allowed size.");
        }
        chunks.push(next.value);
      }
      if (bytes === 0) throw new AppError("VALIDATION", "DELIVERABLE_SIZE", "Choose a non-empty file.");
      const body = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      return this.put({ key: input.key, contentType: input.contentType, bytes, body });
    } finally {
      reader.releaseLock();
    }
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async copy(input: { fromKey: string; toKey: string }): Promise<void> {
    const source = this.objects.get(input.fromKey);
    if (!source) throw new AppError("NOT_FOUND", "storage.object-not-found", "The image is unavailable.");
    if (this.objects.has(input.toKey)) throw new AppError("CONFLICT", "storage.object-exists", "The storage destination is already taken.");
    this.objects.set(input.toKey, { ...source, key: input.toKey, body: source.body.slice() });
  }

  async createSignedReadUrl(key: string, expiresInSeconds: number): Promise<string> {
    if (!this.objects.has(key)) throw new AppError("NOT_FOUND", "storage.object-not-found", "The image is unavailable.");
    return `https://storage.invalid/${encodeURIComponent(key)}?expires=${expiresInSeconds}`;
  }
}
