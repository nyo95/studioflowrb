import { NextResponse } from "next/server";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { resolveSafePath } from "@platform/infrastructure/storage/filesystem";
import { contentTypeFromKey } from "@platform/infrastructure/storage/content-type";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  try {
    const resolvedParams = await params;
    const key = resolvedParams.key.join("/");
    const storageRoot = process.env.STUDIOFLOW_STORAGE_ROOT || path.join(process.cwd(), ".storage");
    const rootDir = path.resolve(storageRoot, "public-assets");

    const filePath = await resolveSafePath(rootDir, key);

    await stat(filePath);

    return new NextResponse(Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFromKey(key),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
