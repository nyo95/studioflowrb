"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cx } from "../internal/cx";
import { Dialog } from "../layouts/overlays";
import { Button, IconButton, Text } from "../primitives";
import { ZoomableImage } from "./zoomable-image";

export type GalleryImage = { id: string; url: string | null };

export type ImageGalleryProps = {
  images: readonly GalleryImage[];
  /** With it, each thumbnail gets a remove button; what removing means stays with the consumer. */
  onRemove?: (image: GalleryImage) => void;
  removingId?: string | null;
  /** Buttons shown under the large image in the viewer (for example "Save to Ideas"); what they do stays with the consumer. */
  viewerActions?: (image: GalleryImage) => ReactNode;
  /** Accessible name of the list, e.g. "Images". */
  label?: string;
  /**
   * Thumbnails (`sm`, `md`); `fill`: each image as wide as its container, at its own proportions; `album`: a chat
   * album, two columns of square tiles, at most four shown and the fourth saying how many more there are.
   */
  size?: "sm" | "md" | "fill" | "album";
  className?: string;
};

/**
 * Thumbnails that open large in a viewer with Previous/Next (and the arrow keys). The URLs are the consumer's
 * (often short-lived signed links), so plain `<img>` is used: an optimiser would cache a link that soon expires.
 */
export function ImageGallery({ images, onRemove, removingId, viewerActions, label = "Images", size = "md", className }: ImageGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (images.length === 0) return null;
  const open = openIndex !== null ? images[openIndex] ?? null : null;
  const step = (delta: number) => setOpenIndex((index) => (index === null ? null : (index + delta + images.length) % images.length));
  const album = size === "album";
  const fill = size === "fill";
  const box = fill ? "w-full" : album ? "aspect-square w-full" : size === "sm" ? "h-14 w-14" : "h-20 w-20";
  const shown = album ? images.slice(0, 4) : images;
  const more = images.length - shown.length;
  return (
    <>
      <ul className={cx("m-0 list-none p-0", fill ? "grid gap-2" : album ? "grid grid-cols-2 gap-1" : "flex flex-wrap gap-2", className)} aria-label={label}>
        {shown.map((image, index) => (
          <li key={image.id} className="relative">
            <button type="button" onClick={() => setOpenIndex(index)} className={cx("relative block overflow-hidden rounded-control border border-line-subtle bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus", box)} aria-label={more > 0 && index === shown.length - 1 ? `Open image ${index + 1}, ${more} more` : `Open image ${index + 1}`}>
              {image.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.url} alt="" className={fill ? "block h-auto w-full" : "h-full w-full object-cover"} draggable={false} />
              ) : <span className={cx("grid place-items-center text-xs text-ink-secondary", fill ? "h-24" : "h-full")}>Unavailable</span>}
              {more > 0 && index === shown.length - 1 ? <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-ink/85 text-2xl font-semibold text-ink-inverse">+{more}</span> : null}
            </button>
            {onRemove ? (
              <IconButton size="sm" variant="ghost" label={`Remove image ${index + 1}`} icon={<X aria-hidden="true" />} pending={removingId === image.id} onClick={() => onRemove(image)} className="!absolute -right-4 -top-4 !h-11 !min-h-11 !w-11 rounded-full !p-0 !bg-transparent before:absolute before:size-6 before:rounded-full before:border before:border-line before:bg-surface enabled:hover:before:bg-surface-muted [&>span]:relative [&>svg]:relative" />
            ) : null}
          </li>
        ))}
      </ul>
      {open ? (
        <Dialog open onOpenChange={(value) => { if (!value) setOpenIndex(null); }} title={`Image ${openIndex! + 1} of ${images.length}`} size="lg">
          <div className="grid gap-3" tabIndex={-1} onKeyDown={(event) => { if (event.key === "ArrowRight") step(1); if (event.key === "ArrowLeft") step(-1); }}>
            {open.url ? (
              // Zoom to read details (scroll, pinch, +/−, double-click); the picture itself never changes.
              <ZoomableImage key={open.id} src={open.url} alt={`Image ${openIndex! + 1}`} className="h-[min(70vh,720px)] w-full" />
            ) : <Text tone="secondary">This image could not be loaded.</Text>}
            {viewerActions && open.url ? <div className="flex flex-wrap gap-2">{viewerActions(open)}</div> : null}
            {images.length > 1 ? (
              <div className="flex justify-between">
                <Button variant="ghost" leadingIcon={<ChevronLeft className="h-4 w-4" />} onClick={() => step(-1)}>Previous</Button>
                <Button variant="ghost" trailingIcon={<ChevronRight className="h-4 w-4" />} onClick={() => step(1)}>Next</Button>
              </div>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
