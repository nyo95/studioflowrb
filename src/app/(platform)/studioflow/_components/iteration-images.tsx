"use client";

import { ChevronLeft, ChevronRight, ImagePlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from "react";

import { Button, Dialog, IconButton, InlineError, Text, shrinkImageFile, useConfirm } from "@/platform/ui_engine";

import { addIterationImageAction, removeIterationImageAction } from "../actions";

export type IterationImage = { id: string; url: string | null; contentType: string; bytes: number };

/** Mirrors the server limits (WO-SF-NOTE-IMG-01); the server stays the authority. */
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_IMAGES = 12;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

/** Thumbnails that open large; with `onRemove`, each has a remove button. */
export function IterationImageList({ images, onRemove, removingId }: { images: readonly IterationImage[]; onRemove?: (image: IterationImage) => void; removingId?: string | null }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (images.length === 0) return null;
  const open = openIndex !== null ? images[openIndex] ?? null : null;
  const step = (delta: number) => setOpenIndex((index) => (index === null ? null : (index + delta + images.length) % images.length));
  return (
    <>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Images">
        {images.map((image, index) => (
          <li key={image.id} className="relative">
            <button type="button" onClick={() => setOpenIndex(index)} className="block h-20 w-20 overflow-hidden rounded-control border border-line-subtle bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus" aria-label={`Open image ${index + 1}`}>
              {image.url ? (
                // Signed private URLs are short-lived; next/image optimisation would cache them.
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
          <div
            className="grid gap-3"
            tabIndex={-1}
            onKeyDown={(event) => { if (event.key === "ArrowRight") step(1); if (event.key === "ArrowLeft") step(-1); }}
          >
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

/**
 * Client notes plus their images (owner, 2026-10-07: drag, paste or pick). Wraps the notes editor: dropping or
 * pasting an image anywhere in it, or using "Add images", uploads straight away (images are not part of the
 * Save of the notes, and are not undoable). Large photos are shrunk to the 3 MB limit first.
 */
export function IterationImageArea({ projectId, phaseId, iterationId, images, disabled = false, children }: { projectId: string; phaseId: string; iterationId: string; images: readonly IterationImage[]; disabled?: boolean; children: ReactNode }) {
  const router = useRouter();
  const confirm = useConfirm();
  const pickerRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const room = MAX_IMAGES - images.length - uploading;

  const upload = async (files: File[]) => {
    const accepted = files.filter((file) => ACCEPTED.includes(file.type));
    const problems: string[] = [];
    if (accepted.length < files.length) problems.push("Only PNG, JPEG or WebP images can be added.");
    const batch = accepted.slice(0, Math.max(0, room));
    if (accepted.length > batch.length) problems.push(`An iteration holds at most ${MAX_IMAGES} images.`);
    setErrors(problems);
    if (batch.length === 0) return;
    setUploading((count) => count + batch.length);
    // One at a time keeps the order the person chose and stays under the request size limit.
    for (const file of batch) {
      try {
        const prepared = await shrinkImageFile(file, { maxBytes: MAX_BYTES });
        const form = new FormData();
        form.set("projectId", projectId);
        form.set("phaseId", phaseId);
        form.set("iterationId", iterationId);
        form.set("file", prepared);
        const result = await addIterationImageAction(form);
        if (!result.ok) problems.push(result.error.safeMessage);
      } catch {
        problems.push(`${file.name || "An image"} could not be prepared.`);
      } finally {
        setUploading((count) => count - 1);
      }
    }
    setErrors([...problems]);
    router.refresh();
  };

  const remove = async (image: IterationImage) => {
    const ok = await confirm.confirm({ title: "Remove this image?", description: "It is removed from these client notes. This cannot be undone.", confirmLabel: "Remove image", tone: "danger" });
    if (!ok) return;
    setRemovingId(image.id);
    const result = await removeIterationImageAction({ projectId, phaseId, imageId: image.id });
    setRemovingId(null);
    if (!result.ok) setErrors([result.error.safeMessage]);
    router.refresh();
  };

  const filesOf = (list: DataTransferItemList | FileList | null) => {
    if (!list) return [];
    if ("length" in list && list instanceof FileList) return Array.from(list);
    return Array.from(list as DataTransferItemList).filter((item) => item.kind === "file").map((item) => item.getAsFile()).filter((file): file is File => file !== null);
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const files = filesOf(event.clipboardData.items).filter((file) => file.type.startsWith("image/"));
    // Only a pasted image is taken over; pasted text goes into the notes as usual.
    if (files.length === 0) return;
    event.preventDefault();
    void upload(files);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    setDragging(false);
    void upload(filesOf(event.dataTransfer.files));
  };

  return (
    <div
      className={`grid gap-2 rounded-control ${dragging ? "outline-2 outline-dashed outline-offset-4 outline-line-focus" : ""}`}
      onPaste={onPaste}
      onDragOver={(event) => { if (!disabled && Array.from(event.dataTransfer.types).includes("Files")) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={onDrop}
    >
      {children}
      <IterationImageList images={images} onRemove={disabled ? undefined : (image) => void remove(image)} removingId={removingId} />
      {disabled ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" leadingIcon={<ImagePlus className="h-3.5 w-3.5" />} disabled={room <= 0} pending={uploading > 0} onClick={() => pickerRef.current?.click()}>
            {uploading > 0 ? `Adding ${uploading}…` : "Add images"}
          </Button>
          <Text size="sm" tone="tertiary">{room <= 0 ? `${MAX_IMAGES} images is the limit.` : "Or drop them here, or paste a screenshot (Ctrl+V)."}</Text>
          <input ref={pickerRef} type="file" accept={ACCEPTED.join(",")} multiple hidden onChange={(event) => { const files = filesOf(event.target.files); event.target.value = ""; void upload(files); }} />
        </div>
      )}
      {errors.length > 0 ? <InlineError>{errors.join(" ")}</InlineError> : null}
      {confirm.dialog}
    </div>
  );
}
