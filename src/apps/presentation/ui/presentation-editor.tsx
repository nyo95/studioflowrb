"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type DragEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent } from "react";

import { ArrowDown, ArrowLeft, ArrowUp, FileDown, ImagePlus, Plus, Trash2 } from "lucide-react";
import { Button, Field, InlineError, Input, Select, Textarea, shrinkImageFile, useConfirm } from "@/platform/ui_engine";
import type { ActionResult } from "@platform/core/actions";
import { PRESENTATION_ROUTES } from "../public";
import { LAYOUT_SPECS, PRESENTATION_LAYOUTS, layoutSpec, type PresentationLayout } from "../layouts";
import { SlideGrid, SlideImageBox, numberPins, type FrameImage } from "./slide-frame";
import { isPinDrag, nudgePin, pinAtPoint, type ClientPoint, type PinFrame, type PinPosition } from "./pin-geometry";
import { boardConfirmation, imageConfirmation, pinConfirmation, slideConfirmation } from "./destructive-confirmation";

import {
  addPresentationAnnotationAction, addPresentationSlideAction, addPresentationSlidesAction, deletePresentationAnnotationAction, deletePresentationBoardAction,
  deletePresentationSlideAction, movePresentationImageAction, placePresentationImageAction, removePresentationImageAction, reorderPresentationSlidesAction,
  updatePresentationAnnotationAction, updatePresentationBoardAction, updatePresentationImageAction, updatePresentationSlideAction,
} from "../actions";

type Annotation = { id: string; pinX: number; pinY: number; scheduleEntryId: string | null; labelSide: "auto" | "left" | "right"; note: string | null; scheduleEntry: { code: string; productName: string | null } | null };
type SlideImage = { id: string; slot: number; imageUrl: string | null; imageRatio: number | null; fit: "cover" | "contain"; focusX: number; focusY: number; annotations: Annotation[] };
type Slide = { id: string; layout: PresentationLayout; title: string | null; caption: string | null; images: SlideImage[] };
type Board = { id: string; title: string; slides: Slide[] };
type ScheduleEntry = { id: string; code: string; productName: string | null };

/** Mirrors the server limit for a slide image; the server stays the authority. */
const SLIDE_IMAGE_BYTES = 3 * 1024 * 1024;
const MOVE_TYPE = "application/x-presentation-image";
const LAYOUT_LABELS: Record<PresentationLayout, string> = {
  one: "1 image", "two-side": "2 side by side", "two-stack": "2 stacked", "one-two": "1 large + 2 small", three: "3 in a row", four: "Grid 4",
};
type PinDrag = { pinId: string; pointerId: number; frame: PinFrame; start: ClientPoint; position: PinPosition; moved: boolean; target: HTMLButtonElement };
type PinKeys = { pinId: string; position: PinPosition; timer: ReturnType<typeof setTimeout> };

async function prepare(file: File): Promise<{ file: File; ratio: number | null }> {
  // A larger image is shrunk here (as on the Ideas board) so a phone photo or a big render still fits the 3 MB limit.
  const shrunk = await shrinkImageFile(file, { maxBytes: SLIDE_IMAGE_BYTES });
  try { const bitmap = await createImageBitmap(shrunk); const ratio = bitmap.width / bitmap.height; bitmap.close(); return { file: shrunk, ratio }; } catch { return { file: shrunk, ratio: null }; }
}

/** A layout as a small drawing of its boxes. */
function LayoutGlyph({ layout, width = 38, height = 27 }: { layout: PresentationLayout; width?: number; height?: number }) {
  const spec = LAYOUT_SPECS[layout];
  return (
    <span aria-hidden="true" className="grid gap-[2px]" style={{ width, height, gridTemplateColumns: spec.columns, gridTemplateRows: spec.rows }}>
      {spec.boxes.map((box, index) => <span key={index} className="rounded-[1.5px] bg-current" style={{ gridColumn: box.column, gridRow: box.row }} />)}
    </span>
  );
}

/**
 * The board editor (owner 2026-10-14, "mini PowerPoint", option A): slides on the left, the chosen slide in its layout in
 * the middle, the chosen image (or pin) on the right. Drop or pick an image into a box, drag an image onto another box to
 * move it, click a chosen image to put a pin on it.
 */
