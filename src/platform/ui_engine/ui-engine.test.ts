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
      "TableCellContent",
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
      "CreatableSearch",
      "CreatableMultiSelect",
      "InlineEdit",
      "SimpleTextEditor",
      "useDebouncedValue",
      "useOptionOverlay",
      "useConfirm",
      "useUnsavedChangesGuard",
      "useFormDraftGuard",
    ]) {
      const exported = ui[name as keyof typeof ui];
      assert.ok(
        typeof exported === "function" || (typeof exported === "object" && exported !== null),
        name,
      );
    }
    for (const deferred of ["WorkspaceShell", "SplitPane", "ReorderHandle", "FileDropZone", "DocumentSheet"]) {
      assert.equal(deferred in ui, false, `${deferred} must remain deferred`);
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

  it("keeps compound button children on one line", () => {
    const button = renderToStaticMarkup(createElement(
      ui.Button,
      null,
      createElement("svg", { "aria-hidden": true }),
      createElement("span", null, "New record"),
    ));
    assert.match(button, /inline-flex items-center gap-\[7px\] whitespace-nowrap/);
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
        },
        createElement(ui.Input, {}),
      ),
    );
    assert.match(field, /for="record-name"/);
    assert.match(field, /id="record-name"/);
    assert.match(field, /aria-describedby="record-name-description record-name-error"/);
    assert.match(field, /aria-invalid="true"/);
    assert.match(field, /aria-label="More information"/);
    assert.match(field, /class="sr-only"/);
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
    const nav = renderToStaticMarkup(createElement(ui.NavItem, { href: "/records", active: true }, "Records"));
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

    const dataSource = readFileSync(new URL("./components/data.tsx", import.meta.url), "utf8");
    /* Selected rows keep the leading ink rule on their first cell and stay filled. */
    assert.match(dataSource, /first:shadow-\[inset_3px_0_0_var\(--ui-row-marker,transparent\)\]/);
    assert.match(dataSource, /--ui-row-marker:var\(--ui-action-primary\)/);

    const tieredCell = renderToStaticMarkup(createElement(
      "table",
      null,
      createElement("tbody", null, createElement("tr", null,
        createElement(ui.TableCell, { wrap: true }, createElement(ui.TableCellContent, {
          primary: "Long value",
          secondary: "Supporting context",
          primaryLines: 2,
        })),
      )),
    ));
    assert.match(tieredCell, /data-wrap="true"/);
    assert.match(tieredCell, /data-primary-lines="2"/);
    assert.match(tieredCell, /text-ink-tertiary/);

    const inlineSelection = renderToStaticMarkup(createElement(ui.SelectionBar, {
      count: 2,
      variant: "inline",
    }));
    assert.match(inlineSelection, /data-variant="inline"/);

    const creatable = renderToStaticMarkup(createElement(ui.CreatableSearch, {
      label: "Tag",
      options: [
        { id: "one", label: "One" },
        { id: "two", label: "Two" },
      ],
      value: "one",
      onValueChange: () => undefined,
    }));
    assert.match(creatable, /aria-haspopup="listbox"/);
    assert.match(creatable, />One<\/span>/);

    const editor = renderToStaticMarkup(createElement(ui.SimpleTextEditor, {
      name: "scopeNote",
      defaultValue: "- Installation labor",
    }));
    assert.match(editor, /role="toolbar"/);
    assert.match(editor, /aria-label="Bullet list"/);
    assert.match(editor, /name="scopeNote"/);
  });

  it("keeps desktop rail preference while forcing labeled narrow navigation", () => {
    assert.equal(getEffectiveRailCollapsed(true, false, true), true);
    assert.equal(getEffectiveRailCollapsed(true, true, true), false);
    assert.equal(getEffectiveRailCollapsed(false, false, true), false);

    const shells = readFileSync(new URL("./layouts/shells.tsx", import.meta.url), "utf8");
    assert.match(shells, /className="shrink-0 max-\[840px\]:hidden"/);
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

  it("gives the drawer the width its size token names", () => {
    const overlays = readFileSync(new URL("./layouts/overlays.tsx", import.meta.url), "utf8");
    /* Without a width on the drawer branch the panel shrank to its content and
       the size prop did nothing above the narrow breakpoint. */
    assert.match(overlays, /h-full w-\[min\(100%,var\(--dialog-width\)\)\]/);
  });

  it("refuses dismissal only when the caller asks, and never silently", () => {
    const overlays = readFileSync(new URL("./layouts/overlays.tsx", import.meta.url), "utf8");
    assert.match(overlays, /onEscapeKeyDown=\{blockDismiss\}/);
    assert.match(overlays, /onPointerDownOutside=\{blockDismiss\}/);
    assert.match(overlays, /dismissible = true/);
  });

  it("gates confirmation on exact typed text when one is required", () => {
    const overlays = readFileSync(new URL("./layouts/overlays.tsx", import.meta.url), "utf8");
    assert.match(overlays, /requireTypedConfirmation/);
    assert.match(overlays, /typed === requireTypedConfirmation/);
    const hooks = readFileSync(new URL("./patterns/hooks.tsx", import.meta.url), "utf8");
    /* The request shape carries it through, or the dialog support is unreachable. */
    assert.match(hooks, /requireTypedConfirmation=\{request\.requireTypedConfirmation\}/);
  });

  it("settles a superseded confirm instead of stranding its caller", () => {
    const hooks = readFileSync(new URL("./patterns/hooks.tsx", import.meta.url), "utf8");
    assert.match(hooks, /resolverRef\.current\?\.\(false\);\s*\n\s*resolverRef\.current = null;\s*\n\s*setRequest\(nextRequest\)/);
  });

  it("compares the unsaved-changes baseline with the caller's comparator", () => {
    const hooks = readFileSync(new URL("./patterns/hooks.tsx", import.meta.url), "utf8");
    /* Reference identity moved the baseline every render for a form that rebuilt
       its initial object, so the guard never saw a dirty form. */
    assert.match(hooks, /if \(!equals\(initialValue, prevInitial\)\)/);
  });

  it("uses Next client navigation for clickable rail destinations", () => {
    const shells = readFileSync(new URL("./layouts/shells.tsx", import.meta.url), "utf8");
    assert.match(shells, /import Link from "next\/link"/);
    assert.match(shells, /<Link href=\{props\.href \?\? "#"\}/);
  });

  it("keeps dialog form drafts in the browser until the app explicitly saves", () => {
    const hooks = readFileSync(new URL("./patterns/hooks.tsx", import.meta.url), "utf8");
    assert.match(hooks, /export function useFormDraftGuard/);
    assert.match(hooks, /new FormData\(form\)/);
  });

  it("owns the busy and failure states around an app-supplied create", () => {
    const creatable = readFileSync(new URL("./patterns/creatable-search.tsx", import.meta.url), "utf8");
    assert.match(creatable, /if \(creating\) return;/);
    assert.match(creatable, /catch \(error\) \{\s*\n\s*setCreateError\(createErrorLabel\(error\)\)/);
    assert.match(creatable, /role="alert"/);
  });

  it("puts combobox semantics on the field that owns the query", () => {
    for (const file of ["./patterns/combobox.tsx", "./patterns/creatable-search.tsx"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      /* A trigger button is not a combobox: role="combobox" without an owned
         text input announces an editable control that never accepts text. */
      assert.doesNotMatch(source, /role="combobox"\n\s+disabled=\{disabled\}/);
      assert.match(source, /aria-autocomplete="list"/);
      assert.match(source, /aria-haspopup="listbox"/);
    }
  });

  it("selects from the search field on Enter in both search controls", () => {
    for (const file of ["./patterns/combobox.tsx", "./patterns/creatable-search.tsx"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      assert.match(source, /event\.key === "Enter"/);
    }
  });

  it("opens an uncontrolled tab set on its first enabled panel", () => {
    const tabs = renderToStaticMarkup(createElement(ui.Tabs, {
      items: [
        { value: "one", label: "One", content: "First", disabled: true },
        { value: "two", label: "Two", content: "Second" },
      ],
    }));
    /* The prop spread used to overwrite the computed fallback with undefined,
       leaving every panel closed. */
    assert.match(tabs, /data-state="active"/);
    assert.match(tabs, /Second/);
  });

  it("keeps narrow tab sets scrollable without exposing a browser scrollbar", () => {
    const tabs = renderToStaticMarkup(createElement(ui.Tabs, {
      items: [{ value: "one", label: "One", content: "First" }],
    }));
    assert.match(tabs, /overflow-x-auto/);
    assert.match(tabs, /\[scrollbar-width:none\]/);
    assert.match(tabs, /\[&amp;::\-webkit-scrollbar\]:hidden/);
  });

  it("can distribute a fixed tab set evenly without a scroll strip", () => {
    const tabs = renderToStaticMarkup(createElement(ui.Tabs, {
      distribution: "equal",
      items: [
        { value: "one", label: "One", content: "First" },
        { value: "two", label: "Two", content: "Second" },
        { value: "three", label: "Three", content: "Third" },
      ],
    }));
    assert.match(tabs, /class="[^"]*\bgrid\b/);
    assert.match(tabs, /grid-template-columns:repeat\(3, minmax\(0, 1fr\)\)/);
    assert.doesNotMatch(tabs, /overflow-x-auto/);
  });

  it("keeps a bounded scroll body available for a sticky header", () => {
    const table = renderToStaticMarkup(createElement(ui.DataTable, {
      stickyHeader: true,
      maxBodyHeight: "60vh",
    }));
    /* A sticky header needs a container that actually scrolls. */
    assert.match(table, /data-sticky-header="true"/);
    assert.match(table, /overflow-y-auto/);
    assert.match(table, /max-height:60vh/);
  });

  it("marks a required field for assistive technology, not only with an asterisk", () => {
    const field = renderToStaticMarkup(
      createElement(
        ui.Field,
        { id: "record-code", label: "Code", description: "Short identifier.", required: true },
        createElement(ui.Input, {}),
      ),
    );
    assert.match(field, /aria-required="true"/);
    /* The help control must sit beside the label, not inside it: a button in a
       label forwards its click to the labelled control. */
    assert.match(field, /<\/label>[\s\S]*aria-label="More information"/);
  });

  it("keeps one tooltip per control and announces loading once", () => {
    const iconButton = renderToStaticMarkup(createElement(ui.IconButton, {
      label: "Archive",
      icon: createElement("svg", { "aria-hidden": true }),
    }));
    /* Unwrapped, the native tooltip is the fallback. */
    assert.match(iconButton, /aria-label="Archive"/);
    assert.match(iconButton, /title="Archive"/);

    /* Wrapped, the shared tooltip supersedes it rather than racing it. */
    const tooltipped = renderToStaticMarkup(createElement(
      ui.Tooltip,
      { content: "Archive this record" } as never,
      createElement(ui.IconButton, {
        label: "Archive",
        icon: createElement("svg", { "aria-hidden": true }),
      }),
    ));
    assert.doesNotMatch(tooltipped, /title="Archive"/);

    const loading = renderToStaticMarkup(createElement(ui.LoadingState, { title: "Loading records" }));
    assert.equal(loading.match(/role="status"/g)?.length, 1);
  });

  it("opens an inline cell for reading before it is edited", () => {
    const cell = renderToStaticMarkup(createElement(ui.InlineEdit, {
      value: "2.5",
      label: "Quantity",
      align: "end",
      onCommit: () => undefined,
    }));
    /* Read mode is a control, not static text: it must be reachable and named
       without the row's header, which is not announced per cell. */
    assert.match(cell, /<button/);
    assert.match(cell, /aria-label="Quantity: 2\.5"/);
    assert.match(cell, /2\.5/);
  });

  it("keeps inline editing free of validation and persistence policy", () => {
    const source = readFileSync(new URL("./patterns/inline-edit.tsx", import.meta.url), "utf8");
    /* Enter commits, Escape cancels, blur commits only when asked. */
    assert.match(source, /commitOnBlur = false/);
    assert.match(source, /event\.key === "Enter"/);
    assert.match(source, /event\.key === "Escape"/);
    /* A refused commit restores the previous value instead of leaving refused
       text on screen looking saved. */
    assert.match(source, /catch \(failure\) \{[\s\S]*setDraft\(value\)/);
    /* The shell owns no rules about what a value may be. */
    assert.doesNotMatch(source, /parseFloat|Number\(|isNaN|required/);
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
