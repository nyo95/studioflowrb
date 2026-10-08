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
};

/**
 * What-you-see editor (Tiptap) that keeps the stored value as plain text, so notes stay searchable, printable and
 * readable by `FormattedText`; notes written before this editor existed open unchanged. Loaded on demand.
 */
export const RichTextEditor = dynamic<RichTextEditorProps>(() => import("./rich-text-editor-impl"), {
  ssr: false,
  loading: () => <Textarea className="min-h-[140px]" aria-label="Loading editor" disabled defaultValue="" />,
});
