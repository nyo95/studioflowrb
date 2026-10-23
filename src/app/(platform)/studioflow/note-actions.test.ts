import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import ts from "typescript";
import { z } from "zod";

import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { AppError } from "@platform/core/errors";
import { validationError } from "@platform/core/validation";
import { SCHEDULE_HIGHLIGHTS } from "@/apps/studioflow/domain/schedule";

const projectId = randomUUID();
const noteId = randomUUID();
type Actions = Record<"noteAction" | "phaseNoteAction" | "workspaceAction" | "threadCommandAction" | "postThreadImageAction" | "listWorkspaceThreadsAction" | "listProjectNotesAction", (input: unknown) => Promise<ActionResult<unknown>>>;

/** Run the real action schemas/auth/dispatch/revalidation with Board explicitly unavailable. */
function loadActions(failure?: AppError) {
  const compiled = ts.transpileModule(readFileSync("src/app/(platform)/studioflow/actions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls: Array<{ method: string; input: Record<string, unknown> }> = [];
  const refreshed: string[] = [];
  let moduleChecks = 0;
  let signedIn = true;
  let boardEnabled = false;
  const workspace = Object.fromEntries(["updateWorkspaceCardText", "setWorkspaceCardFlags", "deleteWorkspaceCard", "postThreadMessage", "postThreadImage", "moveThread", "listWorkspaceThreads", "listProjectNotes"].map((method) => [method, async (input: Record<string, unknown>) => {
    calls.push({ method, input });
    if (failure) throw failure;
    if (method === "listProjectNotes") return { notes: [], cursor: null };
    if (method === "listWorkspaceThreads") return [];
    if (method === "postThreadMessage") return { threadId: noteId, noteId };
    if (method === "postThreadImage") return { threadId: noteId, imageId: noteId };
    if (method === "moveThread") return { threadId: input.threadId, version: Number(input.version) + 1 };
    return { cardId: input.cardId, version: 8 };
  }]));
  const dependencies: Record<string, unknown> = {
    "next/cache": { revalidatePath: (path: string) => refreshed.push(path) },
    "zod": { z },
    "@platform/core/auth": { requirePrincipalGrants: async () => {
      if (!signedIn) throw new AppError("UNAUTHENTICATED", "ACTOR_REQUIRED", "Sign in first.");
      return { principal: { userId: "actor", displayName: "Designer" }, grants: ["studioflow.phase.work"] };
    } },
    "@platform/core/actions": { runSafeAction },
    "@platform/core/errors": { AppError },
    "@platform/core/modules": { requireModuleEnabled: async () => { moduleChecks++; if (!boardEnabled) throw new AppError("CONFLICT", "MODULE_DISABLED", "Board is disabled."); } },
    "@platform/core/validation": { validationError },
    "@/apps/studioflow/domain/schedule": { SCHEDULE_HIGHLIGHTS },
    "@/apps/studioflow/shared": { P: { projectManage: "studioflow.project.manage" }, requireCommand: () => undefined },
    "@/apps/presentation/public/lifecycle": {},
    "@/apps/ideas/public/lifecycle": {},
    "@/apps/studioflow/runtime": { studioFlow: { workspace } },
  };
  const actions = {} as Actions;
  new Function("require", "exports", compiled)((id: string) => {
    assert.ok(id in dependencies, `unexpected dependency: ${id}`);
    return dependencies[id];
  }, actions);
  return { actions, calls, refreshed, moduleChecks: () => moduleChecks, enableBoard: () => { boardEnabled = true; }, signOut: () => { signedIn = false; } };
}

it("thread transport authenticates and validates exclusive thread specs, required phase, bounds/version and dispatches posts/moves", async () => {
  const test = loadActions(); test.enableBoard();
  const base = { command: "post", projectId, phaseId: noteId, body: "Message" };
  for (const thread of [{ threadId: noteId }, { x: 0, y: 100_000 }, { anchorCardId: noteId, offsetX: -2, offsetY: 3 }]) {
    assert.deepEqual(await test.actions.threadCommandAction({ ...base, thread, tags: ["tile"], itemEntryIds: [noteId] }), { ok: true, data: { threadId: noteId, noteId } });
    assert.deepEqual(test.calls.at(-1)!.input.thread, thread);
  }
  assert.deepEqual(await test.actions.threadCommandAction({ command: "move", projectId, threadId: noteId, version: 7, x: 10, y: 20 }), { ok: true, data: { threadId: noteId, version: 8 } });
  const called = test.calls.length;
  for (const thread of [{}, { threadId: noteId, x: 0, y: 0 }, { x: -1, y: 0 }, { x: 1.5, y: 0 }, { anchorCardId: noteId, offsetX: 0 }, { x: 0, y: 0, extra: true }]) assert.equal((await test.actions.threadCommandAction({ ...base, thread })).ok, false);
  assert.equal((await test.actions.threadCommandAction({ ...base, phaseId: undefined, thread: { x: 0, y: 0 } })).ok, false);
  assert.equal((await test.actions.threadCommandAction({ command: "move", projectId, threadId: noteId, version: 0, x: 0, y: 0 })).ok, false);
  assert.equal(test.calls.length, called);
  assert.equal(test.refreshed.length, 8);
  test.signOut();
  assert.equal((await test.actions.threadCommandAction({ ...base, thread: { x: 0, y: 0 } })).ok, false);
  assert.equal(test.calls.length, called);
});

it("thread image FormData uses the same exclusive spec, requires a file, parses tags and preserves safe refusal", async () => {
  const test = loadActions(); test.enableBoard();
  const form = () => {
    const data = new FormData();
    data.set("projectId", projectId); data.set("phaseId", noteId); data.set("x", "0"); data.set("y", "100000");
    data.set("tags", '["photos"]'); data.set("clientFeedback", "true");
    data.set("file", new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" }));
    return data;
  };
  assert.deepEqual(await test.actions.postThreadImageAction(form()), { ok: true, data: { threadId: noteId, imageId: noteId } });
  assert.deepEqual(test.calls[0].input.thread, { x: 0, y: 100_000 });
  assert.deepEqual(test.calls[0].input.tags, ["photos"]);
  assert.equal(test.calls[0].input.clientFeedback, true);
  for (const modify of [
    (data: FormData) => data.set("threadId", noteId),
    (data: FormData) => data.set("x", ""),
    (data: FormData) => data.delete("phaseId"),
    (data: FormData) => data.delete("file"),
    (data: FormData) => data.append("x", "20"),
    (data: FormData) => data.set("tags", "broken"),
  ]) { const data = form(); modify(data); assert.equal((await test.actions.postThreadImageAction(data)).ok, false); }
  assert.equal(test.calls.length, 1);
  const failed = loadActions(new AppError("CONFLICT", "WORKSPACE_THREAD_LOCKED", "Safe refusal")); failed.enableBoard();
  const result = await failed.actions.threadCommandAction({ command: "post", projectId, phaseId: noteId, body: "No", thread: { x: 0, y: 0 } });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.safeMessage, "Safe refusal");
  assert.equal(failed.refreshed.length, 0);
});

it("thread marker reads remain gated but thread-filtered Notes reads and existing-message mutations work with Board off", async () => {
  const test = loadActions();
  assert.deepEqual(await test.actions.listProjectNotesAction({ projectId, threadId: noteId, inThreads: true }), { ok: true, data: { notes: [], cursor: null } });
  assert.equal(test.moduleChecks(), 0);
  assert.equal(test.calls[0].input.threadId, noteId);
  assert.equal(test.calls[0].input.inThreads, true);
  assert.equal(test.calls[0].input.actorId, "actor");
  assert.equal((await test.actions.noteAction({ command: "delete", projectId, noteId, version: 1 })).ok, true);
  const result = await test.actions.listWorkspaceThreadsAction(projectId);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "MODULE_DISABLED");
  test.enableBoard();
  assert.deepEqual(await test.actions.listWorkspaceThreadsAction(projectId), { ok: true, data: [] });
  assert.equal(test.calls.at(-1)!.input.projectId, projectId);
  assert.equal(test.calls.at(-1)!.input.actorId, "actor");
});

it("noteAction requires a positive integer read version on edit, flags and delete before dispatch", async () => {
  const { actions, calls, refreshed } = loadActions();
  for (const command of ["edit", "flags", "delete"]) {
    for (const version of [undefined, 0, -1, 1.5, "1", null, Number.NaN]) {
      const result = await actions.noteAction({ command, projectId, noteId, version, ...(command === "edit" ? { body: "Draft", itemEntryIds: [] } : {}) });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.kind, "VALIDATION");
    }
  }
  for (const extra of [{ phaseId: randomUUID() }, { unknown: true }]) {
    assert.equal((await actions.noteAction({ command: "delete", projectId, noteId, version: 1, ...extra })).ok, false);
  }
  assert.equal((await actions.noteAction({ command: "edit", projectId, noteId, version: 1, body: "Missing complete set" })).ok, false);
  assert.equal(calls.length, 0);
  assert.equal(refreshed.length, 0);
});

