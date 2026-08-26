import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { AppError } from "@platform/core/errors";
import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { AuditQueryService } from "../application/audit-query";
import { CategoryService } from "../application/category-service";
import { UnitService } from "../application/unit-service";
import { prismaAuditQueryRepository } from "./audit-query-prisma";
import { prismaCategoryRepository } from "./category-repository-prisma";
import { prismaUnitRepository } from "./unit-repository-prisma";
import {
  closeTestDb,
  createTestDb,
  requireDisposableTestDatabaseUrl,
  truncateAllTables,
  type TestDb,
} from "./test-db";
import { createTransactionRunner } from "./transaction";

const actorContext = {
  grants: [
    "masterdata.category.manage",
    "masterdata.category.read",
    "masterdata.dictionary.manage",
    "masterdata.dictionary.read",
    "masterdata.audit.read",
  ],
  actor: { kind: "USER" as const, userId: "audit-test-user", label: "Audit Test" },
};

const noAuditContext = {
  grants: [
    "masterdata.category.manage",
    "masterdata.category.read",
    "masterdata.dictionary.manage",
    "masterdata.dictionary.read",
  ],
  actor: { kind: "USER" as const, userId: "audit-test-user", label: "Audit Test" },
};

describe("Master Data audit persistence and convergence", () => {
  let db: TestDb;
  let seq = 0;

  before(async () => {
    db = await createTestDb(requireDisposableTestDatabaseUrl());
  });
  beforeEach(async () => {
    await truncateAllTables(db);
    seq = 0;
  });
  after(async () => {
    await closeTestDb(db);
  });

  function common() {
    return {
      runTransaction: createTransactionRunner(db.prisma),
      auditWriter: createAuditEventWriter(),
      generateId: () =>
        `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
      now: () => new Date("2026-08-26T03:00:00.000Z"),
    };
  }

  function auditQuery() {
    return new AuditQueryService({
      runTransaction: createTransactionRunner(db.prisma),
      auditEvents: prismaAuditQueryRepository,
    });
  }

  // ── Atomicity ──────────────────────────────────────────────────────────────

  it("successful mutation writes exactly one audit event in the same transaction", async () => {
    const cats = new CategoryService({ ...common(), categories: prismaCategoryRepository });
    const cat = await cats.create(actorContext, { kind: "PRODUCT", name: "Tiles" });
    assert.equal(await db.prisma.auditEvent.count(), 1);
    const ev = await db.prisma.auditEvent.findFirstOrThrow();
    assert.equal(ev.app_id, "masterdata");
    assert.equal(ev.action, "category.created");
    assert.equal(ev.entity_type, "category");
    assert.equal(ev.entity_id, cat.id);
    assert.equal(ev.actor_label, "Audit Test");
    assert.equal(ev.actor_user_id, "audit-test-user");
  });

  it("failed mutation rolls back audit atomically — conflict leaves zero events", async () => {
    const cats = new CategoryService({ ...common(), categories: prismaCategoryRepository });
    await cats.create(actorContext, { kind: "PRODUCT", name: "Tiles" });
    const beforeCount = await db.prisma.auditEvent.count();
    // Duplicate name triggers a CONFLICT/VALIDATION error
    await assert.rejects(
      () => cats.create(actorContext, { kind: "PRODUCT", name: "Tiles" }),
      (e: unknown) => e instanceof AppError,
    );
    // Audit count unchanged — the failed tx rolled back its event too
    assert.equal(await db.prisma.auditEvent.count(), beforeCount);
  });

  // ── No-op ──────────────────────────────────────────────────────────────────

  it("no-op update (identical payload) emits no audit event", async () => {
    const cats = new CategoryService({ ...common(), categories: prismaCategoryRepository });
    const cat = await cats.create(actorContext, { kind: "PRODUCT", name: "Tiles" });
    const beforeCount = await db.prisma.auditEvent.count();
    // Update with the same name — diffAuditChanges produces {} → no event
    await cats.update(actorContext, { id: cat.id, name: "Tiles" });
    assert.equal(await db.prisma.auditEvent.count(), beforeCount);
  });

  it("real update emits exactly one delta event with before/after", async () => {
    const cats = new CategoryService({ ...common(), categories: prismaCategoryRepository });
    const cat = await cats.create(actorContext, { kind: "PRODUCT", name: "Tiles" });
    await cats.update(actorContext, { id: cat.id, name: "Stone" });
    const events = await db.prisma.auditEvent.findMany({ orderBy: { occurred_at: "asc" } });
    assert.equal(events.length, 2);
    assert.equal(events[1].action, "category.updated");
    const changes = events[1].changes as Record<string, { from: unknown; to: unknown }> | null;
    assert.ok(changes && "name" in changes, "audit changes must record the name diff");
    assert.equal(changes!.name.from, "Tiles");
    assert.equal(changes!.name.to, "Stone");
  });

  // ── Permission ────────────────────────────────────────────────────────────

  it("audit list requires masterdata.audit.read — forbidden without it", async () => {
    await assert.rejects(
      () => auditQuery().list(noAuditContext),
      (e: unknown) => e instanceof AppError && (e as AppError).code === "FORBIDDEN",
    );
  });

  it("audit list is permitted with masterdata.audit.read and filters by entity", async () => {
    const cats = new CategoryService({ ...common(), categories: prismaCategoryRepository });
    const units = new UnitService({ ...common(), units: prismaUnitRepository });
    const cat = await cats.create(actorContext, { kind: "PRODUCT", name: "Tiles" });
    await units.create(actorContext, { code: "box", label: "Box", usages: ["QUANTITY"] });
    const events = await auditQuery().list(actorContext, {
      entityType: "category",
      entityId: cat.id,
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "category.created");
  });

  // ── Secret safety ─────────────────────────────────────────────────────────

  it("category audit changes payload does not leak contact PII fields", async () => {
    const cats = new CategoryService({ ...common(), categories: prismaCategoryRepository });
    await cats.create(actorContext, { kind: "PRODUCT", name: "Tiles" });
    const ev = await db.prisma.auditEvent.findFirstOrThrow();
    const changes = ev.changes as Record<string, unknown> | null;
    for (const forbidden of ["email", "phone", "password", "secret", "token"]) {
      assert.ok(
        !changes || !(forbidden in changes),
        `audit payload must not contain "${forbidden}"`,
      );
    }
  });

  // ── RBAC correction ───────────────────────────────────────────────────────

  it("masterdata.access (two-segment) is accepted by isValidPermissionId", async () => {
    const { isValidPermissionId } = await import("@platform/core/rbac");
    assert.equal(isValidPermissionId("masterdata.access"), true);
  });

  it("normal three-segment IDs remain valid after the RBAC correction", async () => {
    const { isValidPermissionId } = await import("@platform/core/rbac");
    assert.equal(isValidPermissionId("masterdata.party.read"), true);
    assert.equal(isValidPermissionId("masterdata.sku.manage"), true);
  });

  it("malformed IDs remain invalid after the RBAC correction", async () => {
    const { isValidPermissionId } = await import("@platform/core/rbac");
    assert.equal(isValidPermissionId("masterdata"), false);
    assert.equal(isValidPermissionId("masterdata..read"), false);
    assert.equal(isValidPermissionId(""), false);
    assert.equal(isValidPermissionId("MASTERDATA.PARTY.READ"), false);
  });
});
