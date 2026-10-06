import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const scheduleBoard = readFileSync("src/app/(platform)/studioflow/projects/[projectId]/schedule/schedule-board.tsx", "utf8");
const serviceTs = readFileSync("src/apps/studioflow/schedule/service.ts", "utf8");
const actionsTs = readFileSync("src/app/(platform)/studioflow/actions.ts", "utf8");
const settingsView = readFileSync("src/app/(platform)/studioflow/schedule-templates/schedule-templates-view.tsx", "utf8");
const scheduleDomain = readFileSync("src/apps/studioflow/domain/schedule.ts", "utf8");

describe("WO-SF-SCHED-RELAYOUT-01 board structure", () => {
  it("keeps one outer Board/List branch", () => {
    assert.equal((scheduleBoard.match(/viewMode === "board" \? \(/g) ?? []).length, 1);
    assert.equal((scheduleBoard.match(/<BoardView/g) ?? []).length, 1);
  });
  it("uses FilterChip for section and view controls", () => {
    assert.match(scheduleBoard, /selected=\{viewMode === "board"\}/);
    assert.match(scheduleBoard, /selected=\{viewMode === "list"\}/);
  });
  it("puts setup actions in one ButtonMenu", () => {
    assert.match(scheduleBoard, /<ButtonMenu label="Set up"/);
    for (const label of ["Apply studio templates", "Import CSV", "Schedule templates"]) assert.match(scheduleBoard, new RegExp(label));
  });
  it("shows progress and all four filters", () => {
    assert.match(scheduleBoard, /<ProgressBar/);
    for (const label of ["All", "Needs a decision", "Sample waiting", "No product yet"]) assert.match(scheduleBoard, new RegExp(`>${label}<`));
  });
  it("counts filters from the current section", () => {
    assert.match(scheduleBoard, /function scheduleFilterCounts/);
    assert.match(scheduleBoard, /entryMatchesFilter/);
  });
  it("defines decision, sample, empty and final counts from option facts", () => {
    const helper = scheduleBoard.slice(scheduleBoard.indexOf("function scheduleFilterCounts"), scheduleBoard.indexOf("function entryMatchesFilter"));
    assert.match(helper, /entry\.options\.length > 0 && !finalOf\(entry\)/);
    assert.match(helper, /sampleRequest\?\.status === "REQUESTED"/);
    assert.match(helper, /entry\.options\.length === 0/);
    assert.match(helper, /filter\(\(entry\) => finalOf\(entry\)\)/);
  });
  it("uses GroupHeader instead of the vertical category rail", () => {
    assert.match(scheduleBoard, /<GroupHeader/);
    assert.doesNotMatch(scheduleBoard, /writing-mode:vertical-rl/);
  });
  it("offers quick add only in All", () => {
    assert.match(scheduleBoard, /function QuickAddTile/);
    assert.match(scheduleBoard, /canEdit && filter === "all"/);
  });
  it("quick add can create a product or reserve the code", () => {
    assert.match(scheduleBoard, /snapshot: value \? \{ productName: value \} : null/);
  });
  it("board cards use sibling photo and body buttons", () => {
    const board = scheduleBoard.slice(scheduleBoard.indexOf("function BoardView"), scheduleBoard.indexOf("export function ScheduleBoard"));
    assert.match(board, /<article[\s\S]*?<button type="button"[\s\S]*?<\/button>[\s\S]*?<button type="button"/);
    assert.doesNotMatch(board, /role="button"/);
  });
  it("removes sample actions from board cards", () => {
    const board = scheduleBoard.slice(scheduleBoard.indexOf("function BoardView"), scheduleBoard.indexOf("export function ScheduleBoard"));
    assert.doesNotMatch(board, />Request sample</);
    assert.doesNotMatch(board, />Mark received</);
  });
  it("shows the same status badges in board and list", () => {
    assert.match(scheduleBoard, /function entryBadges/);
    assert.ok((scheduleBoard.match(/entryBadges\(entry\)/g) ?? []).length >= 2);
  });
  it("keeps drag reorder bounded to All", () => {
    assert.match(scheduleBoard, /const reorderEnabled = canEdit && filter === "all"/);
  });
});

describe("WO-SF-SCHED-RELAYOUT-01 one drawer editor", () => {
  it("uses Drawer for existing and new items", () => {
    assert.match(scheduleBoard, /function EntryDrawer/);
    assert.match(scheduleBoard, /function AddItemDrawer/);
    assert.ok((scheduleBoard.match(/<Drawer/g) ?? []).length >= 2);
  });
  it("removes the three old editor dialogs", () => {
    assert.doesNotMatch(scheduleBoard, /OptionDialog|AddItemDialog|EntryDialog/);
  });
  it("keeps photo editing inline", () => {
    assert.match(scheduleBoard, /<InlinePhotoEditor/);
    assert.doesNotMatch(scheduleBoard, /<Dialog[\s\S]{0,80}Photo — /);
  });
  it("keeps sample request inline", () => {
    assert.match(scheduleBoard, /function InlineSampleRequest/);
    assert.doesNotMatch(scheduleBoard, /SampleRequestDialog/);
  });
  it("keeps past-project reuse inline", () => {
    assert.match(scheduleBoard, /function InlineReuse/);
    assert.doesNotMatch(scheduleBoard, /ReuseDialog/);
  });
  it("keeps option drafts under the new key", () => {
    assert.match(scheduleBoard, /draftKey = selectedId === "new" \? "new"/);
  });
  it("keeps explicit Save and Discard without blur writes", () => {
    assert.match(scheduleBoard, /onClick=\{discardDraft\}/);
    assert.match(scheduleBoard, /onClick=\{\(\) => void saveAll\(\)/);
    const panel = scheduleBoard.slice(scheduleBoard.indexOf("function EntryPanelContent"), scheduleBoard.indexOf("function EntryDrawer"));
    assert.doesNotMatch(panel, /onBlur=/);
  });
  it("prompts before close, navigation and section changes", () => {
    assert.match(scheduleBoard, /const askDiscard = async/);
    assert.match(scheduleBoard, /const navigateEntry = async/);
    assert.match(scheduleBoard, /const changeSection = async/);
  });
});

describe("Schedule field rules survive the relayout", () => {
  it("Type is always shown and never a card-field toggle", () => {
    assert.match(scheduleBoard, /aria-label="Type"/);
    assert.doesNotMatch(scheduleBoard, /visibilityAction\("type"/i);
  });
  it("Qty remains Fixture-only", () => {
    assert.match(scheduleBoard, /entry\.section === "FIXTURE" \?/);
    assert.match(scheduleBoard, /visibilityAction\("qty", "Qty"\)/);
  });
  it("Brand remains one CreatableSearch with no Master Data write", () => {
    assert.match(scheduleBoard, /<CreatableSearch/);
    assert.match(scheduleBoard, /onCreate=\{\(text\) => text\}/);
    assert.doesNotMatch(scheduleBoard, /masterData\.(create|insert|upsert)/i);
  });
  it("Notes still uses SimpleTextEditor", () => {
    assert.match(scheduleBoard, /<SimpleTextEditor value=\{draft\.notes\}/);
  });
  it("Pattern stays in drafts, snapshots, templates, service and CSV", () => {
    assert.match(scheduleBoard, /pattern:\s*string;/);
    assert.match(scheduleBoard, /pattern:\s*text\(draft\.pattern\)/);
    assert.match(actionsTs, /pattern:\s*z\.string\(\)\.max\(160\)\.nullish\(\)/);
    assert.match(settingsView, /<Field label="Pattern">/);
    assert.match(serviceTs, /pattern:\s*snapshot\.pattern/);
    assert.match(serviceTs, /row\.pattern\s*\|\|\s*row\.motif\s*\|\|\s*row\.catalog_motif/);
    assert.match(scheduleDomain, /Pick<ScheduleOptionView, "color" \| "pattern" \| "finishing" \| "dimension">/);
  });
});
