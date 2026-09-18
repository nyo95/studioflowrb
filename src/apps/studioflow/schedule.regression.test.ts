import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const scheduleBoard = readFileSync(
  "src/app/(platform)/studioflow/projects/[projectId]/schedule/schedule-board.tsx",
  "utf8",
);
const serviceTs = readFileSync("src/apps/studioflow/schedule/service.ts", "utf8");
const actionsTs = readFileSync("src/app/(platform)/studioflow/actions.ts", "utf8");
const settingsView = readFileSync(
  "src/app/(platform)/studioflow/settings/studio-settings-view.tsx",
  "utf8",
);

describe("Schedule Board/List outer branching and pattern form preservation", () => {
  it("renders BoardView exactly once at the outer view-mode conditional", () => {
    const branch = (scheduleBoard.match(/viewMode === "board" \? \(/g) ?? []).length;
    const boardUsage = (scheduleBoard.match(/<BoardView/g) ?? []).length;
    assert.equal(branch, 1, "the Board/List render branch must exist exactly once (outer level)");
    assert.equal(boardUsage, 1, "BoardView must be rendered exactly once (no nested duplicate)");
  });

  it("keeps the board branch outside and before the list rows", () => {
    const toggle = scheduleBoard.indexOf('viewMode === "board" ? (');
    const listUl = scheduleBoard.indexOf('<ul className="m-0 list-none divide-y');
    const listGrid = scheduleBoard.indexOf('<div className="grid">', toggle);
    assert.ok(toggle > -1, "Board/List render branch exists");
    assert.ok(listGrid > -1, "List view is the else branch of the toggle");
    assert.ok(listUl > -1 && listUl > toggle, "list rows render only inside the else branch, not before the board branch");
  });

  it("opens a single shared inspector for both views", () => {
    const boardOpen = scheduleBoard.indexOf("onOpen={setOpenId}", scheduleBoard.indexOf("<BoardView"));
    const drawer = scheduleBoard.indexOf("<EntryDrawer");
    assert.ok(boardOpen > -1, "BoardView opens the shared inspector");
    assert.equal(drawer, scheduleBoard.lastIndexOf("<EntryDrawer"), "EntryDrawer is rendered once at the outer level");
    assert.ok(scheduleBoard.indexOf("{/* Desktop inline panel */}") > scheduleBoard.indexOf('<div className="min-w-0">'), "desktop panel is a sibling of the view pane, not inside it");
  });

  it("has the List button and Board button in the toolbar", () => {
    assert.match(scheduleBoard, /onClick=\{\(\) => setViewMode\("list"\)\}/);
    assert.match(scheduleBoard, /onClick=\{\(\) => setViewMode\("board"\)\}/);
    assert.match(scheduleBoard, /aria-pressed=\{viewMode === "list"\}/);
    assert.match(scheduleBoard, /aria-pressed=\{viewMode === "board"\}/);
  });

  it("preserves pattern in ProductDraft type", () => {
    assert.match(scheduleBoard, /pattern:\s*string;/);
  });

  it("includes pattern in EMPTY_PRODUCT and productFromOption", () => {
    assert.match(scheduleBoard, /EMPTY_PRODUCT:\s*ProductDraft\s*=\s*\{[^}]*pattern:\s*""/s);
    assert.match(scheduleBoard, /pattern:\s*option\.pattern\s*\?\?\s*""/);
  });

  it("includes pattern in toSnapshot and specLine", () => {
    assert.match(scheduleBoard, /pattern:\s*text\(draft\.pattern\)/);
    assert.match(scheduleBoard, /Pick<ScheduleOptionView, "skuText" \| "color" \| "pattern" \| "finishing" \| "dimension">/);
  });

  it("has a Pattern / motif field in ProductFields", () => {
    const productFieldsIndex = scheduleBoard.indexOf("function ProductFields");
    const patternField = scheduleBoard.indexOf('<Field label="Pattern / motif">', productFieldsIndex);
    assert.ok(patternField > -1, "Pattern field exists in ProductFields");
    assert.ok(patternField > scheduleBoard.indexOf('<Field label="Color">', productFieldsIndex), "Pattern sits after Color");
    assert.ok(patternField < scheduleBoard.indexOf('<Field label="Finishing">', productFieldsIndex), "Pattern sits before Finishing");
  });

  it("accepts pattern in the ScheduleSnapshot action schema", () => {
    assert.match(actionsTs, /const ScheduleSnapshot\s*=\s*z\.strictObject\(\{[^}]*pattern:\s*z\.string\(\)\.max\(160\)\.nullish\(\)/s);
  });

  it("preserves pattern through the template item editor", () => {
    assert.match(settingsView, /pattern:\s*string\s*\| null;/);
    assert.match(settingsView, /pattern:\s*text\(item\?\.pattern\)/);
    assert.match(settingsView, /pattern:\s*nullable\(draft\.pattern\)/);
    assert.match(settingsView, /<Field label="Pattern \/ motif">/);
  });

  it("preserves pattern in service templateItemData", () => {
    assert.match(serviceTs, /pattern:\s*snapshot\.pattern/);
  });

  it("handles pattern/motif/catalog_motif CSV import aliases", () => {
    assert.match(serviceTs, /pattern:\s*row\.pattern\s*\|\|\s*row\.motif\s*\|\|\s*row\.catalog_motif/);
  });
});