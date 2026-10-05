"use client";

import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import Image from "next/image";

import { Button } from "../primitives/actions";
import { Input } from "../primitives/forms";
import { ADJUST_LIMITS, colorFilter, compressionSteps, formatSize, isNeutral, NEUTRAL_ADJUST, type ColorAdjust } from "./image-adjust";

type Point = { x: number; y: number };
type DrawTool = "pen" | "arrow" | "rect" | "ellipse";
type Tool = DrawTool | "pan";
type Stroke = { tool: DrawTool; color: string; points: Point[] };

const TOOLS: { value: Tool; label: string }[] = [
  { value: "pen", label: "Pen" },
  { value: "arrow", label: "Arrow" },
  { value: "rect", label: "Box" },
  { value: "ellipse", label: "Circle" },
  { value: "pan", label: "Pan" },
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
  disabled?: boolean;
};

const DEFAULT_TARGET_BYTES = 1.5 * 1024 * 1024;

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
export function ImageWorkspace({ label, onPrepared, accept = "image/png,image/jpeg,image/webp", maxBytes = 30 * 1024 * 1024, maxDimension = 1800, outputType = "image/png", outputQuality = 0.86, aspect, targetBytes = DEFAULT_TARGET_BYTES, disabled = false, openOnMount = false }: ImageWorkspaceProps) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const opened = useRef(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const panState = useRef<{ pointerId: number; startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(50);
  const [panY, setPanY] = useState(50);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjust, setAdjust] = useState<ColorAdjust>(NEUTRAL_ADJUST);
  const [sizeNote, setSizeNote] = useState<string | null>(null);
  // Read once on the client; the controls only render after an image is chosen, so there is no server markup to disagree with.
  const [colorSupported] = useState(canBakeColorFilter);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    if (!openOnMount || disabled || opened.current) return;
    opened.current = true;
    pickerRef.current?.click();
  }, [openOnMount, disabled]);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    context.scale(ratio, ratio);
    context.clearRect(0, 0, rect.width, rect.height);
    drawStrokes(context, strokes, rect.width, rect.height, 2);
  }, [strokes, previewUrl]);

  const select = (selected: File | undefined) => {
    if (!selected) return;
    setError(null);
    if (!accept.split(",").map((value) => value.trim()).includes(selected.type)) {
      setError("Use a supported image format.");
      return;
    }
    if (selected.size === 0 || selected.size > maxBytes) {
      setError(`Choose a non-empty image no larger than ${Math.ceil(maxBytes / 1024 / 1024)} MB.`);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setZoom(1); setPanX(50); setPanY(50); setStrokes([]); setAdjust(NEUTRAL_ADJUST); setSizeNote(null);
  };

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  };

  const prepare = async () => {
    const image = imageRef.current;
    if (!file || !image?.naturalWidth || !image.naturalHeight) return;
    setPending(true); setError(null);
    try {
      let baseWidth = image.naturalWidth;
      let baseHeight = image.naturalHeight;
      if (aspect && aspect > 0) {
        if (baseWidth / baseHeight > aspect) baseWidth = baseHeight * aspect;
        else baseHeight = baseWidth / aspect;
      }
      const cropWidth = baseWidth / zoom;
      const cropHeight = baseHeight / zoom;
      const sourceX = (image.naturalWidth - cropWidth) * (panX / 100);
      const sourceY = (image.naturalHeight - cropHeight) * (panY / 100);
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
    } finally { setPending(false); }
  };

  const onOverlayPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (tool === "pan") {
      event.currentTarget.setPointerCapture(event.pointerId);
      panState.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startPanX: panX, startPanY: panY };
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    setDrawing(true);
    setStrokes((current) => [...current, { tool, color, points: [point] }]);
  };
  const onOverlayPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const pan = panState.current;
    if (pan && pan.pointerId === event.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect();
      const dx = ((event.clientX - pan.startX) / rect.width) * -100;
      const dy = ((event.clientY - pan.startY) / rect.height) * -100;
      setPanX(clamp(pan.startPanX + dx, 0, 100));
      setPanY(clamp(pan.startPanY + dy, 0, 100));
      return;
    }
    if (!drawing) return;
    const point = pointFromEvent(event);
    setStrokes((current) => current.map((stroke, index) => {
      if (index !== current.length - 1) return stroke;
      // Pen accumulates every point; shape tools only ever need a start/end pair.
      return stroke.tool === "pen" ? { ...stroke, points: [...stroke.points, point] } : { ...stroke, points: [stroke.points[0], point] };
    }));
  };
  const onOverlayPointerUp = () => { setDrawing(false); panState.current = null; };

  // Scroll-to-zoom on the preview itself; sliders remain for keyboard/precise control.
  const onWheelZoom = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((current) => clamp(current - event.deltaY / 500, 1, 3));
  };

  return <div className="grid gap-3 rounded-control shadow-plane p-3" aria-label={label}>
    <input ref={pickerRef} className="sr-only" type="file" accept={accept} disabled={disabled || pending} onChange={(event) => { select(event.target.files?.[0]); event.target.value = ""; }} />
    {!previewUrl ? <Button type="button" variant="secondary" onClick={() => pickerRef.current?.click()} disabled={disabled}>Choose image</Button> : <>
      <div
        className={aspect ? "relative overflow-hidden rounded-control border border-line bg-surface-muted touch-none" : "relative aspect-video overflow-hidden rounded-control border border-line bg-surface-muted touch-none"}
        style={aspect ? { aspectRatio: String(aspect) } : undefined}
        onWheel={onWheelZoom}
      >
        <Image ref={imageRef} src={previewUrl} alt="Image preview" fill unoptimized className="object-cover" style={{ transform: `scale(${zoom})`, transformOrigin: `${panX}% ${panY}%`, filter: colorSupported ? colorFilter(adjust) : undefined }} />
        <canvas ref={overlayRef} className={tool === "pan" ? "absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing" : "absolute inset-0 h-full w-full cursor-crosshair"} aria-label="Annotation canvas" onPointerDown={onOverlayPointerDown} onPointerMove={onOverlayPointerMove} onPointerUp={onOverlayPointerUp} onPointerCancel={onOverlayPointerUp} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-xs text-ink-secondary">Crop zoom<Input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        <label className="grid gap-1 text-xs text-ink-secondary">Horizontal focus<Input type="range" min="0" max="100" value={panX} onChange={(event) => setPanX(Number(event.target.value))} /></label>
        <label className="grid gap-1 text-xs text-ink-secondary">Vertical focus<Input type="range" min="0" max="100" value={panY} onChange={(event) => setPanY(Number(event.target.value))} /></label>
      </div>
      {colorSupported ? <details className="rounded-control border border-line-subtle px-3 py-2">
        <summary className="cursor-pointer text-xs text-ink-secondary">Touch up colours{isNeutral(adjust) ? "" : " (changed)"}</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(["hue", "saturation", "brightness"] as const).map((key) => (
            <label key={key} className="grid gap-1 text-xs text-ink-secondary">
              {key === "hue" ? "Hue" : key === "saturation" ? "Saturation" : "Brightness"} ({adjust[key]}{ADJUST_LIMITS[key].unit})
              <Input type="range" min={ADJUST_LIMITS[key].min} max={ADJUST_LIMITS[key].max} step={ADJUST_LIMITS[key].step} value={adjust[key]} onChange={(event) => setAdjust((current) => ({ ...current, [key]: Number(event.target.value) }))} />
            </label>
          ))}
        </div>
        <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => setAdjust(NEUTRAL_ADJUST)} disabled={isNeutral(adjust)}>Reset colours</Button>
      </details> : null}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="group" aria-label="Annotation tool">
          {TOOLS.map((option) => (
            <Button key={option.value} type="button" size="sm" variant={tool === option.value ? "primary" : "secondary"} onClick={() => setTool(option.value)}>{option.label}</Button>
          ))}
        </div>
        {tool !== "pan" ? <div className="flex gap-1" role="group" aria-label="Annotation color">
          {COLORS.map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`Use color ${value}`}
              aria-pressed={color === value}
              onClick={() => setColor(value)}
              className={color === value ? "h-6 w-6 rounded-full ring-2 ring-offset-1 ring-line-focus" : "h-6 w-6 rounded-full border border-line"}
              style={{ backgroundColor: value }}
            />
          ))}
        </div> : null}
      </div>
      <p className="text-xs text-ink-tertiary">Scroll to zoom. Pick Pan to drag the preview, or draw with the other tools.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="primary" pending={pending} onClick={prepare}>Use prepared image</Button><Button type="button" variant="secondary" onClick={() => setStrokes([])} disabled={!strokes.length || pending}>Clear annotations</Button><Button type="button" variant="ghost" onClick={() => pickerRef.current?.click()} disabled={pending}>Choose another</Button></div>
    </>}
    {sizeNote && !error ? <p className="text-xs text-ink-secondary" aria-live="polite">{sizeNote}</p> : null}
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
  </div>;
}
