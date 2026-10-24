import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import { hasPermission, type PermissionGrants } from "@platform/core/rbac";
import { initializePermissionRegistry } from "@platform/core/rbac/registry";

import { APP_REGISTRATIONS } from "../../app/app-registrations";

import { STUDIOFLOW_PERMISSIONS as P } from "./permissions";
import { STUDIOFLOW_ROLE_PROFILES } from "./role-profiles";
import { projectAccessFromFacts } from "./shared";

/**
 * The access matrix (WO-SF-ROLES-01) is generated from the code, never typed: the profiles, the PIC and book-member facts
 * and `projectAccessFromFacts`. This test keeps `docs/apps/studioflow/ACCESS-MATRIX.md` equal to what the code says; run it
 * with `UPDATE_ACCESS_MATRIX=1` to rewrite the table after an intended change.
 */

const MATRIX_FILE = "docs/apps/studioflow/ACCESS-MATRIX.md";
const BEGIN = "<!-- access-matrix:begin -->";
const END = "<!-- access-matrix:end -->";

function grantsOf(permissions: readonly string[]): PermissionGrants {
  return permissions;
}

const profile = (code: string) => STUDIOFLOW_ROLE_PROFILES.find((candidate) => candidate.code === code)!.permissionIds as readonly string[];

type Persona = { name: string; permissions: readonly string[]; asDesignerPic?: boolean; asDrafterPic?: boolean; asMember?: boolean };

const PERSONAS: readonly Persona[] = [
  // The owner policy never gives the Platform Owner a position (Designer/Drafter): those say who a person is.
  { name: "Platform Owner (holds everything, no PIC seat)", permissions: Object.values(P).filter((permission) => permission !== P.projectPicDesigner && permission !== P.projectPicDrafter) },
  { name: "Manager (not on the project)", permissions: profile("studio-manager") },
  { name: "Designer, PIC designer of the project", permissions: profile("designer"), asDesignerPic: true },
  { name: "Designer, not on the project", permissions: profile("designer") },
  { name: "Drafter, PIC drafter of the project", permissions: profile("drafter"), asDrafterPic: true },
  { name: "Designer invited to the book", permissions: profile("designer"), asMember: true },
  { name: "Signed in with access only", permissions: [P.access, P.projectRead] },
];

const COLUMNS = [
  "Sees the project's work pages",
  "Reads the private book",
  "Edits project info and assigns PICs",
  "Edits documents (with the feature permission)",
  "Moves designer-seat phases",
  "Moves drafter-seat phases",
  "Manages templates and settings",
  "Sets Timeline dates",
  "Resets phase history",
  "Can be picked as PIC",
] as const;

function rowFor(persona: Persona): boolean[] {
  const grants = grantsOf(persona.permissions);
  const actorId = "actor";
  const access = projectAccessFromFacts({
    status: "ACTIVE",
    pic_designer_id: persona.asDesignerPic ? actorId : "someone-else",
    pic_drafter_id: persona.asDrafterPic ? actorId : "another-one",
    phases: [{ id: "designer-phase", seat_snapshot: "designer" }, { id: "drafter-phase", seat_snapshot: "drafter" }],
    book_members: persona.asMember ? [{ user_id: actorId }] : [],
  }, { grants, actorId });
  const transition = (id: string) => access.phases.find((phase) => phase.phaseId === id)!.canTransition;
  return [
    access.canSeeWorkSections,
    access.canReadBook,
    access.canEditProject,
    access.canEditDocuments,
    transition("designer-phase"),
    transition("drafter-phase"),
    hasPermission(grants, P.settingsManage),
    hasPermission(grants, P.projectManage) && hasPermission(grants, P.projectOverride),
    hasPermission(grants, P.phaseOverride),
    hasPermission(grants, P.projectPicDesigner) || hasPermission(grants, P.projectPicDrafter),
  ];
}

export function renderAccessMatrix(): string {
  const header = `| Who | ${COLUMNS.join(" | ")} |`;
  const rule = `|---|${COLUMNS.map(() => ":-:").join("|")}|`;
  const rows = PERSONAS.map((persona) => `| ${persona.name} | ${rowFor(persona).map((yes) => (yes ? "yes" : "-")).join(" | ")} |`);
  return [header, rule, ...rows].join("\n");
}

describe("StudioFlow access matrix", () => {
  before(() => {
    initializePermissionRegistry(APP_REGISTRATIONS);
  });

  it("keeps the documented matrix equal to what the code decides", () => {
    const text = readFileSync(MATRIX_FILE, "utf8").replace(/\r\n/g, "\n");
    const start = text.indexOf(BEGIN);
    const end = text.indexOf(END);
    assert.ok(start >= 0 && end > start, "the matrix markers are missing");
    const generated = renderAccessMatrix();
    if (process.env.UPDATE_ACCESS_MATRIX === "1") {
      writeFileSync(MATRIX_FILE, `${text.slice(0, start + BEGIN.length)}\n${generated}\n${text.slice(end)}`);
      return;
    }
    assert.equal(text.slice(start + BEGIN.length, end).trim(), generated, "run with UPDATE_ACCESS_MATRIX=1 after an intended permission change");
  });

  it("holds the owner's rules", () => {
    const rows = new Map(PERSONAS.map((persona) => [persona.name, rowFor(persona)]));
    const col = (name: (typeof COLUMNS)[number]) => COLUMNS.indexOf(name);
    const manager = rows.get("Manager (not on the project)")!;
    const owner = rows.get("Platform Owner (holds everything, no PIC seat)")!;
    // The Platform Owner does not read staff books; neither does a Manager; a Manager acts for an absent PIC.
    assert.equal(owner[col("Reads the private book")], false);
    assert.equal(manager[col("Reads the private book")], false);
    for (const column of ["Moves designer-seat phases", "Moves drafter-seat phases", "Edits documents (with the feature permission)", "Manages templates and settings", "Sets Timeline dates", "Resets phase history"] as const) {
      assert.equal(manager[col(column)], true, column);
    }
    assert.equal(manager[col("Resets phase history")], true);
    assert.equal(manager[col("Can be picked as PIC")], false);
    // A designer works only where they are PIC; a drafter only in drafter-seat phases.
    assert.deepEqual(rows.get("Designer, not on the project")!.slice(0, 6), [false, false, false, false, false, false]);
    const drafter = rows.get("Drafter, PIC drafter of the project")!;
    assert.deepEqual([drafter[col("Moves designer-seat phases")], drafter[col("Moves drafter-seat phases")]], [false, true]);
  });
});
