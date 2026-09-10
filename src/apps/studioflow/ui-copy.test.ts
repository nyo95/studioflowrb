import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import test from "node:test";

const routeRoot = resolve("src/app/(platform)/studioflow");
const servicePath = resolve("src/apps/studioflow/service.ts");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) && !entry.name.endsWith(".test.ts")
      ? [path]
      : [];
  });
}

test("StudioFlow user copy does not regress to the corrected Indonesian phrases", () => {
  const source = [...sourceFiles(routeRoot), servicePath]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  const correctedPhrases = [
    "Alasan batal",
    "Alasan tarik",
    "Buka",
    "Catat jawaban ronde sebelumnya",
    "Contoh hasil",
    "Format email tidak valid",
    "Hanya round terkirim",
    "Konteks tambahan",
    "Minta revisi",
    "Nama file wajib diisi",
    "Poin baru",
    "Poin revisi",
    "Response revisi butuh",
    "Setujui",
    "StudioFlow menyimpan metadata",
    "Tambah poin",
    "Tandai diganti",
    "Tarik",
    "Tulis alasan",
    "Ukuran file tidak valid",
  ];

  for (const phrase of correctedPhrases) {
    assert.equal(source.includes(phrase), false, `found corrected user copy: ${phrase}`);
  }
});
