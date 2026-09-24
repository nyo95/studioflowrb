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
const scheduleDomain = readFileSync("src/apps/studioflow/domain/schedule.ts", "utf8");

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

  it("opens a single shared editor dialog for both views (R8.112: no separate desktop-panel/mobile-drawer split)", () => {
    const boardOpen = scheduleBoard.indexOf("onOpen={setOpenId}", scheduleBoard.indexOf("<BoardView"));
    const dialogUsage = (scheduleBoard.match(/<EntryDialog/g) ?? []).length;
    assert.ok(boardOpen > -1, "BoardView opens the shared editor");
    assert.equal(dialogUsage, 1, "EntryDialog is rendered exactly once, as a sibling of the view pane, not once per breakpoint");
    assert.doesNotMatch(scheduleBoard, /useIsDesktop\(\)|<EntryDrawer|md:grid-cols-\[1fr_22rem\]/, "the split desktop-sidebar/mobile-drawer layout must not come back");
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
    assert.match(scheduleDomain, /Pick<ScheduleOptionView, "color" \| "pattern" \| "finishing" \| "dimension">/);
  });

  it("has a Pattern field in ProductFields", () => {
    const productFieldsIndex = scheduleBoard.indexOf("function ProductFields");
    const patternField = scheduleBoard.indexOf('<Field label="Pattern">', productFieldsIndex);
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
    assert.match(settingsView, /<Field label="Pattern">/);
  });

  it("preserves pattern in service templateItemData", () => {
    assert.match(serviceTs, /pattern:\s*snapshot\.pattern/);
  });

  it("handles pattern/motif/catalog_motif CSV import aliases", () => {
    assert.match(serviceTs, /pattern:\s*row\.pattern\s*\|\|\s*row\.motif\s*\|\|\s*row\.catalog_motif/);
  });
});

