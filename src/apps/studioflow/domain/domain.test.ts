import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fullBlockers, todoBlockers } from "./blockers";
import { isPermutation, moveId, pointMarkers } from "./mom";
import { compareOptionLabels, fallbackPrefix, nextOptionLabel, normalizeScheduleCategory, optionLabel, optionLabelIndex, parseLegacyScheduleCsv, parseLegacyScheduleSheet, parseScheduleCode, scheduleCode, scheduleSearchKey } from "./schedule";
import {
  applyChecklistFilter,
  buildTree,
  cascadeTargets,
  countChecklistFilters,
  fromChecklistFilterQuery,
  steppedSortOrders,
  toChecklistFilterQuery,
} from "./checklist";
import { countOpen, groupFeed, nestFeed, sortFeed, type FeedTask } from "./feed";
import { formatProjectName, looksFormatted, parseProjectName } from "./naming";
import {
  PHASE_BLUEPRINT,
  PHASE_STATUSES,
  availablePhaseCommands,
  canActivatePhase,
  isPhaseModifiable,
  isValidPhaseTransition,
  nextRevision,
  phaseOwnerSeat,
  phaseStatusDisplay,
  revisionLabel,
  waitingDays,
} from "./phase";

describe("phase policy (legacy parity)", () => {
  it("creates the five legacy phases with Layout/3D/CD parallel", () => {
    assert.deepEqual(PHASE_BLUEPRINT.map((p) => [p.key, p.orderIndex, p.allowParallel]), [
      ["MOODBOARD", 1, false], ["LAYOUT", 2, true], ["DESIGN_3D", 3, true], ["CD", 4, true], ["SUPERVISION", 5, false],
    ]);
    assert.equal(phaseOwnerSeat("CD"), "drafter");
    assert.equal(phaseOwnerSeat("LAYOUT"), "designer");
  });

  it("never shows a raw enum and maps to five simplified groups", () => {
    for (const status of PHASE_STATUSES) {
      const display = phaseStatusDisplay(status);
      assert.doesNotMatch(display.label, /_/);
      assert.ok(["Not started", "Working", "In review", "Approved", "Done"].includes(display.group));
    }
    assert.equal(phaseStatusDisplay("ON_REVIEW_CLIENT").label, "With client");
  });

  it("enforces sequential activation unless parallel", () => {
    assert.equal(canActivatePhase({ orderIndex: 1, allowParallel: false }, null), true);
    assert.equal(canActivatePhase({ orderIndex: 5, allowParallel: false }, { status: "IN_PROGRESS" }), false);
    assert.equal(canActivatePhase({ orderIndex: 5, allowParallel: false }, { status: "READY_FOR_NEXT" }), true);
    assert.equal(canActivatePhase({ orderIndex: 3, allowParallel: true }, { status: "PENDING" }), true);
  });

  it("follows the legacy transition table", () => {
    assert.equal(isValidPhaseTransition("PENDING", "IN_PROGRESS"), true);
    assert.equal(isValidPhaseTransition("IN_PROGRESS", "APPROVED_INTERNAL"), false);
    assert.equal(isValidPhaseTransition("APPROVED_INTERNAL", "ON_REVIEW_CLIENT"), true);
    assert.equal(isValidPhaseTransition("COMPLETED", "IN_PROGRESS"), true);
  });

  it("locks content once approved or locked", () => {
    assert.equal(isPhaseModifiable({ status: "IN_PROGRESS", isLocked: false }), true);
    assert.equal(isPhaseModifiable({ status: "READY_FOR_NEXT", isLocked: false }), false);
    assert.equal(isPhaseModifiable({ status: "IN_PROGRESS", isLocked: true }), false);
  });

  it("offers the right commands per state", () => {
    assert.deepEqual(availablePhaseCommands({ key: "LAYOUT", status: "PENDING", isLocked: false }), ["activate", "bypass", "reopen"]);
    assert.deepEqual(availablePhaseCommands({ key: "LAYOUT", status: "IN_PROGRESS", isLocked: false }), ["submitInternal", "submitClient"]);
    assert.deepEqual(availablePhaseCommands({ key: "SUPERVISION", status: "IN_PROGRESS", isLocked: false }), ["completeSupervision"]);
    assert.deepEqual(availablePhaseCommands({ key: "CD", status: "READY_FOR_NEXT", isLocked: true }), ["reopen"]);
  });

  it("numbers revisions like legacy", () => {
    assert.deepEqual(nextRevision({ major: 1, minor: 0 }, "INTERNAL"), { major: 1, minor: 1 });
    assert.deepEqual(nextRevision({ major: 1, minor: 3 }, "CLIENT"), { major: 2, minor: 0 });
    assert.deepEqual(nextRevision(null, "CLIENT"), { major: 1, minor: 0 });
    assert.deepEqual(nextRevision(null, "INTERNAL"), { major: 1, minor: 0 }, "no v0.x revisions");
    assert.equal(revisionLabel({ major: 2, minor: 1 }), "v2.1");
  });

  it("reports waiting days, never negative, unknown as null", () => {
    const now = new Date("2026-09-15T00:00:00Z");
    assert.equal(waitingDays(new Date("2026-09-12T12:00:00Z"), now), 2);
    assert.equal(waitingDays(new Date("2026-09-16T00:00:00Z"), now), 0);
    assert.equal(waitingDays(null, now), null);
  });
});

