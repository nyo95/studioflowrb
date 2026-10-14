import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPastePreview, guessColumns, parseNumber, resolveUnit, splitClipboard } from "./paste-rows";

const UNITS = ["ls", "m", "m2", "m3", "pcs", "point", "set", "unit"];

describe("BQ paste from a spreadsheet", () => {
  it("reads Indonesian and English number formats and spreadsheet float noise", () => {
    assert.equal(parseNumber("1.250.000"), "1250000");
    assert.equal(parseNumber("1,250,000"), "1250000");
    assert.equal(parseNumber("36,5"), "36.5");
    assert.equal(parseNumber("36.5"), "36.5");
    assert.equal(parseNumber("Rp 275.000"), "275000");
    assert.equal(parseNumber("1.234,56"), "1234.56");
    assert.equal(parseNumber("4079999.9999999995"), "4080000");
    assert.equal(parseNumber("By Owner"), null);
    assert.equal(parseNumber(""), null);
  });

  it("splits tabs and lines, keeps a quoted cell with a line break, drops empty rows", () => {
    assert.deepEqual(splitClipboard('a\tb\r\n\r\n"two\nlines"\tc\n'), [["a", "b"], ["two\nlines", "c"]]);
  });

  it("maps office units to studio units", () => {
    assert.deepEqual(resolveUnit("titik", UNITS), { unit: "point", note: '"titik" dibaca sebagai point' });
    assert.deepEqual(resolveUnit("M2", UNITS), { unit: "m2", note: null });
    assert.equal(resolveUnit("roll", UNITS).note, 'Satuan "roll" belum ada di Master Data');
    assert.equal(resolveUnit("", UNITS).unit, "ls");
  });

  it("reads a contractor BOQ copied with its header, skipping group headings and totals", () => {
    const rows = splitClipboard([
      "NO.\tDESCRIPTION\tVOL\tSAT\tSPECIFICATION\tRATE\tTOTAL RATE",
      "A\tWALL WORK",
      "1\tCover Dinding\t42,3\tm2\tGypsum 9mm\t275.000\t11.632.500",
      "2\tTitik Lampu\t52\ttitik\tKabel NYM\t\t",
      "3\tBar Stool\t8\tunit\tRefer to drawing\tBy Owner\t0",
      "\tSUB TOTAL WALL WORK\t\t\t\t\t11.632.500",
    ].join("\n"));
    const roles = guessColumns(rows, UNITS);
    assert.deepEqual(roles, ["ignore", "name", "qty", "unit", "spec", "price", "ignore"]);
    const preview = buildPastePreview(rows, roles, { withPrices: true, knownUnits: UNITS });
    assert.deepEqual(preview.rows.map((row) => [row.item.name, row.item.qty, row.item.unit, row.item.specification, row.item.hargaSnapshot, row.item.priceMode]), [
      ["Cover Dinding", "42.3", "m2", "Gypsum 9mm", "275000", "PRICED"],
      ["Titik Lampu", "52", "point", "Kabel NYM", null, "TBC"],
      ["Bar Stool", "8", "unit", "Refer to drawing", null, "BY_OWNER"],
    ]);
    assert.equal(preview.skipped, 2, "the group heading and the subtotal");
    assert.deepEqual(preview.rows[1]!.notes, ['"titik" dibaca sebagai point', "Harga kosong → TBC"]);
  });

  it("guesses the columns of rows copied without a header, and can leave prices for later", () => {
    const rows = splitClipboard([
      "1\tCover Kolom\t6,24\tm2\tBacking multiplek\t780000\t4867200",
      "2\tPartisi 2 muka\t24,9\tm2\tGypsum 9mm\t550000\t13695000",
    ].join("\n"));
    const roles = guessColumns(rows, UNITS);
    assert.deepEqual(roles, ["ignore", "name", "qty", "unit", "spec", "price", "ignore"]);
    const later = buildPastePreview(rows, roles, { withPrices: false, knownUnits: UNITS });
    assert.deepEqual(later.rows.map((row) => [row.item.priceMode, row.item.hargaSnapshot]), [["TBC", null], ["TBC", null]]);
    assert.deepEqual(buildPastePreview(rows, ["ignore", "ignore", "qty", "unit", "spec", "price", "ignore"], { withPrices: true, knownUnits: UNITS }).problems, ["Pilih kolom mana yang berisi Uraian."]);
  });
});
