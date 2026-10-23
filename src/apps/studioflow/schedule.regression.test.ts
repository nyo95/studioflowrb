import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// The Schedule screen is split over several files (R9.229); these checks read them as one source.
const SCHEDULE_DIR = "src/app/(platform)/studioflow/projects/[projectId]/schedule";
const scheduleBoard = ["schedule-board", "schedule-shared", "schedule-board-view", "schedule-entry-panel", "schedule-add-item", "schedule-dialogs", "schedule-reuse"]
  .map((name) => readFileSync(`${SCHEDULE_DIR}/${name}.tsx`, "utf8"))
  .join("\n");
const serviceTs = readFileSync("src/apps/studioflow/schedule/service.ts", "utf8");
const actionsTs = readFileSync("src/app/(platform)/studioflow/actions.ts", "utf8");
const settingsView = readFileSync("src/app/(platform)/studioflow/settings/schedule/schedule-templates-view.tsx", "utf8");
const scheduleDomain = readFileSync("src/apps/studioflow/domain/schedule.ts", "utf8");
const schedulePrint = readFileSync("src/app/(document)/studioflow/print/projects/[projectId]/schedule/page.tsx", "utf8");

describe("WO-SF-SCHED-RELAYOUT-01 board structure", () => {
  it("keeps one outer Board/List branch", () => {
    assert.equal((scheduleBoard.match(/viewMode === "board" \? \(/g) ?? []).length, 1);
    assert.equal((scheduleBoard.match(/<BoardView/g) ?? []).length, 1);
  });
  it("uses PillTabs for the section and view (sibling views, DESIGN v2 §10.3)", () => {
    assert.match(scheduleBoard, /<PillTabs label="Schedule section"/);
    assert.match(scheduleBoard, /<PillTabs label="Schedule view"/);
    assert.match(scheduleBoard, /active: viewMode === "board"/);
    assert.match(scheduleBoard, /active: viewMode === "list"/);
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
    const board = readFileSync(`${SCHEDULE_DIR}/schedule-board-view.tsx`, "utf8");
    assert.match(board, /<article[\s\S]*?<button type="button"[\s\S]*?<\/button>[\s\S]*?<button type="button"/);
    assert.doesNotMatch(board, /role="button"/);
  });
  it("removes sample actions from board cards", () => {
    const board = readFileSync(`${SCHEDULE_DIR}/schedule-board-view.tsx`, "utf8");
    assert.doesNotMatch(board, />Request sample</);
    assert.doesNotMatch(board, />Mark received</);
  });
  it("shows the same status badges in board and list", () => {
    assert.match(scheduleBoard, /function entryBadges/);
    assert.ok((scheduleBoard.match(/entryBadges\(entry\)/g) ?? []).length >= 2);
  });
  it("shows a declined sample and its reason without counting it as waiting", () => {
    assert.match(scheduleBoard, /status === "DECLINED"\) badges\.push\(\{ label: "Sample declined"/);
    assert.match(scheduleBoard, /sample\.declineReason/);
    assert.match(scheduleBoard, /sampleRequest\?\.status === "REQUESTED"/);
  });
  it("keeps drag reorder bounded to All", () => {
    assert.match(scheduleBoard, /const reorderEnabled = canEdit && filter === "all"/);
  });
});

describe("WO-SF-SCHED-RELAYOUT-01 one drawer editor", () => {
  it("docks the editor beside the board and keeps a Drawer for new items", () => {
    // Owner 2026-10-22: the existing-item editor is a pane fixed beside the board, not a pop-up.
    assert.match(scheduleBoard, /function DockedEntryPanel/);
    assert.doesNotMatch(scheduleBoard, /function EntryDrawer/);
    assert.match(scheduleBoard, /function AddItemDrawer/);
    assert.ok((scheduleBoard.match(/<Drawer/g) ?? []).length >= 1);
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
    // Leaving a field may tidy the draft (Title Case, R9.233) but never writes: no server action runs on blur.
    for (const handler of panel.match(/onBlur=\{[^\n]*/g) ?? []) assert.doesNotMatch(handler, /Action\(|\brun\(/, handler);
  });
  it("prompts before close, navigation and section changes", () => {
    assert.match(scheduleBoard, /const askDiscard = async/);
    assert.match(scheduleBoard, /const navigateEntry = async/);
    assert.match(scheduleBoard, /const changeSection = async/);
  });
});

describe("Schedule field rules survive the relayout", () => {
  it("keeps reserve rows out of the printed schedule", () => {
    assert.match(schedulePrint, /entries\.filter\(\(entry\) => entry\.section === section && shownOptionOf\(entry\)\)/);
    assert.doesNotMatch(schedulePrint, /Reserved — no product yet/);
  });

  it("Type is always shown and never a card-field toggle", () => {
    assert.match(scheduleBoard, /aria-label="Type"/);
    assert.doesNotMatch(scheduleBoard, /visibilityAction\("type"/i);
  });
  it("Qty remains Fixture-only", () => {
    assert.match(scheduleBoard, /entry\.section === "FIXTURE" \?/);
    assert.match(scheduleBoard, /\.filter\(\(key\) => key !== "qty" \|\| entry\.section === "FIXTURE"\)/, "the Card fields picker offers Qty on Fixture cards only");
  });
  it("Brand remains one CreatableSearch with no Master Data write", () => {
    assert.match(scheduleBoard, /<CreatableSearch/);
    assert.match(scheduleBoard, /onCreate=\{\(text\) => titleCaseWords\(text\)\}/, "a typed Brand is kept as typed, in Title Case");
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

describe("WO-SF-SCHEDULE-SHEET-01 list follows the studio sheet", () => {
  it("shows the sheet's columns in order under a heading row that stays put", () => {
    const order = ['"Code"', '"Material type"', '"Ex"', '"Type"', '"Initials type"', ">Image<", '"Location"', '"Contact"', '"Status"']; // Contact only while shown
    const head = scheduleBoard.slice(scheduleBoard.indexOf("sticky top-0 z-10 flex items-center"));
    let at = 0;
    for (const label of order) {
      const next = head.indexOf(label, at);
      assert.ok(next > at, `${label} follows the previous column`);
      at = next;
    }
  });
  it("sorts and filters the List without breaking the studio's manual order", () => {
    assert.match(scheduleBoard, /<SortToggle/);
    assert.match(scheduleBoard, /<TableFilters/);
    assert.match(scheduleBoard, /const listManual = filter === "all" && listSort === null && !listFiltered && highlightFilter === "ALL" && visibility !== "hidden";/);
    assert.match(scheduleBoard, /draggable=\{canEdit && listManual && !selecting\}/);
  });
  it("keeps Contact off the card fields and print", () => {
    assert.doesNotMatch(scheduleDomain, /contact: "Contact"/);
    assert.doesNotMatch(schedulePrint, /\.contact\b/);
  });
});

describe("List category groups collapse", () => {
  it("toggles each group and keeps the open item's group visible", () => {
    assert.match(scheduleBoard, /aria-expanded=\{!collapsed\}/);
    assert.match(scheduleBoard, /collapsedGroups\.has\(group\.category\) && !group\.rows\.some\(\(row\) => row\.id === openId\)/);
    assert.match(scheduleBoard, /<ul hidden=\{collapsed\}/);
  });
});

describe("List is the default view with the Board's right-click menu", () => {
  it("opens on List and shares one action list between the row menu and right-click", () => {
    assert.match(scheduleBoard, /useState<"list" \| "board">\("list"\)/);
    assert.match(scheduleBoard, /<ContextActionMenu key=\{entry\.id\} items=\{rowItems\}>/);
    assert.match(scheduleBoard, /<RowActionMenu label=\{`Actions for \$\{entry\.code\}`\} pending=\{busy\} items=\{rowItems\} \/>/);
  });
});

describe("Copy for the studio sheet", () => {
  it("copies rows in the sheet's column order with an empty IMAGE cell, and photos separately", () => {
    assert.match(scheduleBoard, /const row = \[entry\.code, entry\.category, shown\?\.brandName \?\? "", shown\?\.productName \?\? "", shown \? initialsOf\(shown\) : "", "", entry\.location \?\? "", \.\.\.\(withContact \? \[shown\?\.contact \?\? ""\] : \[\]\)\];/);
    assert.match(scheduleBoard, /sheetRowOf\(row, showContact\)/);
    assert.match(scheduleBoard, /\{showContact \? "Hide Contact" : "Show Contact"\}/);
    assert.match(scheduleBoard, /label: "Copy row"/);
    assert.match(scheduleBoard, /label: "Copy image"/);
    assert.match(scheduleBoard, /onCopy=\{\(\) => void copyRows\(/);
  });
});

describe("Board card is a viewer: Type or Initials type, then active fields", () => {
  it("titles the card with the Type, or the Initials type while there is no Type, the same on the Board and in print", () => {
    assert.match(scheduleBoard, /const heading = shown \? scheduleCardTitle\(shown\) : null;/);
    assert.match(scheduleBoard, /SPEC_LINE_FIELDS\.has\(key\) && !\(heading\?\.fromInitials && INITIALS_FIELDS\.has\(key\)\)/);
    assert.match(schedulePrint, /const heading = shown \? scheduleCardTitle\(shown\) : null;/);
    assert.match(schedulePrint, /\{heading\?\.title\}/);
  });
});

describe("Board is the pre-print view; the inspector only records data (owner, 2026-10-23)", () => {
  it("has no card-field dots in the inspector or the Add item drawer", () => {
    assert.doesNotMatch(scheduleBoard, /visibilityAction|VisibilityField|on card &amp; print|cardFieldsDraft/);
  });
  it("chooses card fields per card on the Board, from a hover button and the right-click menu", () => {
    assert.match(scheduleBoard, /function CardFieldsDialog\(/);
    assert.match(scheduleBoard, /label: "Card fields…"/);
    assert.match(scheduleBoard, /updateScheduleEntryCardFieldsAction\(\{ projectId, entryId: entry\.id, fields \}\)/);
    assert.match(scheduleBoard, />Use default<\/Button>/);
  });
});

const printPage = readFileSync("src/app/(document)/studioflow/print/projects/[projectId]/schedule/page.tsx", "utf8");

describe("WO-SF-SCHEDULE-MARKS-01 hide and highlight", () => {
  it("offers Hide/Unhide and a Highlight submenu on List rows, Board cards and the selection", () => {
    assert.match(scheduleBoard, /label: allHidden \? "Unhide" : "Hide"/);
    assert.match(scheduleBoard, /label: "Highlight",[\s\S]*?items: \[/);
    assert.match(scheduleBoard, /\.\.\.markItems\(\[entry\]\),/);
    assert.match(scheduleBoard, /menuItems=\{\(entry\) => \[\.\.\.copyItems\(entry\), \.\.\.sampleItems\(entry\), \.\.\.markItems\(\[entry\]\)\]\}/);
    assert.match(scheduleBoard, /marks=\{markItems\(/);
  });
  it("keeps hidden items out of the counts and progress, with a visibility and a colour filter", () => {
    assert.match(scheduleBoard, /scheduleFilterCounts\(sectionEntries\.filter\(\(entry\) => !entry\.hidden\)\)/);
    assert.match(scheduleBoard, /<option value="all">Show hidden<\/option>/);
    assert.match(scheduleBoard, /<option value="hidden">Hidden only<\/option>/);
    assert.match(scheduleBoard, /aria-label="Highlight colour"/);
  });
  it("reorders a whole category so hidden rows are never dropped from the order sent", () => {
    assert.match(scheduleBoard, /const ids = sectionEntries\.filter\(\(entry\) => entry\.category === rows\[0\]\?\.category\)\.map\(\(entry\) => entry\.id\);/);
  });
  it("asks at Print / PDF and prints hidden items only when asked", () => {
    assert.match(scheduleBoard, /title="Include hidden items\?"/);
    assert.match(scheduleBoard, /\?hidden=include/);
    assert.match(printPage, /const entries = includeHidden \? allEntries : allEntries\.filter\(\(entry\) => !entry\.hidden\);/);
  });
});

describe("Type and Initials type share the List width", () => {
  it("gives both columns the same flexible width", () => {
    assert.match(scheduleBoard, /<span className="min-w-40 flex-1 basis-0">\{sortHead\("type", "Type"\)\}<\/span>/);
    assert.match(scheduleBoard, /<span className="min-w-40 flex-1 basis-0">\{sortHead\("initials", "Initials type"\)\}<\/span>/);
  });
});

describe("Contact is offered from the Brand's Master Data contacts", () => {
  it("loads the chosen Brand's contacts and keeps typed text as its own choice", () => {
    assert.match(scheduleBoard, /listScheduleBrandContactsAction\(\{ projectId, brandId \}\)/);
    assert.match(scheduleBoard, /<CreatableSearch\s+label="Contact"/);
    assert.match(scheduleBoard, /\[\{ id: draft\.contact, label: draft\.contact \}, \.\.\.fromMasterData\]/);
  });
});

describe("a typed Brand is offered a link to Master Data, never switched on its own", () => {
  it("suggests in the inspector, filters typed Brands, and links a selection in one go", () => {
    assert.match(scheduleBoard, /const linkCandidates = draft\.brandId \? \[\] : brandLinkCandidates\(draft\.brandName, brands\);/);
    assert.match(scheduleBoard, /onClick=\{\(\) => updateDraft\(\{ brandId: brand\.id, brandName: "" \}\)\}/);
    assert.match(scheduleBoard, /label: "Not in Master Data \(typed\)"/);
    assert.match(scheduleBoard, /brandLinks=\{brandLinksFor\(/);
  });
});

describe("Request sample from a row's menu", () => {
  it("offers it on List rows and Board cards for the option the row shows", () => {
    assert.match(scheduleBoard, /label: asked \? "Ask for the sample again" : "Request sample"/);
    assert.match(scheduleBoard, /\.\.\.copyItems\(entry\),\s+\.\.\.sampleItems\(entry\),/);
    assert.match(scheduleBoard, /menuItems=\{\(entry\) => \[\.\.\.copyItems\(entry\), \.\.\.sampleItems\(entry\), \.\.\.markItems\(\[entry\]\)\]\}/);
    assert.match(scheduleBoard, /<InlineSampleRequest projectId=\{projectId\} option=\{sampleTarget\.option\}/);
  });
});

describe("Hide and highlight never leave a stale mark (R9.232, R9.234)", () => {
  const command = readFileSync("src/app/(platform)/studioflow/_components/use-command.ts", "utf8");
  const shared = readFileSync(`${SCHEDULE_DIR}/schedule-shared.tsx`, "utf8");
  it("shows the mark at once, holds it until the page agrees, and re-fetches at most twice after the write", () => {
    assert.match(command, /if \(options\.refresh !== false\) router\.refresh\(\);/);
    assert.match(scheduleBoard, /overrideMarks\(entryIds, \{ mark: \{ highlight \} \}\);\s+const ok = await run\("mark-highlight", [\s\S]*?\{ refresh: false \}\);\s+overrideMarks\(entryIds, ok \? "settled" : "drop"\);/);
    assert.match(scheduleBoard, /overrideMarks\(entryIds, \{ mark: \{ hidden \} \}\);\s+const ok = await run\("mark-hidden", [\s\S]*?\{ refresh: false \}\);\s+overrideMarks\(entryIds, ok \? "settled" : "drop"\);/);
    assert.match(scheduleBoard, /if \(agrees \|\| override\.retries >= 2\) next\.delete\(id\);/);
    assert.match(scheduleBoard, /if \(refetch\) router\.refresh\(\);/);
  });
  it("keeps hover and the open row visible on a highlighted row", () => {
    assert.match(shared, /hover:bg-\[color-mix\(in_srgb,var\(--row-highlight\)_24%,var\(--ui-surface\)\)\]/);
    assert.match(shared, /const edge = open \? "shadow-\[inset_4px_0_0_var\(--color-ink\)\]"/, "the open row has its own thick dark edge");
    assert.match(scheduleBoard, /\$\{rowHighlightClass\(entry\.highlight, open\?\.id === entry\.id\)\}/);
  });
});

describe("Enter saves the inspector from a one-line field", () => {
  it("saves on Enter except in Notes and in the Brand/Contact search lists", () => {
    assert.match(scheduleBoard, /if \(event\.key !== "Enter" \|\| event\.shiftKey \|\| event\.nativeEvent\.isComposing \|\| target\.tagName !== "INPUT"\) return;/);
    assert.match(scheduleBoard, /if \(!event\.currentTarget\.contains\(target\) \|\| target\.getAttribute\("role"\) === "combobox"/);
    assert.match(scheduleBoard, /if \(!canEdit \|\| savePending \|\| !isDirty \|\| optionNeedsType\) return;/);
  });
});

describe("Title Case on names and descriptions; selected rows stand out", () => {
  it("raises the first letter of each word when a name or description field is left, not Size, Qty or Notes", () => {
    assert.match(scheduleBoard, /onBlur=\{\(\) => titled\(draft\.productName,/);
    assert.match(scheduleBoard, /key: "color",[^\n]*titleCase: true/);
    assert.match(scheduleBoard, /key: "dimension",[^\n]*titleCase: false/);
    assert.match(scheduleBoard, /onBlur=\{\(\) => titled\(fields\.location,/);
    assert.match(scheduleBoard, /onCreate=\{\(text\) => titleCaseWords\(text\)\}/);
    assert.match(scheduleBoard, /<Input textCase="title" value=\{product\.productName\}/);
  });
  it("outlines a selected List row so it shows even on a highlighted row", () => {
    assert.match(scheduleBoard, /\$\{selecting && selectedIds\.has\(entry\.id\) \? "outline-2 outline-offset-\[-2px\] outline-line-focus" : ""\}/);
  });
});
