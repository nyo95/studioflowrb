import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { requirePrincipalGrants } from "@platform/core/auth";
import { resolveSafePath } from "@platform/infrastructure/storage/filesystem";

export async function GET(request: Request) {
  try {
    await requirePrincipalGrants();
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    const token = url.searchParams.get("token");
    const expires = url.searchParams.get("expires");

    if (!key || !token || !expires) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const expiresTime = Number(expires);
    if (!Number.isFinite(expiresTime) || Date.now() > expiresTime * 1000) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const expectedToken = crypto
      .createHmac("sha256", process.env.SESSION_SECRET || "local-storage-secret")
      .update(`${key}:${expires}`)
      .digest("hex");

    if (token !== expectedToken) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const storageRoot = process.env.STUDIOFLOW_STORAGE_ROOT || path.join(process.cwd(), ".storage");
    const rootDir = path.resolve(storageRoot, "private-assets");

    const filePath = await resolveSafePath(rootDir, key);

    const data = await fs.readFile(filePath);
    const ext = path.extname(key).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".webp"
            ? "image/webp"
            : "application/octet-stream";

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }
}
