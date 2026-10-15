import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection, type Plugin } from "@tiptap/pm/state";
import type { DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";

import { activeToken, InlineTokens, optionsOf, TOKEN_KEY } from "./rich-text-token-plugin";

const schema = getSchema([StarterKit, InlineTokens]);
const plugins = InlineTokens.config.addProseMirrorPlugins!.call({} as never) as Plugin[];
const CODE = /@[A-Za-z]{1,4}-?\d{1,3}/;

/** A document of paragraphs; `|` marks the caret. Positions: paragraph n starts after its opening token. */
function stateOf(...lines: string[]) {
  let caret = -1;
  let offset = 0;
  const content = lines.map((line) => {
    const at = line.indexOf("|");
    const text = line.replace("|", "");
    if (at >= 0) caret = offset + 1 + at;
    offset += text.length + 2;
    return { type: "paragraph", content: text ? [{ type: "text", text }] : [] };
  });
  const doc = schema.nodeFromJSON({ type: "doc", content });
  const state = EditorState.create({ schema, doc, plugins });
  return caret >= 0 ? state.apply(state.tr.setSelection(TextSelection.create(state.doc, caret))) : state;
}
const withOptions = (state: EditorState, triggers: string[], highlight?: RegExp) => state.apply(state.tr.setMeta(TOKEN_KEY, { triggers, highlight }));
const decorations = (state: EditorState) => (plugins[0]!.props.decorations!.call(plugins[0]!, state) as DecorationSet).find().map((item) => [item.from, item.to, (item as unknown as { type: { attrs: { class: string } } }).type.attrs.class]);

describe("inline token plugin", () => {
  it("is inert until a caller gives it triggers or a highlight pattern", () => {
    const state = stateOf("Use @HT|");
    assert.deepEqual(optionsOf(state), { triggers: [] });
    assert.equal(activeToken(state, optionsOf(state).triggers), null);
    assert.deepEqual(decorations(state), []);
  });

  it("finds the caret token in the middle of a later line, with document positions", () => {
    const state = withOptions(stateOf("first line", "Use @H|T-01 here"), ["@", "#"]);
    const token = activeToken(state, optionsOf(state).triggers)!;
    assert.equal(token.trigger, "@");
    assert.equal(token.query, "H");
    assert.equal(token.text, "@HT-01");
    assert.equal(token.after, " here");
    assert.equal(state.doc.textBetween(token.fromPos, token.toPos), "@HT-01");
  });

  it("paints highlight matches and the caret token, and follows option changes by transaction", () => {
    let state = withOptions(stateOf("See @HT1 and @CL|"), ["@"], CODE);
    assert.deepEqual(decorations(state), [[5, 9, "rte-token"], [14, 17, "rte-token-active"]]);
    state = withOptions(state, []);
    assert.deepEqual(decorations(state), []);
  });

  it("replacing the token range keeps the surrounding text", () => {
    const state = withOptions(stateOf("Use @H|T here"), ["@"]);
    const token = activeToken(state, ["@"])!;
    const next = state.apply(state.tr.insertText("@HT-01", token.fromPos, token.toPos));
    assert.equal(next.doc.textContent, "Use @HT-01 here");
  });
});
