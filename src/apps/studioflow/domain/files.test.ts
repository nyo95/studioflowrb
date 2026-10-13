import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WORKSPACE_FILE_TYPES, fileExtension, sniffWorkspaceFile } from "./files";

describe("Workspace file elements", () => {
  it("reads the extension from the name, case-insensitively", () => {
    assert.equal(fileExtension("DED Dapur R2.PDF"), "pdf");
    assert.equal(fileExtension("archive.tar.zip"), "zip");
    assert.equal(fileExtension("no-extension"), null);
    assert.equal(fileExtension("trailing."), null);
  });

  it("checks the bytes against each signature and refuses unknown types", () => {
    assert.ok(sniffWorkspaceFile(new Uint8Array([0x25, 0x50, 0x44, 0x46, 1]), "pdf"));
    assert.ok(!sniffWorkspaceFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "pdf"));
    assert.ok(sniffWorkspaceFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "docx"));
    assert.ok(!sniffWorkspaceFile(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "xlsx"));
    assert.ok(sniffWorkspaceFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]), "xls"));
    assert.ok(sniffWorkspaceFile(new Uint8Array([0x41, 0x43, 0x31, 0x30, 0x33, 0x32]), "dwg"));
    assert.ok(sniffWorkspaceFile(new TextEncoder().encode("0\nSECTION\n"), "dxf"));
    assert.ok(!sniffWorkspaceFile(new Uint8Array([0x61, 0x00]), "csv"));
    assert.ok(sniffWorkspaceFile(new Uint8Array([1, 2, 3]), "skp"), "a format without a signature passes on its extension");
    assert.ok(!sniffWorkspaceFile(new Uint8Array([0x4d, 0x5a]), "exe"));
    assert.equal(WORKSPACE_FILE_TYPES.exe, undefined);
  });
});
