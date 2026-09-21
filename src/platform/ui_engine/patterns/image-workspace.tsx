"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import Image from "next/image";

import { Button } from "../primitives/actions";
import { Input } from "../primitives/forms";

type Point = { x: number; y: number };

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
  disabled?: boolean;
};

/** Browser image preparation only; storage and consumer policy stay outside. */
export function ImageWorkspace({ label, onPrepared, accept = "image/png,image/jpeg,image/webp", maxBytes = 10 * 1024 * 1024, maxDimension = 1800, outputType = "image/png", outputQuality = 0.86, aspect, disabled = false }: ImageWorkspaceProps) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(50);
  const [panY, setPanY] = useState(50);
  const [paths, setPaths] = useState<Point[][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

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
    context.strokeStyle = "#dc2626";
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const path of paths) {
      if (path.length < 2) continue;
      context.beginPath();
      context.moveTo(path[0].x * rect.width, path[0].y * rect.height);
      for (const point of path.slice(1)) context.lineTo(point.x * rect.width, point.y * rect.height);
      context.stroke();
    }
  }, [paths, previewUrl]);

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
    setZoom(1); setPanX(50); setPanY(50); setPaths([]);
  };

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) };
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
      const scale = Math.min(1, maxDimension / Math.max(cropWidth, cropHeight));
      const width = Math.max(1, Math.round(cropWidth * scale));
      const height = Math.max(1, Math.round(cropHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      if (outputType === "image/jpeg") { context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); }
      context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, width, height);
      context.strokeStyle = "#dc2626"; context.lineWidth = Math.max(2, width / 700); context.lineCap = "round"; context.lineJoin = "round";
      for (const path of paths) {
        if (path.length < 2) continue;
        context.beginPath(); context.moveTo(path[0].x * width, path[0].y * height);
        for (const point of path.slice(1)) context.lineTo(point.x * width, point.y * height);
        context.stroke();
      }
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Image preparation failed")), outputType, outputQuality));
      if (blob.size > maxBytes) throw new Error("Prepared image is too large");
      const extension = outputType === "image/jpeg" ? "jpg" : "png";
      await onPrepared(new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "image"}.${extension}`, { type: outputType }));
    } catch {
      setError("The image could not be prepared. Try a smaller image.");
    } finally { setPending(false); }
  };

  return <div className="grid gap-3 rounded-control border border-line p-3" aria-label={label}>
    <input ref={pickerRef} className="sr-only" type="file" accept={accept} disabled={disabled || pending} onChange={(event) => { select(event.target.files?.[0]); event.target.value = ""; }} />
    {!previewUrl ? <Button type="button" variant="secondary" onClick={() => pickerRef.current?.click()} disabled={disabled}>Choose image</Button> : <>
      <div className={aspect ? "relative overflow-hidden rounded-control border border-line bg-surface-muted touch-none" : "relative aspect-video overflow-hidden rounded-control border border-line bg-surface-muted touch-none"} style={aspect ? { aspectRatio: String(aspect) } : undefined}>
        <Image ref={imageRef} src={previewUrl} alt="Image preview" fill unoptimized className="object-cover" style={{ transform: `scale(${zoom})`, transformOrigin: `${panX}% ${panY}%` }} />
        <canvas ref={overlayRef} className="absolute inset-0 h-full w-full cursor-crosshair" aria-label="Annotation canvas" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const point = pointFromEvent(event); setDrawing(true); setPaths((current) => [...current, [point]]); }} onPointerMove={(event) => { if (!drawing) return; const point = pointFromEvent(event); setPaths((current) => current.map((path, index) => index === current.length - 1 ? [...path, point] : path)); }} onPointerUp={() => setDrawing(false)} onPointerCancel={() => setDrawing(false)} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-xs text-ink-secondary">Crop zoom<Input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        <label className="grid gap-1 text-xs text-ink-secondary">Horizontal focus<Input type="range" min="0" max="100" value={panX} onChange={(event) => setPanX(Number(event.target.value))} /></label>
        <label className="grid gap-1 text-xs text-ink-secondary">Vertical focus<Input type="range" min="0" max="100" value={panY} onChange={(event) => setPanY(Number(event.target.value))} /></label>
      </div>
      <p className="text-xs text-ink-tertiary">Drag on the preview to annotate. Zoom and focus define the saved crop.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="primary" pending={pending} onClick={prepare}>Use prepared image</Button><Button type="button" variant="secondary" onClick={() => setPaths([])} disabled={!paths.length || pending}>Clear annotations</Button><Button type="button" variant="ghost" onClick={() => pickerRef.current?.click()} disabled={pending}>Choose another</Button></div>
    </>}
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
  </div>;
}