export function PresentationEditor({ projectId, board, scheduleEntries, canEdit }: { projectId: string; board: Board; scheduleEntries: ScheduleEntry[]; canEdit: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const operation = useRef(false);
  const pinDrag = useRef<PinDrag | null>(null);
  const pinKeys = useRef<PinKeys | null>(null);
  const suppressClick = useRef(false);
  const previews = useRef<Record<string, PinPosition>>({});
  const [previewPins, setPreviewPins] = useState<Record<string, PinPosition>>({});
  const [pinMoving, setPinMoving] = useState(false);
  const newSlidesInput = useRef<HTMLInputElement>(null);
  const boxInput = useRef<HTMLInputElement>(null);
  const boxTarget = useRef<number>(0);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(board.slides[0]?.id ?? null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const [title, setTitle] = useState(board.title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const busy = pending || confirming;
  const locked = busy || pinMoving;
  const active = board.slides.find((slide) => slide.id === activeSlideId) ?? board.slides[0] ?? null;
  const selectedImage = active?.images.find((image) => image.id === selectedImageId) ?? null;
  const selectedPin = active?.images.flatMap((image) => image.annotations).find((annotation) => annotation.id === selectedPinId) ?? null;
  const pinNumbers = active ? numberPins(active.images) : new Map<string, number>();

  /** Runs an action, shows its refusal, refreshes on success. */
  const act = <T,>(work: () => Promise<ActionResult<T> | undefined>, options: { after?: (data: T) => void; settled?: () => void; refresh?: boolean } = {}) => {
    if (!canEdit || operation.current || pinDrag.current || pinKeys.current) return;
    operation.current = true;
    startTransition(async () => {
      setError(null);
      try {
        const result = await work();
        if (!result) return; // A cancelled confirmation or empty file picker does no work.
        if (!result.ok) { setError(result.error.safeMessage); return; }
        options.after?.(result.data);
        if (options.refresh !== false) router.refresh();
      } catch { setError("The change could not be saved. Please try again."); }
      finally { options.settled?.(); operation.current = false; }
    });
  };
  // Open the dialog outside a transition: its rendering must not await the action it confirms.
  const askDestructive = async (request: ReturnType<typeof imageConfirmation>) => {
    if (!canEdit || operation.current || pinDrag.current || pinKeys.current) return false;
    operation.current = true; setConfirming(true); setError(null);
    try { return await confirm.confirm({ ...request, tone: "danger" }); }
    finally { operation.current = false; setConfirming(false); }
  };
  const destructive = async (request: ReturnType<typeof imageConfirmation>, work: () => Promise<ActionResult<unknown>>, after?: () => void, refresh = true) => {
    if (await askDestructive(request)) act(work, { after, refresh });
  };
  const choose = (slideId: string) => { if (operation.current || pinDrag.current || pinKeys.current) return; setActiveSlideId(slideId); setSelectedImageId(null); setSelectedPinId(null); };

  const preview = (pinId: string, position: PinPosition | null) => {
    const next = { ...previews.current };
    if (position) next[pinId] = position;
    else delete next[pinId];
    previews.current = next; setPreviewPins(next);
  };
  const suppressTrailingClick = () => { suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 0); };
  const releasePin = (drag: PinDrag) => { if (drag.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId); };
  const cancelPinMovement = () => {
    const drag = pinDrag.current;
    const keys = pinKeys.current;
    pinDrag.current = null; pinKeys.current = null;
    if (keys) { clearTimeout(keys.timer); preview(keys.pinId, null); }
    if (drag) { preview(drag.pinId, null); releasePin(drag); }
    setPinMoving(false); suppressTrailingClick();
  };
  useEffect(() => () => {
    if (pinKeys.current) clearTimeout(pinKeys.current.timer);
    const drag = pinDrag.current;
    pinDrag.current = null; pinKeys.current = null;
    if (drag && drag.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
  }, []);

  const savePinPosition = (pinId: string, position: PinPosition) => act(
    () => updatePresentationAnnotationAction({ projectId, annotationId: pinId, ...position }),
    { settled: () => preview(pinId, null) },
  );
  const startPin = (event: PointerEvent<HTMLButtonElement>, pinId: string, frame: PinFrame, imageId: string) => {
    event.preventDefault(); event.stopPropagation();
    if (!canEdit || operation.current || pinDrag.current || pinKeys.current || event.button !== 0 || !event.isPrimary) return;
    const point = { x: event.clientX, y: event.clientY };
    const position = pinAtPoint(point, frame);
    if (!position) return;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    pinDrag.current = { pinId, pointerId: event.pointerId, frame, start: point, position, moved: false, target: event.currentTarget };
    setSelectedImageId(imageId); setSelectedPinId(pinId); setPinMoving(true);
  };
  const movePin = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = pinDrag.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const point = { x: event.clientX, y: event.clientY };
    drag.moved ||= isPinDrag(drag.start, point);
    const position = pinAtPoint(point, drag.frame);
    if (drag.moved && position) { drag.position = position; preview(drag.pinId, position); }
  };
  const endPin = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = pinDrag.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    movePin(event);
    pinDrag.current = null;
    releasePin(drag); setPinMoving(false); suppressTrailingClick();
    if (drag.moved) savePinPosition(drag.pinId, drag.position);
  };
  const cancelPointer = (event: PointerEvent<HTMLButtonElement>) => {
    if (pinDrag.current?.pointerId === event.pointerId) { event.stopPropagation(); cancelPinMovement(); }
  };
  const keyPin = (event: KeyboardEvent<HTMLButtonElement>, pinId: string, stored: PinPosition) => {
    if (!canEdit || selectedPinId !== pinId || operation.current || pinDrag.current || (pinKeys.current && pinKeys.current.pinId !== pinId)) return;
    const before = previews.current[pinId] ?? stored;
    const next = nudgePin(before, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault(); event.stopPropagation();
    if (next.pinX === before.pinX && next.pinY === before.pinY) return;
    if (pinKeys.current) clearTimeout(pinKeys.current.timer);
    preview(pinId, next); setPinMoving(true);
    const timer = setTimeout(() => {
      pinKeys.current = null; setPinMoving(false);
      savePinPosition(pinId, next);
    }, 400);
    pinKeys.current = { pinId, position: next, timer };
  };

  const addNewSlides = () => act(async () => {
    const files = newSlidesInput.current?.files;
    if (!files?.length) return;
    try {
      const form = new FormData(); form.set("projectId", projectId); form.set("boardId", board.id);
      for (const file of files) { const prepared = await prepare(file); form.append("files", prepared.file); form.append("ratios", prepared.ratio ? String(prepared.ratio) : ""); }
      return await addPresentationSlidesAction(form);
    } finally { if (newSlidesInput.current) newSlidesInput.current.value = ""; }
  });
  const place = async (slot: number, file: File) => {
    if (!active) return;
    const previous = active.images.find((image) => image.slot === slot);
    if (previous && !(await askDestructive(imageConfirmation(previous, true)))) return;
    act(async () => {
      const prepared = await prepare(file);
      const form = new FormData(); form.set("projectId", projectId); form.set("slideId", active.id); form.set("slot", String(slot)); form.set("file", prepared.file);
      if (prepared.ratio) form.set("imageRatio", String(prepared.ratio));
      return placePresentationImageAction(form);
    }, { after: () => setSelectedPinId(null) });
  };
  const pickForBox = (slot: number) => { boxTarget.current = slot; boxInput.current?.click(); };
  const onBoxInput = () => { const file = boxInput.current?.files?.[0]; if (file) place(boxTarget.current, file); if (boxInput.current) boxInput.current.value = ""; };

  const onBoxDrop = (slot: number) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropSlot(null);
    if (!canEdit || !active || operation.current || pinDrag.current || pinKeys.current) return;
    const moving = event.dataTransfer.getData(MOVE_TYPE);
    if (moving) { act(() => movePresentationImageAction({ projectId, imageId: moving, slot })); return; }
    const file = [...event.dataTransfer.files].find((candidate) => candidate.type.startsWith("image/"));
    if (file) place(slot, file);
  };
  const onImageClick = (event: ReactMouseEvent<HTMLDivElement>, image: FrameImage) => {
    if (suppressClick.current || operation.current || pinDrag.current || pinKeys.current) { event.preventDefault(); event.stopPropagation(); return; }
    // The first click chooses the image; a click on the chosen image puts a pin there.
    if (selectedImageId !== image.id || !canEdit) { setSelectedImageId(image.id); setSelectedPinId(null); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const pinX = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const pinY = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    act(() => addPresentationAnnotationAction({ projectId, imageId: image.id, pinX, pinY }), { after: (data) => setSelectedPinId(data.annotationId) });
  };
  const reorder = (direction: -1 | 1) => {
    if (!active) return; const index = board.slides.findIndex((slide) => slide.id === active.id); const next = index + direction; if (next < 0 || next >= board.slides.length) return;
    const ids = board.slides.map((slide) => slide.id); [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    act(() => reorderPresentationSlidesAction({ projectId, boardId: board.id, orderedIds: ids }));
  };
  const saveAnnotation = (form: FormData) => {
    if (!selectedPin) return;
    act(() => updatePresentationAnnotationAction({ projectId, annotationId: selectedPin.id, scheduleEntryId: (form.get("scheduleEntryId") as string) || null, labelSide: form.get("labelSide") as "auto" | "left" | "right", note: (form.get("note") as string) || null }));
  };

  const pinClass = "grid size-7 place-items-center rounded-full bg-action text-xs font-bold text-action-ink shadow";

  return <div className="grid gap-4" onKeyDownCapture={(event) => { if (event.key === "Escape" && (pinDrag.current || pinKeys.current)) { event.preventDefault(); event.stopPropagation(); cancelPinMovement(); } }}>
    <div className="flex flex-wrap items-center gap-2">
      <Link href={PRESENTATION_ROUTES.project(projectId)} className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:underline"><ArrowLeft size={16} /> Back to Presentation</Link>
      <div className="ml-auto flex flex-wrap gap-2">
        {canEdit ? <>
          <Button variant="secondary" pending={busy} disabled={pinMoving} onClick={() => act(() => addPresentationSlideAction({ projectId, boardId: board.id, layout: "one-two" }))}><Plus size={16} /> New slide</Button>
          <input ref={newSlidesInput} type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={locked} className="sr-only" onChange={addNewSlides} />
          <Button variant="secondary" pending={busy} disabled={pinMoving} onClick={() => newSlidesInput.current?.click()}><ImagePlus size={16} /> Images → new slides</Button>
        </> : null}
        <Link href={PRESENTATION_ROUTES.print(projectId, board.id)} target="_blank"><Button variant="secondary"><FileDown size={16} /> Print / Save PDF</Button></Link>
        {canEdit ? <Button variant="danger" pending={busy} disabled={pinMoving} onClick={() => destructive(boardConfirmation(board.slides), () => deletePresentationBoardAction({ projectId, boardId: board.id }), () => router.push(PRESENTATION_ROUTES.project(projectId)), false)}><Trash2 size={16} /> Delete board</Button> : null}
      </div>
    </div>
    {canEdit ? <div className="flex flex-wrap items-end gap-2"><Field label="Board title"><Input value={title} disabled={locked} onChange={(event) => setTitle(event.target.value)} /></Field><Button pending={busy} disabled={pinMoving} onClick={() => act(() => updatePresentationBoardAction({ projectId, boardId: board.id, title }))}>Save title</Button></div> : null}
    {error ? <div role="alert"><InlineError>{error}</InlineError></div> : null}
    <input ref={boxInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={locked} className="sr-only" onChange={onBoxInput} />

    {active ? <div className="grid gap-4 lg:grid-cols-[170px_minmax(0,1fr)_280px]">
      <nav aria-label="Slides" className="flex gap-2 overflow-x-auto lg:flex-col">
        {board.slides.map((slide, index) => {
          const spec = layoutSpec(slide.layout);
          return (
            <button type="button" key={slide.id} aria-label={`Slide ${index + 1}`} disabled={locked} onClick={() => choose(slide.id)} aria-current={slide.id === active.id ? "true" : undefined} className={`flex shrink-0 items-center gap-2 rounded-control border p-1.5 text-left ${slide.id === active.id ? "border-action bg-action/5" : "border-transparent hover:bg-surface-muted"}`}>
              <span className="w-4 text-right text-xs text-ink-tertiary">{index + 1}</span>
              <span className="grid aspect-[297/210] w-[120px] gap-[2px] rounded-sm border border-line bg-surface p-[3px]" style={{ gridTemplateColumns: spec.columns, gridTemplateRows: spec.rows }}>
                {spec.boxes.map((box, slot) => {
                  const image = slide.images.find((candidate) => candidate.slot === slot);
                  // eslint-disable-next-line @next/next/no-img-element
                  return <span key={slot} className="relative min-h-0 overflow-hidden rounded-[2px] bg-surface-muted" style={{ gridColumn: box.column, gridRow: box.row }}>{image?.imageUrl ? <img src={image.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}</span>;
                })}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="grid min-w-0 content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-secondary">Layout</span>
          <div role="group" aria-label="Slide layout" className="flex gap-1 rounded-control bg-surface-muted p-1">
            {PRESENTATION_LAYOUTS.map((layout) => {
              const on = layout === active.layout;
              return <button key={layout} type="button" disabled={!canEdit || locked} aria-pressed={on} aria-label={LAYOUT_LABELS[layout]} title={LAYOUT_LABELS[layout]} onClick={() => act(() => updatePresentationSlideAction({ projectId, slideId: active.id, layout }))} className={`grid h-11 w-[52px] place-items-center rounded-action disabled:opacity-60 ${on ? "bg-action text-action-ink shadow-raise" : "text-ink-secondary hover:bg-surface/60"}`}><LayoutGlyph layout={layout} /></button>;
            })}
          </div>
          <span className="text-sm font-medium">{LAYOUT_LABELS[active.layout]}</span>
          {canEdit ? <span className="ml-auto text-xs text-ink-tertiary">Drag images into boxes · click the selected image to add a pin</span> : null}
        </div>

        <section aria-label="Slide" className="grid gap-2 rounded-card border border-line bg-surface p-4 shadow-plane">
          <Input key={`title-${active.id}`} aria-label="Slide title" placeholder="Title (optional)" defaultValue={active.title ?? ""} disabled={!canEdit || locked} maxLength={200} onBlur={(event) => { if ((event.target.value || null) !== active.title) act(() => updatePresentationSlideAction({ projectId, slideId: active.id, title: event.target.value || null })); }} className="!border-transparent !bg-transparent !px-0 text-lg font-semibold shadow-none hover:!border-line focus:!border-line-focus focus:!px-2" />
          <div className="aspect-[297/180] w-full">
            <SlideGrid layout={active.layout} gap="10px" renderBox={(slot) => {
              const image = active.images.find((candidate) => candidate.slot === slot);
              const dropping = dropSlot === slot;
              return (
                <div
                  className={`absolute inset-0 overflow-hidden rounded-control ${image ? "bg-surface-muted" : "border-[1.5px] border-dashed border-line-strong bg-surface-muted/50"} ${dropping ? "outline outline-2 outline-offset-2 outline-action" : ""} ${image && image.id === selectedImageId ? "outline outline-2 outline-offset-2 outline-ink" : ""}`}
                  onDragOver={(event) => { if (canEdit && !locked) { event.preventDefault(); if (dropSlot !== slot) setDropSlot(slot); } }}
                  onDragLeave={() => setDropSlot((current) => (current === slot ? null : current))}
                  onDrop={onBoxDrop(slot)}
                >
                  {image ? (
                    <div className="absolute inset-0 cursor-pointer" draggable={canEdit && !locked} onDragStart={(event) => { if (operation.current || pinDrag.current || pinKeys.current) { event.preventDefault(); return; } event.dataTransfer.setData(MOVE_TYPE, image.id); event.dataTransfer.effectAllowed = "move"; }}>
                      <SlideImageBox
                        image={{ ...image, pins: image.annotations.map((annotation) => ({ id: annotation.id, number: pinNumbers.get(annotation.id) ?? 0, ...(previewPins[annotation.id] ?? { pinX: annotation.pinX, pinY: annotation.pinY }), selected: annotation.id === selectedPinId })) }}
                        pinClassName={pinClass}
                        pinDisabled={busy}
                        onImageClick={onImageClick}
                        onPinClick={(pinId) => { if (!suppressClick.current && !pinDrag.current && !pinKeys.current) { setSelectedImageId(image.id); setSelectedPinId(pinId); } }}
                        onPinPointerDown={canEdit ? (event, pinId, frame) => startPin(event, pinId, frame, image.id) : undefined}
                        onPinPointerMove={movePin} onPinPointerUp={endPin} onPinPointerCancel={cancelPointer}
                        onPinKeyDown={canEdit ? (event, pinId) => keyPin(event, pinId, image.annotations.find((pin) => pin.id === pinId)!) : undefined}
                      />
                    </div>
                  ) : canEdit ? (
                    <button type="button" onClick={() => pickForBox(slot)} disabled={locked} className="absolute inset-0 grid place-items-center content-center gap-1 text-sm text-ink-secondary hover:bg-surface-muted">
                      <span className="text-2xl leading-none" aria-hidden="true">+</span>
                      <span>Add an image or drop one here</span>
                    </button>
                  ) : null}
                </div>
              );
            }} />
          </div>
          <Textarea key={`caption-${active.id}`} aria-label="Slide caption" rows={1} placeholder="Caption (optional)" defaultValue={active.caption ?? ""} disabled={!canEdit || locked} maxLength={1000} onBlur={(event) => { if ((event.target.value || null) !== active.caption) act(() => updatePresentationSlideAction({ projectId, slideId: active.id, caption: event.target.value || null })); }} className="!min-h-0 resize-none !border-transparent !bg-transparent !px-0 text-sm text-ink-secondary hover:!border-line focus:!border-line-focus focus:!px-2" />
        </section>

        {canEdit ? <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" pending={busy} disabled={pinMoving || board.slides[0]?.id === active.id} onClick={() => reorder(-1)}><ArrowUp size={14} /> Move slide up</Button>
          <Button size="sm" variant="secondary" pending={busy} disabled={pinMoving || board.slides.at(-1)?.id === active.id} onClick={() => reorder(1)}><ArrowDown size={14} /> Move slide down</Button>
          <Button size="sm" variant="danger" pending={busy} disabled={pinMoving} onClick={() => destructive(slideConfirmation(active), () => deletePresentationSlideAction({ projectId, slideId: active.id }), () => { setActiveSlideId(null); setSelectedImageId(null); setSelectedPinId(null); })}><Trash2 size={14} /> Delete slide</Button>
        </div> : null}
      </div>

      <aside aria-label="Panel" className="grid content-start gap-4 rounded-card border border-line bg-surface p-4">
        {selectedPin ? (
          <form action={saveAnnotation} className="grid gap-3" key={selectedPin.id}>
            <div className="font-semibold">Pin {pinNumbers.get(selectedPin.id)}</div>
            <Field label="Product Schedule"><Select name="scheduleEntryId" defaultValue={selectedPin.scheduleEntryId ?? ""} disabled={!canEdit || locked}><option value="">No linked item</option>{scheduleEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.code}{entry.productName ? ` — ${entry.productName}` : ""}</option>)}</Select></Field>
            <Field label="Label position"><Select name="labelSide" defaultValue={selectedPin.labelSide} disabled={!canEdit || locked}><option value="auto">Automatic</option><option value="left">Left</option><option value="right">Right</option></Select></Field>
            <Field label="Note"><Textarea name="note" defaultValue={selectedPin.note ?? ""} disabled={!canEdit || locked} /></Field>
            {canEdit ? <><Button type="submit" pending={busy} disabled={pinMoving}>Save pin</Button><Button type="button" variant="danger" pending={busy} disabled={pinMoving} onClick={() => destructive(pinConfirmation(pinNumbers.get(selectedPin.id) ?? 0), () => deletePresentationAnnotationAction({ projectId, annotationId: selectedPin.id }), () => setSelectedPinId(null))}><Trash2 size={16} /> Delete pin</Button></> : null}
            {canEdit ? <p className="m-0 text-xs text-ink-secondary">Drag the pin to move it, or use arrow keys (Shift for 5%).</p> : null}
            <Button type="button" variant="ghost" disabled={locked} onClick={() => setSelectedPinId(null)}>Back to image</Button>
          </form>
        ) : selectedImage ? (
          <div className="grid gap-4" key={selectedImage.id}>
            <div><div className="text-xs uppercase tracking-[0.12em] text-ink-tertiary">Selected image</div><div className="mt-1 font-semibold">Box {selectedImage.slot + 1}</div></div>
            <div className="grid gap-1.5">
              <span className="text-sm text-ink-secondary">Fill</span>
              <div role="group" aria-label="Fill" className="flex gap-1 rounded-control bg-surface-muted p-1">
                {(["cover", "contain"] as const).map((fit) => <button key={fit} type="button" disabled={!canEdit || locked} aria-pressed={selectedImage.fit === fit} onClick={() => act(() => updatePresentationImageAction({ projectId, imageId: selectedImage.id, fit }))} className={`h-11 flex-1 rounded-action text-sm ${selectedImage.fit === fit ? "bg-surface font-semibold shadow-raise" : "text-ink-secondary"}`}>{fit === "cover" ? "Crop to fill" : "Show whole"}</button>)}
              </div>
              {!selectedImage.imageRatio ? <span className="text-xs text-ink-tertiary">This older image always shows whole; replace it to crop.</span> : null}
            </div>
            {selectedImage.fit === "cover" && selectedImage.imageRatio ? (
              <div className="grid gap-2">
                <span className="text-sm text-ink-secondary">Crop position</span>
                {(["focusX", "focusY"] as const).map((axis) => (
                  <label key={axis} className="grid gap-0.5 text-xs text-ink-tertiary">
                    {axis === "focusX" ? "Left ↔ right" : "Top ↕ bottom"}
                    <input type="range" min={0} max={100} step={1} disabled={!canEdit || locked} defaultValue={selectedImage[axis]} onPointerUp={(event) => { const value = Number((event.target as HTMLInputElement).value); act(() => updatePresentationImageAction({ projectId, imageId: selectedImage.id, [axis]: value })); }} onKeyUp={(event) => { const value = Number((event.target as HTMLInputElement).value); act(() => updatePresentationImageAction({ projectId, imageId: selectedImage.id, [axis]: value })); }} />
                  </label>
                ))}
              </div>
            ) : null}
            <div className="grid gap-2">
              <span className="text-sm text-ink-secondary">Pins on this image</span>
              {selectedImage.annotations.length === 0 ? <span className="text-xs text-ink-tertiary">Click the image again to add a pin. Drag a pin to move it.</span> : null}
              {selectedImage.annotations.map((annotation) => (
                <button key={annotation.id} type="button" disabled={locked} onClick={() => setSelectedPinId(annotation.id)} className="flex items-center gap-2 rounded-control border border-line bg-surface p-2 text-left text-sm hover:bg-surface-muted">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-action text-xs font-bold text-action-ink">{pinNumbers.get(annotation.id)}</span>
                  <span className="min-w-0 truncate">{annotation.scheduleEntry ? `${annotation.scheduleEntry.code}${annotation.scheduleEntry.productName ? ` ${annotation.scheduleEntry.productName}` : ""}` : annotation.note ?? "Pin without a note"}</span>
                </button>
              ))}
            </div>
            {canEdit ? <div className="grid gap-2">
              <Button variant="secondary" disabled={locked} onClick={() => pickForBox(selectedImage.slot)}>Replace image</Button>
              <Button variant="ghost" pending={busy} disabled={pinMoving} onClick={() => destructive(imageConfirmation(selectedImage, false), () => removePresentationImageAction({ projectId, imageId: selectedImage.id }), () => setSelectedImageId(null))}>Remove from slide</Button>
            </div> : null}
          </div>
        ) : (
          <div className="grid gap-2 text-sm text-ink-secondary">
            <p className="m-0">Click an image to set how it fills its box and to add pins.</p>
            <p className="m-0">Empty box: click to choose an image, or drop one from your computer. Drag an image to another box to move it.</p>
          </div>
        )}
      </aside>
    </div> : <div className="rounded-card border border-dashed border-line p-8 text-center text-ink-secondary">{canEdit ? "Add a slide or images to start this presentation." : "This presentation has no slides yet."}</div>}
    {confirm.dialog}
  </div>;
}
