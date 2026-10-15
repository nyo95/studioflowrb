"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import Image from "next/image";

import { Button } from "../primitives/actions";
import { Input } from "../primitives/forms";
import { useFileIntake } from "./file-intake";
import { ADJUST_LIMITS, colorFilter, compressionSteps, formatSize, isNeutral, NEUTRAL_ADJUST, type ColorAdjust } from "./image-adjust";
import { cropPreview, cropRect, panCrop, pinchCrop, zoomCrop, type CropPosition } from "./image-crop";

type Point = { x: number; y: number };
type DrawTool = "pen" | "arrow" | "rect" | "ellipse";
type Tool = DrawTool | "pan";
type Stroke = { tool: DrawTool; color: string; points: Point[] };

const TOOLS: { value: Tool; label: string }[] = [
  { value: "pen", label: "Pen" },
  { value: "arrow", label: "Arrow" },
  { value: "rect", label: "Box" },
  { value: "ellipse", label: "Circle" },
];

const COLORS = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#111827"];

export type ImageWorkspaceProps = {
  label: string;
  onPrepared: (file: File) => void | Promise<void>;
  accept?: string;
  maxBytes?: number;
  maxDimension?: number;
  /** Encoded output; JPEG keeps photos small enough for server-action uploads. */
  outputType?: "image/png" | "image/jpeg";
  /** JPEG quality 0-1 (ignored for PNG). */
  outputQuality?: number;
  /** Fixed crop aspect (width / height); omitted keeps the source aspect. */
  aspect?: number;
  /**
   * The prepared image is re-encoded smaller (JPEG quality first, then a little fewer pixels) until it fits this size.
   * An image that already fits is encoded once with the settings above.
   */
  targetBytes?: number;
  /**
   * Open the file picker as soon as the workspace appears, for a "Change photo" click that should go straight to
   * choosing a file. The browser only allows this right after a user click; if it declines, "Choose image" stays.
   */
  openOnMount?: boolean;
  /** An image the person already handed over (pasted or dropped before the workspace opened); the picker then stays shut. */
  initialFile?: File | null;
  /**
   * Also take an image pasted while the focus is on no text field, so Ctrl+V works right after copying without a
   * click into the workspace first. One open workspace per page should ask for this.
   */
  pasteFromPage?: boolean;
  disabled?: boolean;
};

const DEFAULT_TARGET_BYTES = 1.5 * 1024 * 1024;

/** Why a chosen image cannot be used, or null when it can. */
function imageProblem(file: File, accept: string, maxBytes: number): string | null {
  if (!accept.split(",").map((value) => value.trim()).includes(file.type)) return "Use a supported image format.";
  if (file.size === 0 || file.size > maxBytes) return `Choose a non-empty image no larger than ${Math.ceil(maxBytes / 1024 / 1024)} MB.`;
  return null;
}

