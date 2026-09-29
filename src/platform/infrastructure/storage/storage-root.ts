import fs from "node:fs/promises";
import path from "node:path";

import { AppError } from "@platform/core/errors";

/**
 * Where the local-PC deployment keeps uploaded files.
 *
 * The database holds only opaque keys, so the folder is the only copy of every
 * upload. A wrong value fails quietly: an unset variable silently falls back to
 * `<repo>/.storage`, which a `git clean` or a re-clone on the production PC
 * would wipe, and a relative path resolves against whatever directory the
 * process happened to start in. Production therefore refuses to start unless
 * the folder is explicit, absolute, and outside the checkout.
 */

export type StorageRootEnvironment = { NODE_ENV?: string; STUDIOFLOW_STORAGE_ROOT?: string };

export function resolveStorageRoot(
  environment: StorageRootEnvironment = process.env,
  cwd: string = process.cwd(),
): string {
  return environment.STUDIOFLOW_STORAGE_ROOT?.trim() || path.join(cwd, ".storage");
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Pure configuration check. Returns plain-language problems; empty means acceptable. */
export function storageRootProblems(
  environment: StorageRootEnvironment = process.env,
  cwd: string = process.cwd(),
): string[] {
  const configured = environment.STUDIOFLOW_STORAGE_ROOT?.trim();
  const production = environment.NODE_ENV === "production";
  if (!configured) {
    return production
      ? ["STUDIOFLOW_STORAGE_ROOT is not set; production must name an explicit storage folder."]
      : [];
  }
  if (!path.isAbsolute(configured)) {
    return ["STUDIOFLOW_STORAGE_ROOT must be an absolute path."];
  }
  const resolved = path.resolve(configured);
  if (resolved === path.parse(resolved).root) {
    return ["STUDIOFLOW_STORAGE_ROOT must not be a drive or filesystem root."];
  }
  if (production && isInside(path.resolve(cwd), resolved)) {
    return ["STUDIOFLOW_STORAGE_ROOT must be outside the application folder; a re-clone or clean would erase it."];
  }
  return [];
}

/**
 * Boot check, called from the instrumentation `register()` hook. In production
 * it also proves the folder can actually be written, so a missing drive or a
 * permission problem fails at start instead of on the first upload.
 */
export async function assertStorageRootConfigured(
  environment: StorageRootEnvironment = process.env,
  cwd: string = process.cwd(),
): Promise<void> {
  const problems = storageRootProblems(environment, cwd);
  if (problems.length > 0) {
    throw new AppError("INFRASTRUCTURE", "storage.root-misconfigured", `File storage is misconfigured: ${problems.join(" ")}`);
  }
  if (environment.NODE_ENV !== "production") return;

  const root = resolveStorageRoot(environment, cwd);
  const probe = path.join(root, `.write-probe-${process.pid}`);
  try {
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(probe, "ok");
    await fs.rm(probe, { force: true });
  } catch {
    throw new AppError(
      "INFRASTRUCTURE",
      "storage.root-unwritable",
      "File storage is misconfigured: the storage folder cannot be created or written to.",
    );
  }
}
