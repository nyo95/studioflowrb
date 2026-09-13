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

export async function resolveSafePath(rootDir: string, key: string): Promise<string> {
  if (!key || key.includes("..") || key.startsWith("/") || key.endsWith("/")) {
    throw new AppError("VALIDATION", "storage.invalid-key", "The storage object reference is invalid.");
  }
  const resolvedRoot = path.resolve(rootDir);
  const targetPath = path.resolve(resolvedRoot, key);

  const normRoot = path.resolve(resolvedRoot).toLowerCase();
  const normTarget = path.resolve(targetPath).toLowerCase();
  if (!normTarget.startsWith(normRoot + path.sep.toLowerCase()) && normTarget !== normRoot) {
    throw new AppError("VALIDATION", "storage.invalid-key", "The storage object reference is invalid.");
  }

  // Check every segment from root down to targetPath using realpath (covers Windows junctions & symlinks)
  let currentPath = resolvedRoot;
  const relative = path.relative(resolvedRoot, targetPath);
  const segments = relative ? relative.split(path.sep) : [];

  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    try {
      const realSegment = await fs.realpath(currentPath);
      const normReal = path.resolve(realSegment).toLowerCase();
      if (!normReal.startsWith(normRoot + path.sep.toLowerCase()) && normReal !== normRoot) {
        throw new AppError("VALIDATION", "storage.invalid-key", "The storage object reference is invalid.");
      }
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "ENOENT") {
        break;
      }
      if (err instanceof AppError) throw err;
    }
  }

  // Final realpath verification if target exists
  try {
    const realRoot = await fs.realpath(resolvedRoot);
    const realPath = await fs.realpath(targetPath);
    const normRealRoot = path.resolve(realRoot).toLowerCase();
    const normRealPath = path.resolve(realPath).toLowerCase();
    if (!normRealPath.startsWith(normRealRoot + path.sep.toLowerCase()) && normRealPath !== normRealRoot) {
      throw new AppError("VALIDATION", "storage.invalid-key", "The storage object reference is invalid.");
    }
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
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
