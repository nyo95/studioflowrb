import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AppError } from "@platform/core/errors";
import type { PermissionGrants } from "@platform/core/rbac";
import type { SampleRequestIntakeRead, SampleRequestIntakeStatus, SampleRequestSnapshot } from "@/apps/masterdata/public";
import type { SampleRequestRead } from "@/apps/studioflow/public";

import { createSampleRequestCoordinator } from "./sample-request-coordinator";

const STAFF_GRANTS: PermissionGrants = ["masterdata.sample-request.manage"];
const ACTOR = { kind: "USER" as const, userId: "staff-1", label: "Sari Staff" };

function request(id: string, over: Partial<SampleRequestRead> = {}): SampleRequestRead {
  return {
    id, status: "REQUESTED", requestedAt: new Date("2026-09-10T03:00:00Z"), requestedBy: { id: "designer-1", name: "Dina" },
    requestedFrom: "Toko Kayu", note: "swatch", receivedAt: null, project: { id: "p1", name: "2026-506 Test", archived: false },
    option: { id: `option-${id}`, productName: `Product ${id}`, brandName: "Brand", color: "Oak", pattern: null, finishing: null, dimension: null }, ...over,
  };
}

function intake(sourceRequestId: string, status: SampleRequestIntakeStatus, over: Partial<SampleRequestIntakeRead> = {}): SampleRequestIntakeRead {
  return {
    id: `intake-${sourceRequestId}`, status, sourceRequestId, sourceProjectId: "p1", sourceProjectName: "2026-506 Test", sourceOptionId: `option-${sourceRequestId}`,
    productName: `Product ${sourceRequestId}`, brandName: "Brand", color: "Oak", pattern: null, finishing: null, dimension: null, requestedFrom: "Toko Kayu",
    requestNote: null, requesterUserId: "designer-1", requesterLabel: "Dina", requestedAt: new Date("2026-09-10T03:00:00Z"), vendorId: null,
    quotedAmount: null, quotedCurrency: null, staffNote: null, skuId: null, priceMaterialId: null, handledBy: { id: "staff-1", label: "Sari Staff" },
    startedAt: new Date("2026-09-11T03:00:00Z"), resolvedAt: status === "IN_PROGRESS" ? null : new Date("2026-09-12T03:00:00Z"), ...over,
  };
}

function setup(state: { pending?: SampleRequestRead[]; sources?: SampleRequestRead[]; intakes?: SampleRequestIntakeRead[] }) {
  const calls: string[] = [];
  const started: SampleRequestSnapshot[] = [];
  const coordinator = createSampleRequestCoordinator({
    studioFlow: {
      async listPendingSampleRequests() { calls.push("sf.pending"); return state.pending ?? []; },
      async getSampleRequests(ids) { calls.push(`sf.get:${ids.join(",")}`); return (state.sources ?? state.pending ?? []).filter((row) => ids.includes(row.id)); },
    },
    masterData: {
      async startSampleRequestIntake({ snapshot }) { calls.push("md.start"); started.push(snapshot); return intake(snapshot.sourceRequestId, "IN_PROGRESS"); },
      async recordSampleQuote({ intakeId }) { calls.push(`md.quote:${intakeId}`); return intake("x", "IN_PROGRESS"); },
      async markSampleRequestPriced({ intakeId }) { calls.push(`md.priced:${intakeId}`); return intake("x", "PRICED"); },
      async declineSampleRequest({ intakeId }) { calls.push(`md.decline:${intakeId}`); return intake("x", "DECLINED"); },
      async listSampleRequestIntakes({ status, sourceRequestIds }) {
        calls.push(`md.list:${status ?? (sourceRequestIds ? "ids" : "all")}`);
        return (state.intakes ?? []).filter((row) => (status ? row.status === status : true) && (sourceRequestIds ? sourceRequestIds.includes(row.sourceRequestId) : true));
      },
    },
  });
  return { coordinator, calls, started };
}

const denied = (promise: Promise<unknown>) => assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === "PERMISSION_DENIED");
const code = (promise: Promise<unknown>, expected: string) => assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === expected, expected);