it("Notes edit/star/feedback/delete use stored-label workspace gates with Board off and preserve the exact version", async () => {
  const test = loadActions();
  for (const input of [
    { command: "edit", body: "General changed", tags: ["local"], itemEntryIds: [] },
    { command: "flags", starred: true, clientFeedback: false },
    { command: "delete" },
  ]) assert.deepEqual(await test.actions.noteAction({ ...input, projectId, noteId, version: 7 }), { ok: true, data: { noteId } });
  assert.equal(test.moduleChecks(), 0);
  assert.deepEqual(test.calls.map((call) => call.method), ["updateWorkspaceCardText", "setWorkspaceCardFlags", "deleteWorkspaceCard"]);
  for (const { input } of test.calls) {
    assert.equal(input.version, 7);
    assert.equal(input.cardId, noteId);
    assert.equal(input.projectId, projectId);
    assert.equal(input.actor && (input.actor as { userId: string }).userId, "actor");
    assert.equal("phaseId" in input, false);
  }
  assert.deepEqual(test.calls[0]!.input.itemEntryIds, []);
  assert.equal(test.calls[1]!.input.pinned, true);
  assert.equal(test.calls[1]!.input.clientAnswer, false);
  assert.equal(test.refreshed.length, 6);
  assert.equal((await test.actions.workspaceAction({ command: "deleteCard", projectId, cardId: noteId, version: 7 })).ok, false);
  assert.equal(test.moduleChecks(), 1, "Board's own door remains gated");
});

it("Notes preserves service refusals, never revalidates a failed write, and authenticates", async () => {
  for (const code of ["WORKSPACE_CARD_STALE", "WORKSPACE_RECORD_LOCKED", "PERMISSION_DENIED"]) {
    const test = loadActions(new AppError("CONFLICT", code, "Safe refusal"));
    const result = await test.actions.noteAction({ command: "flags", projectId, noteId, version: 1, clientFeedback: false });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, code);
    assert.equal(test.refreshed.length, 0);
  }
  const test = loadActions();
  test.signOut();
  assert.equal((await test.actions.noteAction({ command: "delete", projectId, noteId, version: 1 })).ok, false);
  assert.equal(test.calls.length, 0);
});

it("phaseNoteAction no longer accepts the unversioned edit/flags/delete alternatives", async () => {
  const { actions, calls } = loadActions();
  for (const command of ["edit", "flags", "delete"]) {
    const result = await actions.phaseNoteAction({ command, projectId, phaseId: randomUUID(), noteId, body: "Old transport" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "VALIDATION");
  }
  assert.equal(calls.length, 0);
});
