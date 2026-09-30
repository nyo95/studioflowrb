import fs from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";

import { configuredMinFreeBytes } from "./filesystem";

export type StorageUsage = {
  totalBytes: number;
  freeBytes: number;
  minFreeBytes: number;
  groups: Array<{ prefix: string; files: number; bytes: number }>;
  generatedAt: Date;
  truncated: boolean;
};

const MAX_FILES = 20_000;

/** Local-only observability adapter; it deliberately exposes no app policy. */
export function createStorageUsageReader(rootDir: string, options: { now?: () => Date; maxFiles?: number } = {}) {
  const now = options.now ?? (() => new Date());
  const maxFiles = options.maxFiles ?? MAX_FILES;
  let cached: StorageUsage | null = null;

  return async function readStorageUsage(): Promise<StorageUsage> {
    const current = now();
    if (cached && current.getTime() - cached.generatedAt.getTime() < 60_000) return cached;
    const groups = new Map<string, { files: number; bytes: number }>();
    let visited = 0;
    let truncated = false;
    async function walk(directory: string, group: string): Promise<void> {
      if (truncated) return;
      let entries: Dirent<string>[];
      try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (truncated || entry.isSymbolicLink()) continue;
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) { await walk(target, group); continue; }
        if (!entry.isFile()) continue;
        visited++;
        if (visited > maxFiles) { truncated = true; return; }
        const stat = await fs.stat(target);
        const record = groups.get(group) ?? { files: 0, bytes: 0 };
        record.files++; record.bytes += stat.size; groups.set(group, record);
      }
    }
    const privateDir = path.join(rootDir, "private-assets");
    let privateEntries: Dirent<string>[] = [];
    try { privateEntries = await fs.readdir(privateDir, { withFileTypes: true }); } catch { /* empty/missing root */ }
    for (const entry of privateEntries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) await walk(path.join(privateDir, entry.name), entry.name);
    }
    await walk(path.join(rootDir, "public-assets"), "public-assets");
    const stat = await fs.statfs(rootDir);
    cached = { totalBytes: Number(stat.blocks) * Number(stat.bsize), freeBytes: Number(stat.bavail) * Number(stat.bsize), minFreeBytes: configuredMinFreeBytes(), groups: [...groups.entries()].map(([prefix, value]) => ({ prefix, ...value })).sort((a, b) => a.prefix.localeCompare(b.prefix)), generatedAt: current, truncated };
    return cached;
  };
}
