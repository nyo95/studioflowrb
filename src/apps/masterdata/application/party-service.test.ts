import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SerializedAuditEvent } from "@platform/core/audit";
import type { TransactionClient } from "@platform/core/db";

import { PartyService } from "./party-service";
import type { BrandContactScopeRecord, PartyGraphInput, PartyListFilter, PartyRecord, PartyRepository } from "./party-repository";

const tx = {} as TransactionClient;
const now = new Date("2026-08-26T02:00:00.000Z");
const context = { grants: ["masterdata.party.read", "masterdata.party.manage"], actor: { kind: "USER" as const, userId: "user-1", label: "Owner" } };

class MemoryPartyRepository implements PartyRepository {
  records = new Map<string, PartyRecord>();
  liveBusinessTypes = new Set<string>();
  brandScopes = new Map<string, BrandContactScopeRecord>();
  roleReferences = { liveBrandSuppliers: 0, canonicalSkuPrices: 0, liveWorkPrices: 0 };
  deleteReferences = { ...this.roleReferences, liveOwnedBrands: 0 };
  async list(_tx: TransactionClient, _filter: PartyListFilter) { return [...this.records.values()]; }
  async listEligible(_tx: TransactionClient, role: "MATERIAL_SUPPLIER" | "WORK_VENDOR") { return [...this.records.values()].filter((row) => row.deletedAt === null && row.roles.includes(role)); }
  async findById(_tx: TransactionClient, id: string) { return this.records.get(id) ?? null; }
  async findLiveIdentityConflict(_tx: TransactionClient, name: string, slug: string) { return [...this.records.values()].find((row) => row.deletedAt === null && (row.name.toLowerCase() === name.toLowerCase() || row.slug === slug)) ?? null; }
  async findMissingLiveBusinessTypeIds(_tx: TransactionClient, ids: readonly string[]) { return ids.filter((id) => !this.liveBusinessTypes.has(id)); }
  async loadBrandContactScope(_tx: TransactionClient, _partyId: string, brandId: string) { return this.brandScopes.get(brandId) ?? null; }
  async countRoleReferences() { return this.roleReferences; }
  async countDeleteReferences() { return this.deleteReferences; }
  async create(_tx: TransactionClient, input: PartyGraphInput) { const row = { ...input, createdAt: now, updatedAt: now, deletedAt: null }; this.records.set(row.id, row); return row; }
  async update(_tx: TransactionClient, id: string, input: PartyGraphInput) { const row = { ...this.records.get(id)!, ...input, updatedAt: now }; this.records.set(id, row); return row; }
  async setDeletedAt(_tx: TransactionClient, id: string, deletedAt: Date | null) { const row = { ...this.records.get(id)!, deletedAt }; this.records.set(id, row); return row; }
}

function harness(repository = new MemoryPartyRepository()) {
  const events: SerializedAuditEvent[] = [];
  let sequence = 0;
  const service = new PartyService({
    parties: repository, generateId: () => `id-${++sequence}`, now: () => now,
    runTransaction: (work) => work(tx), auditWriter: { write: async (event) => { events.push(event); } },
  });
  return { service, repository, events };
}

describe("PartyService", () => {
  it("creates one multi-role identity without deriving roles from Business Type", async () => {
    const h = harness();
    h.repository.liveBusinessTypes.add("manufacturer");
    const row = await h.service.create(context, { name: "  Acme Indonesia ", type: "COMPANY", roles: ["WORK_VENDOR", "MATERIAL_SUPPLIER"], businessTypeIds: ["manufacturer"] });
    assert.equal(row.type, "ORGANIZATION");
    assert.deepEqual(row.roles, ["MATERIAL_SUPPLIER", "WORK_VENDOR"]);
    assert.equal((await h.service.listEligible(context, "MATERIAL_SUPPLIER"))[0]?.id, row.id);
    assert.equal(h.events[0]?.action, "party.created");
  });

  it("rejects unknown dictionaries and never accepts an unclassified live Party", async () => {
    const h = harness();
    await assert.rejects(() => h.service.create(context, { name: "Unknown", type: "ORGANIZATION", roles: [], businessTypeIds: [] }), { code: "PARTY_REQUIRES_OPERATIONAL_ROLE" });
    await assert.rejects(() => h.service.create(context, { name: "Unknown", type: "ORGANIZATION", roles: ["MATERIAL_SUPPLIER"], businessTypeIds: ["missing"] }), { code: "PARTY_BUSINESS_TYPE_INVALID" });
    assert.equal(h.events.length, 0);
  });

  it("blocks removal of a commercially required role and Party deletion", async () => {
    const h = harness();
    const row = await h.service.create(context, { name: "Vendor", type: "ORGANIZATION", roles: ["MATERIAL_SUPPLIER", "WORK_VENDOR"] });
    h.repository.roleReferences.liveBrandSuppliers = 1;
    await assert.rejects(() => h.service.update(context, { id: row.id, roles: ["WORK_VENDOR"] }), { code: "PARTY_ROLE_STILL_REFERENCED" });
    h.repository.deleteReferences.liveOwnedBrands = 1;
    await assert.rejects(() => h.service.softDelete(context, row.id), { code: "PARTY_STILL_REFERENCED" });
  });

  it("validates Brand-scoped contacts through the explicit relation port", async () => {
    const h = harness();
    const row = await h.service.create(context, { name: "Vendor", type: "ORGANIZATION", roles: ["MATERIAL_SUPPLIER"] });
    h.repository.brandScopes.set("brand-1", { brandId: "brand-1", brandDeletedAt: null, partyOwnsBrand: false, hasLiveBrandSupplier: false });
    await assert.rejects(() => h.service.update(context, { id: row.id, contacts: [{ personName: "Ayu", jobTitle: null, phone: null, email: null, isPrimary: true, notes: null, brandId: "brand-1" }] }), { code: "PARTY_CONTACT_BRAND_SCOPE_INVALID" });
    h.repository.brandScopes.set("brand-1", { brandId: "brand-1", brandDeletedAt: null, partyOwnsBrand: false, hasLiveBrandSupplier: true });
    const updated = await h.service.update(context, { id: row.id, contacts: [{ personName: "Ayu", jobTitle: null, phone: null, email: null, isPrimary: true, notes: null, brandId: "brand-1" }] });
    assert.equal(updated.contacts[0]?.brandId, "brand-1");
  });

  it("revalidates live uniqueness on restore", async () => {
    const h = harness();
    const deleted = await h.service.create(context, { name: "Vendor", type: "ORGANIZATION", roles: ["WORK_VENDOR"] });
    h.repository.records.set(deleted.id, { ...deleted, deletedAt: now });
    const conflict = { ...deleted, id: "other", deletedAt: null };
    h.repository.records.set(conflict.id, conflict);
    await assert.rejects(() => h.service.restore(context, deleted.id), { code: "PARTY_IDENTITY_TAKEN" });
  });
});