describe("blockers", () => {
  const counts = { openRevisionActivities: 2, openRevisionTodos: 1, openDeferredActivities: 1, openDeferredTodos: 0, openRootChecklistItems: 3 };
  it("counts root checklist, revision and deferred items for approval", () => {
    const result = fullBlockers(counts);
    assert.equal(result.total, 6);
    assert.equal(result.reasons.length, 3);
  });
  it("counts only to-dos for internal submission", () => {
    assert.equal(todoBlockers(counts).total, 1);
    assert.equal(todoBlockers({ ...counts, openRevisionTodos: 0 }).total, 0);
  });
});

describe("naming", () => {
  it("formats and parses [Year]-[Number] [Name]", () => {
    assert.equal(formatProjectName(2026, 7, " Heloskin Cimanggu "), "2026-007 Heloskin Cimanggu");
    assert.deepEqual(parseProjectName("2025-429 Heloskin Cimanggu"), { code: "2025-429", year: 2025, sequence: 429, readable: "Heloskin Cimanggu" });
    assert.equal(parseProjectName("2025-429-Heloskin"), null);
    assert.equal(looksFormatted("2026-001 X"), true);
    assert.equal(looksFormatted("Heloskin"), false);
  });
});

describe("checklist rules", () => {
  const tasks = [
    { id: "a", isChecked: false, dueDate: "2026-09-10", priority: 1, assigneeId: "u1" },
    { id: "b", isChecked: true, dueDate: "2026-09-10", priority: 1, assigneeId: null },
    { id: "c", isChecked: false, dueDate: "2026-09-15", priority: 4, assigneeId: "u2" },
    { id: "d", isChecked: false, dueDate: null, priority: 2, assigneeId: "u1" },
  ];
  it("applies built-in filters by calendar date", () => {
    const today = "2026-09-15";
    assert.deepEqual(applyChecklistFilter(tasks, "overdue", "u1", today).map((t) => t.id), ["a"]);
    assert.deepEqual(applyChecklistFilter(tasks, "today", "u1", today).map((t) => t.id), ["a", "b", "c"]);
    assert.deepEqual(applyChecklistFilter(tasks, "p1", "u1", today).map((t) => t.id), ["a"]);
    assert.deepEqual(applyChecklistFilter(tasks, "mine", "u1", today).map((t) => t.id), ["a", "d"]);
    assert.deepEqual(countChecklistFilters(tasks, "u1", today), { all: 4, today: 3, overdue: 1, p1: 1, mine: 2 });
  });
  it("round-trips saved filter queries", () => {
    for (const filter of ["all", "today", "overdue", "p1", "mine"] as const) {
      assert.deepEqual(fromChecklistFilterQuery(toChecklistFilterQuery(filter, true)), { filter, showCompleted: true });
    }
  });
  it("builds a one-level tree and promotes orphans", () => {
    const tree = buildTree([
      { id: "r1", parentId: null }, { id: "c1", parentId: "r1" }, { id: "c2", parentId: "missing" },
    ]);
    assert.deepEqual(tree.map((n) => [n.id, n.children.map((c) => c.id)]), [["r1", ["c1"]], ["c2", []]]);
  });
  it("renumbers siblings with a fixed step and cascades only from parents", () => {
    assert.deepEqual(steppedSortOrders(["x", "y"]), [{ id: "x", sortOrder: 10 }, { id: "y", sortOrder: 20 }]);
    assert.deepEqual(cascadeTargets({ id: "p", parentId: null }, ["c1", "c2"]), ["p", "c1", "c2"]);
    assert.deepEqual(cascadeTargets({ id: "c1", parentId: "p" }, []), ["c1"]);
  });
});

describe("today feed", () => {
  const base = { projectId: "p1", phaseId: null, phaseLabel: null, assigneeId: null, labels: [], templateId: null, children: [] };
  const rows: FeedTask[] = [
    { ...base, key: "checklist:c", id: "c", source: "checklist", label: "child", isChecked: false, priority: 4, dueDate: null, mode: null, parentId: "r" },
    { ...base, key: "checklist:r", id: "r", source: "checklist", label: "root", isChecked: false, priority: 2, dueDate: null, mode: null, parentId: null },
    { ...base, key: "activity:a", id: "a", source: "activity", label: "todo", isChecked: false, priority: 4, dueDate: "2026-09-01", mode: "TODO", parentId: null },
    { ...base, key: "activity:d", id: "d", source: "activity", label: "done", isChecked: true, priority: 4, dueDate: "2026-08-01", mode: "TODO", parentId: null },
  ];
  it("nests, sorts, and keeps empty projects", () => {
    const nested = nestFeed(rows);
    assert.equal(nested.length, 3);
    assert.equal(countOpen(nested), 3);
    assert.deepEqual(sortFeed(nested).map((t) => t.id), ["a", "r", "d"]);
    const groups = groupFeed([{ id: "p1", name: "One", isUrgent: false }, { id: "p2", name: "Two", isUrgent: true }], nested);
    assert.deepEqual(groups.map((g) => [g.project.id, g.tasks.length]), [["p1", 3], ["p2", 0]]);
  });
});

