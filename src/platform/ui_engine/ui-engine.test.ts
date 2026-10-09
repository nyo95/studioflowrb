import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as ui from "./index";
import { getComboboxNavigationIndex } from "./internal/combobox-navigation";
import { withCreatedOption } from "./internal/creatable-options";
import { matchesAccept, selectFiles } from "./internal/file-drop";
import { getEffectiveRailCollapsed, NARROW_NAVIGATION_QUERY } from "./internal/rail-state";

describe("UI Engine foundation", () => {
  it("exports the deliberate shared surface", () => {
    for (const name of [
      "Heading",
      "Text",
      "Button",
      "IconButton",
      "Input",
      "PrefixedInput",
      "Textarea",
      "Select",
      "Checkbox",
      "RadioGroup",
      "LogoFrame",
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
      "ContextNavLink",
      "ContextNavHeading",
      "Tabs",
      "PageSection",
      "SectionCard",
      "DataTable",
      "LoadingState",
      "EmptyState",
      "ErrorState",
      "InlineError",
      "RowActionMenu",
      "ContextActionMenu",
      "useRowAction",
      "FilterBar",
      "SelectionBar",
      "Combobox",
      "CreatableSearch",
      "CreatableMultiSelect",
      "InlineEdit",
      // R7.43 — activated by the phase deliverable intake consumer (KB-011).
      "FileDropZone",
      // Drop and paste intake every file-taking surface shares (owner, 2026-10-08: paste a photo like in Notes).
      "useFileIntake",
      "clipboardFiles",
      // R7.48 — canonical copy-to-clipboard button; no StudioFlow vocabulary.
      "CopyButton",
      "SimpleTextEditor",
      // Notes (owner, 2026-10-08): Tiptap editor that stores the same text dialect FormattedText shows.
      "RichTextEditor",
      "FormattedText",
      "shrinkImageFile",
      // R7.52 — activated by the project MOM image consumer.
      "ImageWorkspace",
      // Thumbnails that open large; first consumers are the StudioFlow phase notes (WO-SF-NOTEFEED-01).
      "ImageGallery",
      "useDebouncedValue",
      "useOptionOverlay",
      "useConfirm",
      "useUnsavedChangesGuard",
      "useFormDraftGuard",
      // R7.22 — chrome and display atoms the three apps now share.
      "Breadcrumb",
      "FilterChip",
      "filterChipClasses",
      "Avatar",
      "initialsOf",
      "CountBadge",
      "MetaList",
      "ProgressBar",
      "SegmentBar",
      "GroupHeader",
      "PipelineStrip",
      "PillTabs",
      "PillTabPanels",
      "StatCard",
      "StatGrid",
      // R8.72 — activated by the StudioFlow MOM print view (SF-R2).
      "DocumentSheet",
      "DocumentBlock",
      "DocumentPage",
      "PrintButton",
    ]) {
      const exported = ui[name as keyof typeof ui];
      assert.ok(
        typeof exported === "function" || (typeof exported === "object" && exported !== null),
        name,
      );
    }
    for (const deferred of ["WorkspaceShell", "SplitPane", "ReorderHandle"]) {
      assert.equal(deferred in ui, false, `${deferred} must remain deferred`);
    }
  });

  it("frames a logo without ever recolouring it, and falls back to initials", () => {
    const withImage = renderToStaticMarkup(createElement(ui.LogoFrame, { src: "https://brand.example/logo.svg", name: "Acme Tiles" }));
    assert.match(withImage, /<img[^>]+src="https:\/\/brand\.example\/logo\.svg"/);
    assert.match(withImage, /alt="Acme Tiles logo"/);
    assert.match(withImage, /object-contain/);
    assert.match(withImage, /\[filter:var\(--ui-logo-halo\)\]/, "readability comes from the themed hairline token");
    assert.doesNotMatch(withImage, /invert|brightness|grayscale|hue-rotate|saturate|mix-blend/, "a brand logo keeps its real colours");

    const decorative = renderToStaticMarkup(createElement(ui.LogoFrame, { src: "https://brand.example/logo.png", name: "Acme Tiles", decorative: true }));
    assert.match(decorative, /alt=""/);

    for (const src of [null, undefined, ""]) {
      const empty = renderToStaticMarkup(createElement(ui.LogoFrame, { src, name: "Acme Tiles" }));
      assert.doesNotMatch(empty, /<img/);
      assert.match(empty, /role="img" aria-label="Acme Tiles: logo unavailable"/);
      assert.match(empty, />AT</);
    }
    assert.match(renderToStaticMarkup(createElement(ui.LogoFrame, { name: "Acme", fallback: "AC" })), />AC</);
  });

  it("defines the logo hairline for light and for both dark-theme paths", () => {
    const tokens = readFileSync(fileURLToPath(new URL("./tokens/tokens.css", import.meta.url)), "utf8");
    const definitions = tokens.match(/--ui-logo-halo:\s*([^;]+);/g) ?? [];
    assert.equal(definitions.length, 3, ":root, prefers-color-scheme dark, and [data-theme=dark]");
    assert.match(definitions[0]!, /rgb\(0 0 0/);
    assert.match(definitions[1]!, /rgb\(255 255 255/);
    assert.equal(definitions[1], definitions[2]);
  });

  it("closes every comment in tokens.css so no phase colour is swallowed (Moodboard went transparent once)", () => {
    const tokens = readFileSync(fileURLToPath(new URL("./tokens/tokens.css", import.meta.url)), "utf8");
    assert.equal((tokens.match(/\/\*/g) ?? []).length, (tokens.match(/\*\//g) ?? []).length, "unbalanced comment markers");
    const declarations = tokens.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const token of ["--ph-mood", "--ph-layout", "--ph-3d", "--ph-cd", "--ph-sup", "--ui-mark"]) {
      assert.ok((declarations.match(new RegExp(`${token}:`, "g")) ?? []).length >= 3, `${token} must be declared in light and both dark paths`);
    }
  });

  it("keeps paper light: dark tokens are screen-only and never apply while a DocumentSheet is shown", () => {
    const tokens = readFileSync(fileURLToPath(new URL("./tokens/tokens.css", import.meta.url)), "utf8");
    assert.match(tokens, /@media screen and \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\):not\(:has\(\.ui-document\)\) \{/);
    assert.match(tokens, /@media screen \{\s*:root\[data-theme="dark"\]:not\(:has\(\.ui-document\)\) \{/);
    assert.doesNotMatch(tokens, /^:root\[data-theme="dark"\] \{/m, "no unscoped dark block");
  });

  it("gives colour-carried display atoms a text alternative", () => {
    // Each of these signals with colour, so none may ship without a name.
    assert.match(renderToStaticMarkup(createElement(ui.Avatar, { name: "Admin Rad" })), /aria-label="Admin Rad"/);
    assert.match(renderToStaticMarkup(createElement(ui.Avatar, { name: "Admin Rad" })), />AR</);
    assert.match(
      renderToStaticMarkup(createElement(ui.ProgressBar, { value: 2, max: 4, label: "2 of 4 done" })),
      /role="progressbar"[^>]*aria-valuenow="2"/,
    );
    assert.match(
      renderToStaticMarkup(createElement(ui.SegmentBar, { segments: ["done", "idle"], label: "1 of 2" })),
      /role="img"[^>]*aria-label="1 of 2"/,
    );
    const strip = renderToStaticMarkup(
      createElement(ui.PipelineStrip, {
        steps: [
          { id: "a", label: "Moodboard", state: "done" },
          { id: "b", label: "Design 3D", state: "current" },
        ],
      }),
    );
    // The current stage must be findable without reading its fill.
    assert.match(strip, /aria-current="step"/);
  });

  it("renders the track pipeline markers, current states, and action slot", () => {
    const track = renderToStaticMarkup(createElement(ui.PipelineStrip, {
      variant: "track",
      steps: [
        { id: "done", label: "Brief", note: "Done", state: "done" },
        { id: "current", label: "Design", note: "In progress", state: "current" },
        { id: "attention", label: "Review", note: "Needs a decision", state: "attention", action: createElement("button", null, "Decide") },
      ],
    }));
    assert.match(track, /data-variant="track"/);
    assert.equal(track.match(/aria-current="step"/g)?.length, 2);
    assert.match(track, />Decide<\/button>/);
    assert.match(track, /rounded-full border-2/);
  });

  it("paginates by href for server-rendered directories and by callback for client ones", () => {
    const paginationSource = readFileSync(new URL("./components/pagination.tsx", import.meta.url), "utf8");
    // URL pagination is rendered by server pages; importing the client Button
    // here would make getHref cross a server/client boundary and crash Next.
    assert.doesNotMatch(paginationSource, /from\s*["']\.\.\/primitives["']/);
    assert.match(paginationSource, /buttonClasses\("secondary",\s*"sm"\)/);
    const linked = renderToStaticMarkup(
      createElement(ui.Pagination, { page: 2, pageCount: 4, total: 96, pageSize: 25, getHref: (n: number) => `?page=${n}` }),
    );
    // Row range beats page number: the operator is looking for a record.
    assert.match(linked, /26–50 of 96/);
    assert.match(linked, /href="\?page=1"/);
    assert.match(linked, /href="\?page=3"/);
    // A boundary step stays present but inert, so the row does not reflow.
    const first = renderToStaticMarkup(
      createElement(ui.Pagination, { page: 1, pageCount: 3, total: 60, pageSize: 25, getHref: (n: number) => `?page=${n}` }),
    );
    assert.match(first, /disabled=""/);
    assert.doesNotMatch(first, /href="\?page=0"/);
    // Without a total it still falls back to counting pages.
    assert.match(
      renderToStaticMarkup(createElement(ui.Pagination, { page: 1, pageCount: 3, onPageChange: () => {} })),
      /Page 1 of 3/,
    );
  });

  it("keeps generic row-action state and directory pagination in the UI Engine", () => {
    const actions = readFileSync(new URL("./patterns/actions.tsx", import.meta.url), "utf8");
    assert.match(actions, /export function useRowAction/);
    assert.match(actions, /if \(pendingId\) return/);
    assert.match(actions, /safeMessage \?\? "The action could not be completed\."/);
    assert.match(actions, /Please try again\./);
  });

  it("marks filter chip selection for assistive technology", () => {
    const chip = renderToStaticMarkup(createElement(ui.FilterChip, { selected: true }, "Mine"));
    assert.match(chip, /aria-pressed="true"/);
  });

  it("renders pill sibling views and responsive stat cards", () => {
    const tabs = renderToStaticMarkup(createElement(ui.PillTabs, { items: [{ key: "one", label: "One", href: "/one", active: true }, { key: "two", label: "Two", href: "/two", active: false }] }));
    assert.match(tabs, /aria-current="page"/);
    assert.match(tabs, /rounded-pill/);
    // The active pill carries one text colour; a second one (text-ink-secondary) made the label unreadable on graphite.
    const activePill = tabs.match(/<a[^>]*aria-current="page"[^>]*>/)![0];
    assert.match(activePill, /text-action-ink/);
    assert.doesNotMatch(activePill, /text-ink-secondary/);
    const gated = renderToStaticMarkup(createElement(ui.PillTabs, { items: [{ key: "one", label: "One", active: true, onSelect: () => undefined }, { key: "two", label: "Two", active: false, disabled: true, disabledReason: "No access" }], actions: createElement("button", null, "New") }));
    assert.match(gated, /aria-disabled="true"[^>]*title="No access"|title="No access"[^>]*aria-disabled="true"/);
    assert.match(gated, /<button[^>]*>New<\/button>/); // the actions slot renders beside the bar
    const panels = renderToStaticMarkup(createElement(ui.PillTabPanels, { items: [{ value: "a", label: "A", content: "Panel A" }, { value: "b", label: "B", disabled: true, content: "Panel B" }] }));
    assert.match(panels, /Panel A/);
    assert.doesNotMatch(panels, /Panel B/); // inactive panels are not mounted
    const stats = renderToStaticMarkup(createElement(ui.StatGrid, null, createElement(ui.StatCard, { label: "Waiting", value: "2", caption: "Needs action" })));
    assert.match(stats, /min-\[840px\]:grid-cols-4/);
    assert.match(stats, /max-\[400px\]:grid-cols-1/);
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
    assert.match(button, /inline-flex min-w-0 items-center gap-\[7px\] whitespace-nowrap/);
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
    assert.match(css, /--ui-radius-action:\s*8px/);
    assert.match(css, /--ui-dialog-sm:\s*420px/);
    assert.match(css, /--ui-dialog-full:\s*1180px/);
    assert.match(css, /--ui-dialog-max-height:\s*90dvh/);
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
    assert.match(shells, /collapsible && !narrowNavigation/);
    assert.match(shells, /group-data-collapsed:h-11 group-data-collapsed:w-11/);
    assert.match(shells, /max-\[840px\]:group-data-collapsed:w-auto/);
    assert.doesNotMatch(shells, /max-\[840px\]:group-data-collapsed:h-auto/);
  });

  it("removes the rail when a surface has no application navigation", () => {
    const shells = readFileSync(new URL("./layouts/shells.tsx", import.meta.url), "utf8");

    assert.match(shells, /railVisible \? <aside/);
    assert.match(shells, /: "grid-cols-1"/);
  });

  it("draws the DESIGN v2 rail: round icon chips, a white current block, account and General slots", () => {
    const current = renderToStaticMarkup(createElement(ui.NavItem, { href: "/a", active: true, icon: createElement("svg") }, "Home"));
    assert.match(current, /shadow-raise/);
    assert.match(current, /bg-action text-action-ink/);
    const idle = renderToStaticMarkup(createElement(ui.NavItem, { href: "/b", icon: createElement("svg"), badge: "3" }, "Samples"));
    assert.match(idle, /bg-surface-muted text-ink-secondary/);
    assert.match(idle, /group-data-collapsed:block/); // the count's dot while collapsed
    const logout = renderToStaticMarkup(createElement(ui.NavAction, { icon: createElement("svg") }, "Log out"));
    assert.match(logout, /<button type="button"/);
    const shell = renderToStaticMarkup(createElement(ui.AppShell, { brand: "B", navigation: "N", topbar: "T", railHeader: createElement("span", null, "ACCOUNT"), railFooter: createElement("span", null, "GENERAL") }, "Body"));
    assert.ok(shell.indexOf("ACCOUNT") < shell.indexOf("GENERAL"));
    assert.match(shell, /max-\[840px\]:hidden">\<span>ACCOUNT/);
  });

  it("keeps a page header's action row inside the page on a phone", () => {
    // A stacked header used to size its actions to their content, so a scrolling section nav made the page 414px wide at 375px.
    const markup = renderToStaticMarkup(createElement(ui.PageHeader, { title: "Project", actions: createElement("nav", null, "Phases MOM Schedule") }));
    assert.match(markup, /class="flex max-w-full shrink-0[^"]*"><nav>/);
    // The title column is capped too, so a long context capsule cannot widen a stacked header.
    assert.match(markup, /class="grid min-w-0 max-w-full gap-1"/);
  });

  it("bounds long content and rail menus inside the viewport at every screen width", () => {
    for (const state of [{ railVisible: true, collapsed: true }, { railVisible: true, collapsed: false }, { railVisible: false }]) {
      const props = {
        ...state,
        collapsible: true,
        brand: "UI",
        topbar: "Application",
        navigation: Array.from({ length: 40 }, (_, index) => createElement("button", { key: index }, `Navigation ${index}`)),
        utility: createElement("button", null, "Utility"),
        children: createElement("div", { style: { height: 4000 } }, "Long content", createElement("span", { className: "sr-only" }, "Accessible resource label")),
      };
      const markup = renderToStaticMarkup(createElement(ui.AppShell, props));
      const classes = (tag: string) => new Set(markup.match(new RegExp(`<${tag} class="([^"]+)"`))?.[1].split(" "));

      for (const value of ["relative", "h-dvh", "flex", "flex-col", "overflow-hidden", "print:h-auto", "print:overflow-visible"]) {
        assert.ok(classes("div").has(value), `Frame must contain ${value}`);
      }
      assert.ok(classes("header").has("shrink-0"));
      for (const value of ["relative", "flex-1", "min-h-0", "overflow-auto", "overscroll-contain", "print:overflow-visible"]) {
        assert.ok(classes("main").has(value), `Content must contain ${value}`);
      }
      assert.ok(!classes("main").has("max-[840px]:overflow-visible"));
      assert.ok(!classes("main").has("max-[840px]:h-auto"));
      if (state.railVisible) {
        for (const value of ["h-full", "min-h-0", "shrink-0", "overflow-hidden", "max-[840px]:h-auto"]) {
          assert.ok(classes("aside").has(value), `Rail must contain ${value}`);
        }
        for (const value of ["min-h-0", "flex-1", "overflow-auto", "overscroll-contain", "max-[840px]:overflow-x-auto"]) {
          assert.ok(classes("nav").has(value), `Rail menu must contain ${value}`);
        }
        assert.match(markup, /max-\[840px\]:flex-col/);
      } else {
        assert.doesNotMatch(markup, /<aside/);
      }
    }
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

  it("restores dialog focus to the control that opened it", () => {
    const overlays = readFileSync(new URL("./layouts/overlays.tsx", import.meta.url), "utf8");
    assert.match(overlays, /onOpenAutoFocus=\{\(\) => \{[\s\S]*document\.activeElement/);
    assert.match(overlays, /onCloseAutoFocus=\{\(event\) => \{[\s\S]*event\.preventDefault\(\);[\s\S]*opener\.focus\(\{ preventScroll: true \}\)/);
    assert.match(overlays, /opener\?\.isConnected/);
  });

  it("restores confirmation focus when no alert-dialog trigger exists", () => {
    const overlays = readFileSync(new URL("./layouts/overlays.tsx", import.meta.url), "utf8");
    const confirmStart = overlays.indexOf("export function ConfirmDialog");
    const confirmEnd = overlays.indexOf("export type TooltipProps");
    const confirmDialog = overlays.slice(confirmStart, confirmEnd);
    assert.match(confirmDialog, /onOpenAutoFocus=\{\(\) => \{[\s\S]*document\.activeElement/);
    assert.match(confirmDialog, /onCloseAutoFocus=\{\(event\) => \{[\s\S]*event\.preventDefault\(\);[\s\S]*opener\.focus\(\{ preventScroll: true \}\)/);
    assert.match(confirmDialog, /opener\?\.isConnected/);
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

  it("can guard same-origin link navigation with the shared unsaved dialog", () => {
    const hooks = readFileSync(new URL("./patterns/hooks.tsx", import.meta.url), "utf8");
    assert.match(hooks, /guardNavigation/);
    assert.match(hooks, /document\.addEventListener\("click", handleClick, true\)/);
    assert.match(hooks, /event\.stopImmediatePropagation\(\)/);
    assert.match(hooks, /destination\.origin !== window\.location\.origin/);
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
    assert.match(hooks, /baselineCapturedRef/);
    assert.match(hooks, /window\.setTimeout\(\(\) => \{/);
  });

  it("propagates viewport fill through shells, tabs, and table scroll regions", () => {
    const shells = readFileSync(new URL("./layouts/shells.tsx", import.meta.url), "utf8");
    const templates = readFileSync(new URL("./layouts/templates.tsx", import.meta.url), "utf8");
    const data = readFileSync(new URL("./components/data.tsx", import.meta.url), "utf8");
    assert.match(shells, /fill \? "flex min-h-0 flex-1 flex-col" : "grid"/);
    assert.match(templates, /fill \? "flex min-h-0 flex-1 flex-col gap-4" : "grid gap-4"/);
    assert.match(templates, /fill && "min-h-0 flex-1 data-\[state=active\]:flex/);
    assert.match(data, /fill && "flex-1 min-h-0"/);
  });

  it("owns the busy and failure states around an app-supplied create", () => {
    const creatable = readFileSync(new URL("./patterns/creatable-search.tsx", import.meta.url), "utf8");
    assert.match(creatable, /if \(creating\) return;/);
    assert.match(creatable, /catch \(error\) \{\s*\n\s*setCreateError\(createErrorLabel\(error\)\)/);
    assert.match(creatable, /role="alert"/);
  });

  it("switches to narrow navigation at exactly the width its CSS does", () => {
    // Tailwind v4 compiles max-[840px] to (width < 840px); the runtime query must select the same widths,
    // or at 840px the desktop rail is drawn while the runtime forces it open without a collapse control.
    assert.equal(NARROW_NAVIGATION_QUERY, "(width < 840px)");
    const shells = readFileSync(new URL("./layouts/shells.tsx", import.meta.url), "utf8");
    assert.match(shells, /window\.matchMedia\(NARROW_NAVIGATION_QUERY\)/);
    assert.doesNotMatch(shells, /max-width: 840px/);
    assert.doesNotMatch(shells, /max-\[841px\]|min-\[840px\]/);
    const showcase = readFileSync(new URL("../../app/ui-engine/ui-engine-showcase.tsx", import.meta.url), "utf8");
    assert.match(showcase, /utility=\{\s*<UtilitySection>/, "the showcase rail utility uses rail-aware items");
  });

  it("keeps naming a created value until the app's options carry it", () => {
    const options = [{ id: "paint", label: "Paint" }];
    assert.deepEqual(withCreatedOption(options, null), options);
    assert.deepEqual(withCreatedOption(options, { id: "Tile", label: "Tile" }).map((option) => option.label), ["Paint", "Tile"]);
    assert.deepEqual(withCreatedOption([...options, { id: "Tile", label: "Tile (saved)" }], { id: "Tile", label: "Tile" }).map((option) => option.label), ["Paint", "Tile (saved)"], "the app's own option wins once it exists");
    const creatable = readFileSync(new URL("./patterns/creatable-search.tsx", import.meta.url), "utf8");
    assert.match(creatable, /withCreatedOption<CreatableSearchOption>\(/);
    assert.match(creatable, /setCreated\(\{ id: nextValue, label: text \}\)/);
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

  it("distributes fixed tabs evenly and falls back to scrolling only on narrow viewports", () => {
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
    assert.match(tabs, /grid overflow-hidden/);
    assert.match(tabs, /max-\[560px\]:overflow-x-auto/);
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

  it("names the drop region and keeps a keyboard route to the picker", () => {
    const zone = renderToStaticMarkup(
      createElement(
        ui.FileDropZone,
        { label: "Deliverable file", onFiles: () => {}, browseLabel: "Choose file", hint: "Bytes stay local." },
        createElement(ui.Input, { name: "original_filename" }),
      ),
    );
    /* A dashed box is a visual affordance only, so the region needs a name. */
    assert.match(zone, /role="group"/);
    assert.match(zone, /aria-label="Deliverable file"/);
    /* Dragging cannot be performed from a keyboard, so a real control stays. */
    assert.match(zone, /<button type="button"/);
    assert.match(zone, />Choose file</);
    /* The picker is out of the accessibility tree: the button is the affordance. */
    assert.match(zone, /<input[^>]*type="file"[^>]*aria-hidden="true"/);
    /* Composed controls and caller-owned copy both survive. */
    assert.match(zone, /name="original_filename"/);
    assert.match(zone, /Bytes stay local\./);
  });

  it("reports file facts without letting bytes ride along with a form", () => {
    const zone = renderToStaticMarkup(
      createElement(ui.FileDropZone, { label: "Deliverable file", onFiles: () => {} }),
    );
    const picker = /<input[^>]*type="file"[^>]*>/.exec(zone);
    assert.ok(picker, "the zone must keep a real file picker");
    /* An unnamed input is not serialized, so a submit can never carry the file. */
    assert.doesNotMatch(picker[0], /name=/);
    const source = readFileSync(new URL("./patterns/file-drop-zone.tsx", import.meta.url), "utf8");
    /* Interaction only: no transport, no reading, no storage policy. */
    assert.doesNotMatch(source, /fetch\(|FileReader|arrayBuffer|XMLHttpRequest|FormData/);
    /* The drag gesture is the shared intake's, and that intake keeps the browser from opening the file. */
    assert.match(source, /useFileIntake\(/);
    const intake = readFileSync(new URL("./patterns/file-intake.tsx", import.meta.url), "utf8");
    assert.match(intake, /event\.preventDefault\(\)/);
  });

  it("filters a drop by accept and hands single-select zones one file", () => {
    const files = [
      { name: "plan.skp", size: 12, type: "" },
      { name: "render.PNG", size: 34, type: "image/png" },
      { name: "notes.txt", size: 56, type: "text/plain" },
    ];
    const names = (chosen: ReadonlyArray<{ name: string }>) => chosen.map((file) => file.name);
    /* An empty accept list means "anything", never "nothing". */
    assert.deepEqual(names(selectFiles(files, { multiple: true })), ["plan.skp", "render.PNG", "notes.txt"]);
    /* Suffix and media-type-group tokens both apply, case-insensitively. */
    assert.deepEqual(names(selectFiles(files, { accept: ".skp, image/*", multiple: true })), ["plan.skp", "render.PNG"]);
    /* A single-select zone never hands back the rest of a multi-file drop. */
    assert.deepEqual(names(selectFiles(files, { accept: "image/*" })), ["render.PNG"]);
    /* A drop of only refused files yields nothing rather than a wrong first file. */
    assert.deepEqual(selectFiles(files, { accept: ".dwg" }), []);
    /* A group token must not match a media type that merely starts alike. */
    assert.equal(matchesAccept("image/*", { name: "a", size: 1, type: "imagex/png" }), false);
    assert.equal(matchesAccept("text/plain", { name: "a", size: 1, type: "text/plain" }), true);
    assert.equal(matchesAccept("text/plain", { name: "a", size: 1, type: "text/html" }), false);
  });

  it("reads pasted files from either clipboard list and ignores plain text", () => {
    const shot = { name: "image.png", size: 10, type: "image/png" } as File;
    const clipboard = (files: File[], items: Array<{ kind: string; getAsFile: () => File | null }>) => ({ files, items }) as unknown as DataTransfer;
    assert.deepEqual(ui.clipboardFiles(clipboard([shot], [])), [shot]);
    /* Some browsers fill only the item list for a copied screenshot. */
    assert.deepEqual(ui.clipboardFiles(clipboard([], [{ kind: "string", getAsFile: () => null }, { kind: "file", getAsFile: () => shot }])), [shot]);
    /* Text alone yields nothing, so a text paste is never taken over. */
    assert.deepEqual(ui.clipboardFiles(clipboard([], [{ kind: "string", getAsFile: () => null }])), []);
    assert.deepEqual(ui.clipboardFiles(null), []);
  });

  it("keeps a disabled zone inert and marks nothing before a drag", () => {
    const off = renderToStaticMarkup(
      createElement(ui.FileDropZone, { label: "Zone", onFiles: () => {}, disabled: true }),
    );
    assert.match(off, /aria-disabled="true"/);
    assert.match(off, /<input[^>]*disabled=""/);
    assert.match(off, /<button type="button"[^>]*disabled=""/);
    /* The active-target attribute appears on drag, never at rest. */
    assert.doesNotMatch(off, /data-drop-active/);
  });

  it("forwards the control props Field injects onto the region root", () => {
    const zone = renderToStaticMarkup(
      createElement(ui.FileDropZone, {
        label: "Zone",
        onFiles: () => {},
        id: "field-1",
        "aria-describedby": "field-1-error",
        "aria-invalid": true,
        "aria-required": true,
      }),
    );
    /* Field clones its single child to wire the label, description, and error. */
    assert.match(zone, /id="field-1"/);
    assert.match(zone, /aria-describedby="field-1-error"/);
    assert.match(zone, /aria-invalid="true"/);
    assert.match(zone, /aria-required="true"/);
  });

  it("keeps an input prefix presentational and out of the submitted value", () => {
    const amount = renderToStaticMarkup(
      createElement(ui.PrefixedInput, {
        prefix: "Rp.",
        value: "15000",
        readOnly: true,
        "aria-label": "Amount",
      }),
    );
    assert.match(amount, /aria-hidden="true"[^>]*>Rp\.<\/span>/);
    assert.match(amount, /<input[^>]*value="15000"/);
    assert.doesNotMatch(amount, /value="Rp\./);

    const textPrice = renderToStaticMarkup(
      createElement(ui.PrefixedInput, {
        prefix: "Rp.",
        prefixVisible: false,
        value: '"call sales"',
        readOnly: true,
      }),
    );
    assert.doesNotMatch(textPrice, />Rp\.<\/span>/);
  });

  it("CopyButton renders with its idle accessible label", () => {
    const btn = renderToStaticMarkup(
      createElement(ui.CopyButton, { value: "SF26-TEST D1", label: "Copy filename" }),
    );
    assert.match(btn, /aria-label="Copy filename"/);
  });

  it("CopyButton source awaits clipboard write before changing state", () => {
    const source = readFileSync(
      new URL("./patterns/copy-button.tsx", import.meta.url),
      "utf8",
    );
    assert.match(source, /await navigator\.clipboard\.writeText/);
  });

  it("CopyButton source handles clipboard failure", () => {
    const source = readFileSync(
      new URL("./patterns/copy-button.tsx", import.meta.url),
      "utf8",
    );
    assert.match(source, /catch/);
  });

  it("CopyButton failure label is accessible from source", () => {
    const source = readFileSync(
      new URL("./patterns/copy-button.tsx", import.meta.url),
      "utf8",
    );
    assert.match(source, /failureLabel/);
    assert.match(source, /role="status"/);
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /clearTimeout/);
    assert.match(source, /label=\{label\}/);
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
