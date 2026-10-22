import { crc32, deflateSync } from "node:zlib";

/** `#RRGGBB`, the only colour form the Schedule accepts for a colour placeholder. */
export const SCHEDULE_COLOR_HEX = /^#[0-9a-fA-F]{6}$/;

/** A colour placeholder has the Schedule card's photo shape (4:5). */
const WIDTH = 400;
const HEIGHT = 500;

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * A solid-colour PNG drawn on the server (WO-SCHEDULE-ASSISTANT-04), the counterpart of the screen's colour swatch:
 * stored as an ordinary option photo so print, presentation and copies carry it unchanged. No image library needed.
 */
export function solidColorPng(hex: string): { body: Uint8Array; contentType: "image/png"; fileName: string } {
  if (!SCHEDULE_COLOR_HEX.test(hex)) throw new Error("Colour must be #RRGGBB.");
  const rgb = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  const row = Buffer.alloc(1 + WIDTH * 3);
  for (let x = 0; x < WIDTH; x++) row.set(rgb, 1 + x * 3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no interlace
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: HEIGHT }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return { body: new Uint8Array(png), contentType: "image/png", fileName: `color-${hex.slice(1).toLowerCase()}.png` };
}
