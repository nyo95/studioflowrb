import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, type TestDb } from "@platform/core/db/test-support";

import { READ_NOTIFICATION_RETENTION_DAYS, createNotificationCenter, createNotificationRetention, createNotificationWriter } from "./persistence";

let db: TestDb;
let clock = new Date("2026-09-29T03:00:00Z");
const writer = createNotificationWriter();
const input = (over: Partial<Parameters<typeof writer.notify>[0]> = {}) => ({
  recipientUserIds: ["alice"], appId: "masterdata" as const, kind: "masterdata.sample-request.priced", title: "Priced", ...over,
});

before(async () => {
  db = await createTestDb(requireDisposableTestDatabaseUrl());
});

beforeEach(async () => {
  // The shared truncation helper predates this table, so clear it here.
  await db.prisma.notification.deleteMany();
  clock = new Date("2026-09-29T03:00:00Z");
});

after(async () => {
  if (db) {
    await db.prisma.notification.deleteMany();
    await closeTestDb(db);
  }
});

const center = () => createNotificationCenter(db.prisma, { now: () => clock });
const send = (over = {}) => db.prisma.$transaction((tx) => writer.notify(input(over), tx));

describe("notification writer", () => {
  it("writes one unread item per distinct recipient and returns how many", async () => {
    const count = await send({ recipientUserIds: ["alice", "bob", "alice", " "], body: "Oak Panel", href: "/studioflow/projects/p1/schedule", entity: { type: "sample_request_intake", id: "i1" } });
    assert.equal(count, 2);
    const rows = await db.prisma.notification.findMany({ orderBy: { recipient_user_id: "asc" } });
    assert.deepEqual(rows.map((row) => row.recipient_user_id), ["alice", "bob"]);
    assert.ok(rows.every((row) => row.read_at === null && row.app_id === "masterdata" && row.kind === "masterdata.sample-request.priced"));
    assert.equal(rows[0].href, "/studioflow/projects/p1/schedule");
    assert.deepEqual([rows[0].entity_type, rows[0].entity_id], ["sample_request_intake", "i1"]);
  });

  it("writes nothing for an empty recipient list", async () => {
    assert.equal(await send({ recipientUserIds: [] }), 0);
    assert.equal(await db.prisma.notification.count(), 0);
  });

  it("refuses an unsafe notification before touching the database", async () => {
    await assert.rejects(send({ href: "https://evil.example" }), /href/);
    await assert.rejects(send({ kind: "studioflow.sample-request.created" }), /kind/);
    assert.equal(await db.prisma.notification.count(), 0);
  });

  it("rolls back with the transaction that wrote it, so a failed event tells nobody", async () => {
    await assert.rejects(
      db.prisma.$transaction(async (tx) => {
        await writer.notify(input(), tx);
        throw new Error("the event failed");
      }),
      /the event failed/,
    );
    assert.equal(await db.prisma.notification.count(), 0);
  });
});

