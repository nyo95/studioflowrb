import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, it } from "node:test";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, type TestDb } from "@platform/core/db/test-support";

let db: TestDb;
before(async () => { db = await createTestDb(requireDisposableTestDatabaseUrl()); });
after(async () => { if (db) await closeTestDb(db); });
const migration = (name: string) => readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8").replaceAll('"master_data".', 'pg_temp.').replaceAll('master_data.', 'pg_temp.').replaceAll('"bq".', 'pg_temp.');

it("corrects historical CUSTOM baselines without changing working or imported prices", async () => {
  const c = await db.pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`CREATE TEMP TABLE "Sku" (brand_id text NOT NULL);
      CREATE TEMP TABLE bq_line_item (source_type text, harga_snapshot numeric, source_price_snapshot numeric);
      INSERT INTO bq_line_item VALUES ('CUSTOM',15,15),('MASTERDATA',25,20),('BQ_LIBRARY',35,30);`);
    await c.query(migration("20260907090000_regression_sku_and_custom_snapshot"));
    await c.query(`INSERT INTO "Sku" VALUES (NULL)`);
    const rows = (await c.query("SELECT * FROM bq_line_item ORDER BY source_type")).rows;
    assert.deepEqual(rows.map(r => [r.source_type, r.harga_snapshot, r.source_price_snapshot]), [["BQ_LIBRARY","35","30"],["CUSTOM","15",null],["MASTERDATA","25","20"]]);
    await assert.rejects(c.query("INSERT INTO bq_line_item VALUES ('CUSTOM',1,1)"));
  } finally { await c.query("ROLLBACK"); c.release(); }
});

it("preserves company links and holds ambiguous links with all metadata before VendorLink purge", async () => {
  const c = await db.pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`CREATE TEMP TABLE "Vendor" (id text);
      CREATE TEMP TABLE "VendorLink" (id text, vendor_id text, kind text, url text, sort_order int, label text);
      INSERT INTO "Vendor" VALUES ('supplier');
      INSERT INTO "VendorLink" VALUES ('website','supplier','WEBSITE','https://example.com',0,'Company'),('resource','supplier','OTHER','https://example.com/file',1,'Review me');`);
    await c.query(migration("20260906085900_preserve_supplier_information_links"));
    await c.query('DROP TABLE pg_temp."VendorLink"');
    const row = (await c.query('SELECT * FROM pg_temp."Vendor"')).rows[0];
    assert.equal(row.info_links[0].url, "https://example.com");
    assert.equal(row.info_links[0].label, "Company");
    assert.equal(row.link_review_snapshot[0].id, "resource");
    assert.equal(row.link_review_snapshot[0].label, "Review me");
  } finally { await c.query("ROLLBACK"); c.release(); }
});
