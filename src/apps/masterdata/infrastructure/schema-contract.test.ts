import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";

import {
  closeTestDb,
  createTestDb,
  requireDisposableTestDatabaseUrl,
  truncateAllTables,
  type TestDb,
} from "./test-db";

/**
 * MD-01 schema contract tests.
 *
 * Prove that the currently implemented persisted Master Data shape exists and
 * that every declared race-safe database constraint rejects its negative
 * fixture: live/partial uniqueness, cardinality, enum vocabularies, FK
 * behavior, and the absence of forbidden legacy fields/relations.
 */

let db: TestDb;

before(async () => {
  db = await createTestDb(requireDisposableTestDatabaseUrl());
});

after(async () => {
  if (db) await closeTestDb(db);
});

afterEach(async () => {
  if (db) await truncateAllTables(db);
});

async function expectConstraintViolation(
  operation: () => Promise<unknown>,
  expectedCode: string,
  description: string,
): Promise<void> {
  let violation: unknown;
  try {
    await operation();
  } catch (error) {
    violation = error;
  }
  if (!violation) {
    assert.fail(`expected the operation to violate a ${description} constraint`);
  }
  const code = (violation as { code?: string }).code;
  assert.equal(code, expectedCode, `expected ${description}-violation ${expectedCode}, got ${JSON.stringify(violation)}`);
}

async function expectUniqueViolation(operation: () => Promise<unknown>): Promise<void> {
  await expectConstraintViolation(operation, "P2002", "unique");
}

async function expectForeignKeyViolation(operation: () => Promise<unknown>): Promise<void> {
  await expectConstraintViolation(operation, "P2003", "foreign key");
}

// ── Fixture helpers ───────────────────────────────────────────────────────

function createUnit(code: string) {
  return db.prisma.unit.create({ data: { code, label: code } });
}

function createBusinessType(code: string) {
  return db.prisma.businessType.create({ data: { code, label: code } });
}

function createParty(name: string, slug = name.toLowerCase()) {
  return db.prisma.party.create({
    data: { name, slug, type: "ORGANIZATION", roles: { create: { role: "MATERIAL_SUPPLIER" } } },
  });
}

let brandFixtureCounter = 0;

