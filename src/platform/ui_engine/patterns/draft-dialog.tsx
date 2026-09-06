"use client";

import { useCallback, useRef, useState } from "react";
import { Dialog, type DialogProps } from "../layouts/overlays";
import { useUnsavedChangesGuard } from "./hooks";

function snapshot(root: HTMLDivElement | null): string {
  return JSON.stringify(Array.from(root?.querySelectorAll("input, textarea, select") ?? []).map(element => {
    const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    return [input.name, input.value, "checked" in input ? input.checked : null];
  }));
}

/** Native-form draft protection, with explicit extra controlled state from callers.
 * Mark a Cancel button with data-dialog-cancel to share the overlay close path.
 * A successful save is still closed by the app; no persistence is owned here.
 */
export function DraftDialog({ watchedValue = "", pending = false, children, onOpenChange, open, ...props }: DialogProps & { watchedValue?: string; pending?: boolean }) {
  const root = useRef<HTMLDivElement | null>(null);
  const [baseline, setBaseline] = useState("");
  const [value, setValue] = useState("");
  const [opening, setOpening] = useState({ open, watchedValue });
  if (open !== opening.open) setOpening({ open, watchedValue });
  const baselineWatched = open !== opening.open ? watchedValue : opening.watchedValue;
  const guard = useUnsavedChangesGuard({ value: JSON.stringify([value, watchedValue]), initialValue: JSON.stringify([baseline, baselineWatched]) });
  const attach = useCallback((node: HTMLDivElement | null) => {
    root.current = node;
    if (node) { const initial = snapshot(node); setBaseline(initial); setValue(initial); }
  }, []);
  const close = () => { if (!pending) void guard.requestDiscard(() => onOpenChange(false), JSON.stringify([snapshot(root.current), watchedValue])); };
  return <>
    <Dialog {...props} open={open} dismissible={!pending && props.dismissible !== false} onOpenChange={next => next ? onOpenChange(true) : close()}>
      <div ref={attach} onChange={() => setValue(snapshot(root.current))} onInput={() => setValue(snapshot(root.current))} onClickCapture={event => {
        if ((event.target as HTMLElement).closest("[data-dialog-cancel]")) { event.preventDefault(); event.stopPropagation(); close(); }
      }}>{children}</div>
    </Dialog>
    {guard.confirmDialog}
  </>;
}
