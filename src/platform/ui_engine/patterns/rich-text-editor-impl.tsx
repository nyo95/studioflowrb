"use client";

import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, List, ListChecks, ListOrdered } from "lucide-react";
import { useEffect, useRef } from "react";

import { cx } from "../internal/cx";
import { IconButton } from "../primitives";
import type { RichTextEditorProps } from "./rich-text-editor";

/** Only what `FormattedText` can show back: bold, italic, headings, bullet, numbered and check lists. */
const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [2] },
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    link: false,
    trailingNode: false,
  }),
  TaskList,
  TaskItem.configure({ nested: false }),
  Markdown,
];

export default function RichTextEditorImpl({ value, onChange, maxLength, disabled, autoFocus, placeholder, "aria-label": ariaLabel, className, onSubmit, compact = false }: RichTextEditorProps) {
  // The last text we reported: the parent echoing it back is not a replacement, so typing is never reset.
  const reported = useRef(value);
  const submitRef = useRef(onSubmit);
  useEffect(() => { submitRef.current = onSubmit; });
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: value,
    contentType: "markdown",
    editable: !disabled,
    autofocus: autoFocus ? "end" : false,
    immediatelyRender: false,
    editorProps: {
      attributes: { role: "textbox", "aria-multiline": "true", ...(ariaLabel ? { "aria-label": ariaLabel } : {}) },
      handleKeyDown: (view, event) => {
        const submit = submitRef.current;
        if (!submit || event.key !== "Enter" || event.isComposing) return false;
        const { $from } = view.state.selection;
        let inList = false;
        for (let depth = $from.depth; depth > 0; depth -= 1) if (["listItem", "taskItem"].includes($from.node(depth).type.name)) inList = true;
        if (event.ctrlKey || event.metaKey || (!event.shiftKey && !inList)) {
          event.preventDefault();
          submit();
          return true;
        }
        // Shift+Enter starts a new paragraph (what Enter does without sending), not a soft line break the stored text cannot keep.
        if (event.shiftKey && !inList) {
          view.dispatch(view.state.tr.split(view.state.selection.from).scrollIntoView());
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = current.getMarkdown();
      const next = maxLength !== undefined && markdown.length > maxLength ? markdown.slice(0, maxLength) : markdown;
      reported.current = next;
      onChange(next);
    },
  });

  // The parent can replace the text (e.g. cancel, or open another note): follow it without echoing our own typing.
  useEffect(() => {
    if (!editor || value === reported.current) return;
    reported.current = value;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);

  const over = maxLength !== undefined && value.length >= maxLength;
  const tool = (label: string, icon: React.ReactNode, active: boolean, run: () => void) => (
    <IconButton size="sm" variant={active ? "secondary" : "ghost"} label={label} icon={icon} aria-pressed={active} disabled={disabled || !editor} onMouseDown={(event) => event.preventDefault()} onClick={run} />
  );

  return (
    <div className={cx("overflow-hidden rounded-control border border-line bg-surface focus-within:border-line-focus focus-within:shadow-[0_0_0_3px_rgb(87_83_78/0.12)]", className)}>
      <div className="flex items-center gap-1 border-b border-line-subtle bg-surface-muted px-1.5 py-1" role="toolbar" aria-label="Formatting tools">
        {tool("Bold", <Bold aria-hidden="true" size={14} />, !!editor?.isActive("bold"), () => editor?.chain().focus().toggleBold().run())}
        {tool("Italic", <Italic aria-hidden="true" size={14} />, !!editor?.isActive("italic"), () => editor?.chain().focus().toggleItalic().run())}
        {tool("Heading", <Heading2 aria-hidden="true" size={14} />, !!editor?.isActive("heading"), () => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
        {tool("Bullet list", <List aria-hidden="true" size={14} />, !!editor?.isActive("bulletList"), () => editor?.chain().focus().toggleBulletList().run())}
        {tool("Numbered list", <ListOrdered aria-hidden="true" size={14} />, !!editor?.isActive("orderedList"), () => editor?.chain().focus().toggleOrderedList().run())}
        {tool("Checklist", <ListChecks aria-hidden="true" size={14} />, !!editor?.isActive("taskList"), () => editor?.chain().focus().toggleTaskList().run())}
        {over ? <span className="ml-auto pr-1 text-xs text-ink-tertiary">Limit reached</span> : null}
      </div>
      <div className="relative">
      {placeholder && !value ? <span aria-hidden="true" className="pointer-events-none absolute left-3 top-2 text-sm text-ink-tertiary">{placeholder}</span> : null}
      <EditorContent
        editor={editor}
        data-placeholder={placeholder}
        className={cx(
          compact ? "max-h-64 min-h-[44px] overflow-y-auto px-3 py-2 text-sm text-ink" : "min-h-[116px] px-3 py-2 text-sm text-ink",
          compact ? "[&_.ProseMirror]:min-h-[24px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:[overflow-wrap:anywhere]" : "[&_.ProseMirror]:min-h-[96px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:[overflow-wrap:anywhere]",
          "[&_.ProseMirror_p]:my-0 [&_.ProseMirror_h2]:my-1 [&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-semibold",
          "[&_.ProseMirror_ul]:my-0 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:my-0 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5",
          "[&_.ProseMirror_ul[data-type=taskList]]:list-none [&_.ProseMirror_ul[data-type=taskList]]:pl-0",
          "[&_.ProseMirror_ul[data-type=taskList]_li]:flex [&_.ProseMirror_ul[data-type=taskList]_li]:items-start [&_.ProseMirror_ul[data-type=taskList]_li]:gap-2",
          "[&_.ProseMirror_ul[data-type=taskList]_li>label]:mt-0.5 [&_.ProseMirror_ul[data-type=taskList]_li>div]:min-w-0 [&_.ProseMirror_ul[data-type=taskList]_li>div]:flex-1",
          "[&_.ProseMirror_li[data-checked=true]>div]:text-ink-tertiary [&_.ProseMirror_li[data-checked=true]>div]:line-through",
        )}
      />
      </div>
    </div>
  );
}