/** `ctx.filter` is missing in older Safari; without it the colour sliders would preview one thing and save another, so they are hidden. */
function canBakeColorFilter(): boolean {
  return typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Draws every stroke onto a 2D context at the given pixel size, shared by the live preview and the final bake so the two never drift apart. */
function drawStrokes(context: CanvasRenderingContext2D, strokes: readonly Stroke[], width: number, height: number, lineWidth: number) {
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.points.length < 1) continue;
    context.strokeStyle = stroke.color;
    context.fillStyle = stroke.color;
    context.lineWidth = lineWidth;
    const px = (point: Point) => point.x * width;
    const py = (point: Point) => point.y * height;
    if (stroke.tool === "pen") {
      if (stroke.points.length < 2) continue;
      context.beginPath();
      context.moveTo(px(stroke.points[0]), py(stroke.points[0]));
      for (const point of stroke.points.slice(1)) context.lineTo(px(point), py(point));
      context.stroke();
      continue;
    }
    const start = stroke.points[0];
    const end = stroke.points[stroke.points.length - 1];
    if (stroke.tool === "rect") {
      context.strokeRect(Math.min(px(start), px(end)), Math.min(py(start), py(end)), Math.abs(px(end) - px(start)), Math.abs(py(end) - py(start)));
      continue;
    }
    if (stroke.tool === "ellipse") {
      const cx = (px(start) + px(end)) / 2;
      const cy = (py(start) + py(end)) / 2;
      const rx = Math.abs(px(end) - px(start)) / 2;
      const ry = Math.abs(py(end) - py(start)) / 2;
      context.beginPath();
      context.ellipse(cx, cy, Math.max(rx, 0.01), Math.max(ry, 0.01), 0, 0, Math.PI * 2);
      context.stroke();
      continue;
    }
    // arrow
    context.beginPath();
    context.moveTo(px(start), py(start));
    context.lineTo(px(end), py(end));
    context.stroke();
    const angle = Math.atan2(py(end) - py(start), px(end) - px(start));
    const headLength = Math.max(8, lineWidth * 4);
    context.beginPath();
    context.moveTo(px(end), py(end));
    context.lineTo(px(end) - headLength * Math.cos(angle - Math.PI / 6), py(end) - headLength * Math.sin(angle - Math.PI / 6));
    context.lineTo(px(end) - headLength * Math.cos(angle + Math.PI / 6), py(end) - headLength * Math.sin(angle + Math.PI / 6));
    context.closePath();
    context.fill();
  }
}

