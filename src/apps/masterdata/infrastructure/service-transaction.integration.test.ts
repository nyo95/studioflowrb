import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { CategoryService } from "../application/category-service";
import { PartyService } from "../application/party-service";
import { UnitService } from "../application/unit-service";
import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { prismaCategoryRepository } from "./category-repository-prisma";
import { prismaPartyRepository } from "./party-repository-prisma";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncateAllTables, type TestDb } from "./test-db";
import { createTransactionRunner } from "./transaction";
import { prismaUnitRepository } from "./unit-repository-prisma";

const context = {
  grants: ["masterdata.category.manage", "masterdata.category.read", "masterdata.dictionary.manage", "masterdata.dictionary.read", "masterdata.party.manage", "masterdata.party.read"],
  actor: { kind: "USER" as const, userId: "integration-user", label: "Integration user" },
};

describe("Master Data transactional services", () => {
  let db: TestDb;
  let id = 0;
  before(async () => { db = await createTestDb(requireDisposableTestDatabaseUrl()); });
  beforeEach(async () => { await truncateAllTables(db); id = 0; });
  after(async () => { await closeTestDb(db); });

  function common() {
    return {
      runTransaction: createTransactionRunner(db.prisma),
      auditWriter: createAuditEventWriter(),
      generateId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
      now: () => new Date("2026-08-26T03:00:00.000Z"),
    };
  }

  it("persists Category/Unit mutations with one audit row each and propagates WORK paths", async () => {
    const categories = new CategoryService({ ...common(), categories: prismaCategoryRepository });
    const units = new UnitService({ ...common(), units: prismaUnitRepository });
    const root = await categories.create(context, { kind: "WORK", name: "MEP" });
    await categories.create(context, { kind: "WORK", name: "Lighting", parentId: root.id });
    await categories.update(context, { id: root.id, name: "Electrical" });
    await units.create(context, { code: "fixture", label: "Fixture", usages: ["RATE"] });
    const child = await db.prisma.category.findFirstOrThrow({ where: { name: "Lighting" } });
    assert.equal(child.path, "electrical/lighting");
    assert.equal(await db.prisma.auditEvent.count(), 4);
  });

  it("persists one multi-role Party graph and its audit atomically", async () => {
    const businessType = await db.prisma.businessType.create({ data: { code: "MAKER", label: "Maker" } });
    const parties = new PartyService({ ...common(), parties: prismaPartyRepository });
    const party = await parties.create(context, {
      name: "Acme", type: "ORGANIZATION", roles: ["MATERIAL_SUPPLIER", "WORK_VENDOR"], businessTypeIds: [businessType.id],
      contacts: [{ personName: "Ayu", jobTitle: null, phone: null, email: null, isPrimary: true, notes: null, brandId: null }],
      links: [{ kind: "WEBSITE", url: "https://example.com", archiveUrl: null, label: "Site", sortOrder: 0 }],
    });
    const stored = await db.prisma.party.findUniqueOrThrow({ where: { id: party.id }, include: { roles: true, business_types: true, contacts: true, links: true } });
    assert.equal(stored.roles.length, 2);
    assert.equal(stored.business_types.length, 1);
    assert.equal(stored.contacts.length, 1);
    assert.equal(stored.links.length, 1);
    assert.equal(await db.prisma.auditEvent.count({ where: { entity_id: party.id } }), 1);
  });
});
