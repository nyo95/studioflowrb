import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { tokenAtCaret, tokenRanges } from "./rich-text-tokens";

// ── Inline tokens (`@CODE`, `#tag`): caret token for the caller's suggestions, plus highlights while writing ──────
export type TokenOptions = { triggers: readonly string[]; highlight?: RegExp };
export type ActiveToken = { trigger: string; query: string; fromPos: number; toPos: number; text: string; after: string };
export const TOKEN_KEY = new PluginKey<TokenOptions>("inlineTokens");
/** Inline content that is not text (a line break) counts as one character, exactly its size in the document. */
export const LEAF = "￼";

export function activeToken(state: EditorState, triggers: readonly string[]): ActiveToken | null {
  const { $from, empty } = state.selection;
  if (!empty || !triggers.length || !$from.parent.isTextblock) return null;
  const parent = $from.parent;
  const before = parent.textBetween(0, $from.parentOffset, undefined, LEAF);
  const after = parent.textBetween($from.parentOffset, parent.content.size, undefined, LEAF);
  const token = tokenAtCaret(before, after, triggers);
  if (!token) return null;
  const line = before + after;
  return { trigger: token.trigger, query: token.query, fromPos: $from.start() + token.from, toPos: $from.start() + token.to, text: line.slice(token.from, token.to), after: line.slice(token.to) };
}

export function tokenDecorations(state: EditorState, options: TokenOptions): DecorationSet {
  const decorations: Decoration[] = [];
  const pattern = options.highlight;
  if (pattern) {
    state.doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      for (const [start, end] of tokenRanges(node.textBetween(0, node.content.size, undefined, LEAF), pattern)) {
        decorations.push(Decoration.inline(pos + 1 + start, pos + 1 + end, { class: "rte-token" }));
      }
      return false;
    });
  }
  const active = activeToken(state, options.triggers);
  if (active) decorations.push(Decoration.inline(active.fromPos, active.toPos, { class: "rte-token-active" }));
  return decorations.length ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty;
}
export const patternKey = (pattern?: RegExp) => (pattern ? `${pattern.source}/${pattern.flags}` : "");
export const optionsOf = (state: EditorState): TokenOptions => TOKEN_KEY.getState(state) ?? { triggers: [] };
/** Every editor carries the plugin; its options live in the editor state, set from props by a transaction (below). */
export const InlineTokens = Extension.create({
  name: "inlineTokens",
  addProseMirrorPlugins: () => [new Plugin<TokenOptions>({
    key: TOKEN_KEY,
    state: { init: () => ({ triggers: [] }), apply: (tr, value) => (tr.getMeta(TOKEN_KEY) as TokenOptions | undefined) ?? value },
    props: { decorations: (state) => tokenDecorations(state, optionsOf(state)) },
  })],
});
