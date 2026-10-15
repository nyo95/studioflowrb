"use client";

import { useEffect, useRef, useState } from "react";

import { cx } from "../internal/cx";
import { Button } from "../primitives/actions";
import { compressionSteps } from "./image-adjust";
import { DRAW_TOOLS, drawStrokes, STROKE_COLORS, type DrawTool, type Stroke } from "./image-strokes";
import { ZoomableImage, type DrawHandlers } from "./zoomable-image";
import type { Size } from "./zoom-pan";

export type ImageMarkupProps = {
  /** The picture to mark up; it is never changed. Same-origin (or CORS-enabled) so the result can be drawn. */
  src: string;
  /** Receives the whole picture with the marks drawn on it, as a new file. */
  onSave: (file: File) => void | Promise<void>;
  onCancel?: () => void;
  fileName?: string;
  outputType?: "image/jpeg" | "image/png";
  outputQuality?: number;
  /** The saved picture's longest side. */
  maxDimension?: number;
  /** The encoder steps down (quality, then size) until the file fits. */
  maxBytes?: number;
  saveLabel?: string;
};

/** Line width as a share of the picture's width, the same in the preview and in the saved file. */
const LINE_SHARE = 1 / 250;

/**
 * Zoom in to mark details; the result is always the whole picture with every mark where it was drawn (owner
 * 2026-10-15). Marks are kept in picture coordinates, so zooming or moving never shifts them; the original picture
 * is untouched and the consumer decides where the marked copy goes.
 */
export function ImageMarkup({ src, onSave, onCancel, fileName = "markup", outputType = "image/jpeg", outputQuality = 0.86, maxDimension = 2400, maxBytes = 3 * 1024 * 1024, saveLabel = "Save marked copy" }: ImageMarkupProps) {
  const [tool, setTool] = useState<DrawTool | "pan">("pen");
  const [color, setColor] = useState(STROKE_COLORS[0]!);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [natural, setNatural] = useState<Size | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draw: DrawHandlers | null = tool === "pan" || saving ? null : {
    start: (at) => setStrokes((current) => [...current, { tool, color, points: [at] }]),
    move: (at) => setStrokes((current) => current.map((stroke, index) => index !== current.length - 1 ? stroke : stroke.tool === "pen" ? { ...stroke, points: [...stroke.points, at] } : { ...stroke, points: [stroke.points[0]!, at] })),
    end: () => undefined,
    cancel: () => setStrokes((current) => current.slice(0, -1)),
  };

  const save = async () => {
    if (!natural || saving) return;
    setSaving(true); setError(null);
    try {
      const image = new Image();
      image.decoding = "async";
      image.src = src;
      await image.decode();
      const base = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const render = (scale: number) => {
        const width = Math.max(1, Math.round(image.naturalWidth * base * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * base * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable");
        if (outputType === "image/jpeg") { context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); }
        context.drawImage(image, 0, 0, width, height);
        drawStrokes(context, strokes, width, height, Math.max(2, width * LINE_SHARE));
        return canvas;
      };
      const encode = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), outputType, quality));
      let blob: Blob | null = null;
      for (const step of compressionSteps(outputType, outputQuality)) {
        blob = await encode(render(step.scale), step.quality);
        if (blob.size <= maxBytes) break;
      }
      if (!blob || blob.size > maxBytes) throw new Error("too large");
      await onSave(new File([blob], `${fileName}.${outputType === "image/jpeg" ? "jpg" : "png"}`, { type: outputType }));
    } catch {
      setError("The marked copy could not be made. Try again, or use a smaller picture.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-3">
      <ZoomableImage
        src={src}
        alt="Picture to mark up"
        className="h-[min(62vh,640px)] w-full"
        draw={draw}
        onContent={setNatural}
        overlay={(content, view) => <StrokeLayer strokes={strokes} content={content} zoom={view.zoom} />}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Tool" className="flex flex-wrap gap-1">
          <Button type="button" size="sm" variant={tool === "pan" ? "primary" : "secondary"} aria-pressed={tool === "pan"} onClick={() => setTool("pan")}>Pan</Button>
          {DRAW_TOOLS.map((option) => <Button key={option.value} type="button" size="sm" variant={tool === option.value ? "primary" : "secondary"} aria-pressed={tool === option.value} onClick={() => setTool(option.value)}>{option.label}</Button>)}
        </div>
        <div role="group" aria-label="Colour" className="flex gap-0.5">
          {STROKE_COLORS.map((value) => (
            <button key={value} type="button" aria-label={`Use colour ${value}`} aria-pressed={color === value} onClick={() => { setColor(value); if (tool === "pan") setTool("pen"); }} className="grid size-11 place-items-center rounded-full">
              <span className={cx("size-6 rounded-full", color === value ? "ring-2 ring-line-focus ring-offset-1 ring-offset-surface" : "border border-line")} style={{ backgroundColor: value }} />
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <Button type="button" size="sm" variant="ghost" disabled={!strokes.length || saving} onClick={() => setStrokes((current) => current.slice(0, -1))}>Undo last mark</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!strokes.length || saving} onClick={() => setStrokes([])}>Clear marks</Button>
      </div>
      <p className="m-0 text-xs text-ink-secondary">Scroll or pinch to zoom in on a detail, Pan to move around. The whole picture is saved with your marks; the original stays as it was.</p>
      {error ? <p role="alert" className="m-0 text-sm text-danger">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button> : null}
        <Button type="button" variant="primary" pending={saving} disabled={!strokes.length || !natural} onClick={() => void save()}>{saveLabel}</Button>
      </div>
    </div>
  );
}

/** The marks over the picture, redrawn sharp for the current zoom. */
function StrokeLayer({ strokes, content, zoom }: { strokes: readonly Stroke[]; content: Size; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const scale = (window.devicePixelRatio || 1) * Math.min(zoom, 4);
    canvas.width = Math.max(1, Math.round(content.width * scale));
    canvas.height = Math.max(1, Math.round(content.height * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawStrokes(context, strokes, canvas.width, canvas.height, Math.max(1, canvas.width * LINE_SHARE));
  }, [strokes, content.width, content.height, zoom]);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
