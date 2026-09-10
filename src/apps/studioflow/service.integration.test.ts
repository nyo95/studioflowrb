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
      "studioflow"."sf_product_catalogue",
      "studioflow"."sf_client",
      "studioflow"."sf_phase_template",
      "platform"."AuditEvent"
    RESTART IDENTITY CASCADE
  `);
}

async function seedRoundPhase() {
  const client = await testDb.prisma.sfClient.create({ data: { name: "Client" } });
  const template = await testDb.prisma.sfPhaseTemplate.create({
    data: {
      key: "DESIGN",
      name: "Design",
      sort_order: 1,
      has_rounds: true,
      round_prefix: "D",
    },
  });
  const project = await testDb.prisma.sfProject.create({
    data: {
      code: "SF26-TEST",
      name: "Test project",
      client_id: client.id,
      opened_at: new Date("2026-09-09T00:00:00.000Z"),
    },
  });
  const phase = await testDb.prisma.sfProjectPhase.create({
    data: {
      project_id: project.id,
      template_id: template.id,
      key: template.key,
      name: template.name,
      sort_order: template.sort_order,
      has_rounds: true,
      round_prefix: template.round_prefix,
      folder_key: "design",
    },
  });
  return { phase, project };
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

describe("StudioFlow round lifecycle", () => {
  it("reserves send and stop for reviewers and blocks a second pending send", async () => {
    const { phase } = await seedRoundPhase();
    const first = await service.openIteration(
      [STUDIOFLOW_PERMISSIONS.iterationManage],
      ACTOR,
      phase.id,
    );

    await service.sendIteration(
      [STUDIOFLOW_PERMISSIONS.iterationReview],
      ACTOR,
      first.iteration.id,
    );
    const second = await service.openIteration(
      [STUDIOFLOW_PERMISSIONS.iterationManage],
      ACTOR,
      phase.id,
    );

    await assert.rejects(
      () =>
        service.sendIteration(
          [STUDIOFLOW_PERMISSIONS.iterationReview],
          ACTOR,
          second.iteration.id,
        ),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "studioflow.iteration.pending-client-response",
    );

    await service.voidIteration(
      [STUDIOFLOW_PERMISSIONS.iterationReview],
      ACTOR,
      first.iteration.id,
      "Incorrect send",
    );
    await service.sendIteration(
      [STUDIOFLOW_PERMISSIONS.iterationReview],
      ACTOR,
      second.iteration.id,
    );
  });

  it("reuses an existing successor draft and appends client points", async () => {
    const { phase } = await seedRoundPhase();
    const first = await service.openIteration(
      [STUDIOFLOW_PERMISSIONS.iterationManage],
      ACTOR,
      phase.id,
    );
    await service.sendIteration(
      [STUDIOFLOW_PERMISSIONS.iterationReview],
      ACTOR,
      first.iteration.id,
    );
    const successor = await service.openIteration(
      [STUDIOFLOW_PERMISSIONS.iterationManage],
      ACTOR,
      phase.id,
    );
    await service.addIterationPoint(
      [STUDIOFLOW_PERMISSIONS.iterationManage],
      ACTOR,
      successor.iteration.id,
      "Existing work",
    );

    const result = await service.recordResponse(
      [STUDIOFLOW_PERMISSIONS.iterationReview],
      ACTOR,
      first.iteration.id,
      { kind: "REVISION", points: ["Client change"] },
    );

    assert.equal(result.nextIteration?.id, successor.iteration.id);
    assert.equal(await testDb.prisma.sfIteration.count({ where: { phase_id: phase.id } }), 2);
    const points = await testDb.prisma.sfIterationPoint.findMany({
      where: { iteration_id: successor.iteration.id },
      orderBy: { sort_order: "asc" },
    });
    assert.deepEqual(
      points.map((point) => [point.text, point.source]),
      [
        ["Existing work", "INTERNAL"],
        ["Client change", "CLIENT_REVISION"],
      ],
    );
  });

  it("saves approval and optional phase closure atomically", async () => {
    const { phase } = await seedRoundPhase();
    const first = await service.openIteration(
      [STUDIOFLOW_PERMISSIONS.iterationManage],
      ACTOR,
      phase.id,
    );
    await service.sendIteration(
      [STUDIOFLOW_PERMISSIONS.iterationReview],
      ACTOR,
      first.iteration.id,
    );
    const successor = await service.openIteration(
      [STUDIOFLOW_PERMISSIONS.iterationManage],
      ACTOR,
      phase.id,
    );

    await assert.rejects(
      () =>
        service.recordResponse(
          [STUDIOFLOW_PERMISSIONS.iterationReview],
          ACTOR,
          first.iteration.id,
          { kind: "APPROVAL", also_finish_phase: true },
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "studioflow.phase.open-iterations",
    );
    assert.equal(await testDb.prisma.sfResponse.count(), 0);
    assert.equal(
      (await testDb.prisma.sfIteration.findUniqueOrThrow({ where: { id: first.iteration.id } }))
        .state,
      "SENT",
    );

    await service.voidIteration(
      [STUDIOFLOW_PERMISSIONS.iterationReview],
      ACTOR,
      successor.iteration.id,
      "Not required",
    );
    await service.recordResponse(
      [STUDIOFLOW_PERMISSIONS.iterationReview],
      ACTOR,
      first.iteration.id,
      { kind: "APPROVAL", also_finish_phase: true },
    );

    assert.equal(
      (await testDb.prisma.sfProjectPhase.findUniqueOrThrow({ where: { id: phase.id } })).state,
      "DONE",
    );
    const responseAudit = await testDb.prisma.auditEvent.findFirstOrThrow({
      where: { action: "response.record" },
    });
    assert.equal((responseAudit.metadata as { phase_closed?: boolean }).phase_closed, true);
  });

  it("getNextFilename uses DRAFT round number when draft exists", async () => {
    const { phase } = await seedRoundPhase();
    const iter = await service.openIteration(
      [STUDIOFLOW_PERMISSIONS.iterationManage],
      ACTOR,
      phase.id,
    );
    const projectId = (await testDb.prisma.sfProjectPhase.findUniqueOrThrow({ where: { id: phase.id } })).project_id;
    const filename = await service.getNextFilename(
      [STUDIOFLOW_PERMISSIONS.projectRead],
      projectId,
      phase.id,
    );
    assert.match(filename, new RegExp(`D ${iter.iteration.number}`));
  });

  it("getNextFilename previews max+1 when no DRAFT exists", async () => {
    const { phase } = await seedRoundPhase();
    const projectId = (await testDb.prisma.sfProjectPhase.findUniqueOrThrow({ where: { id: phase.id } })).project_id;
    // No draft yet — should preview D 1 (0 + 1)
    const filename = await service.getNextFilename(
      [STUDIOFLOW_PERMISSIONS.projectRead],
      projectId,
      phase.id,
    );
    assert.match(filename, /D 1/);

    // Open then void — max number is 1, so next preview should be D 2
    const first = await service.openIteration([STUDIOFLOW_PERMISSIONS.iterationManage], ACTOR, phase.id);
    await service.voidIteration([STUDIOFLOW_PERMISSIONS.iterationReview], ACTOR, first.iteration.id, "Test void");
    const filename2 = await service.getNextFilename(
      [STUDIOFLOW_PERMISSIONS.projectRead],
      projectId,
      phase.id,
    );
    assert.match(filename2, /D 2/);
  });

  it("getNextFilename rejects a phase from a different project", async () => {
    const { phase } = await seedRoundPhase();
    const otherClient = await testDb.prisma.sfClient.create({ data: { name: "Other" } });
    const otherProject = await testDb.prisma.sfProject.create({
      data: {
        code: "SF26-OTH",
        name: "Other project",
        client_id: otherClient.id,
        opened_at: new Date("2026-09-09T00:00:00.000Z"),
      },
    });
    await assert.rejects(
      () =>
        service.getNextFilename(
          [STUDIOFLOW_PERMISSIONS.projectRead],
          otherProject.id,
          phase.id,
        ),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.phase.not-found",
    );
  });

  it("DONE supervision phase refuses file intake", async () => {
    const client = await testDb.prisma.sfClient.create({ data: { name: "SupClient" } });
    const supTemplate = await testDb.prisma.sfPhaseTemplate.create({
      data: { key: "SUPERVISION", name: "Supervision", sort_order: 2, has_rounds: false, round_prefix: null },
    });
    const project = await testDb.prisma.sfProject.create({
      data: {
        code: "SF26-SUP",
        name: "Sup project",
        client_id: client.id,
        opened_at: new Date("2026-09-09T00:00:00.000Z"),
      },
    });
    const supPhase = await testDb.prisma.sfProjectPhase.create({
      data: {
        project_id: project.id,
        template_id: supTemplate.id,
        key: supTemplate.key,
        name: supTemplate.name,
        sort_order: supTemplate.sort_order,
        has_rounds: false,
        round_prefix: null,
        folder_key: "supervision",
      },
    });
    // Start and finish supervision
    await service.startSupervision([STUDIOFLOW_PERMISSIONS.iterationReview], ACTOR, supPhase.id);
    await service.finishSupervision([STUDIOFLOW_PERMISSIONS.iterationReview], ACTOR, supPhase.id);

    await assert.rejects(
      () =>
        service.recordFile(
          [STUDIOFLOW_PERMISSIONS.iterationManage],
          ACTOR,
          { project_id: project.id, folder_key: "supervision", original_filename: "site.skp", bytes: 100 },
        ),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.phase.closed",
    );
  });

  it("DONE round-bearing phases refuse both record and link intake", async () => {
    const { phase } = await seedRoundPhase();
    const projectId = (await testDb.prisma.sfProjectPhase.findUniqueOrThrow({ where: { id: phase.id } })).project_id;
    await testDb.prisma.sfProjectPhase.update({ where: { id: phase.id }, data: { state: "DONE" } });

    await assert.rejects(
      () => service.recordFile(
        [STUDIOFLOW_PERMISSIONS.iterationManage],
        ACTOR,
        { project_id: projectId, folder_key: "design", original_filename: "done.skp", bytes: 100 },
      ),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.phase.closed",
    );
    await assert.rejects(
      () => service.linkFile(
        [STUDIOFLOW_PERMISSIONS.iterationManage],
        ACTOR,
        { project_id: projectId, folder_key: "design", original_filename: "done.pdf", external_url: "https://example.com/done.pdf" },
      ),
      (err: unknown) => err instanceof AppError && err.code === "studioflow.phase.closed",
    );
  });

  it("current file excludes superseded and respects folder", async () => {
    const { phase } = await seedRoundPhase();
    const projectId = (await testDb.prisma.sfProjectPhase.findUniqueOrThrow({ where: { id: phase.id } })).project_id;
    // Drop first file (will be superseded by second)
    const first = await service.recordFile(
      [STUDIOFLOW_PERMISSIONS.iterationManage],
      ACTOR,
      { project_id: projectId, folder_key: "design", original_filename: "v1.skp", bytes: 100 },
    );
    const second = await service.recordFile(
      [STUDIOFLOW_PERMISSIONS.iterationManage],
      ACTOR,
      { project_id: projectId, folder_key: "design", original_filename: "v2.skp", bytes: 200 },
    );
    await service.recordFile(
      [STUDIOFLOW_PERMISSIONS.iterationManage],
      ACTOR,
      { project_id: projectId, folder_key: "other", original_filename: "other.skp", bytes: 300 },
    );
    const files = await service.listFiles([STUDIOFLOW_PERMISSIONS.projectRead], projectId);
    const active = files.filter((f) => f.folder_key === "design" && f.superseded_at === null);
    assert.equal(active.length, 1);
    assert.equal(active[0].id, second.file.id);
    const superseded = files.filter((f) => f.id === first.file.id);
    assert.ok(superseded[0].superseded_at !== null);
  });

  it("keeps one unsent current deliverable and freezes it on send", async () => {
    const { phase } = await seedRoundPhase();
    const first = await service.recordFile(
      [STUDIOFLOW_PERMISSIONS.iterationManage],
      ACTOR,
      { project_id: (await testDb.prisma.sfProjectPhase.findUniqueOrThrow({ where: { id: phase.id } })).project_id, folder_key: "design", original_filename: "first.skp", bytes: 10 },
    );
    const second = await service.recordFile(
      [STUDIOFLOW_PERMISSIONS.iterationManage],
      ACTOR,
      { project_id: first.file.project_id, folder_key: "design", original_filename: "second.skp", bytes: 20 },
    );
    assert.equal(second.iteration?.id, first.iteration?.id);
    assert.equal((await testDb.prisma.sfFile.findUniqueOrThrow({ where: { id: first.file.id } })).superseded_at !== null, true);
    assert.equal((await testDb.prisma.sfIteration.findUniqueOrThrow({ where: { id: first.iteration!.id } })).working_revision, 1);

    await service.sendIteration([STUDIOFLOW_PERMISSIONS.iterationReview], ACTOR, first.iteration!.id);
    assert.equal((await testDb.prisma.sfFile.findUniqueOrThrow({ where: { id: second.file.id } })).sent_in_iteration_id, first.iteration!.id);
  });

  it("keeps MOM project-scoped, ordered, auditable, and immutable after issue", async () => {
    const { project } = await seedRoundPhase();
    const draft = await service.createMomDraft([STUDIOFLOW_PERMISSIONS.momManage], ACTOR, {
      project_id: project.id,
      topic: "Design review",
      meeting_at: new Date("2026-09-10T03:00:00.000Z"),
      prepared_by_name: "Designer",
    });
    assert.equal(draft.sequence, null);
    assert.equal(draft.items.length, 1);

    await service.updateMomContent([STUDIOFLOW_PERMISSIONS.momManage], ACTOR, project.id, draft.id, {
      items: [{
        sort_order: 0,
        is_text_only: false,
        list_style: "BULLET",
        points: [{ sort_order: 0, text: "Approve tile sample", style: "BULLET" }],
        images: [{ sort_order: 0, storage_key: `studioflow/mom/${project.id}/${draft.id}/sample.png`, alt_text: "Tile sample" }],
      }],
    });
    const issued = await service.issueMom([STUDIOFLOW_PERMISSIONS.momIssue], ACTOR, project.id, draft.id);
    assert.equal(issued.state, "ISSUED");
    assert.equal(issued.sequence, 1);
    await assert.rejects(
      () => service.updateMomDraft([STUDIOFLOW_PERMISSIONS.momManage], ACTOR, project.id, draft.id, { topic: "Changed" }),
      (error: unknown) => error instanceof AppError && error.code === "studioflow.mom.immutable",
    );
    assert.ok(await testDb.prisma.auditEvent.findFirst({ where: { action: "mom.issue", entity_id: draft.id } }));
  });

  it("refuses cross-project MOM child mutation and issues a correction without rewriting the source", async () => {
    const { project } = await seedRoundPhase();
    const otherClient = await testDb.prisma.sfClient.create({ data: { name: "Other client" } });
    const otherProject = await testDb.prisma.sfProject.create({ data: { code: "SF26-MOM2", name: "Other", client_id: otherClient.id, opened_at: new Date() } });
    const draft = await service.createMomDraft([STUDIOFLOW_PERMISSIONS.momManage], ACTOR, { project_id: project.id, topic: "Original", meeting_at: new Date(), prepared_by_name: "Designer" });
    await assert.rejects(
      () => service.updateMomContent([STUDIOFLOW_PERMISSIONS.momManage], ACTOR, otherProject.id, draft.id, { items: [{ sort_order: 0, is_text_only: true, list_style: "NONE", points: [{ sort_order: 0, text: "No", style: "TEXT" }], images: [] }] }),
      (error: unknown) => error instanceof AppError && error.code === "studioflow.mom.not-found",
    );
    await service.updateMomContent([STUDIOFLOW_PERMISSIONS.momManage], ACTOR, project.id, draft.id, {
      items: [{ sort_order: 0, is_text_only: true, list_style: "NONE", points: [{ sort_order: 0, text: "Approved content", style: "TEXT" }], images: [] }],
    });
    await service.issueMom([STUDIOFLOW_PERMISSIONS.momIssue], ACTOR, project.id, draft.id);
    const correction = await service.supersedeMom([STUDIOFLOW_PERMISSIONS.momIssue], ACTOR, project.id, draft.id, { project_id: project.id, topic: "Corrected", meeting_at: new Date(), prepared_by_name: "Designer" });
    assert.equal(correction.supersedes_id, draft.id);
    assert.equal(correction.sequence, 2);
    assert.equal((await testDb.prisma.sfMomDocument.findUniqueOrThrow({ where: { id: draft.id } })).state, "SUPERSEDED");
  });

  it("creates, searches, no-op edits, archives, and restores Product Catalogue rows", async () => {
    const product = await service.createCatalogueProduct([STUDIOFLOW_PERMISSIONS.scheduleManage], ACTOR, { brand_md_id: "brand-1", brand_name: "Acme", product_name: "Tile", colour: "White", finishing: "Matte", unit: "pcs" });
    assert.equal(product.search_key, "acme::tile::white::matte");
    assert.equal((await service.listCatalogueProducts([STUDIOFLOW_PERMISSIONS.projectRead], { search: "WHITE" })).length, 1);
    const beforeAudit = await testDb.prisma.auditEvent.count({ where: { action: "catalogue.edit", entity_id: product.id } });
    await service.editCatalogueProduct([STUDIOFLOW_PERMISSIONS.scheduleManage], ACTOR, product.id, { product_name: "Tile" });
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "catalogue.edit", entity_id: product.id } }), beforeAudit);
    await service.archiveCatalogueProduct([STUDIOFLOW_PERMISSIONS.scheduleManage], ACTOR, product.id);
    assert.equal((await service.listCatalogueProducts([STUDIOFLOW_PERMISSIONS.projectRead])).length, 0);
    await service.restoreCatalogueProduct([STUDIOFLOW_PERMISSIONS.scheduleManage], ACTOR, product.id);
    assert.equal((await service.listCatalogueProducts([STUDIOFLOW_PERMISSIONS.projectRead])).length, 1);
    await assert.rejects(() => service.createCatalogueProduct([], ACTOR, { product_name: "Forbidden" }), (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN");
  });
});
