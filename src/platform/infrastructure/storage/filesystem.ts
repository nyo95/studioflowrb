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

function isSameOrDescendant(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

/**
 * Resolve the deepest existing ancestor through realpath, then append missing
 * segments. This gives existing and future paths the same canonical root on
 * Windows, where a short lexical path and its long realpath may differ.
 */
async function canonicalizePath(target: string): Promise<string> {
  const missingSegments: string[] = [];
  let current = path.resolve(target);

  for (;;) {
    try {
      const realPath = await fs.realpath(current);
      return missingSegments.length === 0 ? realPath : path.join(realPath, ...missingSegments.reverse());
    } catch (error: unknown) {
      if (!(typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT")) {
        throw error;
      }
      const parent = path.dirname(current);
      if (parent === current) return current;
      missingSegments.push(path.basename(current));
      current = parent;
    }
  }
}

export async function resolveSafePath(rootDir: string, key: string): Promise<string> {
  if (!key || key.includes("..") || key.startsWith("/") || key.endsWith("/")) {
    throw new AppError("VALIDATION", "storage.invalid-key", "The storage object reference is invalid.");
  }
  const resolvedRoot = path.resolve(rootDir);
  const targetPath = path.resolve(resolvedRoot, key);

  if (!isSameOrDescendant(resolvedRoot, targetPath)) {
    throw new AppError("VALIDATION", "storage.invalid-key", "The storage object reference is invalid.");
  }

  const [canonicalRoot, canonicalTarget] = await Promise.all([
    canonicalizePath(resolvedRoot),
    canonicalizePath(targetPath),
  ]);
  if (!isSameOrDescendant(canonicalRoot, canonicalTarget)) {
    throw new AppError("VALIDATION", "storage.invalid-key", "The storage object reference is invalid.");
  }

  return targetPath;
}

export function createLocalFilesystemStorage(rootDir: string): ObjectStorage {
  const root = path.resolve(rootDir);
  return {
    async put(input: PutObjectInput): Promise<StoredObject> {
      const filePath = await resolveSafePath(root, input.key);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, Uint8Array.from(input.body));
      return { key: input.key, contentType: input.contentType, bytes: input.bytes };
    },
    async remove(key: string): Promise<void> {
      const filePath = await resolveSafePath(root, key);
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
      const filePath = await resolveSafePath(root, key);
      try {
        await fs.access(filePath);
      } catch {
        throw new AppError("NOT_FOUND", "storage.object-not-found", "The image is unavailable.");
      }
      const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
      const token = crypto.createHmac("sha256", process.env.SESSION_SECRET || "local-storage-secret")
        .update(`${key}:${expiresAt}`)
        .digest("hex");
      return `/api/platform/assets/private?key=${encodeURIComponent(key)}&expires=${expiresAt}&token=${token}`;
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
