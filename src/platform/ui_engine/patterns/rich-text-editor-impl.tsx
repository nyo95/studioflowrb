"use client";

import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, List, ListChecks, ListOrdered, Type } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

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

type SlashItem = { label: string; hint: string; icon: ReactNode; apply: (editor: Editor) => void };
/** The "/" menu: what a line can become. Each choice first returns the line to plain text, then applies one kind. */
const SLASH_ITEMS: SlashItem[] = [
  { label: "Text", hint: "Plain writing", icon: <Type aria-hidden="true" size={14} />, apply: (e) => { e.chain().focus().clearNodes().run(); } },
  { label: "Heading", hint: "A topic title", icon: <Heading2 aria-hidden="true" size={14} />, apply: (e) => { e.chain().focus().clearNodes().setHeading({ level: 2 }).run(); } },
  { label: "Bullet list", hint: "Simple points", icon: <List aria-hidden="true" size={14} />, apply: (e) => { e.chain().focus().clearNodes().toggleBulletList().run(); } },
  { label: "Numbered list", hint: "Steps in order", icon: <ListOrdered aria-hidden="true" size={14} />, apply: (e) => { e.chain().focus().clearNodes().toggleOrderedList().run(); } },
  { label: "Checklist", hint: "Things to tick off", icon: <ListChecks aria-hidden="true" size={14} />, apply: (e) => { e.chain().focus().clearNodes().toggleTaskList().run(); } },
];

type Slash = { from: number; left: number; top: number; index: number };

