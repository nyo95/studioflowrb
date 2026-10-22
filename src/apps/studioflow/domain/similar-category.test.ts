import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_SCHEDULE_MATERIAL_CATEGORIES, similarScheduleCategories } from "./schedule";

const STUDIO = DEFAULT_SCHEDULE_MATERIAL_CATEGORIES.map(({ category, prefix }) => ({ category, prefix }));
const names = (typed: string) => similarScheduleCategories(typed, STUDIO).map((choice) => `${choice.category} (${choice.prefix})`);

describe("similar schedule categories (WO-SF-CATEGORY-SIMILAR-01)", () => {
  it("suggests the studio category for the spellings seen in the Sociolla import", () => {
    assert.equal(names("HPL/PLASTIC LAMINATE")[0], "High Pressure Laminate (PL)");
    assert.equal(names("Plastic Laminate")[0], "High Pressure Laminate (PL)");
    assert.equal(names("hpl")[0], "High Pressure Laminate (PL)");
    assert.equal(names("HOMOGENEUS TILE")[0], "Homogeneous Tile (HT)");
    assert.equal(names("Solid surfaces")[0], "Solid Surface (SO)");
  });

  it("stays quiet for an exact studio category and for an unrelated new one", () => {
    assert.deepEqual(names("ceramic tile"), []);
    assert.deepEqual(names("  High   Pressure laminate "), []);
    assert.deepEqual(names("Wallpaper"), []);
    assert.deepEqual(names(""), []);
  });

  it("caps the list and lists the strongest first", () => {
    const suggestions = similarScheduleCategories("Tiles", [{ category: "Tile", prefix: "TL" }, { category: "Tiles Mosaic", prefix: "TM" }, { category: "Ceramic Tile", prefix: "CT" }], 2);
    assert.equal(suggestions.length <= 2, true);
    assert.equal(suggestions[0]?.category, "Tile");
  });
});
