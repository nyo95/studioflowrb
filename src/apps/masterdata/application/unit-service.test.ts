import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SerializedAuditEvent } from "@platform/core/audit";
import type { TransactionClient } from "@platform/core/db";

import { UnitService } from "./unit-service";
import type { UnitCreateInput, UnitListFilter, UnitRecord, UnitRepository, UnitUpdateInput } from "./unit-repository";

const tx = {} as TransactionClient;
const now = new Date("2026-08-26T01:00:00.000Z");
const context = {
  grants: ["masterdata.dictionary.read", "masterdata.dictionary.manage"],
  actor: { kind: "USER" as const, userId: "user-1", label: "Owner" },
};

class MemoryUnitRepository implements UnitRepository {
  records = new Map<string, UnitRecord>();
  references = { liveBaseUnitSkus: 0, livePurchaseUnitSkus: 0, liveDimensionUnitSkus: 0, liveSkuPrices: 0, liveWorkPrices: 0 };
  async list(_tx: TransactionClient, _filter: UnitListFilter) { return [...this.records.values()]; }
  async findById(_tx: TransactionClient, id: string) { return this.records.get(id) ?? null; }
  async findByCode(_tx: TransactionClient, code: string) { return [...this.records.values()].find((row) => row.code === code) ?? null; }
  async countDeleteReferences() { return this.references; }
  async create(_tx: TransactionClient, input: UnitCreateInput) {
    const record: UnitRecord = { ...input, createdAt: now, updatedAt: now, deletedAt: null };
    this.records.set(record.id, record);
    return record;
  }
  async update(_tx: TransactionClient, id: string, input: UnitUpdateInput) {
    const record = { ...this.records.get(id)!, ...input, updatedAt: now };
    this.records.set(id, record);
    return record;
  }
  async setDeletedAt(_tx: TransactionClient, id: string, deletedAt: Date | null) {
    const record = { ...this.records.get(id)!, deletedAt };
    this.records.set(id, record);
    return record;
  }
}

function harness(repository = new MemoryUnitRepository()) {
  const events: SerializedAuditEvent[] = [];
  const service = new UnitService({
    units: repository,
    generateId: () => "unit-id",
    now: () => now,
    runTransaction: (work) => work(tx),
    auditWriter: { write: async (event) => { events.push(event); } },
  });
  return { service, repository, events };
}

describe("UnitService", () => {
  it("creates explicit controlled data and filters selectors without conversion", async () => {
    const h = harness();
    const created = await h.service.create(context, {
      code: " m2 ", label: " Square metre ", aliases: ["Mètre carré", "metre carre", "m2"], usages: ["RATE", "USAGE"],
    });
    assert.equal(created.code, "m2");
    assert.deepEqual(created.aliases, ["Mètre carré"]);
    assert.deepEqual(created.usages, ["USAGE", "RATE"]);
    assert.equal((await h.service.list(context, { usage: "DIMENSION" })).length, 0);
    assert.equal((await h.service.list(context, { usage: "RATE" })).length, 1);
    assert.equal(h.events[0]?.action, "unit.created");
  });

  it("enforces immutable code, delete blockers, and no-op audit omission", async () => {
    const h = harness();
    await h.service.create(context, { code: "pcs", label: "Pieces", usages: ["QUANTITY"] });
    await assert.rejects(() => h.service.update(context, { id: "unit-id", code: "piece" }), { code: "UNIT_CODE_IMMUTABLE" });
    const beforeNoOp = h.events.length;
    await h.service.update(context, { id: "unit-id", code: "pcs" });
    assert.equal(h.events.length, beforeNoOp);
    h.repository.references.liveSkuPrices = 1;
    await assert.rejects(() => h.service.softDelete(context, "unit-id"), { code: "UNIT_STILL_REFERENCED" });
  });
});
