"use client";

import { Bold, Italic, List } from "lucide-react";
import { useRef, type TextareaHTMLAttributes } from "react";

import { IconButton, Textarea } from "../primitives";

export type SimpleTextEditorProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  toolbarLabel?: string;
};

function notifyInput(textarea: HTMLTextAreaElement) {
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}

export function SimpleTextEditor({ toolbarLabel = "Formatting tools", ...props }: SimpleTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const wrapSelection = (before: string, after = before) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    textarea.setRangeText(`${before}${selected}${after}`, textarea.selectionStart, textarea.selectionEnd, "select");
    notifyInput(textarea);
  };

  const toggleBullets = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = textarea.value.lastIndexOf("\n", start - 1) + 1;
    const nextLine = textarea.value.indexOf("\n", end);
    const lineEnd = nextLine === -1 ? textarea.value.length : nextLine;
    const selectedLines = textarea.value.slice(lineStart, lineEnd).split("\n");
    const populatedLines = selectedLines.filter((line) => line.length > 0);
    const removeBullets = populatedLines.length > 0 && populatedLines.every((line) => /^[-*]\s/.test(line));
    const replacement = selectedLines.map((line) => {
      if (!line) return line;
      return removeBullets ? line.replace(/^[-*]\s/, "") : `- ${line}`;
    }).join("\n");
    textarea.setRangeText(replacement, lineStart, lineEnd, "select");
    notifyInput(textarea);
  };

  return (
    <div className="overflow-hidden rounded-control border border-line bg-surface focus-within:border-line-focus focus-within:shadow-[0_0_0_3px_rgb(87_83_78/0.12)]">
      <div className="flex items-center gap-1 border-b border-line-subtle bg-surface-muted px-1.5 py-1" aria-label={toolbarLabel} role="toolbar">
        <IconButton size="sm" variant="ghost" label="Bold" icon={<Bold aria-hidden="true" size={15} />} onClick={() => wrapSelection("**")} />
        <IconButton size="sm" variant="ghost" label="Italic" icon={<Italic aria-hidden="true" size={15} />} onClick={() => wrapSelection("*")} />
        <IconButton size="sm" variant="ghost" label="Bullet list" icon={<List aria-hidden="true" size={15} />} onClick={toggleBullets} />
      </div>
      <Textarea ref={textareaRef} className="min-h-[116px] rounded-none border-0 shadow-none focus:border-0 focus:shadow-none" {...props} />
    </div>
  );
}