describe("notification center", () => {
  it("lists a person's own items newest first and never anyone else's", async () => {
    await send({ recipientUserIds: ["alice"], title: "First" });
    clock = new Date("2026-09-29T04:00:00Z");
    await db.prisma.notification.updateMany({ data: { created_at: new Date("2026-09-29T03:00:00Z") } });
    await db.prisma.$transaction((tx) => writer.notify(input({ recipientUserIds: ["alice", "bob"], title: "Second" }), tx));
    await db.prisma.notification.updateMany({ where: { title: "Second" }, data: { created_at: new Date("2026-09-29T04:00:00Z") } });
    const mine = await center().list({ userId: "alice" });
    assert.deepEqual(mine.map((item) => item.title), ["Second", "First"]);
    assert.deepEqual((await center().list({ userId: "bob" })).map((item) => item.title), ["Second"]);
    assert.deepEqual(await center().list({ userId: "nobody" }), []);
    assert.deepEqual(Object.keys(mine[0]).sort(), ["appId", "body", "createdAt", "href", "id", "kind", "readAt", "title"], "the view leaks no recipient or entity ids");
  });

  it("counts and filters unread, and caps or defaults the limit", async () => {
    for (let index = 0; index < 5; index++) await send({ title: `n${index}` });
    assert.equal(await center().countUnread({ userId: "alice" }), 5);
    assert.equal((await center().list({ userId: "alice", limit: 2 })).length, 2);
    for (const limit of [0, -1, Number.NaN]) assert.equal((await center().list({ userId: "alice", limit })).length, 5, `limit ${limit}`);
    assert.equal((await center().list({ userId: "alice", limit: 10_000 })).length, 5);
    const [first] = await center().list({ userId: "alice", limit: 1 });
    assert.equal(await center().markRead({ userId: "alice", ids: [first.id] }), 1);
    assert.equal(await center().countUnread({ userId: "alice" }), 4);
    assert.equal((await center().list({ userId: "alice", unreadOnly: true })).length, 4);
    assert.equal((await center().list({ userId: "alice" })).length, 5, "read items stay in the inbox");
  });

  it("marks only the caller's own unread items, once", async () => {
    await send({ recipientUserIds: ["alice", "bob"] });
    const aliceItem = (await center().list({ userId: "alice" }))[0];
    const bobItem = (await center().list({ userId: "bob" }))[0];
    assert.equal(await center().markRead({ userId: "alice", ids: [bobItem.id] }), 0, "someone else's item is untouched");
    assert.equal(await center().countUnread({ userId: "bob" }), 1);
    assert.equal(await center().markRead({ userId: "alice", ids: [aliceItem.id, aliceItem.id, "no-such-id"] }), 1);
    assert.equal(await center().markRead({ userId: "alice", ids: [aliceItem.id] }), 0, "already read");
    assert.deepEqual((await center().list({ userId: "alice" }))[0].readAt, clock, "the read time comes from the injected clock");
    assert.equal(await center().markRead({ userId: "alice", ids: [] }), 0);
  });

  it("marks everything of the caller's read without touching anyone else", async () => {
    await send({ recipientUserIds: ["alice", "bob"] });
    await send({ recipientUserIds: ["alice"] });
    assert.equal(await center().markAllRead({ userId: "alice" }), 2);
    assert.equal(await center().countUnread({ userId: "alice" }), 0);
    assert.equal(await center().countUnread({ userId: "bob" }), 1);
    assert.equal(await center().markAllRead({ userId: "alice" }), 0);
  });
});

describe("notification retention", () => {
  it("removes read notifications after 90 days and never touches unread ones", async () => {
    await send({ title: "Old read" });
    await send({ title: "Recently read" });
    await send({ title: "Old unread" });
    const rows = await db.prisma.notification.findMany({ orderBy: { title: "asc" } });
    const byTitle = (title: string) => rows.find((row) => row.title === title)!;
    const day = 86_400_000;
    await db.prisma.notification.update({ where: { id: byTitle("Old read").id }, data: { created_at: new Date(clock.getTime() - 200 * day), read_at: new Date(clock.getTime() - (READ_NOTIFICATION_RETENTION_DAYS + 1) * day) } });
    await db.prisma.notification.update({ where: { id: byTitle("Recently read").id }, data: { read_at: new Date(clock.getTime() - (READ_NOTIFICATION_RETENTION_DAYS - 1) * day) } });
    await db.prisma.notification.update({ where: { id: byTitle("Old unread").id }, data: { created_at: new Date(clock.getTime() - 400 * day) } });

    const removed = await createNotificationRetention(db.prisma, { now: () => clock }).purgeReadNotifications();
    assert.equal(removed, 1);
    assert.deepEqual((await db.prisma.notification.findMany({ orderBy: { title: "asc" } })).map((row) => row.title), ["Old unread", "Recently read"]);
  });
});
