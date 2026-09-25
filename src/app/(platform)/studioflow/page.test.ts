import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { currentDateOnly } from "@platform/utilities/date";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Today page summary", () => {
  it("resolves the studio date from the display timezone, not UTC", () => {
    assert.match(source, /readPlatformGeneralSettings\(prisma\)/);
    assert.match(source, /currentDateOnly\(\{\s*timeZone:\s*timezone\s*\}\)/);
    assert.doesNotMatch(source, /toISOString\(\)\.split\("T"\)/);
  });

  it("would have disagreed with the client checklist during the local-day window", () => {
    // 2026-09-16 01:30 in Asia/Jakarta is still 2026-09-15 in UTC, so the old
    // `toISOString()` value put a task due "today" in the overdue bucket of the
    // header while the checklist, on the same timezone, listed it as due today.
    const now = new Date("2026-09-15T18:30:00Z");

    assert.equal(currentDateOnly({ now, timeZone: "Asia/Jakarta" }), "2026-09-16");
    assert.equal(currentDateOnly({ now, timeZone: "UTC" }), "2026-09-15");
  });
});