describe("R8.112: card-field checkboxes grey out when there is nothing to show", () => {
  it("cardFieldValuesOf renders the board card, unchanged since R8.112 (moved to domain/schedule.ts so the print catalogue can share it)", () => {
    assert.match(scheduleDomain, /export function cardFieldValuesOf\(entry: ScheduleEntryView\)/);
    assert.match(scheduleBoard, /\bcardFieldValuesOf,/, "schedule-board.tsx imports the shared function rather than redefining it");
    const boardViewIndex = scheduleBoard.indexOf("function BoardView");
    const panelIndex = scheduleBoard.indexOf("function EntryPanelContent");
    assert.match(scheduleBoard.slice(boardViewIndex, panelIndex), /const fieldValue = cardFieldValuesOf\(entry\);/);
  });

  it("still hides the empty row on the card itself (does not start rendering blanks)", () => {
    assert.match(scheduleBoard, /details\.map\(\(\[label, value\]\) => value \? \(/);
  });
});

describe("R8.113: Item details and card fields merged into one tick-to-fill-in checklist", () => {
  it("the empty-value gate from R8.112 is gone from the panel — ticking a field is never blocked by it being blank", () => {
    assert.doesNotMatch(scheduleBoard, /!hasValue\(/, "an empty-field checkbox gate must not come back");
    const panelIndex = scheduleBoard.indexOf("function EntryPanelContent");
    assert.doesNotMatch(scheduleBoard.slice(panelIndex), /cardFieldValuesOf\(entry\)/, "the panel no longer reads field values just to grey out a checkbox");
  });

  it("R8.135: every Card content row disables only for permission or a pending save — no row requires a shown option to be tickable", () => {
    // Owner reversal, 2026-09-24: PT-01-style items (no option yet) can now
    // have their product info filled in directly; a checkbox is never gated
    // on `shown` existing, only on edit permission / an in-flight save.
    const panelBody = scheduleBoard.slice(scheduleBoard.indexOf("function EntryPanelContent"), scheduleBoard.indexOf("function EntryDialog"));
    assert.doesNotMatch(panelBody, /\|\| !shown\}/, "no Card content row may disable itself for lack of a shown option");
    const rowCount = (panelBody.match(/disabled=\{!canEdit \|\| savePending\}/g) ?? []).length;
    assert.ok(rowCount >= 7, `expected every Card content checkbox row to use the shared !canEdit || savePending gate, found ${rowCount}`);
  });

  it("reveals a field's input only once its checkbox is ticked (ChecklistRow)", () => {
    assert.match(scheduleBoard, /\{checked && children \? <div className="px-1\.5 pb-2 pt-0\.5">\{children\}<\/div> : null\}/);
  });

  it("R8.135: Card content is a draft with an explicit Save/Discard pair — per-field auto-save-on-blur is gone", () => {
    // Owner reversal, 2026-09-24: "jangan langsung update reactive tapi harus
    // di save dulu baru di update" — batched Save, matching Master Data's
    // draft/discard pattern, replaces R8.113's per-row onBlur auto-save.
    const panelBody = scheduleBoard.slice(scheduleBoard.indexOf("function EntryPanelContent"), scheduleBoard.indexOf("function EntryDialog"));
    assert.doesNotMatch(panelBody, /onBlur=/, "no Card content field may auto-save on blur anymore");
    assert.match(panelBody, /onClick=\{\(\) => void saveAll\(\)/, "an explicit Save action exists");
    assert.match(panelBody, /onClick=\{discardDraft\}/, "an explicit Discard action exists");
  });

  it("Brand is one row in the checklist, not a floating select+input pair", () => {
    const panelBody = scheduleBoard.slice(scheduleBoard.indexOf("function EntryPanelContent"));
    assert.match(panelBody, /label="Brand"/);
  });
});

describe("R8.113: Brand as one creatable search, Type in the checklist, Qty fixture-only, WYSIWYG Notes", () => {
  it("Brand is a single CreatableSearch — the old two-control select+input pair is gone", () => {
    const panelBody = scheduleBoard.slice(scheduleBoard.indexOf("function EntryPanelContent"));
    assert.match(panelBody, /<CreatableSearch\b/);
    assert.match(panelBody, /onCreate=\{\(text\) => text\}/, "typing an unlisted brand must not create a Master Data record — it is free text, same as before");
    assert.doesNotMatch(panelBody, /Other \(type the name\)/, "the old dropdown-plus-fallback-input pair must not come back");
  });

  it("never writes Master Data from the schedule side (no create/insert call reachable from the brand row)", () => {
    assert.doesNotMatch(scheduleBoard, /masterData\.(create|insert|upsert)/i);
  });

  it("Type is in the checklist, right after Brand, with no checkbox — it always shows", () => {
    const panelBody = scheduleBoard.slice(scheduleBoard.indexOf("function EntryPanelContent"));
    const brandIndex = panelBody.indexOf('label="Brand"');
    const typeIndex = panelBody.indexOf("Type <span");
    const colorIndex = panelBody.indexOf('label={CARD_FIELD_LABEL[key]}');
    assert.ok(brandIndex > -1 && typeIndex > brandIndex && colorIndex > typeIndex, "order is Brand, then Type, then the simple option fields");
    assert.doesNotMatch(panelBody.slice(typeIndex - 40, typeIndex + 400), /type="checkbox"/, "Type has no checkbox");
    assert.match(panelBody, /value=\{optionDraft\.productName\}/);
  });

  it("Qty only renders for Fixture entries", () => {
    assert.match(scheduleBoard, /\{entry\.section === "FIXTURE" \? \(\s*<ChecklistRow label="Qty"/);
  });

  it("field order is Brand, Type, Color, Pattern, Finishing, Location, [Qty], Size, Notes", () => {
    const panelBody = scheduleBoard.slice(scheduleBoard.indexOf("function EntryPanelContent"));
    const order = ['label="Brand"', "Type <span", "SIMPLE_OPTION_FIELD_KEYS.map", 'label="Location"', 'ChecklistRow label="Qty"', 'label="Size"', 'label="Notes"']
      .map((needle) => panelBody.indexOf(needle));
    assert.ok(order.every((index) => index > -1), "every row is present");
    assert.ok(order.every((index, position) => position === 0 || index > order[position - 1]), "rows appear in the requested order");
  });

  it("Notes uses the shared SimpleTextEditor (masterdata's WYSIWYG-lite), not a plain Textarea", () => {
    const panelBody = scheduleBoard.slice(scheduleBoard.indexOf("function EntryPanelContent"));
    assert.match(panelBody, /<SimpleTextEditor autoFocus value=\{optionDraft\.notes\}/);
  });
});