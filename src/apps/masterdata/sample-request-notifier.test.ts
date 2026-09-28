import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NotificationInput, NotificationWriter } from "@platform/core/notifications";

import { createSampleRequestResolvedNotifier } from "./sample-request-notifier";
import type { SampleRequestResolution, TxClient } from "./services/shared";

const TX = {} as TxClient;
const intake = (over: Partial<SampleRequestResolution["intake"]> = {}): SampleRequestResolution["intake"] => ({
  id: "intake-1", requesterUserId: "designer-1", sourceProjectId: "project-9", sourceProjectName: "2026-506 Sociolla", productName: "Oak Panel",
  quotedAmount: null, quotedCurrency: null, staffNote: null, ...over,
});

function setup() {
  const written: NotificationInput[] = [];
  const writer: NotificationWriter = { async notify(input) { written.push(input); return 1; } };
  return { notifier: createSampleRequestResolvedNotifier({ writer }), written };
}

describe("Master Data sample-request resolved notifier", () => {
  it("tells only the requester, links to their project's schedule, and states the quoted price", async () => {
    const { notifier, written } = setup();
    await notifier.resolved(TX, { outcome: "priced", intake: intake({ quotedAmount: "99000", quotedCurrency: "IDR" }) });
    const [note] = written;
    assert.deepEqual(note.recipientUserIds, ["designer-1"]);
    assert.equal(note.appId, "masterdata");
    assert.equal(note.kind, "masterdata.sample-request.priced");
    assert.equal(note.title, "Your sample request was priced");
    assert.equal(note.body, "Master Data priced Oak Panel (2026-506 Sociolla). Quoted price: IDR 99000.");
    assert.equal(note.href, "/studioflow/projects/project-9/schedule");
    assert.deepEqual(note.entity, { type: "sample_request_intake", id: "intake-1" });
  });

  it("does not invent a price when the request was priced by linking an existing price", async () => {
    const { notifier, written } = setup();
    await notifier.resolved(TX, { outcome: "priced", intake: intake() });
    assert.equal(written[0].body, "Master Data priced Oak Panel (2026-506 Sociolla).");
  });

  it("passes the decline reason on to the requester", async () => {
    const { notifier, written } = setup();
    await notifier.resolved(TX, { outcome: "declined", intake: intake({ staffNote: "Vendor has no stock" }) });
    assert.equal(written[0].kind, "masterdata.sample-request.declined");
    assert.equal(written[0].title, "Your sample request was declined");
    assert.equal(written[0].body, "Master Data declined Oak Panel (2026-506 Sociolla). Reason: Vendor has no stock");
  });

  it("keeps a long reason within the notification limit", async () => {
    const { notifier, written } = setup();
    await notifier.resolved(TX, { outcome: "declined", intake: intake({ staffNote: "r".repeat(1000) }) });
    assert.equal(written[0].body!.length <= 300, true);
    assert.equal(written[0].body!.endsWith("…"), true);
  });
});
