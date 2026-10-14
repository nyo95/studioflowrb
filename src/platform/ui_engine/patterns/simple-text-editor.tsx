"use client";

import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { forwardRef, useRef, type KeyboardEvent, type TextareaHTMLAttributes } from "react";

import { IconButton, Textarea } from "../primitives";

export type SimpleTextEditorProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  toolbarLabel?: string;
};

const BULLET = /^[-*]\s/;
const NUMBER = /^(\d+)[.)]\s/;

/**
 * Adds or removes a list marker on every line the selection touches; numbers count up from 1. A selection on empty
 * lines only (an empty note, or the empty line after the last point) gets the first marker, so the button starts a list.
 */
export function toggleListText(value: string, start: number, end: number, kind: "bullet" | "number"): { text: string; from: number; to: number; caret: "select" | "end" } {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextLine = value.indexOf("\n", end);
  const lineEnd = nextLine === -1 ? value.length : nextLine;
  const selectedLines = value.slice(lineStart, lineEnd).split("\n");
  const populatedLines = selectedLines.filter((line) => line.length > 0);
  if (populatedLines.length === 0) return { text: kind === "bullet" ? "- " : "1. ", from: start, to: end, caret: "end" };
  const marker = kind === "bullet" ? BULLET : NUMBER;
  const remove = populatedLines.every((line) => marker.test(line));
  let count = 0;
  const text = selectedLines.map((line) => {
    if (!line) return line;
    const bare = line.replace(BULLET, "").replace(NUMBER, "");
    if (remove) return bare;
    count += 1;
    return kind === "bullet" ? `- ${bare}` : `${count}. ${bare}`;
  }).join("\n");
  return { text, from: lineStart, to: lineEnd, caret: "select" };
}

function notifyInput(textarea: HTMLTextAreaElement) {
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}

/**
 * Plain text with a few light marks, shown formatted by `FormattedText`: `**bold**`, `*italic*`, lines starting
 * "- " (bullets) and "1. " (numbered). The value stays plain text, so it stores, searches and prints as text.
 */
export const SimpleTextEditor = forwardRef<HTMLTextAreaElement, SimpleTextEditorProps>(function SimpleTextEditor(
  { toolbarLabel = "Formatting tools", onKeyDown, ...props },
  forwardedRef,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const setRefs = (node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const wrapSelection = (before: string, after = before) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    textarea.setRangeText(`${before}${selected}${after}`, textarea.selectionStart, textarea.selectionEnd, "select");
    notifyInput(textarea);
  };

  const toggleList = (kind: "bullet" | "number") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const change = toggleListText(textarea.value, textarea.selectionStart, textarea.selectionEnd, kind);
    textarea.setRangeText(change.text, change.from, change.to, change.caret);
    notifyInput(textarea);
  };

  /** Enter inside a list starts the next item; Enter on an empty item ends the list. */
  const continueList = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    const textarea = event.currentTarget;
    if (textarea.selectionStart !== textarea.selectionEnd) return;
    const caret = textarea.selectionStart;
    const lineStart = textarea.value.lastIndexOf("\n", caret - 1) + 1;
    const line = textarea.value.slice(lineStart, caret);
    const number = NUMBER.exec(line);
    const bullet = BULLET.exec(line);
    if (!number && !bullet) return;
    event.preventDefault();
    const marker = number ? number[0] : bullet![0];
    if (line.trim() === marker.trim()) {
      textarea.setRangeText("", lineStart, caret, "end");
    } else {
      const next = number ? `${Number(number[1]) + 1}. ` : bullet![0];
      textarea.setRangeText(`\n${next}`, caret, caret, "end");
    }
    notifyInput(textarea);
  };

  return (
    <div className="overflow-hidden rounded-control border border-line bg-surface focus-within:border-line-focus focus-within:shadow-[0_0_0_3px_rgb(87_83_78/0.12)]">
      <div className="flex items-center gap-1 border-b border-line-subtle bg-surface-muted px-1.5 py-1" aria-label={toolbarLabel} role="toolbar">
        <IconButton size="sm" variant="ghost" label="Bold" icon={<Bold aria-hidden="true" size={14} />} onClick={() => wrapSelection("**")} disabled={props.disabled} />
        <IconButton size="sm" variant="ghost" label="Italic" icon={<Italic aria-hidden="true" size={14} />} onClick={() => wrapSelection("*")} disabled={props.disabled} />
        <IconButton size="sm" variant="ghost" label="Bullet list" icon={<List aria-hidden="true" size={14} />} onClick={() => toggleList("bullet")} disabled={props.disabled} />
        <IconButton size="sm" variant="ghost" label="Numbered list" icon={<ListOrdered aria-hidden="true" size={14} />} onClick={() => toggleList("number")} disabled={props.disabled} />
      </div>
      <Textarea ref={setRefs} className="min-h-[116px] rounded-none border-0 shadow-none focus:border-0 focus:shadow-none" onKeyDown={continueList} {...props} />
    </div>
  );
});
