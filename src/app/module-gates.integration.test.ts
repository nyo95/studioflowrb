import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { closePrismaConnection } from "@platform/core/db";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "@platform/core/db/test-support";
import { initializeModuleRegistry, resetModuleRegistryForTests, type ModuleManifest } from "@platform/core/modules";

import PresentationPrintPage from "./(document)/studioflow/print/projects/[projectId]/presentation/[boardId]/page";
import { createPresentationBoardAction } from "@/apps/presentation/public/actions";
import { addWorkspaceImageToMoodboardAction } from "@/apps/presentation/public/image-actions";
import { listIdeaCardsAction } from "@/apps/ideas/public/actions";
import { createWorkspaceFileAction, createWorkspaceImageAction, listWorkspaceThreadsAction, postThreadImageAction, threadCommandAction, workspaceAction } from "./(platform)/studioflow/actions";
import IdeasPage from "./(platform)/studioflow/ideas/page";
import PresentationPage from "./(platform)/studioflow/projects/[projectId]/presentation/page";
import PresentationBoardPage from "./(platform)/studioflow/projects/[projectId]/presentation/[boardId]/page";

const MANIFESTS: readonly ModuleManifest[] = [
  { id: "masterdata", name: "Master Data", version: "1.0.0", kind: "core", requires: [] },
  { id: "studioflow", name: "StudioFlow", version: "1.0.0", kind: "core", requires: ["masterdata"] },
  { id: "ideas", name: "Ideas Board", version: "1.0.0", kind: "optional", parent: "studioflow", requires: ["studioflow"] },
  { id: "presentation", name: "Presentation", version: "1.0.0", kind: "optional", parent: "studioflow", requires: ["studioflow"] },
  // No stored row: it starts off on its own (owner 2026-10-14).
  { id: "workspace-board", name: "Workspace board", version: "1.0.0", kind: "optional", parent: "studioflow", requires: ["studioflow"], initialState: "DISABLED" },
];

let db: TestDb;

before(async () => {
  initializeModuleRegistry(MANIFESTS);
  db = await createTestDb(requireDisposableTestDatabaseUrl());
  await truncatePlatformTables(db);
  await db.prisma.moduleState.createMany({ data: [
    { module_id: "ideas", state: "DISABLED", last_version: "1.0.0", updated_by: "test" },
    { module_id: "presentation", state: "DISABLED", last_version: "1.0.0", updated_by: "test" },
  ] });
});

after(async () => {
  resetModuleRegistryForTests();
  await closePrismaConnection();
  await closeTestDb(db);
});

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error &&
    typeof error.digest === "string" && error.digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

describe("disabled StudioFlow module gates", () => {
  it("refuses text/image thread posts, moves and marker reads with MODULE_DISABLED before auth or validation", async () => {
    const results = [
      await threadCommandAction({ command: "post", projectId: "invalid", phaseId: "invalid", thread: { x: 0, y: 0 }, body: "Ignored" }),
      await threadCommandAction({ command: "move", projectId: "invalid", threadId: "invalid", version: 1, x: 0, y: 0 }),
      await postThreadImageAction(new FormData()),
      await listWorkspaceThreadsAction("invalid"),
    ];
    for (const result of results) {
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "MODULE_DISABLED");
    }
  });
  it("returns MODULE_DISABLED before auth or validation from every Ideas and Presentation action lane", async () => {
    const ideas = await listIdeaCardsAction();
    assert.equal(ideas.ok, false);
    if (!ideas.ok) assert.equal(ideas.error.code, "MODULE_DISABLED");

    const presentation = await createPresentationBoardAction({ projectId: "not-a-uuid", title: "Ignored" });
    assert.equal(presentation.ok, false);
    if (!presentation.ok) assert.equal(presentation.error.code, "MODULE_DISABLED");

    const moodboard = await addWorkspaceImageToMoodboardAction({ projectId: "not-a-uuid", imageId: "not-a-uuid" });
    assert.equal(moodboard.ok, false);
    if (!moodboard.ok) assert.equal(moodboard.error.code, "MODULE_DISABLED");
  });

  it("refuses every Workspace board command while the board module has never been switched on", async () => {
    const results = [
      await workspaceAction({ command: "placeItems", projectId: "not-a-uuid", cards: [] }),
      await createWorkspaceImageAction(new FormData()),
      await createWorkspaceFileAction(new FormData()),
    ];
    for (const result of results) {
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "MODULE_DISABLED");
    }
  });

  it("returns not-found from Ideas, Presentation, board, and print routes before loading app data", async () => {
    await assert.rejects(() => IdeasPage(), isNotFound);
    await assert.rejects(() => PresentationPage({ params: Promise.resolve({ projectId: "not-a-uuid" }) }), isNotFound);
    await assert.rejects(() => PresentationBoardPage({ params: Promise.resolve({ projectId: "not-a-uuid", boardId: "not-a-uuid" }) }), isNotFound);
    await assert.rejects(() => PresentationPrintPage({
      params: Promise.resolve({ projectId: "not-a-uuid", boardId: "not-a-uuid" }),
      searchParams: Promise.resolve({}),
    }), isNotFound);
  });
});
