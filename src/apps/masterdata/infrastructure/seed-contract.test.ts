import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  BUSINESS_TYPE_SEEDS,
  PRODUCT_CATEGORY_SEEDS,
  UNIT_SEEDS,
  WORK_CHILD_SEEDS,
  WORK_ROOT_SEEDS,
} from "../../../../prisma/seed-inventory";
import { runSeed } from "../../../../prisma/seed";
import { categorySlug } from "../domain/category-rules";

import {
  closeTestDb,
  createTestDb,
  requireDisposableTestDatabaseUrl,
  truncateAllTables,
  type TestDb,
} from "./test-db";

/**
 * MD-01 seed contract tests.
 *
 * Prove that seeding applies exactly the executable seed inventory, that WORK
 * paths follow the implemented path rules, and that re-seeding is idempotent without
 * overwriting later staff edits.
 */

let db: TestDb;

before(async () => {
  db = await createTestDb(requireDisposableTestDatabaseUrl());
});

after(async () => {
  if (db) await closeTestDb(db);
});

async function unitRowCount(): Promise<number> {
  return db.prisma.unit.count();
}

describe("Master Data MVP seeds", () => {
  it("applies exactly the locked Unit inventory", async () => {
    await truncateAllTables(db);
    await runSeed(db.prisma);

    const units = await db.prisma.unit.findMany({ orderBy: { sort_order: "asc" } });
    assert.equal(units.length, UNIT_SEEDS.length);
    assert.equal(units.length, 24);

    for (const [index, expected] of UNIT_SEEDS.entries()) {
      const actual = units.find((unit) => unit.code === expected.code);
      assert.ok(actual, `missing seeded unit ${expected.code}`);
      assert.equal(actual.label, expected.label);
      assert.deepEqual([...actual.usages].sort(), [...expected.usages].sort());
      assert.equal(actual.sort_order, index, `unexpected sort_order for ${expected.code}`);
      assert.equal(actual.deleted_at, null);
      for (const alias of expected.aliases) {
        assert.ok(actual.aliases.includes(alias), `${expected.code} missing alias ${alias}`);
      }
    }
  });

  it("applies exactly the locked BusinessType inventory", async () => {
    await truncateAllTables(db);
    await runSeed(db.prisma);

    const businessTypes = await db.prisma.businessType.findMany({ orderBy: { sort_order: "asc" } });
    assert.equal(businessTypes.length, BUSINESS_TYPE_SEEDS.length);
    assert.equal(businessTypes.length, 5);
    for (const [index, expected] of BUSINESS_TYPE_SEEDS.entries()) {
      const actual = businessTypes[index]!;
      assert.equal(actual.code, expected.code);
      assert.equal(actual.label, expected.label);
      assert.equal(actual.description, null);
    }
  });

  it("seeds 43 flat PRODUCT categories including locked synonyms", async () => {
    await truncateAllTables(db);
    await runSeed(db.prisma);

    const products = await db.prisma.category.findMany({ where: { kind: "PRODUCT" } });
    assert.equal(products.length, PRODUCT_CATEGORY_SEEDS.length);
    assert.equal(products.length, 43);

    for (const expected of PRODUCT_CATEGORY_SEEDS) {
      const actual = products.find((category) => category.slug === categorySlug(expected.name));
      assert.ok(actual, `missing seeded PRODUCT category ${expected.name}`);
      assert.equal(actual.name, expected.name);
      // Flat for MVP: no parent, no path.
      assert.equal(actual.parent_id, null, `${expected.name} must have parent_id null`);
      assert.equal(actual.path, null, `${expected.name} must have path null`);
      assert.deepEqual([...actual.search_synonyms].sort(), [...expected.search_synonyms].sort());
    }

    // Spot-check merged aliases become synonyms, not new rows.
    const naturalStone = products.find((category) => category.slug === categorySlug("Natural Stone"))!;
    assert.ok(naturalStone, "missing seeded Natural Stone");
    for (const synonym of ["Marble", "Batu Alam", "Travertine"]) {
      assert.ok(naturalStone.search_synonyms.includes(synonym));
    }
    const ceramicTile = products.find((category) => category.slug === categorySlug("Ceramic & Porcelain Tile"))!;
    assert.ok(ceramicTile, "missing seeded Ceramic & Porcelain Tile");
    assert.ok(ceramicTile.search_synonyms.includes("Keramik"));
    const ffe = products.find((category) => category.slug === categorySlug("Furniture & FF&E"))!;
    assert.ok(ffe, "missing seeded Furniture & FF&E");
    assert.ok(ffe.search_synonyms.includes("Custom Furniture"));

    // Broad/noisy legacy labels are review evidence, not seeds.
    for (const banned of ["materials", "finishing", "flooring", "wall-finishing", "accessories"]) {
      assert.equal(
        products.some((category) => category.slug === banned),
        false,
        `broad legacy label ${banned} must not be seeded as a PRODUCT row`,
      );
    }
  });

  it("seeds the locked WORK hierarchy with paths from the locked rules", async () => {
    await truncateAllTables(db);
    await runSeed(db.prisma);

    const workRows = await db.prisma.category.findMany({ where: { kind: "WORK" } });
    assert.equal(workRows.length, WORK_ROOT_SEEDS.length + WORK_CHILD_SEEDS.length);
    assert.equal(workRows.length, 9);

    for (const root of WORK_ROOT_SEEDS) {
      const row = workRows.find((category) => category.slug === categorySlug(root.name));
      assert.ok(row, `missing WORK root ${root.name}`);
      assert.equal(row.parent_id, null, `${root.name} must be a root`);
      assert.equal(row.path, categorySlug(root.name), `${root.name} root path must be its own slug`);
    }

    for (const child of WORK_CHILD_SEEDS) {
      const row = workRows.find((category) => category.slug === categorySlug(child.name));
      assert.ok(row, `missing WORK child ${child.name}`);
      const parent = workRows.find((category) => category.id === row!.parent_id);
      assert.ok(parent, `${child.name} must reference its seeded parent`);
      assert.equal(parent.slug, categorySlug(child.parent));
      assert.equal(row.path, `${categorySlug(child.parent)}/${categorySlug(child.name)}`);
    }

    const lighting = workRows.find((category) => category.slug === "lighting")!;
    assert.equal(lighting.path, "mep/lighting");
    const floorWorks = workRows.find((category) => category.slug === "floor-works")!;
    assert.equal(floorWorks.path, "sipil-struktur/floor-works");
  });

  it("is idempotent: reseeding creates no duplicates and preserves staff edits", async () => {
    await truncateAllTables(db);
    await runSeed(db.prisma);

    const countsAfterFirstRun = {
      units: await unitRowCount(),
      businessTypes: await db.prisma.businessType.count(),
      categories: await db.prisma.category.count(),
    };
    assert.equal(countsAfterFirstRun.units, 24);
    assert.equal(countsAfterFirstRun.businessTypes, 5);
    assert.equal(countsAfterFirstRun.categories, 52);

    // Simulate later staff edits on seeded controlled data.
    const pcs = await db.prisma.unit.findFirstOrThrow({ where: { code: "pcs" } });
    const manufacturer = await db.prisma.businessType.findFirstOrThrow({ where: { code: "MANUFACTURER" } });
    const hpl = await db.prisma.category.findFirstOrThrow({ where: { kind: "PRODUCT", slug: "hpl" } });
    await db.prisma.unit.update({ where: { id: pcs.id }, data: { label: "STAFF EDITED PCS" } });
    await db.prisma.businessType.update({ where: { id: manufacturer.id }, data: { description: "Staff description" } });
    await db.prisma.category.update({ where: { id: hpl.id }, data: { search_synonyms: ["staff alias"] } });

    await runSeed(db.prisma);
    await runSeed(db.prisma);

    assert.equal(await unitRowCount(), 24);
    assert.equal(await db.prisma.businessType.count(), 5);
    assert.equal(await db.prisma.category.count(), 52);

    const pcsAfter = await db.prisma.unit.findFirstOrThrow({ where: { code: "pcs" } });
    assert.equal(pcsAfter.label, "STAFF EDITED PCS");
    const manufacturerAfter = await db.prisma.businessType.findFirstOrThrow({ where: { code: "MANUFACTURER" } });
    assert.equal(manufacturerAfter.description, "Staff description");
    const hplAfter = await db.prisma.category.findFirstOrThrow({ where: { kind: "PRODUCT", slug: "hpl" } });
    assert.deepEqual([...hplAfter.search_synonyms], ["staff alias"]);
  });
});
