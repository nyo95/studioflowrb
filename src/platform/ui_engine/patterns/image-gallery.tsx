"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState } from "react";

import { cx } from "../internal/cx";
import { Dialog } from "../layouts/overlays";
import { Button, IconButton, Text } from "../primitives";

export type GalleryImage = { id: string; url: string | null };

export type ImageGalleryProps = {
  images: readonly GalleryImage[];
  /** With it, each thumbnail gets a remove button; what removing means stays with the consumer. */
  onRemove?: (image: GalleryImage) => void;
  removingId?: string | null;
  /** Accessible name of the list, e.g. "Images". */
  label?: string;
  size?: "sm" | "md";
  className?: string;
};

/**
 * Thumbnails that open large in a viewer with Previous/Next (and the arrow keys). The URLs are the consumer's
 * (often short-lived signed links), so plain `<img>` is used: an optimiser would cache a link that soon expires.
 */
export function ImageGallery({ images, onRemove, removingId, label = "Images", size = "md", className }: ImageGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (images.length === 0) return null;
  const open = openIndex !== null ? images[openIndex] ?? null : null;
  const step = (delta: number) => setOpenIndex((index) => (index === null ? null : (index + delta + images.length) % images.length));
  const box = size === "sm" ? "h-14 w-14" : "h-20 w-20";
  return (
    <>
      <ul className={cx("m-0 flex list-none flex-wrap gap-2 p-0", className)} aria-label={label}>
        {images.map((image, index) => (
          <li key={image.id} className="relative">
            <button type="button" onClick={() => setOpenIndex(index)} className={cx("block overflow-hidden rounded-control border border-line-subtle bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus", box)} aria-label={`Open image ${index + 1}`}>
              {image.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.url} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : <span className="grid h-full place-items-center text-xs text-ink-tertiary">Unavailable</span>}
            </button>
            {onRemove ? (
              <IconButton size="sm" variant="secondary" label={`Remove image ${index + 1}`} icon={<X aria-hidden="true" />} pending={removingId === image.id} onClick={() => onRemove(image)} className="!absolute -right-1.5 -top-1.5 !h-6 !min-h-6 !w-6 rounded-full !p-0" />
            ) : null}
          </li>
        ))}
      </ul>
      {open ? (
        <Dialog open onOpenChange={(value) => { if (!value) setOpenIndex(null); }} title={`Image ${openIndex! + 1} of ${images.length}`} size="lg">
          <div className="grid gap-3" tabIndex={-1} onKeyDown={(event) => { if (event.key === "ArrowRight") step(1); if (event.key === "ArrowLeft") step(-1); }}>
            {open.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={open.url} alt={`Image ${openIndex! + 1}`} className="max-h-[70vh] w-full rounded-control object-contain" />
            ) : <Text tone="tertiary">This image could not be loaded.</Text>}
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
