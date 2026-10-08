"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";

import { matchesAccept } from "../internal/file-drop";

export type FileIntakeOptions = {
  /**
   * Receives the files one drop or paste yielded: those matching `accept` (one at most unless `multiple`) and those
   * refused by it, so a consumer can explain a refusal. Never called when the gesture carried no file at all.
   */
  onFiles: (files: File[], refused: File[]) => void;
  /** Native accept list (`image/*`, `.pdf`, `image/png`...); empty accepts everything. */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /**
   * Also take a file pasted while the focus is on no text field at all (Ctrl+V right after copying a screenshot,
   * without clicking anywhere first). A paste into some other field always stays with that field. Only one mounted
   * intake on a page should ask for this.
   */
  pasteFromPage?: boolean;
};

export type FileIntakeTarget = {
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLElement>) => void;
};

function carriesFiles(transfer: DataTransfer | null): boolean {
  return Boolean(transfer && Array.from(transfer.types).includes("Files"));
}

/** Files on a clipboard: `files` where the browser fills it, otherwise the file items (some browsers fill only these). */
export function clipboardFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const direct = Array.from(data.files ?? []);
  if (direct.length) return direct;
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "number", "tel", "url", "password"]);

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type));
}

/**
 * The one way to take files from a drop or a paste (UI_ENGINE.md, behavioral boundaries). It owns the gestures, the
 * drag highlight, and the accept filter, and hands over the real `File`s; what the bytes are for (preparing, uploading,
 * attaching) stays with the consumer. Spread `target` on the element that receives drops and pastes. A paste that
 * carries no file (plain text) is left alone, so typing and pasting text inside the target work as usual.
 */
export function useFileIntake({ onFiles, accept, multiple = false, disabled = false, pasteFromPage = false }: FileIntakeOptions): { active: boolean; target: FileIntakeTarget } {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  const latest = useRef({ onFiles, accept, multiple });
  useEffect(() => { latest.current = { onFiles, accept, multiple }; });

  const take = (files: File[]) => {
    if (files.length === 0) return;
    const { onFiles: deliver, accept: allowed, multiple: many } = latest.current;
    const matching = files.filter((file) => matchesAccept(allowed, file));
    const refused = files.filter((file) => !matching.includes(file));
    deliver(many ? matching : matching.slice(0, 1), refused);
  };
  const takeRef = useRef(take);
  useEffect(() => { takeRef.current = take; });

  useEffect(() => {
    if (!pasteFromPage || disabled) return;
    const onPagePaste = (event: globalThis.ClipboardEvent) => {
      // A target's own handler has already run (and claimed the files) when it prevented the default.
      if (event.defaultPrevented || isTextField(event.target)) return;
      const files = clipboardFiles(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      takeRef.current(files);
    };
    window.addEventListener("paste", onPagePaste);
    return () => window.removeEventListener("paste", onPagePaste);
  }, [pasteFromPage, disabled]);

  const target: FileIntakeTarget = {
    onDragEnter: (event) => {
      if (disabled || !carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth.current += 1;
      setActive(true);
    },
    onDragOver: (event) => {
      if (disabled || !carriesFiles(event.dataTransfer)) return;
      // Without preventDefault the browser leaves the page and opens the file.
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (event) => {
      if (!carriesFiles(event.dataTransfer)) return;
      // Counted, so crossing a child element does not make the highlight flicker.
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    },
    onDrop: (event) => {
      if (!carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth.current = 0;
      setActive(false);
      if (!disabled) take(Array.from(event.dataTransfer.files));
    },
    onPaste: (event) => {
      if (disabled) return;
      const files = clipboardFiles(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      take(files);
    },
  };

  return { active, target };
}
