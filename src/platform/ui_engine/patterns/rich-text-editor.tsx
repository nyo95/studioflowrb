"use client";

import dynamic from "next/dynamic";

import { Textarea } from "../primitives";

export type RichTextEditorProps = {
  /** Markdown-flavoured text, the same dialect `FormattedText` shows: `**bold**`, `*italic*`, `## heading`, `- `, `1. `, `- [ ]`. */
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
  /**
   * Chat-style sending: Enter calls this, Shift+Enter starts a new line, and Enter inside a list still adds the next
   * item (Ctrl/Cmd+Enter sends from there). Without it, Enter starts a new line as usual.
   */
  onSubmit?: () => void;
  /** A short box that grows with its text, for a composer; the default is a note-sized box. */
  compact?: boolean;
  /**
   * Writing straight on the page (a block, not a form field): no frame and no toolbar. Pair it with `slashMenu`, so
   * headings, lists and checklists stay one keystroke away.
   */
  bare?: boolean;
  /** Typing "/" at the start of a line or after a space opens a menu that turns the line into a heading, list or checklist. */
  slashMenu?: boolean;
  /** Focus left the editor (not into its own menu). */
  onBlur?: () => void;
  /**
   * Single characters (e.g. "@", "#") that start an inline token at the start of a line or after a space. With
   * `onTokenChange`, the editor reports the token under the caret so the caller can show its own suggestions.
   */
  tokenTriggers?: readonly string[];
  /** The token under the caret changed; `null` when the caret is not in one (or while an IME is composing). */
  onTokenChange?: (token: EditorToken | null) => void;
  /** Text matching this pattern is shown as a highlighted token while writing (e.g. codes the caller recognises). */
  highlightPattern?: RegExp;
  /** The suggestion list the caller renders for the current token, and its active option, for assistive technology. */
  listboxId?: string;
  activeOptionId?: string;
};

export type EditorToken = {
  trigger: string;
  /** What was typed between the trigger and the caret. */
  query: string;
  /** The caret's position on screen (viewport pixels), to anchor a suggestion list. */
  caret: { left: number; top: number; bottom: number };
  /** Replaces exactly this token (wherever it sits in the text) and puts the caret after it. */
  replace: (text: string) => void;
};

/**
 * What-you-see editor (Tiptap) that keeps the stored value as plain text, so notes stay searchable, printable and
 * readable by `FormattedText`; notes written before this editor existed open unchanged. Loaded on demand.
 */
export const RichTextEditor = dynamic<RichTextEditorProps>(() => import("./rich-text-editor-impl"), {
  ssr: false,
  loading: () => <Textarea className="min-h-[140px]" aria-label="Loading editor" disabled defaultValue="" />,
});
