import { NextResponse } from "next/server";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { requirePrincipalGrants } from "@platform/core/auth";
import { verifyAssetRead } from "@platform/infrastructure/storage/asset-signing";
import { resolveSafePath } from "@platform/infrastructure/storage/filesystem";
import { contentTypeFromKey } from "@platform/infrastructure/storage/content-type";

export async function GET(request: Request) {
  try {
    await requirePrincipalGrants();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
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

    if (!verifyAssetRead(key, expiresTime, token)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const storageRoot = process.env.STUDIOFLOW_STORAGE_ROOT || path.join(process.cwd(), ".storage");
    const rootDir = path.resolve(storageRoot, "private-assets");

    const filePath = await resolveSafePath(rootDir, key);
    await stat(filePath);

    return new NextResponse(Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFromKey(key),
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
