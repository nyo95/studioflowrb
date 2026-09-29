import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { FakeObjectStorage } from "@platform/core/storage";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "@platform/core/db/test-support";

import { createMessengerService } from "./index";

let db: TestDb;
let storage: FakeObjectStorage;
let clock = new Date("2026-09-29T04:00:00Z");

before(async () => {
  db = await createTestDb(requireDisposableTestDatabaseUrl());
});

beforeEach(async () => {
  await truncatePlatformTables(db);
  storage = new FakeObjectStorage();
  clock = new Date("2026-09-29T04:00:00Z");
  await db.prisma.user.createMany({
    data: [
      { id: "11111111-1111-1111-1111-111111111111", email: "a@example.com", display_name: "Alice", password_hash: "x" },
      { id: "22222222-2222-2222-2222-222222222222", email: "b@example.com", display_name: "Budi", password_hash: "x" },
      { id: "33333333-3333-3333-3333-333333333333", email: "c@example.com", display_name: "Citra", password_hash: "x" },
    ],
  });
});

after(async () => {
  if (db) await closeTestDb(db);
});

const service = () => createMessengerService(db.prisma, storage, { now: () => clock });
const alice = "11111111-1111-1111-1111-111111111111";
const budi = "22222222-2222-2222-2222-222222222222";
const citra = "33333333-3333-3333-3333-333333333333";

describe("platform messenger", () => {
  it("creates one stable 1:1 conversation and tracks unread server-side", async () => {
    const first = await service().sendMessage({ actorUserId: alice, recipientUserId: budi, body: "Halo", files: [] });
    clock = new Date(clock.getTime() + 60_000);
    const second = await service().sendMessage({ actorUserId: budi, recipientUserId: alice, body: "Siap", files: [] });
    assert.equal(first.conversationId, second.conversationId);

    assert.equal(await service().countUnread(alice), 1);
    assert.equal(await service().countUnread(budi), 0);
    assert.deepEqual((await service().listConversations(alice)).map((row) => [row.otherUser.displayName, row.unread]), [["Budi", 1]]);

    const messages = await service().readConversation(alice, first.conversationId);
    assert.deepEqual(messages.map((message) => message.body), ["Halo", "Siap"]);
    assert.equal(await service().countUnread(alice), 0);
    assert.equal(await service().countUnread(budi), 0, "reading is per participant");
  });

  it("blocks non-participants from reading and resolving attachments", async () => {
    const sent = await service().sendMessage({
      actorUserId: alice,
      recipientUserId: budi,
      body: "",
      files: [{ filename: "quote.pdf", contentType: "application/pdf", body: Uint8Array.of(1, 2, 3) }],
    });
    const [message] = await service().readConversation(alice, sent.conversationId);
    const attachmentId = message.attachments[0].id;
    await assert.rejects(() => service().readConversation(citra, sent.conversationId), /Conversation not found/);
    await assert.rejects(() => service().resolveAttachment(citra, attachmentId), /Conversation not found/);
    assert.match((await service().resolveAttachment(budi, attachmentId)).readUrl, /quote|storage.invalid|messenger/);
  });

  it("expires and cleans up attachment objects while preserving messages", async () => {
    const sent = await service().sendMessage({
      actorUserId: alice,
      recipientUserId: budi,
      body: "Lihat file",
      files: [{ filename: "photo.png", contentType: "image/png", body: Uint8Array.of(1) }],
    });
    assert.equal(storage.objects.size, 1);
    const [message] = await service().readConversation(budi, sent.conversationId);
    const attachmentId = message.attachments[0].id;

    clock = new Date(clock.getTime() + 31 * 60_000);
    await assert.rejects(() => service().resolveAttachment(budi, attachmentId), /no longer available/);
    assert.deepEqual(await service().cleanupExpiredAttachments(), { purged: 1 });
    assert.equal(storage.objects.size, 0);

    const [afterCleanup] = await service().readConversation(budi, sent.conversationId);
    assert.equal(afterCleanup.body, "Lihat file");
    assert.equal(afterCleanup.attachments[0].available, false);
  });
});
