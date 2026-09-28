import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ARCHIVE_RETENTION_DEFAULT_DAYS,
  ARCHIVE_RETENTION_MAX_DAYS,
  ARCHIVE_RETENTION_MIN_DAYS,
  archivedFilesState,
  isValidRetentionDays,
} from "./retention";

const DAY = 86_400_000;
const archivedAt = new Date("2026-09-01T03:00:00Z");
const at = (days: number, extraMs = 0) => new Date(archivedAt.getTime() + days * DAY + extraMs);

describe("archivedFilesState", () => {
  it("reports files as kept until archive time plus the window, including the exact due instant", () => {
    const until = at(90);
    assert.deepEqual(archivedFilesState({ archivedAt, assetsPurgedAt: null, retentionDays: 90, asOf: at(1) }), { kind: "kept", until });
    assert.deepEqual(archivedFilesState({ archivedAt, assetsPurgedAt: null, retentionDays: 90, asOf: at(90) }), { kind: "kept", until });
  });

  it("switches to overdue only strictly after the window, matching the sweep's strict older-than rule", () => {
    const state = archivedFilesState({ archivedAt, assetsPurgedAt: null, retentionDays: 90, asOf: at(90, 1) });
    assert.deepEqual(state, { kind: "overdue", since: at(90) });
  });

  it("reports removed whenever the purge marker is set, whatever the dates say", () => {
    const purgedAt = at(95);
    assert.deepEqual(archivedFilesState({ archivedAt, assetsPurgedAt: purgedAt, retentionDays: 90, asOf: at(1) }), { kind: "removed", at: purgedAt });
    assert.deepEqual(archivedFilesState({ archivedAt, assetsPurgedAt: purgedAt, retentionDays: 90, asOf: at(400) }), { kind: "removed", at: purgedAt });
  });

  it("follows a changed window for a project that is already archived", () => {
    assert.equal(archivedFilesState({ archivedAt, assetsPurgedAt: null, retentionDays: 30, asOf: at(31) }).kind, "overdue");
    assert.equal(archivedFilesState({ archivedAt, assetsPurgedAt: null, retentionDays: 200, asOf: at(31) }).kind, "kept");
  });
});

describe("isValidRetentionDays", () => {
  it("accepts whole days from 7 to 730 only, the same range the backend enforces", () => {
    assert.equal(ARCHIVE_RETENTION_MIN_DAYS, 7);
    assert.equal(ARCHIVE_RETENTION_MAX_DAYS, 730);
    assert.equal(ARCHIVE_RETENTION_DEFAULT_DAYS, 90);
    for (const ok of [7, 90, 730]) assert.equal(isValidRetentionDays(ok), true, String(ok));
    for (const bad of [6, 731, 7.5, Number.NaN, -1, 0, Infinity]) assert.equal(isValidRetentionDays(bad), false, String(bad));
  });
});
