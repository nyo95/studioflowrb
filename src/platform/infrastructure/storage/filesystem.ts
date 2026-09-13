import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { AppError } from "@platform/core/errors";
import type { ObjectStorage, PutObjectInput, StoredObject } from "@platform/core/storage";

export type PublicObjectStorage = ObjectStorage & {
  createPublicReadUrl(key: string): string;
};

function encodedKey(key: string): string {
  if (!key || key.includes("..") || key.startsWith("/") || key.endsWith("/")) {
    throw new AppError("VALIDATION", "storage.invalid-key", "The storage object reference is invalid.");
  }
  return key.split("/").map(encodeURIComponent).join("/");
}

function resolveSafePath(rootDir: string, key: string): string {
  if (!key || key.includes("..") || key.startsWith("/") || key.endsWith("/")) {
    throw new AppError("VALIDATION", "storage.invalid-key", "The storage object reference is invalid.");
  }
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(resolvedRoot, key);
  if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
    throw new AppError("VALIDATION", "storage.invalid-key", "The storage object reference is invalid.");
  }
  return resolvedPath;
}

export function createLocalFilesystemStorage(rootDir: string): ObjectStorage {
  const root = path.resolve(rootDir);
  return {
    async put(input: PutObjectInput): Promise<StoredObject> {
      const filePath = resolveSafePath(root, input.key);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, Uint8Array.from(input.body));
      return { key: input.key, contentType: input.contentType, bytes: input.bytes };
    },
    async remove(key: string): Promise<void> {
      const filePath = resolveSafePath(root, key);
      try {
        await fs.unlink(filePath);
      } catch (error: unknown) {
        if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT") {
          return;
        }
        throw new AppError("INFRASTRUCTURE", "storage.provider-unavailable", "Image storage is unavailable. Try again later.");
      }
    },
    async createSignedReadUrl(key: string, expiresInSeconds: number): Promise<string> {
      const filePath = resolveSafePath(root, key);
      try {
        await fs.access(filePath);
      } catch {
        throw new AppError("NOT_FOUND", "storage.object-not-found", "The image is unavailable.");
      }
      const token = crypto.createHmac("sha256", process.env.SESSION_SECRET || "local-storage-secret")
        .update(`${key}:${expiresInSeconds}`)
        .digest("hex");
      return `/api/platform/assets/private?key=${encodeURIComponent(key)}&expires=${expiresInSeconds}&token=${token}`;
    },
  };
}

export function createLocalPublicFilesystemStorage(rootDir: string): PublicObjectStorage {
  const baseStorage = createLocalFilesystemStorage(rootDir);
  return {
    ...baseStorage,
    createPublicReadUrl(key: string): string {
      return `/api/platform/assets/public/${encodedKey(key)}`;
    },
  };
}
