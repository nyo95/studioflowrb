"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { cx } from "../internal/cx";
import { IconButton } from "../primitives";
import { fitSize, initialView, MAX_VIEW_ZOOM, MIN_VIEW_ZOOM, panBy, pinchView, toPicture, zoomAround, type FramePoint, type Size, type ZoomView } from "./zoom-pan";

export type DrawHandlers = {
  /** A point as a fraction (0–1) of the picture. */
  start: (at: FramePoint) => void;
  move: (at: FramePoint) => void;
  end: () => void;
  /** A second finger arrived: the stroke the first one began is not a stroke. */
  cancel: () => void;
};

/**
 * A picture in a fixed frame that zooms (wheel at the cursor, pinch, +/−, double-click, keys) and pans (drag) without
 * changing the picture. With `draw`, one pointer marks instead of panning and `overlay` is laid exactly over the
 * picture at every zoom, so marks stay on the same spot of it.
 */
export function ZoomableImage({ src, alt, className, draw, overlay, onContent }: {
  src: string;
  alt: string;
  className?: string;
  draw?: DrawHandlers | null;
  overlay?: (content: Size, view: ZoomView) => ReactNode;
  onContent?: (natural: Size) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<Size>({ width: 0, height: 0 });
  const [natural, setNatural] = useState<Size>({ width: 0, height: 0 });
  const content = fitSize(natural, frame);
  const [view, setView] = useState<ZoomView>({ zoom: 1, x: 0, y: 0 });
  const live = useRef({ view, content, frame });
  useEffect(() => { live.current = { view, content, frame }; });
  const pointers = useRef(new Map<number, FramePoint>());
  const drawing = useRef<number | null>(null);

  // The frame follows its box; a new size or picture starts fitted again.
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const measure = () => setFrame((current) => (current.width === element.clientWidth && current.height === element.clientHeight ? current : { width: element.clientWidth, height: element.clientHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const contentKey = `${content.width}x${content.height}`;
  useEffect(() => { setView(initialView(live.current.content, live.current.frame)); }, [contentKey]);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = frameRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const update = (next: (current: ZoomView) => ZoomView) => setView((current) => next(current));
  const zoomBy = (factor: number, at?: FramePoint) => update((current) => zoomAround(current, at ?? { x: frame.width / 2, y: frame.height / 2 }, current.zoom * factor, content, frame));

  // Wheel zoom needs a non-passive listener so the page does not scroll as well.
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { content: c, frame: f } = live.current;
      const rect = element.getBoundingClientRect();
      const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setView((current) => zoomAround(current, at, current.zoom * (event.deltaY > 0 ? 0.87 : 1.15), c, f));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = local(event);
    pointers.current.set(event.pointerId, at);
    if (pointers.current.size > 1) {
      if (drawing.current !== null) { draw?.cancel(); drawing.current = null; }
      return;
    }
    if (draw) { drawing.current = event.pointerId; draw.start(toPicture(view, at, content)); }
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const at = local(event);
    const before = [...pointers.current.values()].slice(0, 2);
    pointers.current.set(event.pointerId, at);
    if (pointers.current.size > 1) {
      const after = [...pointers.current.values()].slice(0, 2);
      update((current) => pinchView(current, [before[0]!, before[1]!], [after[0]!, after[1]!], content, frame));
      return;
    }
    if (drawing.current === event.pointerId && draw) { draw.move(toPicture(view, at, content)); return; }
    if (!draw) update((current) => panBy(current, { x: at.x - previous.x, y: at.y - previous.y }, content, frame));
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (drawing.current === event.pointerId) { drawing.current = null; draw?.end(); }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomBy(1.25); }
    else if (event.key === "-") { event.preventDefault(); zoomBy(0.8); }
    else if (event.key === "0") { event.preventDefault(); setView(initialView(content, frame)); }
    else if (view.zoom > 1 && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const step = 60;
      update((current) => panBy(current, { x: event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0, y: event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0 }, content, frame));
    }
  };

  return (
    <div
      ref={frameRef}
      tabIndex={0}
      role="group"
      aria-label={`${alt}. Scroll, pinch or press + and − to zoom; drag${draw ? " with Pan" : ""} to move.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onDoubleClick={(event) => { if (draw || (event.target as HTMLElement).closest("button")) return; if (view.zoom > 1.01) setView(initialView(content, frame)); else zoomBy(2.5, local(event)); }}
      onKeyDown={onKeyDown}
      className={cx("relative touch-none select-none overflow-hidden rounded-control bg-surface-muted outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus", draw ? "cursor-crosshair" : view.zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in", className)}
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: content.width, height: content.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- consumer URLs are often short-lived signed links */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="block h-full w-full"
          onLoad={(event) => { const size = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }; setNatural(size); onContent?.(size); }}
        />
        {overlay && content.width > 0 ? overlay(content, view) : null}
      </div>
      <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-control bg-surface p-0.5 shadow-float">
        <IconButton size="sm" variant="ghost" label="Zoom out" icon={<Minus aria-hidden="true" />} disabled={view.zoom <= MIN_VIEW_ZOOM} onClick={() => zoomBy(0.8)} />
        <span className="min-w-11 text-center text-xs tabular-nums text-ink-secondary" aria-live="polite">{Math.round(view.zoom * 100)}%</span>
        <IconButton size="sm" variant="ghost" label="Zoom in" icon={<Plus aria-hidden="true" />} disabled={view.zoom >= MAX_VIEW_ZOOM} onClick={() => zoomBy(1.25)} />
        <IconButton size="sm" variant="ghost" label="Fit to frame" icon={<Maximize2 aria-hidden="true" />} disabled={view.zoom <= MIN_VIEW_ZOOM} onClick={() => setView(initialView(content, frame))} />
      </div>
    </div>
  );
}
