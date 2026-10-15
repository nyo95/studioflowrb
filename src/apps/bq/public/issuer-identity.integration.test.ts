import assert from "node:assert/strict";
import { after, before, beforeEach, it } from "node:test";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, type TestDb } from "@platform/core/db/test-support";
import { readBqIssuerIdentity } from "./issuer-identity";

let testDb: TestDb;
before(async () => { testDb = await createTestDb(requireDisposableTestDatabaseUrl()); });
beforeEach(async () => { await testDb.prisma.bqQuotationSettings.deleteMany(); });
after(async () => closeTestDb(testDb));

it("reads only BQ issuer letterhead facts", async () => {
  assert.deepEqual(await readBqIssuerIdentity(testDb.prisma), { companyName: null, logoKey: null, companyAddress: null, companyEmail: null });
  await testDb.prisma.bqQuotationSettings.create({ data: { id: "bq_quotation_settings", company_name: "Contractor", logo_key: "bq/logos/a.png", company_address: "Jalan A", company_email: "a@example.test", signer_name: "Private", signature_key: "bq/signatures/private.png", default_payment_terms: "Private", default_ppn_pct: 11 } });
  assert.deepEqual(await readBqIssuerIdentity(testDb.prisma), { companyName: "Contractor", logoKey: "bq/logos/a.png", companyAddress: "Jalan A", companyEmail: "a@example.test" });
});
