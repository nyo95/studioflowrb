import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import {
  closeTestDb,
  createTestDb,
  requireDisposableTestDatabaseUrl,
  type TestDb,
} from "@platform/core/db/test-support";
import { AppError } from "@platform/core/errors";
import type { PrismaClient } from "@/generated/prisma/client";

import { createStudioFlowService, STUDIOFLOW_PERMISSIONS } from "./service";

const ACTOR = {
  kind: "USER" as const,
  userId: "studioflow-test-user",
  label: "StudioFlow Test",
};

let testDb: TestDb;
let service: ReturnType<typeof createStudioFlowService>;

async function resetStudioFlow() {
  await testDb.prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "studioflow"."sf_requirement_evidence",
      "studioflow"."sf_project_requirement",
      "studioflow"."sf_requirement_template",
      "studioflow"."sf_product_catalogue",
      "studioflow"."sf_client",
      "studioflow"."sf_phase_template",
      "platform"."AuditEvent"
    RESTART IDENTITY CASCADE
  `);
}

before(async () => {
  testDb = await createTestDb(requireDisposableTestDatabaseUrl());
  service = createStudioFlowService(testDb.prisma, {
    runTransaction: <T>(work: (tx: PrismaClient) => Promise<T>) =>
      testDb.prisma.$transaction((tx) => work(tx as unknown as PrismaClient)),
    auditWriter: createAuditEventWriter(),
  });
});
beforeEach(resetStudioFlow);
after(async () => closeTestDb(testDb));

describe("§7.1.1 Requirement templates", () => {
  it("creates, reads, edits, archives, restores, and deletes a general template", async () => {
    const created = await service.createRequirementTemplate(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { key: "fire-safety", scope: "GENERAL", title: "Fire Safety Compliance" },
    );
    assert.equal(created.key, "fire-safety");
    assert.equal(created.scope, "GENERAL");
    assert.equal(created.key_immutable, false);

    const list = await service.listRequirementTemplates([STUDIOFLOW_PERMISSIONS.projectRead]);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, created.id);

    const edited = await service.editRequirementTemplate(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      created.id,
      { title: "Fire Safety Compliance v2" },
    );
    assert.equal(edited.title, "Fire Safety Compliance v2");

    const archived = await service.archiveRequirementTemplate(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      created.id,
    );
    assert.ok(archived.deleted_at);

    const restored = await service.restoreRequirementTemplate(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      created.id,
    );
    assert.equal(restored.deleted_at, null);

    // Archive again then delete
    await service.archiveRequirementTemplate([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, created.id);
    await service.deleteRequirementTemplate([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, created.id);

    const afterDelete = await service.listRequirementTemplates([STUDIOFLOW_PERMISSIONS.projectRead]);
    assert.equal(afterDelete.length, 0);
  });

  it("creates a phase template and validates scope", async () => {
    const phaseTemplate = await testDb.prisma.sfPhaseTemplate.create({
      data: { key: "design", name: "Design", sort_order: 1, has_rounds: true, round_prefix: "D" },
    });

    const created = await service.createRequirementTemplate(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { key: "design-spec", scope: "PHASE", title: "Design Specification", phase_template_id: phaseTemplate.id },
    );
    assert.equal(created.scope, "PHASE");
    assert.equal(created.phase_template_id, phaseTemplate.id);

    const scoped = await service.listPhaseRequirementTemplates([STUDIOFLOW_PERMISSIONS.projectRead], phaseTemplate.id);
    assert.equal(scoped.phaseTemplate.id, phaseTemplate.id);
    assert.equal(scoped.templates.length, 1);
    await assert.rejects(
      () => service.listPhaseRequirementTemplates([STUDIOFLOW_PERMISSIONS.projectRead], "00000000-0000-0000-0000-000000000000"),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.phase-template.not-found",
    );

    // Phase scope without phase_template_id should fail
    await assert.rejects(
      () => service.createRequirementTemplate(
        [STUDIOFLOW_PERMISSIONS.projectManage],
        ACTOR,
        { key: "bad", scope: "PHASE", title: "Bad" },
      ),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.requirement-template.phase-template-required",
    );

    // General scope with phase_template_id should fail
    await assert.rejects(
      () => service.createRequirementTemplate(
        [STUDIOFLOW_PERMISSIONS.projectManage],
        ACTOR,
        { key: "bad", scope: "GENERAL", title: "Bad", phase_template_id: phaseTemplate.id },
      ),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.requirement-template.general-no-phase",
    );
  });

  it("prevents duplicate keys within the same scope", async () => {
    await service.createRequirementTemplate(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { key: "acoustic", scope: "GENERAL", title: "Acoustic" },
    );
    await assert.rejects(
      () => service.createRequirementTemplate(
        [STUDIOFLOW_PERMISSIONS.projectManage],
        ACTOR,
        { key: "acoustic", scope: "GENERAL", title: "Acoustic v2" },
      ),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.requirement-template.duplicate-key",
    );
  });

  it("prevents deletion of a template whose key is immutable", async () => {
    const tmpl = await service.createRequirementTemplate(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { key: "used-key", scope: "GENERAL", title: "Used" },
    );
    // Simulate first use by marking key_immutable
    await testDb.prisma.sfRequirementTemplate.update({ where: { id: tmpl.id }, data: { key_immutable: true } });
    await service.archiveRequirementTemplate([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, tmpl.id);
    await assert.rejects(
      () => service.deleteRequirementTemplate([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, tmpl.id),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.requirement-template.key-in-use",
    );
  });
});

describe("§7.1.1 Project requirement snapshot", () => {
  it("snapshots general and phase templates when creating a project", async () => {
    const phaseTemplates = await Promise.all([
      testDb.prisma.sfPhaseTemplate.create({
        data: { key: "design", name: "Design", sort_order: 1, has_rounds: true, round_prefix: "D" },
      }),
      testDb.prisma.sfPhaseTemplate.create({
        data: { key: "build", name: "Build", sort_order: 2, has_rounds: true, round_prefix: "B" },
      }),
    ]);

    // Create general template
    await service.createRequirementTemplate(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { key: "general-1", scope: "GENERAL", title: "General Req 1" },
    );
    // Create phase template
    await service.createRequirementTemplate(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { key: "phase-1", scope: "PHASE", title: "Phase Req 1", phase_template_id: phaseTemplates[0].id },
    );

    const client = await testDb.prisma.sfClient.create({ data: { name: "Test Client" } });
    const project = await service.createProject(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { name: "Snapshot Test", client_id: client.id, opened_at: new Date("2026-09-14") },
    );

    const reqs = await service.listProjectRequirements([STUDIOFLOW_PERMISSIONS.projectRead], project.id);
    assert.equal(reqs.length, 2); // 1 general + 1 phase across 2 project phases

    const generalReqs = reqs.filter((r) => r.phase_id === null);
    assert.equal(generalReqs.length, 1);
    assert.equal(generalReqs[0].title, "General Req 1");
    assert.equal(generalReqs[0].template_key_snapshot, "general-1");

    const phaseReqs = reqs.filter((r) => r.phase_id !== null);
    assert.equal(phaseReqs.length, 1);
    assert.equal(phaseReqs[0].title, "Phase Req 1");
    assert.equal(phaseReqs[0].template_key_snapshot, "phase-1");

    // Templates should have key_immutable = true
    const templates = await service.listRequirementTemplates([STUDIOFLOW_PERMISSIONS.projectRead]);
    assert.ok(templates.every((t) => t.key_immutable === true));
  });

  it("snapshot produces independent copies that survive template edits", async () => {
    const pt = await testDb.prisma.sfPhaseTemplate.create({
      data: { key: "design", name: "Design", sort_order: 1, has_rounds: true, round_prefix: "D" },
    });
    const tmpl = await service.createRequirementTemplate(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { key: "arch-req", scope: "GENERAL", title: "Architecture Req" },
    );

    const client = await testDb.prisma.sfClient.create({ data: { name: "Test Client" } });
    const project = await service.createProject(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { name: "Independence Test", client_id: client.id, opened_at: new Date("2026-09-14") },
    );

    // Edit the template after snapshot
    await service.editRequirementTemplate(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      tmpl.id,
      { title: "Architecture Req (edited)" },
    );

    // Project requirement should still have original title
    const reqs = await service.listProjectRequirements([STUDIOFLOW_PERMISSIONS.projectRead], project.id);
    assert.equal(reqs[0].title, "Architecture Req");
  });

  it("creating a project with no templates still succeeds", async () => {
    const client = await testDb.prisma.sfClient.create({ data: { name: "Test Client" } });
    // Create project directly via Prisma to bypass the phase template requirement
    const project = await testDb.prisma.sfProject.create({
      data: {
        code: "SF26-NTPL",
        name: "No Templates",
        client_id: client.id,
        opened_at: new Date("2026-09-14"),
      },
    });
    const reqs = await service.listProjectRequirements([STUDIOFLOW_PERMISSIONS.projectRead], project.id);
    assert.equal(reqs.length, 0);
  });
});

describe("§7.1.1 Project requirement CRUD and lifecycle", () => {
  async function setupProject() {
    const client = await testDb.prisma.sfClient.create({ data: { name: "CRUD Client" } });
    const pt = await testDb.prisma.sfPhaseTemplate.create({
      data: { key: "design", name: "Design", sort_order: 1, has_rounds: true, round_prefix: "D" },
    });
    const project = await testDb.prisma.sfProject.create({
      data: { code: "SF26-CRUD", name: "CRUD Project", client_id: client.id, opened_at: new Date("2026-09-14") },
    });
    const phase = await testDb.prisma.sfProjectPhase.create({
      data: {
        project_id: project.id, template_id: pt.id, key: pt.key, name: pt.name,
        sort_order: pt.sort_order, has_rounds: true, round_prefix: pt.round_prefix,
      },
    });
    return { project, phase };
  }

  it("creates, reads, edits general and phase requirements", async () => {
    const { project, phase } = await setupProject();

    const genReq = await service.createProjectRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { project_id: project.id, title: "Fire Safety" },
    );
    assert.equal(genReq.phase_id, null);
    assert.equal(genReq.satisfaction_state, "OPEN");

    const phaseReq = await service.createProjectRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { project_id: project.id, phase_id: phase.id, title: "Design Accuracy" },
    );
    assert.equal(phaseReq.phase_id, phase.id);

    const edited = await service.editProjectRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      genReq.id,
      { title: "Fire Safety v2" },
    );
    assert.equal(edited.title, "Fire Safety v2");
  });

  it("refuses phase removal while an archived phase requirement exists", async () => {
    const { phase } = await setupProject();
    const req = await service.createProjectRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { project_id: phase.project_id, phase_id: phase.id, title: "Retained scope" },
    );
    await service.archiveRequirement([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, req.id, { reason: "Retained for audit" });

    await assert.rejects(
      () => service.removeProjectPhase([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, phase.id),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.phase.requirements-exist",
    );
    await assert.rejects(
      () => testDb.prisma.sfProjectPhase.delete({ where: { id: phase.id } }),
      (err: unknown) => typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2003",
    );
    const stillThere = await testDb.prisma.sfProjectRequirement.findUnique({ where: { id: req.id }, select: { phase_id: true } });
    assert.equal(stillThere?.phase_id, phase.id);
  });

  it("satisfies and reopens a requirement", async () => {
    const { project } = await setupProject();
    const req = await service.createProjectRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { project_id: project.id, title: "Structural" },
    );

    const satisfied = await service.satisfyRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      req.id,
      { satisfaction_note: "Verified by engineer" },
    );
    assert.equal(satisfied.satisfaction_state, "SATISFIED");
    assert.ok(satisfied.satisfied_at);
    assert.equal(satisfied.satisfaction_note, "Verified by engineer");

    const reopened = await service.reopenRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      req.id,
      { reopen_reason: "Client requested change" },
    );
    assert.equal(reopened.satisfaction_state, "OPEN");
    assert.equal(reopened.satisfied_at, null);
  });

  it("requires satisfaction note", async () => {
    const { project } = await setupProject();
    const req = await service.createProjectRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { project_id: project.id, title: "Test" },
    );
    await assert.rejects(
      () => service.satisfyRequirement(
        [STUDIOFLOW_PERMISSIONS.projectManage],
        ACTOR,
        req.id,
        { satisfaction_note: "  " },
      ),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.requirement.satisfaction-note-required",
    );
  });

  it("requires reopen reason", async () => {
    const { project } = await setupProject();
    const req = await service.createProjectRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { project_id: project.id, title: "Test" },
    );
    await service.satisfyRequirement([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, req.id, { satisfaction_note: "Done" });
    await assert.rejects(
      () => service.reopenRequirement(
        [STUDIOFLOW_PERMISSIONS.projectManage],
        ACTOR,
        req.id,
        { reopen_reason: "" },
      ),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.requirement.reopen-reason-required",
    );
  });

  it("archives and restores a requirement", async () => {
    const { project } = await setupProject();
    const req = await service.createProjectRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { project_id: project.id, title: "To Archive" },
    );

    const archived = await service.archiveRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      req.id,
      { reason: "Not needed for this project" },
    );
    assert.ok(archived.archived_at);

    // Archived requirements excluded from default listing
    const list = await service.listProjectRequirements([STUDIOFLOW_PERMISSIONS.projectRead], project.id);
    assert.equal(list.length, 0);

    // Included when includeArchived is true
    const allList = await service.listProjectRequirements([STUDIOFLOW_PERMISSIONS.projectRead], project.id, { includeArchived: true });
    assert.equal(allList.length, 1);

    const restored = await service.restoreRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      req.id,
      { reason: "Client wants it back" },
    );
    assert.equal(restored.archived_at, null);
  });

  it("requires archive reason", async () => {
    const { project } = await setupProject();
    const req = await service.createProjectRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { project_id: project.id, title: "Test" },
    );
    await assert.rejects(
      () => service.archiveRequirement([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, req.id, { reason: "" }),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.requirement.archive-reason-required",
    );
  });

  it("prevents editing/archiving/satisfying an archived requirement", async () => {
    const { project } = await setupProject();
    const req = await service.createProjectRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { project_id: project.id, title: "Test" },
    );
    await service.archiveRequirement([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, req.id, { reason: "Archived" });

    await assert.rejects(
      () => service.editProjectRequirement([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, req.id, { title: "Changed" }),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.requirement.archived",
    );
    await assert.rejects(
      () => service.satisfyRequirement([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, req.id, { satisfaction_note: "x" }),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.requirement.archived",
    );
    await assert.rejects(
      () => service.archiveRequirement([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, req.id, { reason: "Again" }),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.requirement.already-archived",
    );
  });

  it("prevents adding requirements to an archived project", async () => {
    const { project } = await setupProject();
    await testDb.prisma.sfProject.update({ where: { id: project.id }, data: { deleted_at: new Date() } });
    await assert.rejects(
      () => service.createProjectRequirement(
        [STUDIOFLOW_PERMISSIONS.projectManage],
        ACTOR,
        { project_id: project.id, title: "Nope" },
      ),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.project.archived",
    );
  });

  it("validates phase_id belongs to the same project", async () => {
    const { project } = await setupProject();
    const otherClient = await testDb.prisma.sfClient.create({ data: { name: "Other" } });
    const otherProject = await testDb.prisma.sfProject.create({
      data: { code: "SF26-OTH", name: "Other", client_id: otherClient.id, opened_at: new Date("2026-09-14") },
    });
    const otherPhase = await testDb.prisma.sfProjectPhase.create({
      data: {
        project_id: otherProject.id,
        template_id: (await testDb.prisma.sfPhaseTemplate.create({ data: { key: "x", name: "X", sort_order: 1 } })).id,
        key: "x", name: "X", sort_order: 1, has_rounds: true,
      },
    });
    await assert.rejects(
      () => service.createProjectRequirement(
        [STUDIOFLOW_PERMISSIONS.projectManage],
        ACTOR,
        { project_id: project.id, phase_id: otherPhase.id, title: "Cross-project" },
      ),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.phase.not-found",
    );
  });

  it("lists general and phase requirements separately", async () => {
    const { project, phase } = await setupProject();
    await service.createProjectRequirement([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, { project_id: project.id, title: "General 1" });
    await service.createProjectRequirement([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, { project_id: project.id, title: "General 2" });
    await service.createProjectRequirement([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, { project_id: project.id, phase_id: phase.id, title: "Phase 1" });

    const general = await service.listGeneralRequirements([STUDIOFLOW_PERMISSIONS.projectRead], project.id);
    assert.equal(general.length, 2);

    const phaseReqs = await service.listPhaseRequirements([STUDIOFLOW_PERMISSIONS.projectRead], project.id, phase.id);
    assert.equal(phaseReqs.length, 1);
  });
});

describe("§7.1.1 Requirement evidence", () => {
  async function setupWithReq() {
    const client = await testDb.prisma.sfClient.create({ data: { name: "Evidence Client" } });
    const project = await testDb.prisma.sfProject.create({
      data: { code: "SF26-EVI", name: "Evidence Project", client_id: client.id, opened_at: new Date("2026-09-14") },
    });
    const req = await service.createProjectRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { project_id: project.id, title: "Needs Evidence" },
    );
    return { project, req };
  }

  it("links and unlinks same-project files as evidence", async () => {
    const { project, req } = await setupWithReq();
    const file = await testDb.prisma.sfFile.create({
      data: {
        project_id: project.id, treatment: "RECORDED", filename: "test.skp",
        original_filename: "test.skp", bytes: 100, dropped_by_id: ACTOR.userId,
      },
    });

    const linked = await service.linkEvidence(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      req.id,
      { file_id: file.id },
    );
    assert.equal(linked.file_id, file.id);
    assert.equal(linked.requirement_id, req.id);

    // Read back with evidence
    const full = await service.getProjectRequirement([STUDIOFLOW_PERMISSIONS.projectRead], req.id);
    assert.equal(full.evidence.length, 1);
    assert.equal(full.evidence[0].file_id, file.id);

    const unlinked = await service.unlinkEvidence(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      req.id,
      linked.id,
      { reason: "Not relevant anymore" },
    );
    assert.ok(unlinked.unlinked_at);

    const fullAfter = await service.getProjectRequirement([STUDIOFLOW_PERMISSIONS.projectRead], req.id);
    assert.equal(fullAfter.evidence.length, 0);
  });

  it("rejects evidence from a different project", async () => {
    const { project, req } = await setupWithReq();
    const otherClient = await testDb.prisma.sfClient.create({ data: { name: "Other" } });
    const otherProject = await testDb.prisma.sfProject.create({
      data: { code: "SF26-OTH2", name: "Other", client_id: otherClient.id, opened_at: new Date("2026-09-14") },
    });
    const file = await testDb.prisma.sfFile.create({
      data: {
        project_id: otherProject.id, treatment: "RECORDED", filename: "other.skp",
        original_filename: "other.skp", bytes: 100, dropped_by_id: ACTOR.userId,
      },
    });

    await assert.rejects(
      () => service.linkEvidence([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, req.id, { file_id: file.id }),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.requirement.evidence-wrong-project",
    );
  });

  it("prevents duplicate evidence links", async () => {
    const { project, req } = await setupWithReq();
    const file = await testDb.prisma.sfFile.create({
      data: {
        project_id: project.id, treatment: "RECORDED", filename: "dup.skp",
        original_filename: "dup.skp", bytes: 100, dropped_by_id: ACTOR.userId,
      },
    });

    await service.linkEvidence([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, req.id, { file_id: file.id });
    await assert.rejects(
      () => service.linkEvidence([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, req.id, { file_id: file.id }),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.requirement.evidence-already-linked",
    );
  });

  it("prevents unlinking without reason", async () => {
    const { project, req } = await setupWithReq();
    const file = await testDb.prisma.sfFile.create({
      data: {
        project_id: project.id, treatment: "RECORDED", filename: "reason.skp",
        original_filename: "reason.skp", bytes: 100, dropped_by_id: ACTOR.userId,
      },
    });
    const linked = await service.linkEvidence([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, req.id, { file_id: file.id });
    await assert.rejects(
      () => service.unlinkEvidence([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, req.id, linked.id, { reason: "" }),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.requirement.unlink-reason-required",
    );
  });
});

describe("§7.1.1 Audit events", () => {
  it("writes audit events for requirement mutations", async () => {
    const client = await testDb.prisma.sfClient.create({ data: { name: "Audit Client" } });
    const project = await testDb.prisma.sfProject.create({
      data: { code: "SF26-AUD", name: "Audit Project", client_id: client.id, opened_at: new Date("2026-09-14") },
    });
    const req = await service.createProjectRequirement(
      [STUDIOFLOW_PERMISSIONS.projectManage],
      ACTOR,
      { project_id: project.id, title: "Audited Req" },
    );

    const audit = await testDb.prisma.auditEvent.findMany({
      where: { entity_id: req.id },
      orderBy: { occurred_at: "asc" },
    });
    assert.ok(audit.length >= 1);
    assert.equal(audit[0].action, "requirement.create");

    await service.satisfyRequirement([STUDIOFLOW_PERMISSIONS.projectManage], ACTOR, req.id, { satisfaction_note: "Done" });
    const auditAfter = await testDb.prisma.auditEvent.findMany({
      where: { entity_id: req.id },
      orderBy: { occurred_at: "asc" },
    });
    assert.ok(auditAfter.length >= 2);
    assert.equal(auditAfter[1].action, "requirement.satisfy");
    const metadata = auditAfter[1].metadata;
    assert.equal(typeof metadata, "object");
    assert.equal((metadata as Record<string, unknown> | null)?.satisfaction_note, undefined);
    assert.equal((metadata as Record<string, unknown> | null)?.satisfaction_state, "SATISFIED");
  });
});