describe("sample request coordinator", () => {
  it("touches neither app for someone without the sample-request permission", async () => {
    const { coordinator, calls } = setup({ pending: [request("a")] });
    await denied(coordinator.listQueue({ grants: ["masterdata.access"] }));
    await denied(coordinator.take({ grants: [], actor: ACTOR, sourceRequestId: "a" }));
    assert.deepEqual(calls, []);
  });

  it("shows new requests oldest first, then requests being worked, and marks what StudioFlow says", async () => {
    const pending = [request("new-late", { requestedAt: new Date("2026-09-12T03:00:00Z") }), request("new-early", { requestedAt: new Date("2026-09-09T03:00:00Z") }), request("taken")];
    const received = request("arrived", { status: "RECEIVED" });
    const { coordinator } = setup({
      pending, sources: [...pending, received],
      intakes: [intake("taken", "IN_PROGRESS"), intake("arrived", "IN_PROGRESS")],
    });
    const rows = await coordinator.listQueue({ grants: STAFF_GRANTS });
    assert.deepEqual(rows.map((row) => [row.sourceRequestId, row.state, row.sourceStatus]), [
      ["new-early", "NEW", "REQUESTED"],
      ["new-late", "NEW", "REQUESTED"],
      ["taken", "IN_PROGRESS", "REQUESTED"],
      ["arrived", "IN_PROGRESS", "RECEIVED"],
    ]);
    assert.equal(rows[2].intake?.id, "intake-taken");
    assert.equal(rows[0].intake, null);
  });

  it("keeps a request Master Data is still working even after StudioFlow stops listing it as pending", async () => {
    const { coordinator, calls } = setup({ pending: [], sources: [request("gone", { status: "RECEIVED" })], intakes: [intake("gone", "IN_PROGRESS")] });
    const rows = await coordinator.listQueue({ grants: STAFF_GRANTS });
    assert.deepEqual(rows.map((row) => [row.sourceRequestId, row.state, row.sourceStatus]), [["gone", "IN_PROGRESS", "RECEIVED"]]);
    assert.ok(calls.includes("sf.get:gone"), "the current StudioFlow state is looked up for it");
  });

  it("adds recently finished requests only when asked, newest first, and survives an unreadable source", async () => {
    const intakes = [intake("old", "PRICED", { resolvedAt: new Date("2026-09-12T03:00:00Z") }), intake("newer", "DECLINED", { resolvedAt: new Date("2026-09-13T03:00:00Z") })];
    const { coordinator } = setup({ pending: [], sources: [], intakes });
    assert.deepEqual(await coordinator.listQueue({ grants: STAFF_GRANTS }), []);
    const rows = await coordinator.listQueue({ grants: STAFF_GRANTS, includeFinished: true });
    assert.deepEqual(rows.map((row) => [row.sourceRequestId, row.state, row.sourceStatus]), [["newer", "DECLINED", null], ["old", "PRICED", null]]);
  });

  it("takes a pending request by copying its facts from StudioFlow, never from the caller", async () => {
    const { coordinator, started } = setup({ pending: [request("a", { note: "Bring a swatch" })] });
    const result = await coordinator.take({ grants: STAFF_GRANTS, actor: ACTOR, sourceRequestId: "a" });
    assert.equal(result.sourceRequestId, "a");
    assert.deepEqual(started, [{
      sourceRequestId: "a", sourceProjectId: "p1", sourceProjectName: "2026-506 Test", sourceOptionId: "option-a", productName: "Product a", brandName: "Brand",
      color: "Oak", pattern: null, finishing: null, dimension: null, requestedFrom: "Toko Kayu", requestNote: "Bring a swatch", requesterUserId: "designer-1",
      requesterLabel: "Dina", requestedAt: new Date("2026-09-10T03:00:00Z"),
    }]);
  });

  it("refuses to take a request that is missing, archived, or already received, without starting anything", async () => {
    const { coordinator, started } = setup({ sources: [request("archived", { project: { id: "p2", name: "Old", archived: true } }), request("received", { status: "RECEIVED" })] });
    await code(coordinator.take({ grants: STAFF_GRANTS, actor: ACTOR, sourceRequestId: "missing" }), "SAMPLE_REQUEST_NOT_FOUND");
    await code(coordinator.take({ grants: STAFF_GRANTS, actor: ACTOR, sourceRequestId: "archived" }), "SAMPLE_PROJECT_ARCHIVED");
    await code(coordinator.take({ grants: STAFF_GRANTS, actor: ACTOR, sourceRequestId: "received" }), "SAMPLE_REQUEST_NOT_PENDING");
    assert.deepEqual(started, []);
  });

  it("passes quote, priced and decline straight to Master Data", async () => {
    const { coordinator, calls } = setup({});
    await coordinator.recordQuote({ grants: STAFF_GRANTS, actor: ACTOR, intakeId: "i1", quotedAmount: "10", quotedCurrency: "IDR" });
    await coordinator.markPriced({ grants: STAFF_GRANTS, actor: ACTOR, intakeId: "i2", quotedAmount: "10", quotedCurrency: "IDR" });
    await coordinator.decline({ grants: STAFF_GRANTS, actor: ACTOR, intakeId: "i3", reason: "No" });
    assert.deepEqual(calls, ["md.quote:i1", "md.priced:i2", "md.decline:i3"]);
  });
});
