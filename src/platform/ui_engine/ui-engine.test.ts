import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as ui from "./index";

describe("UI Engine foundation", () => {
  it("exports the deliberate shared surface", () => {
    for (const name of ["Heading","Button","Field","Dialog","Drawer","AppShell","PageShell","PageHeader","PageSection","SectionCard","DataTable","FormSection","LoadingState","EmptyState","ErrorState","InlineError","RowActionMenu"]) assert.equal(typeof ui[name as keyof typeof ui], "function", name);
  });

  it("keeps accessibility-critical state and dialog semantics distinct", () => {
    assert.match(renderToStaticMarkup(createElement(ui.LoadingState, {})), /role="status"/);
    assert.match(renderToStaticMarkup(createElement(ui.ErrorState, { title: "Failed" })), /role="alert"/);
    assert.doesNotMatch(renderToStaticMarkup(createElement(ui.EmptyState, { title: "None" })), /role="alert"/);
    assert.equal(typeof ui.Dialog, "function");
  });

  it("locks token source, action radius, widths, and horizontal overflow", () => {
    const css = readFileSync(new URL("./tokens/tokens.css", import.meta.url), "utf8");
    assert.match(css, /--ui-radius-action:4px/);
    assert.match(css, /--ui-dialog-sm:420px/);
    assert.match(css, /--ui-dialog-full:1180px/);
    assert.match(css, /--ui-dialog-max-height:90vh/);
    const table = renderToStaticMarkup(createElement(ui.DataTable, { minWidth: "900px" }));
    assert.match(table, /data-table-overflow="horizontal"/);
    assert.match(table, /min-width:900px/);
  });
});
