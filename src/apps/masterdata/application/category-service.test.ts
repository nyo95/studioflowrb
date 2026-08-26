import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SerializedAuditEvent } from "@platform/core/audit";
import type { TransactionClient } from "@platform/core/db";

import { CategoryService } from "./category-service";
import type {
  CategoryCreateInput,
  CategoryListFilter,
  CategoryParentCandidateRecord,
  CategoryRecord,
  CategoryRepository,
  CategoryUpdateInput,
} from "./category-repository";

const tx = {} as TransactionClient;
const now = new Date("2026-08-26T00:00:00.000Z");
const context = {
  grants: ["masterdata.category.read", "masterdata.category.manage"],
  actor: { kind: "USER" as const, userId: "user-1", label: "Owner" },
};

function category(input: Partial<CategoryRecord> & Pick<CategoryRecord, "id" | "kind" | "name">): CategoryRecord {
  return {
    slug: input.name.toLowerCase().replace(/\s+/g, "-"),
    parentId: null,
    path: input.kind === "WORK" ? input.name.toLowerCase().replace(/\s+/g, "-") : null,
    searchSynonyms: [],
    sortOrder: 0,
    description: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...input,
  };
}

class MemoryCategoryRepository implements CategoryRepository {
  records = new Map<string, CategoryRecord>();
  parentCandidates = new Map<string, CategoryParentCandidateRecord>();
  pathUpdates: { id: string; path: string }[] = [];
  references = { liveBrandCategories: 0, nonDeletedSkus: 0, liveWorkPrices: 0, liveChildren: 0 };

  async list(_tx: TransactionClient, _filter: CategoryListFilter) { return [...this.records.values()]; }
  async findById(_tx: TransactionClient, id: string) { return this.records.get(id) ?? null; }
  async findLiveByKindAndSlug(_tx: TransactionClient, kind: CategoryRecord["kind"], slug: string) {
    return [...this.records.values()].find((row) => row.kind === kind && row.slug === slug && row.deletedAt === null) ?? null;
  }
  async loadParentCandidate(_tx: TransactionClient, id: string) { return this.parentCandidates.get(id) ?? null; }
  async listByPathPrefix(_tx: TransactionClient, path: string) {
    return [...this.records.values()].filter((row) => row.path?.startsWith(`${path}/`));
  }
  async countDeleteReferences() { return this.references; }
  async create(_tx: TransactionClient, input: CategoryCreateInput) {
    const record = category({ ...input, createdAt: now, updatedAt: now, deletedAt: null });
    this.records.set(record.id, record);
    return record;
  }
  async update(_tx: TransactionClient, id: string, input: CategoryUpdateInput) {
    const record = { ...this.records.get(id)!, ...input, updatedAt: now };
    this.records.set(id, record);
    return record;
  }
  async updatePath(_tx: TransactionClient, id: string, path: string) {
    this.pathUpdates.push({ id, path });
    this.records.set(id, { ...this.records.get(id)!, path });
  }
  async setDeletedAt(_tx: TransactionClient, id: string, deletedAt: Date | null) {
    const record = { ...this.records.get(id)!, deletedAt };
    this.records.set(id, record);
    return record;
  }
}

function harness(repository = new MemoryCategoryRepository()) {
  const events: SerializedAuditEvent[] = [];
  let transactions = 0;
  const service = new CategoryService({
    categories: repository,
    generateId: () => "generated-id",
    now: () => now,
    runTransaction: async (work) => { transactions += 1; return work(tx); },
    auditWriter: { write: async (event) => { events.push(event); } },
  });
  return { service, repository, events, transactions: () => transactions };
}

describe("CategoryService", () => {
  it("fails closed before opening a transaction without a grant", async () => {
    const h = harness();
    assert.throws(() => h.service.create({ ...context, grants: [] }, { kind: "PRODUCT", name: "HPL" }), {
      code: "PERMISSION_DENIED",
    });
    assert.equal(h.transactions(), 0);
  });

  it("creates a flat PRODUCT category with normalized synonyms and one audit event", async () => {
    const h = harness();
    const record = await h.service.create(context, {
      kind: "PRODUCT",
      name: "  High   Pressure Laminate ",
      searchSynonyms: [" Café ", "cafe", "HPL"],
    });
    assert.equal(record.parentId, null);
    assert.equal(record.path, null);
    assert.deepEqual(record.searchSynonyms, ["Café", "HPL"]);
    assert.equal(h.transactions(), 1);
    assert.equal(h.events.length, 1);
    assert.equal(h.events[0]?.action, "category.created");
    assert.equal(h.events[0]?.occurredAt, now.toISOString());
  });

  it("renames a WORK subtree and propagates every descendant path in the same transaction", async () => {
    const h = harness();
    h.repository.records.set("root", category({ id: "root", kind: "WORK", name: "MEP", path: "mep" }));
    h.repository.records.set("child", category({ id: "child", kind: "WORK", name: "Lighting", parentId: "root", path: "mep/lighting" }));
    h.repository.records.set("leaf", category({ id: "leaf", kind: "WORK", name: "Fixtures", parentId: "child", path: "mep/lighting/fixtures" }));

    const updated = await h.service.update(context, { id: "root", name: "Electrical" });
    assert.equal(updated.path, "electrical");
    assert.deepEqual(h.repository.pathUpdates, [
      { id: "child", path: "electrical/lighting" },
      { id: "leaf", path: "electrical/lighting/fixtures" },
    ]);
    assert.equal(h.transactions(), 1);
    assert.equal(h.events.length, 1);
  });

  it("rejects a cycle and deletion blockers without writing audit", async () => {
    const h = harness();
    h.repository.records.set("root", category({ id: "root", kind: "WORK", name: "MEP", path: "mep" }));
    h.repository.parentCandidates.set("child", {
      id: "child", kind: "WORK", path: "mep/child", deletedAt: null, ancestorIds: ["root"],
    });
    await assert.rejects(() => h.service.update(context, { id: "root", parentId: "child" }), {
      code: "WORK_CATEGORY_CYCLE",
    });
    h.repository.references.liveChildren = 1;
    await assert.rejects(() => h.service.softDelete(context, "root"), { code: "CATEGORY_STILL_REFERENCED" });
    assert.equal(h.events.length, 0);
  });

  it("reports a safe live-slug conflict before the database constraint", async () => {
    const h = harness();
    h.repository.records.set("a", category({ id: "a", kind: "PRODUCT", name: "HPL" }));
    h.repository.records.set("b", category({ id: "b", kind: "PRODUCT", name: "Veneer" }));
    await assert.rejects(() => h.service.update(context, { id: "b", name: "HPL" }), { code: "CATEGORY_SLUG_TAKEN" });
  });
});
