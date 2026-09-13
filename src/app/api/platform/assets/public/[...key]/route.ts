import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  try {
    const resolvedParams = await params;
    const key = resolvedParams.key.join("/");
    if (!key || key.includes("..") || key.startsWith("/")) {
      return new NextResponse("Not Found", { status: 404 });
    }
    const storageRoot = process.env.STUDIOFLOW_STORAGE_ROOT || path.join(process.cwd(), ".storage");
    const rootDir = path.resolve(storageRoot, "public-assets");
    const filePath = path.resolve(rootDir, key);
    const resolvedRoot = path.resolve(rootDir);

    if (!filePath.startsWith(resolvedRoot + path.sep) && filePath !== resolvedRoot) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const data = await fs.readFile(filePath);
    const ext = path.extname(key).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : "application/octet-stream";

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
