import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TransactionClient } from "@platform/core/db";

import { BusinessTypeService } from "./business-type-service";
import type { BusinessTypeRecord, BusinessTypeRepository, BusinessTypeWriteInput } from "./party-repository";

const tx = {} as TransactionClient;
const now = new Date("2026-08-26T02:30:00.000Z");
const context = { grants: ["masterdata.dictionary.read", "masterdata.dictionary.manage"], actor: { kind: "USER" as const, userId: "user-1", label: "Owner" } };

class MemoryBusinessTypes implements BusinessTypeRepository {
  records = new Map<string, BusinessTypeRecord>();
  assignments = 0;
  async list() { return [...this.records.values()]; }
  async findById(_tx: TransactionClient, id: string) { return this.records.get(id) ?? null; }
  async findByCode(_tx: TransactionClient, code: string) { return [...this.records.values()].find((row) => row.code === code) ?? null; }
  async countLivePartyAssignments() { return this.assignments; }
  async create(_tx: TransactionClient, input: BusinessTypeWriteInput) { const row = { ...input, createdAt: now, updatedAt: now, deletedAt: null }; this.records.set(row.id, row); return row; }
  async update(_tx: TransactionClient, id: string, input: Omit<BusinessTypeWriteInput, "id" | "code">) { const row = { ...this.records.get(id)!, ...input, updatedAt: now }; this.records.set(id, row); return row; }
  async setDeletedAt(_tx: TransactionClient, id: string, deletedAt: Date | null) { const row = { ...this.records.get(id)!, deletedAt }; this.records.set(id, row); return row; }
}

describe("BusinessTypeService", () => {
  it("keeps controlled codes immutable and blocks deletion while assigned", async () => {
    const repository = new MemoryBusinessTypes();
    const events: string[] = [];
    const service = new BusinessTypeService({ businessTypes: repository, generateId: () => "type-id", now: () => now, runTransaction: (work) => work(tx), auditWriter: { write: async (event) => { events.push(event.action); } } });
    await service.create(context, { code: " service_provider ", label: "Service Provider" });
    await assert.rejects(() => service.update(context, { id: "type-id", code: "CONTRACTOR" }), { code: "BUSINESS_TYPE_CODE_IMMUTABLE" });
    repository.assignments = 1;
    await assert.rejects(() => service.softDelete(context, "type-id"), { code: "BUSINESS_TYPE_STILL_ASSIGNED" });
    assert.deepEqual(events, ["business-type.created"]);
  });
});
