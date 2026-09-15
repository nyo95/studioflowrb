import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_DISPLAY_LOCALE,
  currentDateOnly,
  diffDateOnlyDays,
  DEFAULT_DISPLAY_TIME_ZONE,
  formatDateOnly,
  formatInstant,
  isDateOnlyString,
  isIsoInstantString,
} from "./index";

describe("instant and date-only validation", () => {
  it("accepts strict UTC instants including fractional seconds", () => {
    assert.equal(isIsoInstantString("0000-01-01T00:00:00Z"), true);
    assert.equal(isIsoInstantString("2026-08-23T10:00:00Z"), true);
    assert.equal(isIsoInstantString("2026-08-23T10:00:00.123456789Z"), true);
  });

  it("rejects date-only strings, offsets, and naive datetimes as instants", () => {
    assert.equal(isIsoInstantString("2026-08-23"), false);
    assert.equal(isIsoInstantString("2026-08-23T10:00:00+02:00"), false);
    assert.equal(isIsoInstantString("2026-08-23T10:00:00"), false);
    assert.equal(isIsoInstantString(""), false);
  });

  it("rejects impossible clock and calendar values", () => {
    assert.equal(isIsoInstantString("2026-08-23T24:00:00Z"), false);
    assert.equal(isIsoInstantString("2026-08-23T10:60:00Z"), false);
    assert.equal(isIsoInstantString("2026-08-23T10:00:60Z"), false);
    assert.equal(isIsoInstantString("2026-02-30T10:00:00Z"), false);
    assert.equal(isIsoInstantString("2026-02-29T10:00:00Z"), false);
    assert.equal(isIsoInstantString("2028-02-29T10:00:00Z"), true);
    assert.equal(isIsoInstantString("2026-13-01T00:00:00Z"), false);
  });

  it("accepts only real YYYY-MM-DD calendar dates", () => {
    assert.equal(isDateOnlyString("0000-01-01"), true);
    assert.equal(isDateOnlyString("0099-12-31"), true);
    assert.equal(isDateOnlyString("2026-08-23"), true);
    assert.equal(isDateOnlyString("2028-02-29"), true);
    assert.equal(isDateOnlyString("2026-02-30"), false);
    assert.equal(isDateOnlyString("2026-13-01"), false);
    assert.equal(isDateOnlyString("2026-00-10"), false);
    assert.equal(isDateOnlyString("2026-08-23T00:00:00Z"), false);
    assert.equal(isDateOnlyString("26-08-23"), false);
  });

  it("keeps the two representations mutually exclusive", () => {
    assert.equal(isDateOnlyString("2026-08-23T00:00:00Z"), false);
    assert.equal(isIsoInstantString("2026-08-23"), false);
  });
});

describe("date-only formatting", () => {
  it("formats with the default id-ID locale without timezone drift", () => {
    assert.equal(formatDateOnly("2026-08-23"), "23 Agustus 2026");
  });

  it("accepts explicit locale overrides", () => {
    assert.equal(formatDateOnly("2026-08-23", { locale: "en-US" }), "August 23, 2026");
  });

  it("never shifts the stored calendar date through an instant", () => {
    assert.equal(formatDateOnly("2026-01-01"), "1 Januari 2026");
    assert.notEqual(formatDateOnly("2026-01-01"), "31 Desember 2025");
  });

  it("rejects non-date-only input", () => {
    assert.throws(() => formatDateOnly("2026-08-23T00:00:00Z"));
    assert.throws(() => formatDateOnly("not-a-date"));
  });
});

describe("instant formatting", () => {
  it("defaults to id-ID in Asia/Jakarta", () => {
    assert.equal(
      formatInstant("2026-08-23T18:30:00Z"),
      new Intl.DateTimeFormat(DEFAULT_DISPLAY_LOCALE, {
        timeZone: DEFAULT_DISPLAY_TIME_ZONE,
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date("2026-08-23T18:30:00Z")),
    );
  });

  it("crosses the timezone-day boundary explicitly", () => {
    assert.equal(formatInstant("2026-08-23T18:30:00Z"), "24 Agustus 2026 pukul 01.30");
    assert.equal(
      formatInstant("2026-08-23T18:30:00Z", { timeZone: "UTC" }),
      "23 Agustus 2026 pukul 18.30",
    );
  });

  it("supports explicit locale overrides", () => {
    assert.equal(
      formatInstant("2026-08-23T18:30:00Z", { locale: "en-US", timeZone: "UTC" }),
      "August 23, 2026 at 18:30",
    );
  });

  it("rejects non-instant input", () => {
    assert.throws(() => formatInstant("2026-08-23"));
    assert.throws(() => formatInstant("2026-08-23T10:00:00+07:00"));
  });
});

describe("formatInstant display styles (shared by app directories)", () => {
  const instant = "2026-08-23T18:30:00Z";

  it("'date' renders dateStyle medium with no time component", () => {
    assert.equal(formatInstant(instant, { locale: "en-US", timeZone: "UTC", style: "date" }), "Aug 23, 2026");
  });

  it("'datetime' renders dateStyle medium plus short time", () => {
    assert.equal(
      formatInstant(instant, { locale: "en-US", timeZone: "UTC", style: "datetime" }),
      "Aug 23, 2026, 6:30 PM",
    );
  });

  it("keeps timezone conversion identical to the pre-consolidation raw formatter", () => {
    assert.equal(formatInstant(instant, { locale: "en-US", timeZone: "UTC", style: "datetime" }),
      new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }).format(new Date(instant)));
  });

  it("accepts Date objects the way the directory consumers pass Prisma Date fields", () => {
    assert.equal(formatInstant(new Date(instant), { locale: "en-US", timeZone: "UTC", style: "date" }), "Aug 23, 2026");
  });
});

describe("currentDateOnly / diffDateOnlyDays", () => {
  it("returns the calendar date in the requested timezone", () => {
    const now = new Date("2026-09-15T18:30:00Z");
    assert.equal(currentDateOnly({ now, timeZone: "Asia/Jakarta" }), "2026-09-16");
    assert.equal(currentDateOnly({ now, timeZone: "UTC" }), "2026-09-15");
  });

  it("counts whole calendar days between date-only values", () => {
    assert.equal(diffDateOnlyDays("2026-09-15", "2026-09-18"), 3);
    assert.equal(diffDateOnlyDays("2026-03-01", "2026-02-27"), -2);
    assert.throws(() => diffDateOnlyDays("2026-02-30", "2026-03-01"));
  });
});
