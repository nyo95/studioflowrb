import { Fragment, type ReactNode } from "react";

import { cx } from "../internal/cx";

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBER = /^\s*(\d+)[.)]\s+(.*)$/;
const CHECK = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;

type Block =
  | { kind: "text"; lines: string[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "checks"; items: { done: boolean; text: string }[] }
  | { kind: "heading"; text: string }
  | { kind: "numbers"; start: number; items: string[] };

function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const check = CHECK.exec(line);
    const heading = HEADING.exec(line);
    const bullet = check ? null : BULLET.exec(line);
    const number = NUMBER.exec(line);
    const last = blocks.at(-1);
    if (heading) {
      blocks.push({ kind: "heading", text: heading[1] });
    } else if (check) {
      const item = { done: check[1] !== " ", text: check[2] };
      if (last?.kind === "checks") last.items.push(item);
      else blocks.push({ kind: "checks", items: [item] });
    } else if (bullet) {
      if (last?.kind === "bullets") last.items.push(bullet[1]);
      else blocks.push({ kind: "bullets", items: [bullet[1]] });
    } else if (number) {
      if (last?.kind === "numbers") last.items.push(number[2]);
      else blocks.push({ kind: "numbers", start: Number(number[1]), items: [number[2]] });
    } else if (last?.kind === "text") {
      last.lines.push(line);
    } else {
      blocks.push({ kind: "text", lines: [line] });
    }
  }
  return blocks;
}

/** `**bold**` and `*italic*` inside one line; anything else is shown as typed. Never renders HTML. */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(?!\s)(.+?)(?<!\s)\*/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(match[1] !== undefined ? <strong key={index} className="font-semibold">{match[1]}</strong> : <em key={index}>{match[2]}</em>);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/**
 * Shows text written with `SimpleTextEditor`: bold, italic, bullet and numbered lists, line breaks kept.
 * Plain text without marks reads exactly as before, so it is safe on every existing note.
 */
export function FormattedText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cx("grid gap-1 [overflow-wrap:anywhere]", className)}>
      {blocksOf(text).map((block, index) => {
        if (block.kind === "heading") return <p key={index} className="m-0 font-semibold">{inline(block.text)}</p>;
        if (block.kind === "checks") {
          return <ul key={index} className="m-0 grid list-none gap-0.5 p-0">{block.items.map((item, i) => <li key={i} className="flex items-start gap-2"><input type="checkbox" checked={item.done} readOnly tabIndex={-1} aria-label={item.done ? "Done" : "Not done"} className="mt-1" /><span className={item.done ? "text-ink-tertiary line-through" : undefined}>{inline(item.text)}</span></li>)}</ul>;
        }
        if (block.kind === "bullets") {
          return <ul key={index} className="m-0 grid list-disc gap-0.5 pl-5">{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>;
        }
        if (block.kind === "numbers") {
          return <ol key={index} start={block.start} className="m-0 grid list-decimal gap-0.5 pl-5">{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ol>;
        }
        return (
          <p key={index} className="m-0">
            {block.lines.map((line, i) => <Fragment key={i}>{i > 0 ? <br /> : null}{inline(line)}</Fragment>)}
          </p>
        );
      })}
    </div>
  );
}
