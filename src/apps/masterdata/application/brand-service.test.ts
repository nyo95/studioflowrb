import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TransactionClient } from "@platform/core/db";
import { BrandService } from "./brand-service";
import type { BrandGraphInput, BrandRecord, BrandRepository } from "./brand-repository";
import type { BrandCategoryCandidate, BrandSupplierCandidate } from "../domain/brand-rules";

const tx = {} as TransactionClient; const now = new Date("2026-08-26T04:00:00Z");
const context = { grants: ["masterdata.brand.read", "masterdata.brand.manage"], actor: { kind: "USER" as const, userId: "u", label: "Owner" } };
class Repo implements BrandRepository {
  rows = new Map<string, BrandRecord>(); categories = new Map<string, BrandCategoryCandidate>(); suppliers = new Map<string, BrandSupplierCandidate>(); owners = new Set<string>(); refs = { liveSkus: 0, scopedContacts: 0 };
  async list() { return [...this.rows.values()]; } async findById(_tx: TransactionClient, id: string) { return this.rows.get(id) ?? null; }
  async findLiveIdentityConflict(_tx: TransactionClient, name: string, slug: string) { return [...this.rows.values()].find(x => !x.deletedAt && (x.name.toLowerCase() === name.toLowerCase() || x.slug === slug)) ?? null; }
  async loadCategoryCandidates(_tx: TransactionClient, ids: readonly string[]) { return ids.flatMap(id => this.categories.has(id) ? [this.categories.get(id)!] : []); }
  async loadSupplierCandidates(_tx: TransactionClient, ids: readonly string[]) { return ids.flatMap(id => this.suppliers.has(id) ? [this.suppliers.get(id)!] : []); }
  async isLiveOwnerCandidate(_tx: TransactionClient, id: string) { return this.owners.has(id); } async countDeleteReferences() { return this.refs; }
  async create(_tx: TransactionClient, input: BrandGraphInput) { const row = { ...input, createdAt: now, updatedAt: now, deletedAt: null }; this.rows.set(row.id, row); return row; }
  async update(_tx: TransactionClient, id: string, input: BrandGraphInput) { const row = { ...this.rows.get(id)!, ...input, updatedAt: now }; this.rows.set(id, row); return row; }
  async setDeletedAt(_tx: TransactionClient, id: string, deletedAt: Date | null) { const row = { ...this.rows.get(id)!, deletedAt }; this.rows.set(id, row); return row; }
}
function harness() { const repo = new Repo(); repo.categories.set("cat", { id: "cat", kind: "PRODUCT", deletedAt: null }); const events: string[] = []; let id=0; const service = new BrandService({ brands: repo, generateId: () => `id-${++id}`, now: () => now, runTransaction: work => work(tx), auditWriter: { write: async e => { events.push(e.action); } } }); return { repo, service, events }; }

describe("BrandService", () => {
  it("requires explicit Product Category but no supplier or SKU", async () => { const h=harness(); await assert.rejects(() => h.service.create(context,{ name:"Empty",categories:[] }), { code:"BRAND_REQUIRES_PRODUCT_CATEGORY" }); const row=await h.service.create(context,{name:"Valid",categories:[{categoryId:"cat"}]}); assert.equal(row.suppliers.length,0); assert.deepEqual(h.events,["brand.created"]); });
  it("rejects ineligible suppliers and removal of all categories", async () => { const h=harness(); h.repo.suppliers.set("vendor",{id:"vendor",deletedAt:null,roles:["WORK_VENDOR"]}); await assert.rejects(() => h.service.create(context,{name:"Bad",categories:[{categoryId:"cat"}],suppliers:[{partyId:"vendor"}]}),{code:"PARTY_NOT_OPERATIONALLY_ELIGIBLE"}); const row=await h.service.create(context,{name:"Valid",categories:[{categoryId:"cat"}]}); await assert.rejects(() => h.service.update(context,{id:row.id,categories:[]}),{code:"BRAND_REQUIRES_PRODUCT_CATEGORY"}); });
  it("blocks deletion with live SKU and omits no-op audit", async () => { const h=harness(); const row=await h.service.create(context,{name:"Valid",categories:[{categoryId:"cat"}]}); const n=h.events.length; await h.service.update(context,{id:row.id}); assert.equal(h.events.length,n); h.repo.refs.liveSkus=1; await assert.rejects(() => h.service.softDelete(context,row.id),{code:"BRAND_STILL_REFERENCED"}); });
});
