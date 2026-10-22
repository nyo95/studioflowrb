// @ts-check
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

/**
 * Packs `src/` into `dist/BerkahStudio_<version>.rbz` (a plain zip, forward-slash entry names, which SketchUp's
 * Extension Manager requires). No dependency: Node ≥ 22 has zlib.crc32. The version is read from the loader.
 */

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src");
const version = /VERSION = '([\d.]+)'/.exec(readFileSync(join(SRC, "berkahstudio.rb"), "utf8"))?.[1];
if (!version) throw new Error("VERSION not found in src/berkahstudio.rb");

/** @param {string} dir @returns {string[]} */
function files(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1; // 1980-01-01, so the same source always gives the same archive
const locals = [];
const centrals = [];
let offset = 0;
for (const path of files(SRC)) {
  const name = Buffer.from(relative(SRC, path).split(sep).join("/"), "utf8");
  const data = readFileSync(path);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  locals.push(local, name, packed);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);
  offset += local.length + name.length + packed.length;
}
const directory = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(centrals.length / 2, 8);
end.writeUInt16LE(centrals.length / 2, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);

const out = join(ROOT, "dist", `BerkahStudio_${version}.rbz`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([...locals, directory, end]));
console.log(`${relative(process.cwd(), out)} (${centrals.length / 2} files)`);