export default function RichTextEditorImpl({ value, onChange, maxLength, disabled, autoFocus, placeholder, "aria-label": ariaLabel, className, onSubmit, compact = false, bare = false, slashMenu = false, onBlur }: RichTextEditorProps) {
  // The last text we reported: the parent echoing it back is not a replacement, so typing is never reset.
  const reported = useRef(value);
  const submitRef = useRef(onSubmit);
  const blurRef = useRef(onBlur);
  useEffect(() => { submitRef.current = onSubmit; blurRef.current = onBlur; });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [slash, setSlash] = useState<Slash | null>(null);
  const slashRef = useRef<Slash | null>(null);
  useEffect(() => { slashRef.current = slash; }, [slash]);
  const editorRef = useRef<Editor | null>(null);

  /** Opens the menu when the caret sits right after a "/" typed at the start of a line or after a space. */
  const readSlash = (current: Editor) => {
    if (!slashMenu) return;
    const { $from, empty } = current.state.selection;
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
    if (!empty || !/(^|\s)\/$/.test(before)) { setSlash(null); return; }
    const caret = current.view.coordsAtPos($from.pos);
    const box = wrapperRef.current?.getBoundingClientRect();
    setSlash((open) => ({ from: $from.pos - 1, left: caret.left - (box?.left ?? 0), top: caret.bottom - (box?.top ?? 0) + 4, index: open?.index ?? 0 }));
  };
  const choose = (item: SlashItem) => {
    const editor = editorRef.current;
    const open = slashRef.current;
    if (!editor || !open) return;
    editor.chain().focus().deleteRange({ from: open.from, to: open.from + 1 }).run();
    item.apply(editor);
    setSlash(null);
  };

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
        const open = slashRef.current;
        if (open) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : SLASH_ITEMS.length - 1;
            setSlash({ ...open, index: (open.index + step) % SLASH_ITEMS.length });
            return true;
          }
          if (event.key === "Enter") { event.preventDefault(); choose(SLASH_ITEMS[open.index]!); return true; }
          if (event.key === "Escape") { event.preventDefault(); setSlash(null); return true; }
        }
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
      readSlash(current);
    },
    onSelectionUpdate: ({ editor: current }) => readSlash(current),
    onBlur: ({ event }) => {
      // Choosing from the "/" menu or the toolbar keeps the editor; anything else outside it is leaving.
      if (event.relatedTarget instanceof Node && wrapperRef.current?.contains(event.relatedTarget)) return;
      setSlash(null);
      blurRef.current?.();
    },
  });
  useEffect(() => { editorRef.current = editor; }, [editor]);

  // The parent can replace the text (e.g. cancel, or open another note): follow it without echoing our own typing.
  useEffect(() => {
    if (!editor || value === reported.current) return;
    reported.current = value;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);

  const over = maxLength !== undefined && value.length >= maxLength;
  const tool = (label: string, icon: ReactNode, active: boolean, run: () => void) => (
    <IconButton size="sm" variant={active ? "secondary" : "ghost"} label={label} icon={icon} aria-pressed={active} disabled={disabled || !editor} onMouseDown={(event) => event.preventDefault()} onClick={run} />
  );

  return (
    <div ref={wrapperRef} className={cx(bare ? "relative" : "relative overflow-hidden rounded-control border border-line bg-surface focus-within:border-line-focus focus-within:shadow-[0_0_0_3px_rgb(87_83_78/0.12)]", className)}>
      {bare ? null : (
        <div className="flex items-center gap-1 border-b border-line-subtle bg-surface-muted px-1.5 py-1" role="toolbar" aria-label="Formatting tools">
          {tool("Bold", <Bold aria-hidden="true" size={14} />, !!editor?.isActive("bold"), () => editor?.chain().focus().toggleBold().run())}
          {tool("Italic", <Italic aria-hidden="true" size={14} />, !!editor?.isActive("italic"), () => editor?.chain().focus().toggleItalic().run())}
          {tool("Heading", <Heading2 aria-hidden="true" size={14} />, !!editor?.isActive("heading"), () => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
          {tool("Bullet list", <List aria-hidden="true" size={14} />, !!editor?.isActive("bulletList"), () => editor?.chain().focus().toggleBulletList().run())}
          {tool("Numbered list", <ListOrdered aria-hidden="true" size={14} />, !!editor?.isActive("orderedList"), () => editor?.chain().focus().toggleOrderedList().run())}
          {tool("Checklist", <ListChecks aria-hidden="true" size={14} />, !!editor?.isActive("taskList"), () => editor?.chain().focus().toggleTaskList().run())}
          {over ? <span className="ml-auto pr-1 text-xs text-ink-tertiary">Limit reached</span> : null}
        </div>
      )}
      <div className="relative">
      {placeholder && !value ? <span aria-hidden="true" className={cx("pointer-events-none absolute text-sm text-ink-tertiary", bare ? "left-0 top-0" : "left-3 top-2")}>{placeholder}</span> : null}
      <EditorContent
        editor={editor}
        data-placeholder={placeholder}
        className={cx(
          bare ? "text-sm text-ink" : compact ? "max-h-64 min-h-[44px] overflow-y-auto px-3 py-2 text-sm text-ink" : "min-h-[116px] px-3 py-2 text-sm text-ink",
          bare ? "[&_.ProseMirror]:min-h-[21px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:[overflow-wrap:anywhere]" : compact ? "[&_.ProseMirror]:min-h-[24px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:[overflow-wrap:anywhere]" : "[&_.ProseMirror]:min-h-[96px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:[overflow-wrap:anywhere]",
          "[&_.ProseMirror_p]:my-0 [&_.ProseMirror_h2]:my-1 [&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-semibold",
          "[&_.ProseMirror_ul]:my-0 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:my-0 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5",
          "[&_.ProseMirror_ul[data-type=taskList]]:list-none [&_.ProseMirror_ul[data-type=taskList]]:pl-0",
          "[&_.ProseMirror_ul[data-type=taskList]_li]:flex [&_.ProseMirror_ul[data-type=taskList]_li]:items-start [&_.ProseMirror_ul[data-type=taskList]_li]:gap-2",
          "[&_.ProseMirror_ul[data-type=taskList]_li>label]:mt-0.5 [&_.ProseMirror_ul[data-type=taskList]_li>div]:min-w-0 [&_.ProseMirror_ul[data-type=taskList]_li>div]:flex-1",
          "[&_.ProseMirror_li[data-checked=true]>div]:text-ink-tertiary [&_.ProseMirror_li[data-checked=true]>div]:line-through",
        )}
      />
      </div>
      {slash ? (
        <div role="listbox" aria-label="Turn into" className="absolute z-50 w-56 rounded-control bg-surface p-1 shadow-over" style={{ left: Math.max(0, slash.left - 8), top: slash.top }}>
          <div className="px-2 pb-1 pt-1.5 text-xs text-ink-tertiary">Turn into</div>
          {SLASH_ITEMS.map((item, index) => (
            <button
              key={item.label}
              type="button"
              role="option"
              aria-selected={index === slash.index}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
              className={cx("flex w-full items-center gap-2.5 rounded-action px-2 py-1.5 text-left", index === slash.index ? "bg-surface-muted" : "hover:bg-surface-muted")}
            >
              <span className="grid h-7 w-7 place-items-center rounded-action text-ink-secondary shadow-[0_0_0_1px_var(--ui-border-default)]">{item.icon}</span>
              <span className="grid"><span className="text-sm font-medium text-ink">{item.label}</span><span className="text-xs text-ink-tertiary">{item.hint}</span></span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
