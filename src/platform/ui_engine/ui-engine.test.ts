import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as ui from "./index";
import { getComboboxNavigationIndex } from "./internal/combobox-navigation";
import { getEffectiveRailCollapsed } from "./internal/rail-state";
import { getInlineEditKeyAction } from "./patterns/inline-edit";

describe("UI Engine foundation", () => {
  it("exports the deliberate shared surface", () => {
    for (const name of [
      "Heading",
      "Text",
      "Button",
      "IconButton",
      "Input",
      "Textarea",
      "Select",
      "Checkbox",
      "RadioGroup",
      "Switch",
      "Divider",
      "Badge",
      "Spinner",
      "Skeleton",
      "Surface",
      "Field",
      "FormSection",
      "FormActions",
      "TableHeader",
      "TableBody",
      "TableRow",
      "TableHead",
      "TableCell",
      "TableToolbar",
      "SearchField",
      "Pagination",
      "DescriptionList",
      "DescriptionItem",
      "StatusBadge",
      "Notice",
      "Dialog",
      "Drawer",
      "ConfirmDialog",
      "Tooltip",
      "AppShell",
      "NavItem",
      "PageShell",
      "PageHeader",
      "DirectoryShell",
      "DetailShell",
      "SettingsShell",
      "WorkspaceShell",
      "SplitPane",
      "Tabs",
      "PageSection",
      "SectionCard",
      "DataTable",
      "LoadingState",
      "EmptyState",
      "ErrorState",
      "InlineError",
      "RowActionMenu",
      "FilterBar",
      "SelectionBar",
      "Combobox",
      "InlineEdit",
      "ReorderHandle",
      "FileDropZone",
      "DocumentSheet",
    ]) {
      const exported = ui[name as keyof typeof ui];
      assert.ok(
        typeof exported === "function" || (typeof exported === "object" && exported !== null),
        name,
      );
    }
  });

  it("keeps accessibility-critical state and dialog semantics distinct", () => {
    assert.match(renderToStaticMarkup(createElement(ui.LoadingState, {})), /role="status"/);
    assert.match(renderToStaticMarkup(createElement(ui.ErrorState, { title: "Failed" })), /role="alert"/);
    assert.doesNotMatch(renderToStaticMarkup(createElement(ui.EmptyState, { title: "None" })), /role="alert"/);
    const overlays = readFileSync(new URL("./layouts/overlays.tsx", import.meta.url), "utf8");
    assert.match(overlays, /RDialog\.Root/);
    assert.match(overlays, /RDialog\.Title/);
    assert.match(overlays, /RDialog\.Description/);
    assert.match(overlays, /RDialog\.Close/);
    assert.match(overlays, /RAlertDialog\.Root/);
    assert.match(overlays, /drawer/);
  });

  it("connects field labels, descriptions, and errors to their control", () => {
    const field = renderToStaticMarkup(
      createElement(
        ui.Field,
        {
          id: "record-name",
          label: "Name",
          description: "Use a clear label.",
          error: "Required",
          children: createElement(ui.Input, {}),
        },
      ),
    );
    assert.match(field, /for="record-name"/);
    assert.match(field, /id="record-name"/);
    assert.match(field, /aria-describedby="record-name-description record-name-error"/);
    assert.match(field, /aria-invalid="true"/);
  });

  it("locks token source, action radius, widths, and horizontal overflow", () => {
    const css = readFileSync(new URL("./tokens/tokens.css", import.meta.url), "utf8");
    assert.match(css, /--ui-radius-action:\s*4px/);
    assert.match(css, /--ui-dialog-sm:\s*420px/);
    assert.match(css, /--ui-dialog-full:\s*1180px/);
    assert.match(css, /--ui-dialog-max-height:\s*90vh/);
    const table = renderToStaticMarkup(createElement(ui.DataTable, { minWidth: "900px" }));
    assert.match(table, /data-table-overflow="horizontal"/);
    assert.match(table, /min-width:900px/);
  });

  it("exposes generic navigation, description columns, sorting, and selected-row presentation", () => {
    const nav = renderToStaticMarkup(createElement(ui.NavItem, { href: "/records", active: true, children: "Records" }));
    assert.match(nav, /aria-current="page"/);

    const descriptions = renderToStaticMarkup(createElement(ui.DescriptionList, { columns: 1 }));
    assert.match(descriptions, /data-columns="1"/);

    const header = renderToStaticMarkup(createElement(
      "table",
      null,
      createElement("thead", null, createElement("tr", null, createElement(ui.TableHead, {
        sortable: true,
        sortDirection: "asc",
        onSortChange: () => undefined,
        sortLabel: (direction) => `Name, sort ${direction}`,
      }, "Name"))),
    ));
    assert.match(header, /aria-sort="ascending"/);
    assert.match(header, /aria-label="Name, sort desc"/);

    const css = readFileSync(new URL("./styles/engine.css", import.meta.url), "utf8");
    assert.match(css, /tr\[data-selected="true"\] td:first-child/);
  });

  it("keeps desktop rail preference while forcing labeled narrow navigation", () => {
    assert.equal(getEffectiveRailCollapsed(true, false, true), true);
    assert.equal(getEffectiveRailCollapsed(true, true, true), false);
    assert.equal(getEffectiveRailCollapsed(false, false, true), false);
  });

  it("moves combobox focus across enabled options without landing on disabled choices", () => {
    const disabled = [false, true, false, false];
    assert.equal(getComboboxNavigationIndex(disabled, -1, "ArrowDown"), 0);
    assert.equal(getComboboxNavigationIndex(disabled, -1, "ArrowUp"), 3);
    assert.equal(getComboboxNavigationIndex(disabled, 0, "ArrowDown"), 2);
    assert.equal(getComboboxNavigationIndex(disabled, 2, "ArrowUp"), 0);
    assert.equal(getComboboxNavigationIndex(disabled, 2, "End"), 3);
    assert.equal(getComboboxNavigationIndex(disabled, 2, "Home"), 0);
    assert.equal(getComboboxNavigationIndex([true, true], -1, "ArrowDown"), null);
  });

  it("locks inline edit keyboard behavior and document print hooks", () => {
    assert.equal(getInlineEditKeyAction("Enter"), "commit");
    assert.equal(getInlineEditKeyAction("Escape"), "cancel");
    assert.equal(getInlineEditKeyAction("Tab"), null);
    const document = renderToStaticMarkup(
      createElement(ui.DocumentSheet, { title: "Summary", children: createElement("p", null, "Content") }),
    );
    assert.match(document, /ui-document-sheet/);
    assert.match(document, /data-size="a4"/);
    const printCss = readFileSync(new URL("./styles/print.css", import.meta.url), "utf8");
    assert.match(printCss, /@media print/);
    assert.doesNotMatch(printCss, /pdf|jspdf|puppeteer/i);
  });

  it("renders inline edit pending and error states without owning persistence", () => {
    const markup = renderToStaticMarkup(createElement(ui.InlineEdit, {
      value: "Current",
      editor: createElement(ui.Input, { defaultValue: "Draft" }),
      editing: true,
      pending: true,
      error: "Unable to save",
      onCommit: () => undefined,
      onCancel: () => undefined,
    }));
    assert.match(markup, /aria-label="Saving"/);
    assert.match(markup, /role="alert"/);
    assert.match(markup, /Unable to save/);
  });

  it("keeps app internals and domain vocabulary out of shared UI sources", () => {
    const root = fileURLToPath(new URL("./", import.meta.url));
    const sourceFiles = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:css|ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts"));
    const sources = sourceFiles.map((entry) => {
      return readFileSync(join(entry.parentPath, entry.name), "utf8");
    }).join("\n");
    assert.doesNotMatch(sources, /@\/apps|@\/platform\/core|@prisma|\.\.\/studioflow/i);
    assert.doesNotMatch(sources, /\bSKU\b|\bBQ\b|\bMaster Data\b/);
  });
});
