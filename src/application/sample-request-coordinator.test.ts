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
    quotedAmount: null, quotedCurrency: null, staffNote: null, skuId: null, priceMaterialId: null, linkedSkuName: null, linkedSkuCode: null, linkedPriceAmount: null, handledBy: { id: "staff-1", label: "Sari Staff" },
    startedAt: new Date("2026-09-11T03:00:00Z"), resolvedAt: status === "IN_PROGRESS" ? null : new Date("2026-09-12T03:00:00Z"), ...over,
  };
}

function setup(state: { pending?: SampleRequestRead[]; sources?: SampleRequestRead[]; intakes?: SampleRequestIntakeRead[]; projects?: Array<{ id: string; name: string }>; receipt?: () => Promise<{ updated: boolean; reason?: string }> }) {
  const calls: string[] = [];
  const started: SampleRequestSnapshot[] = [];
  const statusCalls: Array<Record<string, unknown>> = [];
  const coordinator = createSampleRequestCoordinator({
    studioFlow: {
      async listPendingSampleRequests() { calls.push("sf.pending"); return state.pending ?? []; },
      async getSampleRequests(ids) { calls.push(`sf.get:${ids.join(",")}`); return (state.sources ?? state.pending ?? []).filter((row) => ids.includes(row.id)); },
      async markSampleReceivedFromShelf({ requestId, rack, box }) { calls.push(`sf.received:${requestId}:${rack}/${box}`); return state.receipt ? state.receipt() : { updated: true }; },
      async listProjectChoices() { calls.push("sf.projects"); return state.projects ?? []; },
    },
    masterData: {
      async startSampleRequestIntake({ snapshot }) { calls.push("md.start"); started.push(snapshot); return intake(snapshot.sourceRequestId, "IN_PROGRESS"); },
      async recordSampleQuote({ intakeId }) { calls.push(`md.quote:${intakeId}`); return intake("x", "IN_PROGRESS"); },
      async markSampleRequestPriced({ intakeId }) { calls.push(`md.priced:${intakeId}`); return intake("x", "PRICED"); },
      async syncSampleQuoteToPrice({ intakeId }) { calls.push(`md.sync:${intakeId}`); return intake("x", "PRICED"); },
      async declineSampleRequest({ intakeId }) { calls.push(`md.decline:${intakeId}`); return intake("x", "DECLINED"); },
      async shelveSampleFromIntake({ intakeId, rack, box }) { calls.push(`md.shelve:${intakeId}`); return { id: "sample-1", rack: rack.toUpperCase(), box: box.toUpperCase() }; },
      async setSampleStatus(input) { calls.push("md.status"); statusCalls.push(input); return {}; },
      async listSampleRequestIntakes({ status, sourceRequestIds }) {
        calls.push(`md.list:${status ?? (sourceRequestIds ? "ids" : "all")}`);
        return (state.intakes ?? []).filter((row) => (status ? row.status === status : true) && (sourceRequestIds ? sourceRequestIds.includes(row.sourceRequestId) : true));
      },
    },
  });
  return { coordinator, calls, started, statusCalls };
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

  describe("putting a request on the shelf", () => {
    const SHELF_GRANTS: PermissionGrants = ["masterdata.sample-request.manage", "masterdata.sample.manage"];
    const shelf = { skuId: "sku-1", rack: "a1", box: "b2" };
    const shelvedIntake = (status: SampleRequestIntakeStatus) => intake("a", status, { shelvedSample: { id: "sample-1", rack: "A1", box: "B2" } });

    it("needs both the request and the shelf permission, and touches nothing otherwise", async () => {
      const { coordinator, calls } = setup({ pending: [request("a")], projects: [{ id: "p1", name: "P" }] });
      await denied(coordinator.shelve({ grants: ["masterdata.sample-request.manage"], actor: ACTOR, sourceRequestId: "a", ...shelf }));
      await denied(coordinator.shelve({ grants: ["masterdata.sample.manage"], actor: ACTOR, sourceRequestId: "a", ...shelf }));
      await denied(coordinator.retryStudioFlowReceived({ grants: ["masterdata.sample.manage"], actor: ACTOR, sourceRequestId: "a" }));
      await denied(coordinator.listProjectChoices({ grants: ["masterdata.sample.read"] }));
      await denied(coordinator.setSampleStatus({ grants: ["masterdata.sample.read"], actor: ACTOR, sampleId: "s", status: "AVAILABLE" }));
      assert.deepEqual(calls, []);
    });

    it("takes a new request first, shelves it, then tells StudioFlow, in that order", async () => {
      const { coordinator, calls } = setup({ pending: [request("a")] });
      const result = await coordinator.shelve({ grants: SHELF_GRANTS, actor: ACTOR, sourceRequestId: "a", ...shelf });
      assert.deepEqual(calls.filter((call) => /^(md\.(start|shelve)|sf\.received)/.test(call)), ["md.start", "md.shelve:intake-a", "sf.received:a:A1/B2"]);
      assert.equal(result.studioFlowUpdated, true);
      assert.deepEqual(result.sample, { id: "sample-1", rack: "A1", box: "B2" });
    });

    it("does not take again when the request is already being worked or priced, and refuses a declined one", async () => {
      for (const status of ["IN_PROGRESS", "PRICED"] as const) {
        const { coordinator, calls } = setup({ pending: [request("a")], intakes: [intake("a", status)] });
        const result = await coordinator.shelve({ grants: SHELF_GRANTS, actor: ACTOR, sourceRequestId: "a", ...shelf });
        assert.equal(result.studioFlowUpdated, true);
        assert.ok(!calls.includes("md.start"), status);
        assert.ok(calls.includes("md.shelve:intake-a"), status);
      }
      const declined = setup({ pending: [request("a")], intakes: [intake("a", "DECLINED")] });
      await code(declined.coordinator.shelve({ grants: SHELF_GRANTS, actor: ACTOR, sourceRequestId: "a", ...shelf }), "SAMPLE_INTAKE_DECLINED");
      assert.ok(!declined.calls.some((call) => call.startsWith("md.shelve") || call.startsWith("sf.received")));
    });

    it("refuses to take-and-shelve a request the designer already received or that sits in an archived project", async () => {
      const { coordinator, calls } = setup({ sources: [request("r", { status: "RECEIVED" }), request("x", { project: { id: "p2", name: "Old", archived: true } })] });
      await code(coordinator.shelve({ grants: SHELF_GRANTS, actor: ACTOR, sourceRequestId: "r", ...shelf }), "SAMPLE_REQUEST_NOT_PENDING");
      await code(coordinator.shelve({ grants: SHELF_GRANTS, actor: ACTOR, sourceRequestId: "x", ...shelf }), "SAMPLE_PROJECT_ARCHIVED");
      assert.ok(!calls.some((call) => call.startsWith("md.shelve") || call.startsWith("sf.received")));
    });

    it("keeps the shelved sample when StudioFlow fails, reports it, and the retry then succeeds", async () => {
      let failing = true;
      const { coordinator, calls } = setup({ pending: [request("a")], receipt: async () => { if (failing) throw new Error("StudioFlow is down"); return { updated: true }; } });
      const result = await coordinator.shelve({ grants: SHELF_GRANTS, actor: ACTOR, sourceRequestId: "a", ...shelf });
      assert.equal(result.studioFlowUpdated, false);
      assert.deepEqual(result.sample, { id: "sample-1", rack: "A1", box: "B2" });
      assert.ok(calls.includes("md.shelve:intake-a"), "the shelf write was not rolled back");

      failing = false;
      const again = setup({ pending: [request("a")], intakes: [shelvedIntake("IN_PROGRESS")], receipt: async () => { if (failing) throw new Error("down"); return { updated: true }; } });
      assert.deepEqual(await again.coordinator.retryStudioFlowReceived({ grants: SHELF_GRANTS, actor: ACTOR, sourceRequestId: "a" }), { updated: true });
      assert.ok(again.calls.includes("sf.received:a:A1/B2"), "retries with the rack and box that are on the shelf");
    });

    it("reports a StudioFlow no-write outcome without treating it as a failure", async () => {
      const { coordinator } = setup({ pending: [request("a")], receipt: async () => ({ updated: false, reason: "ALREADY_RECEIVED" }) });
      const result = await coordinator.shelve({ grants: SHELF_GRANTS, actor: ACTOR, sourceRequestId: "a", ...shelf });
      assert.deepEqual([result.studioFlowUpdated, result.reason], [false, "ALREADY_RECEIVED"]);
    });

    it("retries only for a request that has a shelved sample", async () => {
      const { coordinator, calls } = setup({ intakes: [intake("a", "IN_PROGRESS")] });
      await code(coordinator.retryStudioFlowReceived({ grants: SHELF_GRANTS, actor: ACTOR, sourceRequestId: "a" }), "SAMPLE_NOT_SHELVED");
      await code(coordinator.retryStudioFlowReceived({ grants: SHELF_GRANTS, actor: ACTOR, sourceRequestId: "none" }), "SAMPLE_NOT_SHELVED");
      assert.ok(!calls.some((call) => call.startsWith("sf.received")));
    });
  });

  describe("holder project on a status change", () => {
    const MANAGE: PermissionGrants = ["masterdata.sample.manage"];
    const projects = [{ id: "p1", name: "2026-506 Sociolla" }];

    it("resolves the project name from StudioFlow, never from the caller", async () => {
      const { coordinator, statusCalls } = setup({ projects });
      await coordinator.setSampleStatus({ grants: MANAGE, actor: ACTOR, sampleId: "s", status: "BORROWED", holderName: "Dina", holderProjectId: "p1", holderProjectName: "Forged name" } as never);
      assert.equal(statusCalls[0].holderProjectId, "p1");
      assert.equal(statusCalls[0].holderProjectName, "2026-506 Sociolla");
    });

    it("refuses an unknown or archived project before Master Data is asked", async () => {
      const { coordinator, calls } = setup({ projects });
      await code(coordinator.setSampleStatus({ grants: MANAGE, actor: ACTOR, sampleId: "s", status: "BORROWED", holderName: "Dina", holderProjectId: "gone" }), "SAMPLE_PROJECT_NOT_FOUND");
      assert.ok(!calls.includes("md.status"));
    });

    it("skips the StudioFlow lookup when no project is named", async () => {
      const { coordinator, calls, statusCalls } = setup({ projects });
      await coordinator.setSampleStatus({ grants: MANAGE, actor: ACTOR, sampleId: "s", status: "AVAILABLE" });
      assert.ok(!calls.includes("sf.projects"));
      assert.deepEqual([statusCalls[0].holderProjectId, statusCalls[0].holderProjectName], [null, null]);
    });

    it("lists project choices for shelf managers only", async () => {
      const { coordinator } = setup({ projects });
      assert.deepEqual(await coordinator.listProjectChoices({ grants: MANAGE }), projects);
    });
  });
});