/** Browser image preparation only; storage and consumer policy stay outside. */
export function ImageWorkspace({ label, onPrepared, accept = "image/png,image/jpeg,image/webp", maxBytes = 30 * 1024 * 1024, maxDimension = 1800, outputType = "image/png", outputQuality = 0.86, aspect, targetBytes = DEFAULT_TARGET_BYTES, disabled = false, openOnMount = false, initialFile = null, pasteFromPage = false }: ImageWorkspaceProps) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const opened = useRef(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const drawPointer = useRef<number | null>(null);
  const pinching = useRef(false);
  const preparing = useRef(false);
  // A handed-over image starts the workspace already loaded, with the same checks as a picked one.
  const [file, setFile] = useState<File | null>(() => initialFile && !imageProblem(initialFile, accept, maxBytes) ? initialFile : null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(() => initialFile && !imageProblem(initialFile, accept, maxBytes) ? URL.createObjectURL(initialFile) : null);
  const [crop, setCrop] = useState<CropPosition>({ zoom: 1, panX: 50, panY: 50 });
  const cropState = useRef(crop);
  const { zoom, panX, panY } = crop;
  const [natural, setNatural] = useState<{ naturalWidth: number; naturalHeight: number } | null>(null);
  const [tool, setTool] = useState<Tool>("pan");
  const [color, setColor] = useState(COLORS[0]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(() => initialFile ? imageProblem(initialFile, accept, maxBytes) : null);
  const [adjust, setAdjust] = useState<ColorAdjust>(NEUTRAL_ADJUST);
  const [sizeNote, setSizeNote] = useState<string | null>(null);
  // Read once on the client; the controls only render after an image is chosen, so there is no server markup to disagree with.
  const [colorSupported] = useState(canBakeColorFilter);
  const busy = disabled || pending;
  const geometry = natural ? { ...natural, aspect, ...crop } : null;
  const preview = geometry ? cropPreview(geometry) : null;
  const updateCrop = useCallback((next: CropPosition) => { cropState.current = next; setCrop(next); }, []);

  const endGestures = () => {
    const canvas = overlayRef.current;
    const ids = [...pointers.current.keys()];
    pointers.current.clear(); drawPointer.current = null; pinching.current = false;
    for (const id of ids) if (canvas?.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  };

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    if (!disabled) return;
    const canvas = overlayRef.current;
    const ids = [...pointers.current.keys()];
    pointers.current.clear(); drawPointer.current = null; pinching.current = false;
    for (const id of ids) if (canvas?.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }, [disabled]);

  useEffect(() => {
    const canvas = overlayRef.current;
    const activePointers = pointers.current;
    return () => {
      const ids = [...activePointers.keys()]; activePointers.clear();
      for (const id of ids) if (canvas?.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    };
  }, []);

  useEffect(() => {
    if (!openOnMount || disabled || opened.current || initialFile) return;
    opened.current = true;
    pickerRef.current?.click();
  }, [openOnMount, disabled, initialFile]);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const redraw = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      context.scale(ratio, ratio);
      context.clearRect(0, 0, rect.width, rect.height);
      drawStrokes(context, strokes, rect.width, rect.height, 2);
    };
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [strokes, previewUrl, natural]);

  const select = (selected: File | undefined) => {
    if (!selected || disabled || preparing.current) return;
    const problem = imageProblem(selected, accept, maxBytes);
    setError(problem);
    if (problem) return;
    endGestures();
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    updateCrop({ zoom: 1, panX: 50, panY: 50 }); setNatural(null); setStrokes([]); setAdjust(NEUTRAL_ADJUST); setSizeNote(null); setTool("pan"); setColor(COLORS[0]);
  };

  // Drop or paste an image anywhere on the workspace; the same checks as a picked file apply (an unsupported file is explained, not dropped silently).
  const intake = useFileIntake({ accept, disabled: disabled || pending, pasteFromPage, onFiles: (files, refused) => select(files[0] ?? refused[0]) });

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  };

  const prepare = async () => {
    const image = imageRef.current;
    if (disabled || preparing.current || !file || !image?.naturalWidth || !image.naturalHeight) return;
    preparing.current = true; endGestures();
    setPending(true); setError(null);
    try {
      const { x: sourceX, y: sourceY, width: cropWidth, height: cropHeight } = cropRect({ naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, aspect, ...cropState.current });
      const baseScale = Math.min(1, maxDimension / Math.max(cropWidth, cropHeight));
      const render = (factor: number): HTMLCanvasElement => {
        const width = Math.max(1, Math.round(cropWidth * baseScale * factor));
        const height = Math.max(1, Math.round(cropHeight * baseScale * factor));
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable");
        if (outputType === "image/jpeg") { context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); }
        // Colour tweaks apply to the photo only; annotations drawn afterwards keep their exact colours.
        if (colorSupported && !isNeutral(adjust)) context.filter = colorFilter(adjust);
        context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, width, height);
        context.filter = "none";
        drawStrokes(context, strokes, width, height, Math.max(2, width / 700));
        return canvas;
      };
      const encode = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Image preparation failed")), outputType, quality));
      let blob: Blob | null = null;
      for (const step of compressionSteps(outputType, outputQuality)) {
        blob = await encode(render(step.scale), step.quality);
        if (blob.size <= targetBytes) break;
      }
      if (!blob || blob.size > maxBytes) throw new Error("Prepared image is too large");
      setSizeNote(blob.size < file.size ? `Made smaller: ${formatSize(file.size)} → ${formatSize(blob.size)}` : `${formatSize(blob.size)}`);
      const extension = outputType === "image/jpeg" ? "jpg" : "png";
      await onPrepared(new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "image"}.${extension}`, { type: outputType }));
    } catch {
      setError("The image could not be prepared. Try a smaller image.");
    } finally { preparing.current = false; setPending(false); }
  };

  const onOverlayPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled || preparing.current || !natural || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size > 1) {
      // The first finger may have begun drawing. A pinch removes only that unfinished stroke.
      if (drawPointer.current !== null) setStrokes((current) => current.slice(0, -1));
      drawPointer.current = null; pinching.current = true;
    } else if (tool !== "pan") {
      drawPointer.current = event.pointerId;
      setStrokes((current) => [...current, { tool, color, points: [pointFromEvent(event)] }]);
    }
  };
  const onOverlayPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled || preparing.current || !natural) return;
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const local = (point: Point) => ({ x: point.x - rect.left, y: point.y - rect.top });
    const before = [...pointers.current.values()].slice(0, 2).map(local);
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    const current = { ...natural, aspect, ...cropState.current };
    if (pointers.current.size > 1) {
      const after = [...pointers.current.values()].slice(0, 2).map(local);
      updateCrop(pinchCrop(current, rect, [before[0], before[1]], [after[0], after[1]]));
      return;
    }
    // After either finger lifts, no new stroke starts until every pinch pointer has lifted.
    if (pinching.current) return;
    if (tool === "pan") { updateCrop(panCrop(current, rect, { x: point.x - previous.x, y: point.y - previous.y })); return; }
    if (drawPointer.current !== event.pointerId) return;
    const drawn = pointFromEvent(event);
    setStrokes((current) => current.map((stroke, index) => {
      if (index !== current.length - 1) return stroke;
      // Pen accumulates every point; shape tools only ever need a start/end pair.
      return stroke.tool === "pen" ? { ...stroke, points: [...stroke.points, drawn] } : { ...stroke, points: [stroke.points[0], drawn] };
    }));
  };
  const onOverlayPointerEnd = (event: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    if (drawPointer.current === event.pointerId) drawPointer.current = null;
    if (pointers.current.size === 0) pinching.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  // A native non-passive listener is needed to keep wheel zoom from scrolling the page as well.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (disabled || preparing.current || !natural) return;
      event.preventDefault();
      if (pointers.current.size) return;
      const rect = overlayRef.current?.getBoundingClientRect() ?? viewport.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      updateCrop(zoomCrop({ ...natural, aspect, ...cropState.current }, rect, point, point, cropState.current.zoom - event.deltaY / 500));
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [natural, aspect, disabled, previewUrl, updateCrop]);

  return <div className={intake.active ? "grid gap-3 rounded-control shadow-plane p-3 outline-2 outline-dashed outline-offset-2 outline-line-focus" : "grid gap-3 rounded-control shadow-plane p-3"} aria-label={label} {...intake.target}>
    <input ref={pickerRef} className="sr-only" type="file" accept={accept} disabled={busy} onChange={(event) => { select(event.target.files?.[0]); event.target.value = ""; }} />
    {!previewUrl ? <div className="grid gap-1.5"><Button type="button" variant="secondary" onClick={() => pickerRef.current?.click()} disabled={busy}>Choose image</Button><p className="text-xs text-ink-secondary">Or drop an image here, or paste one (Ctrl+V).</p></div> : <>
      <div
        ref={viewportRef}
        className="relative overflow-hidden rounded-control border border-line bg-surface-muted touch-none"
        style={{ boxSizing: "content-box", aspectRatio: String(aspect && aspect > 0 ? aspect : natural ? natural.naturalWidth / natural.naturalHeight : 1) }}
      >
        <div className="absolute" style={{ width: `${preview?.width ?? 100}%`, height: `${preview?.height ?? 100}%`, left: `${preview?.left ?? 0}%`, top: `${preview?.top ?? 0}%` }}>
          <Image key={previewUrl} ref={imageRef} src={previewUrl} alt="Image preview" fill unoptimized draggable={false} onLoad={(event) => { if (event.currentTarget === imageRef.current && event.currentTarget.naturalWidth && event.currentTarget.naturalHeight) setNatural({ naturalWidth: event.currentTarget.naturalWidth, naturalHeight: event.currentTarget.naturalHeight }); }} style={{ filter: colorSupported ? colorFilter(adjust) : undefined }} />
        </div>
        <canvas ref={overlayRef} className={busy ? "absolute inset-0 h-full w-full cursor-wait" : tool === "pan" ? "absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing" : "absolute inset-0 h-full w-full cursor-crosshair"} aria-label="Annotation canvas" onPointerDown={onOverlayPointerDown} onPointerMove={onOverlayPointerMove} onPointerUp={onOverlayPointerEnd} onPointerCancel={onOverlayPointerEnd} onLostPointerCapture={onOverlayPointerEnd} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-xs text-ink-secondary">Crop zoom<Input disabled={busy} type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => { endGestures(); updateCrop({ ...cropState.current, zoom: Number(event.target.value) }); }} /></label>
        <label className="grid gap-1 text-xs text-ink-secondary">Horizontal focus<Input disabled={busy} type="range" min="0" max="100" value={panX} onChange={(event) => { endGestures(); updateCrop({ ...cropState.current, panX: Number(event.target.value) }); }} /></label>
        <label className="grid gap-1 text-xs text-ink-secondary">Vertical focus<Input disabled={busy} type="range" min="0" max="100" value={panY} onChange={(event) => { endGestures(); updateCrop({ ...cropState.current, panY: Number(event.target.value) }); }} /></label>
      </div>
      <div><Button type="button" size="sm" variant="secondary" disabled={busy || (zoom === 1 && panX === 50 && panY === 50)} onClick={() => { endGestures(); updateCrop({ zoom: 1, panX: 50, panY: 50 }); }}>Reset crop</Button></div>
      {colorSupported ? <details className="rounded-control border border-line-subtle px-3 py-2">
        <summary className="cursor-pointer text-xs text-ink-secondary">Touch up colours{isNeutral(adjust) ? "" : " (changed)"}</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(["hue", "saturation", "brightness"] as const).map((key) => (
            <label key={key} className="grid gap-1 text-xs text-ink-secondary">
              {key === "hue" ? "Hue" : key === "saturation" ? "Saturation" : "Brightness"} ({adjust[key]}{ADJUST_LIMITS[key].unit})
              <Input disabled={busy} type="range" min={ADJUST_LIMITS[key].min} max={ADJUST_LIMITS[key].max} step={ADJUST_LIMITS[key].step} value={adjust[key]} onChange={(event) => setAdjust((current) => ({ ...current, [key]: Number(event.target.value) }))} />
            </label>
          ))}
        </div>
        <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => setAdjust(NEUTRAL_ADJUST)} disabled={busy || isNeutral(adjust)}>Reset colours</Button>
      </details> : null}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Pan"><Button type="button" size="sm" aria-pressed={tool === "pan"} disabled={busy} variant={tool === "pan" ? "primary" : "secondary"} onClick={() => { endGestures(); setTool("pan"); }}>Pan</Button></div>
        <div className="flex gap-1" role="group" aria-label="Draw tools">
          {TOOLS.map((option) => (
            <Button key={option.value} type="button" size="sm" aria-pressed={tool === option.value} disabled={busy} variant={tool === option.value ? "primary" : "secondary"} onClick={() => { endGestures(); setTool(option.value); }}>{option.label}</Button>
          ))}
        </div>
        {tool !== "pan" ? <div className="flex gap-1" role="group" aria-label="Annotation color">
          {COLORS.map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`Use color ${value}`}
              aria-pressed={color === value}
              disabled={busy}
              onClick={() => setColor(value)}
              className="grid size-11 place-items-center rounded-full disabled:opacity-50"
            ><span className={color === value ? "size-6 rounded-full ring-2 ring-offset-1 ring-line-focus ring-offset-surface" : "size-6 rounded-full border border-line"} style={{ backgroundColor: value }} /></button>
          ))}
        </div> : null}
      </div>
      <p className="text-xs text-ink-secondary">Drag to move the photo, scroll or pinch to zoom. Pick a drawing tool to mark it up.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="primary" disabled={disabled || !natural} pending={pending} onClick={prepare}>Use prepared image</Button><Button type="button" variant="secondary" onClick={() => { endGestures(); setStrokes((current) => current.slice(0, -1)); }} disabled={!strokes.length || busy}>Undo last stroke</Button><Button type="button" variant="secondary" onClick={() => { endGestures(); setStrokes([]); }} disabled={!strokes.length || busy}>Clear annotations</Button><Button type="button" variant="ghost" onClick={() => pickerRef.current?.click()} disabled={busy}>Choose another</Button></div>
    </>}
    {sizeNote && !error ? <p className="text-xs text-ink-secondary" aria-live="polite">{sizeNote}</p> : null}
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
  </div>;
}