function createBrand(name: string, owner_party_id?: string) {
  brandFixtureCounter += 1;
  const categorySlugSuffix = `${brandFixtureCounter}`;
  return db.prisma.brand.create({
    data: {
      name,
      slug: name.toLowerCase(),
      owner_party_id,
      categories: {
        create: [{
          category: {
            create: {
              kind: "PRODUCT",
              name: `${name} category ${categorySlugSuffix}`,
              slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-category-${categorySlugSuffix}`,
            },
          },
        }],
      },
    },
    include: { categories: true },
  });
}

type CategoryInput = {
  kind: "PRODUCT" | "WORK";
  name: string;
  parent_id?: string | null;
  path?: string | null;
};

function createCategory(input: CategoryInput) {
  return db.prisma.category.create({
    data: {
      kind: input.kind,
      name: input.name,
      slug: input.name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
      parent_id: input.parent_id ?? null,
      path: input.path ?? null,
    },
  });
}

type SkuInput = {
  slug: string;
  brand_id?: string | null;
  code?: string | null;
};

function createSku(input: SkuInput) {
  return db.prisma.sku.create({
    data: {
      name: input.slug,
      slug: input.slug,
      code: input.code ?? null,
      brand_id: input.brand_id ?? null,
      kind: "MATERIAL",
      base_unit_id: unitId!,
    },
  });
}

let unitId: string;
let productCategoryId: string;
let workCategoryId: string;

// Because afterEach truncates all tables, every test creates the base rows it
// needs via this helper.
async function resetAndSeedBaseRows(): Promise<void> {
  await truncateAllTables(db);
  const unit = await createUnit("pcs");
  unitId = unit.id;
  productCategoryId = (await createCategory({ kind: "PRODUCT", name: "Plywood" })).id;
  workCategoryId = (await createCategory({ kind: "WORK", name: "Finishing" })).id;
}

// ── Controlled dictionaries ───────────────────────────────────────────────

describe("Unit/BusinessType controlled dictionaries", () => {
  it("rejects a duplicate Unit code among live rows", async () => {
    await resetAndSeedBaseRows();
    await expectUniqueViolation(() => createUnit("pcs"));
  });

  it("keeps Unit codes unique across soft-deleted rows", async () => {
    await resetAndSeedBaseRows();
    await db.prisma.unit.update({ where: { id: unitId }, data: { deleted_at: new Date() } });
    await expectUniqueViolation(() => createUnit("pcs"));
  });

  it("rejects a duplicate BusinessType code among live rows", async () => {
    await resetAndSeedBaseRows();
    await createBusinessType("MANUFACTURER");
    await expectUniqueViolation(() => createBusinessType("manufacturer".toUpperCase()));
  });

  it("keeps BusinessType codes unique across soft-deleted rows", async () => {
    await resetAndSeedBaseRows();
    const row = await createBusinessType("RETAILER");
    await db.prisma.businessType.update({ where: { id: row.id }, data: { deleted_at: new Date() } });
    await expectUniqueViolation(() => createBusinessType("RETAILER"));
  });
});

// ── Party live identity ───────────────────────────────────────────────────

describe("Party live identity", () => {
  it("rejects a duplicate lower(name) among live parties case-insensitively", async () => {
    await resetAndSeedBaseRows();
    await createParty("PT Alpha");
    await expectUniqueViolation(() => createParty("pt alpha", "pt-alpha-two"));
  });

  it("rejects a duplicate slug among live parties", async () => {
    await resetAndSeedBaseRows();
    await createParty("PT Beta");
    await expectUniqueViolation(() => createParty("PT Beta Two", "pt beta".toLowerCase()));
  });

  it("releases name and slug for reuse after soft deletion", async () => {
    await resetAndSeedBaseRows();
    const party = await createParty("PT Gamma");
    await db.prisma.party.update({ where: { id: party.id }, data: { deleted_at: new Date() } });
    const reused = await createParty("PT Gamma");
    assert.notEqual(reused.id, party.id);
  });

  it("fails restoring into a live identity taken by another row", async () => {
    await resetAndSeedBaseRows();
    const party = await createParty("PT Delta");
    await db.prisma.party.update({ where: { id: party.id }, data: { deleted_at: new Date() } });
    await createParty("PT Delta", "pt-delta-old");
    await expectUniqueViolation(() =>
      db.prisma.party.update({ where: { id: party.id }, data: { deleted_at: null } }),
    );
  });
});

// ── Party children ────────────────────────────────────────────────────────

describe("Party children uniqueness", () => {
  it("rejects duplicate (party_id, role)", async () => {
    await resetAndSeedBaseRows();
    const party = await createParty("PT Epsilon");
    await expectUniqueViolation(() =>
      db.prisma.partyRole.create({ data: { party_id: party.id, role: "MATERIAL_SUPPLIER" } }),
    );
  });

  it("allows two different operational roles for one party", async () => {
    await resetAndSeedBaseRows();
    const party = await createParty("PT Zeta");
    const second = await db.prisma.partyRole.create({ data: { party_id: party.id, role: "WORK_VENDOR" } });
    assert.ok(second.id);
  });

  it("rejects duplicate (party_id, business_type_id)", async () => {
    await resetAndSeedBaseRows();
    const party = await createParty("PT Eta");
    const businessType = await createBusinessType("DISTRIBUTOR");
    await db.prisma.partyBusinessType.create({ data: { party_id: party.id, business_type_id: businessType.id } });
    await expectUniqueViolation(() =>
      db.prisma.partyBusinessType.create({ data: { party_id: party.id, business_type_id: businessType.id } }),
    );
  });

  it("rejects duplicate (party_id, url) links while allowing the same url on another party", async () => {
    await resetAndSeedBaseRows();
    const partyA = await createParty("PT Theta A");
    const partyB = await createParty("PT Theta B");
    await db.prisma.partyLink.create({ data: { party_id: partyA.id, kind: "WEBSITE", url: "https://example.com" } });
    await expectUniqueViolation(() =>
      db.prisma.partyLink.create({ data: { party_id: partyA.id, kind: "INSTAGRAM", url: "https://example.com" } }),
    );
    const other = await db.prisma.partyLink.create({ data: { party_id: partyB.id, kind: "WEBSITE", url: "https://example.com" } });
    assert.ok(other.id);
  });
});

// ── Brand ─────────────────────────────────────────────────────────────────

describe("Brand live identity and relations", () => {
  it("rejects duplicate lower(name) and slug among live brands", async () => {
    await resetAndSeedBaseRows();
    await createBrand("Alpha Brand");
    await expectUniqueViolation(() => createBrand("alpha brand"));
    await expectUniqueViolation(() => db.prisma.brand.create({ data: { name: "Other Brand", slug: "alpha brand" } }));
  });

  it("releases identity after soft deletion and blocks restore into a taken identity", async () => {
    await resetAndSeedBaseRows();
    const brand = await createBrand("Beta Brand");
    await db.prisma.brand.update({ where: { id: brand.id }, data: { deleted_at: new Date() } });
    const replacement = await createBrand("Beta Brand");
    await expectUniqueViolation(() =>
      db.prisma.brand.update({ where: { id: brand.id }, data: { deleted_at: null } }),
    );
    assert.ok(replacement.id);
  });

  it("rejects duplicate (brand_id, url), (brand_id, party_id), and (brand_id, category_id)", async () => {
    await resetAndSeedBaseRows();
    const brand = await createBrand("Gamma Brand");
    const supplier = await createParty("PT Iota");
    await db.prisma.brandLink.create({ data: { brand_id: brand.id, kind: "WEBSITE", url: "https://brand.example.com" } });
    await db.prisma.brandSupplier.create({ data: { brand_id: brand.id, party_id: supplier.id } });

    await expectUniqueViolation(() =>
      db.prisma.brandLink.create({ data: { brand_id: brand.id, kind: "CATALOG", url: "https://brand.example.com" } }),
    );
    await expectUniqueViolation(() =>
      db.prisma.brandSupplier.create({ data: { brand_id: brand.id, party_id: supplier.id } }),
    );
    await expectUniqueViolation(() =>
      db.prisma.brandCategory.create({ data: { brand_id: brand.id, category_id: brand.categories[0]!.category_id } }),
    );
  });
});

// ── Category ──────────────────────────────────────────────────────────────

describe("Category partial uniqueness", () => {
  it("enforces (kind, slug) uniqueness only among live rows", async () => {
    await resetAndSeedBaseRows();
    await expectUniqueViolation(() => createCategory({ kind: "PRODUCT", name: "Plywood" }));

    const row = await db.prisma.category.findFirstOrThrow({ where: { kind: "PRODUCT", slug: "plywood" } });
    await db.prisma.category.update({ where: { id: row.id }, data: { deleted_at: new Date() } });
    const recreated = await createCategory({ kind: "PRODUCT", name: "Plywood" });
    assert.ok(recreated.id);
  });

  it("allows the same slug under different kinds", async () => {
    await resetAndSeedBaseRows();
    const workSameSlug = await createCategory({ kind: "WORK", name: "Plywood" });
    assert.ok(workSameSlug.id);
  });
});

// ── SKU identity ──────────────────────────────────────────────────────────

describe("SKU slug and code uniqueness", () => {
  it("scopes branded slugs per brand and allows the same slug unbranded", async () => {
    await resetAndSeedBaseRows();
    const brandA = await createBrand("Brand A");
    const brandB = await createBrand("Brand B");

    const brandedA = await createSku({ slug: "panel-18mm", brand_id: brandA.id });
    const brandedB = await createSku({ slug: "panel-18mm", brand_id: brandB.id });
    const unbranded = await createSku({ slug: "panel-18mm" });
    assert.ok(brandedA.id && brandedB.id && unbranded.id);

    await expectUniqueViolation(() => createSku({ slug: "Panel-18MM", brand_id: brandA.id }));
    await expectUniqueViolation(() => createSku({ slug: "panel-18mm" }));
  });

  it("releases a branded slug on soft delete and blocks restore into a taken slug", async () => {
    await resetAndSeedBaseRows();
    const brandA = await createBrand("Brand A");
    const sku = await createSku({ slug: "dup-slug", brand_id: brandA.id });
    await db.prisma.sku.update({ where: { id: sku.id }, data: { deleted_at: new Date() } });

    const replacement = await createSku({ slug: "dup-slug", brand_id: brandA.id });
    assert.ok(replacement.id);
    await expectUniqueViolation(() =>
      db.prisma.sku.update({ where: { id: sku.id }, data: { deleted_at: null } }),
    );
  });

  it("enforces non-null live SKU codes case-insensitively within a brand only", async () => {
    await resetAndSeedBaseRows();
    const brandA = await createBrand("Brand A");
    const brandB = await createBrand("Brand B");

    const coded = await createSku({ slug: "coded-a", brand_id: brandA.id, code: "AB-14094" });
    assert.ok(coded.id);

    await expectUniqueViolation(() => createSku({ slug: "coded-b", brand_id: brandA.id, code: "ab-14094" }));

    const sameCodeOtherBrand = await createSku({ slug: "coded-c", brand_id: brandB.id, code: "AB-14094" });
    const sameCodeUnbranded = await createSku({ slug: "coded-d", code: "AB-14094" });
    assert.ok(sameCodeOtherBrand.id && sameCodeUnbranded.id);

    await expectUniqueViolation(() => createSku({ slug: "coded-e", code: "ab-14094" }));
  });
});

describe("SkuMedia uniqueness", () => {
  it("rejects duplicate (sku_id, url)", async () => {
    await resetAndSeedBaseRows();
    const sku = await createSku({ slug: "media-sku" });
    await db.prisma.skuMedia.create({ data: { sku_id: sku.id, kind: "IMAGE", url: "https://img.example.com/1.png" } });
    await expectUniqueViolation(() =>
      db.prisma.skuMedia.create({ data: { sku_id: sku.id, kind: "THUMBNAIL", url: "https://img.example.com/1.png" } }),
    );
  });
});

// ── Pricing cardinality ───────────────────────────────────────────────────

describe("Supplier pair pricing cardinality", () => {
  it("allows several current supplier prices per SKU including a deterministic NULL-supplier pair", async () => {
    await resetAndSeedBaseRows();
    const sku = await createSku({ slug: "priced-sku" });
    const supplierA = await createParty("PT Alpha");
    const supplierB = await createParty("PT Beta");
    const nullPrice = await db.prisma.skuPrice.create({
      data: { sku_id: sku.id, amount: "0", currency: "IDR", unit_id: unitId, updated_by_label: "staff" },
    });
    const priceA = await db.prisma.skuPrice.create({
      data: { sku_id: sku.id, supplier_party_id: supplierA.id, amount: "125000.00", currency: "IDR", unit_id: unitId, updated_by_label: "staff" },
    });
    const priceB = await db.prisma.skuPrice.create({
      data: { sku_id: sku.id, supplier_party_id: supplierB.id, amount: "99000.00", currency: "IDR", unit_id: unitId, updated_by_label: "staff" },
    });
    assert.notEqual(nullPrice.id, priceA.id);
    assert.notEqual(priceA.id, priceB.id);
    assert.equal(await db.prisma.skuPrice.count({ where: { sku_id: sku.id } }), 3);
  });

  it("enforces one row per SKU x supplier pair, including the NULL-supplier partition", async () => {
    await resetAndSeedBaseRows();
    const sku = await createSku({ slug: "pair-uniq-sku" });
    const supplier = await createParty("PT Gamma");
    await db.prisma.skuPrice.create({
      data: { sku_id: sku.id, supplier_party_id: supplier.id, amount: "125000.00", currency: "IDR", unit_id: unitId, updated_by_label: "staff" },
    });
    await expectUniqueViolation(() =>
      db.prisma.skuPrice.create({
        data: { sku_id: sku.id, supplier_party_id: supplier.id, amount: "99000.00", currency: "IDR", unit_id: unitId, updated_by_label: "staff" },
      }),
    );
    await db.prisma.skuPrice.create({
      data: { sku_id: sku.id, amount: "1", currency: "IDR", unit_id: unitId, updated_by_label: "staff" },
    });
    await expectUniqueViolation(() =>
      db.prisma.skuPrice.create({
        data: { sku_id: sku.id, amount: "2", currency: "IDR", unit_id: unitId, updated_by_label: "staff" },
      }),
    );
  });

  it("keeps WorkPrice codes case-insensitively unique among live rows and reusable after deletion", async () => {
    await resetAndSeedBaseRows();
    const work = await db.prisma.workPrice.create({
      data: {
        code: "FIN-DUCO-01",
        name: "Duco finishing rate",
        category_id: workCategoryId,
        unit_id: unitId,
        amount: "150000.00",
        kind: "LABOR_ONLY",
        currency: "IDR",
        updated_by_label: "staff",
      },
    });
    assert.ok(work.id);

    await expectUniqueViolation(() =>
      db.prisma.workPrice.create({
        data: {
          code: "fin-duco-01",
          name: "Duplicate live code",
          category_id: workCategoryId,
          unit_id: unitId,
          amount: "100000.00",
          kind: "LABOR_ONLY",
          currency: "IDR",
          updated_by_label: "staff",
        },
      }),
    );

    await db.prisma.workPrice.update({ where: { id: work.id }, data: { deleted_at: new Date() } });
    const replacement = await db.prisma.workPrice.create({
      data: {
        code: "fin-duco-01",
        name: "Replacement row",
        category_id: workCategoryId,
        unit_id: unitId,
        amount: "175000.00",
        kind: "LABOR_ONLY",
        currency: "IDR",
        updated_by_label: "staff",
      },
    });
    assert.ok(replacement.id);
  });
});

// ── Referential behavior ──────────────────────────────────────────────────

describe("Referential integrity", () => {
  it("blocks hard-deleting referenced dictionary and classification rows", async () => {
    await resetAndSeedBaseRows();
    const sku = await createSku({ slug: "referencing-sku" });
    await db.prisma.sku.update({ where: { id: sku.id }, data: { category_id: productCategoryId } });
    await expectForeignKeyViolation(() => db.prisma.unit.delete({ where: { id: unitId } }));
    await expectForeignKeyViolation(() => db.prisma.category.delete({ where: { id: productCategoryId } }));

    const workPrice = await db.prisma.workPrice.create({
      data: {
        code: "REF-01",
        name: "Referenced category",
        category_id: workCategoryId,
        unit_id: unitId,
        amount: "50000.00",
        kind: "LABOR_ONLY",
        currency: "IDR",
        updated_by_label: "staff",
      },
    });
    assert.ok(workPrice.id);
    await expectForeignKeyViolation(() => db.prisma.category.delete({ where: { id: workCategoryId } }));
  });

  it("nulls optional provenance references when their target is hard-deleted", async () => {
    await resetAndSeedBaseRows();
    const supplier = await createParty("PT Kappa");
    const brand = await createBrand("Delta Brand");
    const link = await db.prisma.brandLink.create({ data: { brand_id: brand.id, kind: "PRICE_LIST", url: "https://price.example.com" } });
    const sku = await createSku({ slug: "provenance-sku", brand_id: brand.id });
    const price = await db.prisma.skuPrice.create({
      data: {
        sku_id: sku.id,
        supplier_party_id: supplier.id,
        source_link_id: link.id,
        amount: "80000.00",
        currency: "IDR",
        unit_id: unitId,
        updated_by_label: "staff",
      },
    });

    await db.prisma.party.delete({ where: { id: supplier.id } });
    await db.prisma.brandLink.delete({ where: { id: link.id } });

    const after = await db.prisma.skuPrice.findUniqueOrThrow({ where: { id: price.id } });
    assert.equal(after.supplier_party_id, null);
    assert.equal(after.source_link_id, null);
  });
});

// ── Persisted shape guards ────────────────────────────────────────────────

describe("Forbidden legacy shapes are absent", () => {
  it("requires canonical timestamps and keeps owner-entered kind/currency values explicit", async () => {
    await resetAndSeedBaseRows();
    const columns = await db.pool.query<{
      table_name: string;
      column_name: string;
      is_nullable: "YES" | "NO";
      column_default: string | null;
    }>(
      `SELECT table_name, column_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'master_data'`,
    );
    const byColumn = new Map(
      columns.rows.map((column) => [`${column.table_name}.${column.column_name}`, column]),
    );

    for (const table of [
      "Unit",
      "BusinessType",
      "Party",
      "Brand",
      "Category",
      "Sku",
      "SkuPrice",
      "WorkPrice",
    ]) {
      const column = byColumn.get(`${table}.updated_at`);
      assert.ok(column, `${table}.updated_at must exist`);
      assert.equal(column.is_nullable, "NO", `${table}.updated_at must be required`);
    }

    for (const key of [
      "Sku.kind",
      "SkuPrice.currency",
      "WorkPrice.kind",
      "WorkPrice.currency",
    ]) {
      const column = byColumn.get(key);
      assert.ok(column, `${key} must exist`);
      assert.equal(column.is_nullable, "NO", `${key} must be required`);
      assert.equal(column.column_default, null, `${key} must be supplied explicitly`);
    }

    const skuStatus = byColumn.get("Sku.status");
    assert.ok(skuStatus, "Sku.status must exist");
    assert.match(skuStatus.column_default ?? "", /DRAFT/, "Sku.status keeps the locked DRAFT default");
  });

  it("stores no temporal/current price fields and no WorkPrice SKU/project relation", async () => {
    await resetAndSeedBaseRows();
    const forbiddenColumns: Array<[string, string]> = [
      ["SkuPrice", "is_current"],
      ["SkuPrice", "valid_from"],
      ["SkuPrice", "valid_to"],
      ["WorkPrice", "valid_from"],
      ["WorkPrice", "valid_to"],
      ["WorkPrice", "is_active"],
      ["WorkPrice", "sku_id"],
      ["WorkPrice", "project_id"],
      ["WorkPrice", "qty"],
      ["Party", "is_active"],
      ["Brand", "is_active"],
      ["Brand", "tags"],
      ["Category", "is_active"],
      ["Sku", "is_active"],
      ["Unit", "is_active"],
      ["BusinessType", "is_active"],
      ["SkuPrice", "updated_by_name"],
      ["WorkPrice", "updated_by_name"],
    ];
    const existing = await db.pool.query<{
      table_name: string;
      column_name: string;
    }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'master_data'`,
    );
    const present = new Set(existing.rows.map((row) => `${row.table_name}.${row.column_name}`));
    for (const [table, column] of forbiddenColumns) {
      assert.equal(present.has(`${table}.${column}`), false, `forbidden column ${table}.${column} must not exist`);
    }
  });

  it("has no SkuCategory join table or duplicate Master Data audit tables", async () => {
    await resetAndSeedBaseRows();
    const tables = await db.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema IN ('master_data','platform')`,
    );
    const names = new Set(tables.rows.map((row) => row.table_name));
    for (const forbidden of ["SkuCategory", "MasterDataAudit", "AuditLog"]) {
      assert.equal(names.has(forbidden), false, `forbidden table ${forbidden} must not exist`);
    }
    for (const required of [
      "Unit", "BusinessType", "Party", "PartyRole", "PartyBusinessType", "PartyContact", "PartyLink",
      "Brand", "BrandLink", "BrandSupplier", "Category", "BrandCategory", "Sku", "SkuMedia", "SkuPrice",
      "WorkPrice", "AuditEvent",
    ]) {
      assert.equal(names.has(required), true, `required table ${required} must exist`);
    }
  });

  it("locks the enum vocabularies including the purged SERVICE and legacy role values", async () => {
    await resetAndSeedBaseRows();
    const enums = await db.pool.query<{ enum_name: string; value: string }>(
      `SELECT t.typname AS enum_name, e.enumlabel AS value
       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'master_data'
       ORDER BY t.typname, e.enumsortorder`,
    );
    const byEnum = new Map<string, string[]>();
    for (const row of enums.rows) {
      byEnum.set(row.enum_name, [...(byEnum.get(row.enum_name) ?? []), row.value]);
    }
    assert.deepEqual(byEnum.get("SkuKind"), ["MATERIAL", "FURNITURE", "FIXTURE"]);
    assert.deepEqual(byEnum.get("PartyRoleKind"), ["MATERIAL_SUPPLIER", "WORK_VENDOR"]);
    assert.deepEqual(byEnum.get("PartyType"), ["ORGANIZATION", "INDIVIDUAL"]);
    assert.deepEqual(byEnum.get("UnitUsage"), ["DIMENSION", "QUANTITY", "USAGE", "PURCHASE", "RATE"]);
    assert.deepEqual(byEnum.get("WorkPriceKind"), ["MATERIAL_LABOR", "LABOR_ONLY"]);
    assert.deepEqual(byEnum.get("MediaKind"), ["IMAGE", "THUMBNAIL", "ORIGINAL", "REFERENCE", "FOLDER"]);
  });

  it("keeps AuditEvent free of foreign keys with its locked indexes in place", async () => {
    await resetAndSeedBaseRows();
    const fks = await db.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'platform' AND t.relname = 'AuditEvent' AND c.contype = 'f'`,
    );
    assert.equal(fks.rows[0]!.count, "0");

    const indexes = await db.pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'platform' AND tablename = 'AuditEvent'`,
    );
    const defs = indexes.rows.map((row) => row.indexdef).join("\n");
    assert.match(defs, /\(app_id, entity_type, entity_id, occurred_at\)/);
    assert.match(defs, /\(actor_user_id, occurred_at\)/);
    assert.ok(indexes.rows.some((row) => /\(occurred_at\)/.test(row.indexdef)), "AuditEvent must have a standalone occurred_at index");
  });

  it("enforces SkuPrice pair uniqueness through the two partial unique indexes without a simple sku_id unique index", async () => {
    await resetAndSeedBaseRows();
    const indexes = await db.pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'master_data' AND tablename = 'SkuPrice'`,
    );
    const defs = indexes.rows.map((row) => row.indexdef);
    assert.ok(
      defs.some((def) => /UNIQUE INDEX "SkuPrice_pair_supplier_uniq".*\( ?"?sku_id"?, ?"?supplier_party_id"?\).*IS NOT NULL/.test(def)),
      "SkuPrice must have a partial unique index on (sku_id, supplier_party_id) for non-NULL suppliers",
    );
    assert.ok(
      defs.some((def) => /UNIQUE INDEX "SkuPrice_pair_nosupplier_uniq".*\( ?"?sku_id"?\).*IS NULL/.test(def)),
      "SkuPrice must have a partial unique index on sku_id for the NULL-supplier partition",
    );
    assert.equal(
      defs.some((def) => /UNIQUE INDEX "SkuPrice_sku_id_key"/.test(def)),
      false,
      "the singular sku_id unique index must be gone",
    );
    assert.equal(
      defs.some((def) => def.includes(" WHERE ") && !def.includes("SkuPrice_pair_")),
      false,
      "SkuPrice must have no other partial (e.g. temporal) index",
    );
  });
});
