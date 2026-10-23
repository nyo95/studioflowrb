import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const actions = readFileSync("src/platform/ui_engine/patterns/actions.tsx", "utf8");
const tokens = readFileSync("src/platform/ui_engine/tokens/tokens.css", "utf8");

describe("row action submenus and highlight tokens", () => {
  it("renders an item with `items` as a submenu in both the ... menu and the right-click menu", () => {
    assert.match(actions, /<DropdownMenu\.Sub>[\s\S]*<DropdownItems items=\{item\.items\} \/>/);
    assert.match(actions, /<ContextMenu\.Sub>[\s\S]*<ContextItems items=\{item\.items\} \/>/);
  });
  it("defines one highlight colour per schedule highlight key", () => {
    for (const key of ["yellow", "green", "blue", "red", "purple", "gray"]) assert.match(tokens, new RegExp(`--ui-highlight-${key}:`));
  });
});
