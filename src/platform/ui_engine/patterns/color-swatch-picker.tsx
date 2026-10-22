"use client";

import { useState } from "react";

import { Button } from "../primitives/actions";
import { Input } from "../primitives/forms";
import { normalizeHex, SWATCH_PRESETS, swatchFileName, swatchSize } from "./color-swatch";

export type ColorSwatchPickerProps = {
  label: string;
  /** Receives a solid-colour picture, so any consumer that stores an uploaded image can take a colour instead. */
  onPrepared: (file: File) => void | Promise<void>;
  /** Picture shape (width / height); omitted gives a square. */
  aspect?: number;
  outputType?: "image/png" | "image/jpeg";
  initialColor?: string;
  disabled?: boolean;
};

/** A plain swatch is tiny however it is encoded; this keeps the long side crisp in print without wasting storage. */
const SWATCH_LONG_SIDE = 800;

type EyeDropperWindow = Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } };

/** Pick a colour (preset, native picker, typed hex, or from the screen where the browser allows) and hand it on as a picture. */
export function ColorSwatchPicker({ label, onPrepared, aspect, outputType = "image/png", initialColor = "#d8cbb5", disabled = false }: ColorSwatchPickerProps) {
  const [color, setColor] = useState(() => normalizeHex(initialColor) ?? "#d8cbb5");
  const [typed, setTyped] = useState(color);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read once on the client; the "from screen" button only exists where the browser offers it.
  const [canSample] = useState(() => typeof window !== "undefined" && !!(window as EyeDropperWindow).EyeDropper);
  const busy = disabled || pending;

  const choose = (value: string) => {
    const hex = normalizeHex(value);
    setTyped(value);
    if (hex) { setColor(hex); setError(null); }
  };

  const sample = async () => {
    const EyeDropper = (window as EyeDropperWindow).EyeDropper;
    if (!EyeDropper || busy) return;
    try { choose((await new EyeDropper().open()).sRGBHex); } catch { /* the person pressed Escape */ }
  };

  const prepare = async () => {
    if (busy) return;
    setPending(true); setError(null);
    try {
      const { width, height } = swatchSize(aspect, SWATCH_LONG_SIDE);
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.fillStyle = color;
      context.fillRect(0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Swatch failed")), outputType, 0.92));
      await onPrepared(new File([blob], swatchFileName(color, outputType), { type: outputType }));
    } catch {
      setError("The colour could not be prepared. Try again.");
    } finally { setPending(false); }
  };

  return <div className="grid gap-3" aria-label={label}>
    <div className="flex items-stretch gap-3">
      <span className="w-16 shrink-0 rounded-control border border-line" style={{ backgroundColor: color, aspectRatio: String(aspect && aspect > 0 ? aspect : 1) }} aria-hidden />
      <div className="grid min-w-0 flex-1 content-start gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Colour presets">
          {SWATCH_PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`Use colour ${value}`}
              aria-pressed={color === value}
              disabled={busy}
              onClick={() => choose(value)}
              className="grid size-8 place-items-center rounded-full disabled:opacity-50"
            ><span className={color === value ? "size-6 rounded-full ring-2 ring-offset-1 ring-line-focus ring-offset-surface" : "size-6 rounded-full border border-line"} style={{ backgroundColor: value }} /></button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-control border border-line" title="Open colour picker">
            <span className="sr-only">Open colour picker</span>
            <input type="color" value={color} disabled={busy} onChange={(event) => choose(event.target.value)} className="absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] cursor-pointer" />
          </label>
          <Input aria-label="Hex colour" value={typed} disabled={busy} maxLength={7} spellCheck={false} onChange={(event) => choose(event.target.value)} className="w-28 font-ui-mono" />
          {canSample ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void sample()}>Pick from screen</Button> : null}
        </div>
        {normalizeHex(typed) ? null : <p className="text-xs text-ink-secondary">Type a hex colour such as #a68a64.</p>}
      </div>
    </div>
    <div><Button type="button" variant="primary" disabled={disabled} pending={pending} onClick={() => void prepare()}>Use this colour</Button></div>
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
  </div>;
}