describe("MOM rules", () => {
  it("numbers only normal points and honours list style", () => {
    assert.deepEqual(pointMarkers("DECIMAL", ["DEFAULT", "PLAIN", "DEFAULT"]), ["1.", "", "2."]);
    assert.deepEqual(pointMarkers("DISC", ["DEFAULT", "DEFAULT"]), ["•", "•"]);
    assert.deepEqual(pointMarkers("DASH", ["PLAIN", "DEFAULT"]), ["", "–"]);
    assert.deepEqual(pointMarkers("NONE", ["DEFAULT"]), [""]);
  });

  it("validates reorder payloads and moves", () => {
    assert.equal(isPermutation(["a", "b"], ["b", "a"]), true);
    assert.equal(isPermutation(["a", "b"], ["a", "a"]), false);
    assert.equal(isPermutation(["a", "b"], ["a"]), false);
    assert.deepEqual(moveId(["a", "b", "c"], "b", "up"), ["b", "a", "c"]);
    assert.equal(moveId(["a", "b"], "a", "up"), null);
    assert.equal(moveId(["a", "b"], "z", "down"), null);
  });
});

describe("schedule rules", () => {
  it("normalizes categories, prefixes, codes, labels, and search keys", () => {
    assert.deepEqual(normalizeScheduleCategory(" loose   furniture "), { label: "loose furniture", key: "LOOSE FURNITURE" });
    assert.equal(fallbackPrefix("Loose Furniture"), "LO");
    assert.equal(scheduleCode("pt", 3), "PT-03");
    assert.equal(optionLabel(0), "A");
    assert.equal(optionLabel(26), "AA");
    assert.equal(scheduleSearchKey({ brandName: "TACO", productName: "TH 121", color: "Ivory" }), "taco | th 121 | ivory");
  });

  it("parses legacy CSV quoting", () => {
    const rows = parseLegacyScheduleCsv('category,brand,product,notes\nTile,Roman,"Tile, ivory","Use ""matte"""');
    assert.deepEqual(rows, [{ category: "Tile", brand: "Roman", product: "Tile, ivory", notes: 'Use "matte"' }]);
  });
});

describe("schedule labels and legacy sheet", () => {
  it("never reuses a label and orders AA after Z", () => {
    assert.equal(optionLabelIndex("A"), 0);
    assert.equal(optionLabelIndex("AA"), 26);
    assert.equal(optionLabelIndex("a"), -1);
    assert.equal(nextOptionLabel([]), "A");
    assert.equal(nextOptionLabel(["A", "C"]), "D", "B was deleted; the next label continues after C");
    assert.equal(nextOptionLabel(["Z"]), "AA");
    assert.deepEqual(["AA", "B", "Z", "A"].sort(compareOptionLabels), ["A", "B", "Z", "AA"]);
  });

  it("parses schedule codes", () => {
    assert.deepEqual(parseScheduleCode("pt-03"), { prefix: "PT", increment: 3 });
    assert.deepEqual(parseScheduleCode(" FL - 12 "), { prefix: "FL", increment: 12 });
    assert.equal(parseScheduleCode("PT"), null);
    assert.equal(parseScheduleCode("PT-00"), null);
  });

  it("finds the Google Sheets header below title rows", () => {
    const csv = [
      "MATERIAL SCHEDULE,,,,,,,,,",
      "Project Heloskin,,,,,,,,,",
      "Code,Product Category,Ex,Type,Initials Type,Image,Location,Contact,Qty,Unit",
      'PT-01,Paint,Dulux,"Easy Clean, Matt",EC,,Bedroom,"Budi, 0812",3,pail',
      ",,,,,,,,,",
    ].join("\r\n");
    const rows = parseLegacyScheduleSheet(csv, "MATERIAL");
    assert.deepEqual(rows, [{ code: "PT-01", category: "Paint", brand: "Dulux", product: "Easy Clean, Matt", initialsType: "EC", imageUrl: null, location: "Bedroom", contact: "Budi, 0812", qty: null, unit: "pail" }]);
    assert.equal(parseLegacyScheduleSheet("category,brand,product\nTile,Roman,Granitio", "MATERIAL"), null);
    assert.equal(parseLegacyScheduleSheet("Code,Ex,Type\nLF-01,Cellini,Aria", "MATERIAL"), null, "Material sheets need a Product Category column");
    assert.equal(parseLegacyScheduleSheet("Code,Ex,Type,Qty\nLF-01,Cellini,Aria,4", "FIXTURE")?.[0]?.qty, "4");
  });
});
