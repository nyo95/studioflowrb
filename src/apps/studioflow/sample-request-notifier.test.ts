import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NotificationInput, NotificationWriter } from "@platform/core/notifications";
import type { PeopleDirectory } from "@platform/core/rbac/people";

import { createSampleRequestNotifier } from "./sample-request-notifier";
import type { SampleRequestedEvent, TxClient } from "./shared";

const TX = {} as TxClient;
const event: SampleRequestedEvent = {
  requestId: "req-1", projectId: "p1", projectName: "2026-506 Sociolla SG Funan", productName: "Oak Panel",
  requestedFrom: "Toko Kayu", requestedById: "designer-1", requestedByName: "Dina Designer",
};

function setup(holders: Array<{ id: string }> | Error) {
  const written: NotificationInput[] = [];
  const asked: string[] = [];
  const writer: NotificationWriter = { async notify(input) { written.push(input); return input.recipientUserIds.length; } };
  const people = {
    async listHolders(permissionId: string) {
      asked.push(permissionId);
      if (holders instanceof Error) throw holders;
      return holders.map((person) => ({ id: person.id, displayName: person.id, active: true }));
    },
    async resolve() { return []; },
  } as PeopleDirectory;
  return { notifier: createSampleRequestNotifier({ writer, people }), written, asked };
}

describe("StudioFlow sample-request notifier", () => {
  it("tells the sample-request staff, by Master Data's public permission, and never the person who asked", async () => {
    const { notifier, written, asked } = setup([{ id: "staff-1" }, { id: "designer-1" }, { id: "staff-2" }]);
    await notifier.requested(TX, event);
    assert.deepEqual(asked, ["masterdata.sample-request.manage"]);
    assert.equal(written.length, 1);
    const [note] = written;
    assert.deepEqual(note.recipientUserIds, ["staff-1", "staff-2"]);
    assert.equal(note.appId, "studioflow");
    assert.equal(note.kind, "studioflow.sample-request.created");
    assert.equal(note.title, "New sample request");
    assert.equal(note.body, "Dina Designer asked Toko Kayu for a sample of Oak Panel (2026-506 Sociolla SG Funan).");
    assert.equal(note.href, "/masterdata/sample-requests");
    assert.deepEqual(note.entity, { type: "sample_request", id: "req-1" });
  });

  it("writes nothing when nobody else holds the permission", async () => {
    const { notifier, written } = setup([{ id: "designer-1" }]);
    await notifier.requested(TX, event);
    const none = setup([]);
    await none.notifier.requested(TX, event);
    assert.deepEqual([written.length, none.written.length], [0, 0]);
  });

  it("never blocks the request when the staff lookup fails", async () => {
    const { notifier, written } = setup(new Error("directory unavailable"));
    await assert.doesNotReject(notifier.requested(TX, event));
    assert.equal(written.length, 0);
  });

  it("keeps a very long product or project name within the notification limit", async () => {
    const { notifier, written } = setup([{ id: "staff-1" }]);
    await notifier.requested(TX, { ...event, productName: "P".repeat(250), projectName: "J".repeat(250) });
    assert.equal(written[0].body!.length <= 300, true);
    assert.equal(written[0].body!.endsWith("…"), true);
  });
});
