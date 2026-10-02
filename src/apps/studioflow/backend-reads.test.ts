import assert from "node:assert/strict";
import { it } from "node:test";
import { readBlockerCountsBatch } from "./phases/blocker-query";
import { createProjectService } from "./projects/service";
import { STUDIOFLOW_PERMISSIONS as P } from "./permissions";
import type { Db, StudioFlowPorts } from "./shared";

it("batch blocker reads use three statements even for many phases", async () => {
  for (const size of [0, 1, 30]) {
    const ids = Array.from({ length: size }, (_, i) => `phase-${i}`);
    let statements = 0;
    const db = {
      sfRevision: { findMany: async (query: { where: unknown }) => {
        statements++;
        assert.deepEqual(query.where, { phase_id: { in: ids }, status: { in: ["NOT_SENT", "SENT", "ANSWERED"] } });
        return ids.map((id) => ({ id: `revision-${id}`, phase_id: id }));
      } },
      sfActivity: { groupBy: async (query: { where: unknown; by: string[] }) => {
        statements++;
        assert.deepEqual(query.by, ["revision_id"]);
        assert.deepEqual(query.where, { revision_id: { in: ids.map((id) => `revision-${id}`) }, status: "OPEN" });
        return ids.map((id) => ({ revision_id: `revision-${id}`, _count: { _all: 2 } }));
      } },
      sfChecklistItem: { groupBy: async (query: { where: unknown; by: string[] }) => {
        statements++;
        assert.deepEqual(query.by, ["phase_id"]);
        assert.deepEqual(query.where, { phase_id: { in: ids }, parent_id: null, is_checked: false, is_blocking: true });
        return ids.map((id) => ({ phase_id: id, _count: { _all: 3 } }));
      } },
    } as unknown as Db;
    const result = await readBlockerCountsBatch(db, ids);
    assert.equal(statements, 3);
    assert.equal(result.size, size);
    for (const id of ids) assert.deepEqual(result.get(id), { openRevisionActivities: 2, openRootChecklistItems: 3 });
  }
});

it("quick-search bounds both database reads and selects only the returned fields", async () => {
  for (const limit of [undefined, 2]) {
    let statements = 0;
    const db = {
      sfProject: { findMany: async (query: { take: number; select: unknown; include?: unknown }) => {
        statements++;
        assert.equal(query.take, limit ?? 6);
        assert.equal(query.include, undefined);
        assert.deepEqual(query.select, { id: true, name: true, client: { select: { name: true } } });
        return [{ id: "p", name: "Project", client: null }];
      } },
      sfClient: { findMany: async (query: { take: number; select: unknown; include?: unknown }) => {
        statements++;
        assert.equal(query.take, limit ?? 6);
        assert.equal(query.include, undefined);
        assert.deepEqual(query.select, { id: true, name: true });
        return [{ id: "c", name: "Client" }];
      } },
    } as unknown as Db;
    const service = createProjectService(db, {} as StudioFlowPorts);
    assert.deepEqual(await service.quickSearch({ grants: [P.access, P.projectRead], search: "match", limit }), {
      projects: [{ id: "p", name: "Project", clientName: null }], clients: [{ id: "c", name: "Client" }],
    });
    assert.equal(statements, 2);
  }
});
