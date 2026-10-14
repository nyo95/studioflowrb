"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";

import { ArrowDown, ArrowLeft, ArrowUp, FileDown, ImagePlus, Plus, Trash2 } from "lucide-react";
import { Button, Field, InlineError, Input, Select, Textarea, shrinkImageFile } from "@/platform/ui_engine";
import { PRESENTATION_ROUTES } from "../public";
import { LAYOUT_SPECS, PRESENTATION_LAYOUTS, layoutSpec, type PresentationLayout } from "../layouts";
import { SlideGrid, SlideImageBox, numberPins, type FrameImage } from "./slide-frame";

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

async function prepare(file: File): Promise<{ file: File; ratio: number | null }> {
  // A larger image is shrunk here (as on the Ideas board) so a phone photo or a big render still fits the 3 MB limit.
  const shrunk = await shrinkImageFile(file, { maxBytes: SLIDE_IMAGE_BYTES });
  try { const bitmap = await createImageBitmap(shrunk); const ratio = bitmap.width / bitmap.height; bitmap.close(); return { file: shrunk, ratio }; } catch { return { file: shrunk, ratio: null }; }
}

/** A layout as a small drawing of its boxes. */
function LayoutGlyph({ layout, ink, width = 38, height = 27 }: { layout: PresentationLayout; ink: string; width?: number; height?: number }) {
  const spec = LAYOUT_SPECS[layout];
  return (
    <span aria-hidden="true" className="grid gap-[2px]" style={{ width, height, gridTemplateColumns: spec.columns, gridTemplateRows: spec.rows }}>
      {spec.boxes.map((box, index) => <span key={index} className="rounded-[1.5px]" style={{ background: ink, gridColumn: box.column, gridRow: box.row }} />)}
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
  const active = board.slides.find((slide) => slide.id === activeSlideId) ?? board.slides[0] ?? null;
  const selectedImage = active?.images.find((image) => image.id === selectedImageId) ?? null;
  const selectedPin = active?.images.flatMap((image) => image.annotations).find((annotation) => annotation.id === selectedPinId) ?? null;
  const pinNumbers = active ? numberPins(active.images) : new Map<string, number>();

  const refresh = () => router.refresh();
  /** Runs an action, shows its refusal, refreshes on success. */
  const act = (work: () => Promise<{ ok: boolean; error?: { safeMessage: string } } | void>, after?: () => void) => startTransition(async () => {
    setError(null);
    try {
      const result = await work();
      if (result && !result.ok) { setError(result.error?.safeMessage ?? "That did not work."); return; }
      after?.();
      refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That did not work."); }
  });
  const choose = (slideId: string) => { setActiveSlideId(slideId); setSelectedImageId(null); setSelectedPinId(null); };

  const addNewSlides = () => act(async () => {
    const files = newSlidesInput.current?.files;
    if (!files?.length) return;
    try {
      const form = new FormData(); form.set("projectId", projectId); form.set("boardId", board.id);
      for (const file of files) { const prepared = await prepare(file); form.append("files", prepared.file); form.append("ratios", prepared.ratio ? String(prepared.ratio) : ""); }
      return await addPresentationSlidesAction(form);
    } finally { if (newSlidesInput.current) newSlidesInput.current.value = ""; }
  });
  const place = (slot: number, file: File) => {
    if (!active) return;
    act(async () => {
      const prepared = await prepare(file);
      const form = new FormData(); form.set("projectId", projectId); form.set("slideId", active.id); form.set("slot", String(slot)); form.set("file", prepared.file);
      if (prepared.ratio) form.set("imageRatio", String(prepared.ratio));
      return placePresentationImageAction(form);
    }, () => setSelectedPinId(null));
  };
  const pickForBox = (slot: number) => { boxTarget.current = slot; boxInput.current?.click(); };
  const onBoxInput = () => { const file = boxInput.current?.files?.[0]; if (file) place(boxTarget.current, file); if (boxInput.current) boxInput.current.value = ""; };

  const onBoxDrop = (slot: number) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropSlot(null);
    if (!canEdit || !active) return;
    const moving = event.dataTransfer.getData(MOVE_TYPE);
    if (moving) { act(() => movePresentationImageAction({ projectId, imageId: moving, slot })); return; }
    const file = [...event.dataTransfer.files].find((candidate) => candidate.type.startsWith("image/"));
    if (file) place(slot, file);
  };
  const onImageClick = (event: ReactMouseEvent<HTMLDivElement>, image: FrameImage) => {
    // The first click chooses the image; a click on the chosen image puts a pin there.
    if (selectedImageId !== image.id || !canEdit) { setSelectedImageId(image.id); setSelectedPinId(null); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const pinX = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const pinY = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    startTransition(async () => { const result = await addPresentationAnnotationAction({ projectId, imageId: image.id, pinX, pinY }); if (result.ok && result.data) setSelectedPinId(result.data.annotationId); refresh(); });
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

  const pinClass = "absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-action text-xs font-bold text-action-ink shadow";

  return <div className="grid gap-4">
    <div className="flex flex-wrap items-center gap-2">
      <Link href={PRESENTATION_ROUTES.project(projectId)} className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:underline"><ArrowLeft size={16} /> Back to Presentation</Link>
      <div className="ml-auto flex flex-wrap gap-2">
        {canEdit ? <>
          <Button variant="secondary" pending={pending} onClick={() => act(() => addPresentationSlideAction({ projectId, boardId: board.id, layout: "one-two" }), () => undefined)}><Plus size={16} /> Slide baru</Button>
          <input ref={newSlidesInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={addNewSlides} />
          <Button variant="secondary" pending={pending} onClick={() => newSlidesInput.current?.click()}><ImagePlus size={16} /> Gambar → slide baru</Button>
        </> : null}
        <Link href={PRESENTATION_ROUTES.print(projectId, board.id)} target="_blank"><Button variant="secondary"><FileDown size={16} /> Print / Save PDF</Button></Link>
        {canEdit ? <Button variant="danger" onClick={() => startTransition(async () => { await deletePresentationBoardAction({ projectId, boardId: board.id }); router.push(PRESENTATION_ROUTES.project(projectId)); })}><Trash2 size={16} /> Delete board</Button> : null}
      </div>
    </div>
    {canEdit ? <div className="flex flex-wrap items-end gap-2"><Field label="Board title"><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field><Button pending={pending} onClick={() => act(() => updatePresentationBoardAction({ projectId, boardId: board.id, title }))}>Save title</Button></div> : null}
    {error ? <div role="alert"><InlineError>{error}</InlineError></div> : null}
    <input ref={boxInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onBoxInput} />

    {active ? <div className="grid gap-4 lg:grid-cols-[170px_minmax(0,1fr)_280px]">
      <nav aria-label="Slides" className="flex gap-2 overflow-x-auto lg:flex-col">
        {board.slides.map((slide, index) => {
          const spec = layoutSpec(slide.layout);
          return (
            <button type="button" key={slide.id} aria-label={`Slide ${index + 1}`} onClick={() => choose(slide.id)} aria-current={slide.id === active.id ? "true" : undefined} className={`flex shrink-0 items-center gap-2 rounded-control border p-1.5 text-left ${slide.id === active.id ? "border-action bg-action/5" : "border-transparent hover:bg-surface-muted"}`}>
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
          <span className="text-sm text-ink-secondary">Tata letak</span>
          <div role="group" aria-label="Tata letak slide" className="flex gap-1 rounded-control bg-surface-muted p-1">
            {PRESENTATION_LAYOUTS.map((layout) => {
              const on = layout === active.layout;
              return <button key={layout} type="button" disabled={!canEdit || pending} aria-pressed={on} aria-label={LAYOUT_SPECS[layout].label} title={LAYOUT_SPECS[layout].label} onClick={() => act(() => updatePresentationSlideAction({ projectId, slideId: active.id, layout }))} className={`grid h-10 w-[52px] place-items-center rounded-action disabled:opacity-60 ${on ? "bg-surface shadow-raise" : "hover:bg-surface/60"}`}><LayoutGlyph layout={layout} ink={on ? "var(--ui-ink, #24211e)" : "var(--ui-ink-tertiary, #a39b91)"} /></button>;
            })}
          </div>
          <span className="text-sm font-medium">{LAYOUT_SPECS[active.layout].label}</span>
          {canEdit ? <span className="ml-auto text-xs text-ink-tertiary">Seret gambar ke kotak · klik gambar terpilih untuk pasang pin</span> : null}
        </div>

        <section aria-label="Slide" className="grid gap-2 rounded-card border border-line bg-surface p-4 shadow-plane">
          <Input key={`title-${active.id}`} aria-label="Judul slide" placeholder="Judul slide (boleh kosong)" defaultValue={active.title ?? ""} disabled={!canEdit} maxLength={200} onBlur={(event) => { if ((event.target.value || null) !== active.title) act(() => updatePresentationSlideAction({ projectId, slideId: active.id, title: event.target.value || null })); }} className="!border-transparent !bg-transparent !px-0 text-lg font-semibold shadow-none hover:!border-line focus:!border-line-focus focus:!px-2" />
          <div className="aspect-[297/180] w-full">
            <SlideGrid layout={active.layout} gap="10px" renderBox={(slot) => {
              const image = active.images.find((candidate) => candidate.slot === slot);
              const dropping = dropSlot === slot;
              return (
                <div
                  className={`absolute inset-0 overflow-hidden rounded-control ${image ? "bg-surface-muted" : "border-[1.5px] border-dashed border-line-strong bg-surface-muted/50"} ${dropping ? "outline outline-2 outline-offset-2 outline-action" : ""} ${image && image.id === selectedImageId ? "outline outline-2 outline-offset-2 outline-ink" : ""}`}
                  onDragOver={(event) => { if (canEdit) { event.preventDefault(); if (dropSlot !== slot) setDropSlot(slot); } }}
                  onDragLeave={() => setDropSlot((current) => (current === slot ? null : current))}
                  onDrop={onBoxDrop(slot)}
                >
                  {image ? (
                    <div className="absolute inset-0 cursor-pointer" draggable={canEdit} onDragStart={(event) => { event.dataTransfer.setData(MOVE_TYPE, image.id); event.dataTransfer.effectAllowed = "move"; }}>
                      <SlideImageBox
                        image={{ ...image, pins: image.annotations.map((annotation) => ({ id: annotation.id, number: pinNumbers.get(annotation.id) ?? 0, pinX: annotation.pinX, pinY: annotation.pinY, selected: annotation.id === selectedPinId })) }}
                        pinClassName={pinClass}
                        onImageClick={onImageClick}
                        onPinClick={(pinId) => { setSelectedImageId(image.id); setSelectedPinId(pinId); }}
                      />
                    </div>
                  ) : canEdit ? (
                    <button type="button" onClick={() => pickForBox(slot)} disabled={pending} className="absolute inset-0 grid place-items-center content-center gap-1 text-sm text-ink-secondary hover:bg-surface-muted">
                      <span className="text-2xl leading-none" aria-hidden="true">+</span>
                      <span>Tambah gambar atau seret ke sini</span>
                    </button>
                  ) : null}
                </div>
              );
            }} />
          </div>
          <Textarea key={`caption-${active.id}`} aria-label="Keterangan slide" rows={1} placeholder="Keterangan (boleh kosong)" defaultValue={active.caption ?? ""} disabled={!canEdit} maxLength={1000} onBlur={(event) => { if ((event.target.value || null) !== active.caption) act(() => updatePresentationSlideAction({ projectId, slideId: active.id, caption: event.target.value || null })); }} className="!min-h-0 resize-none !border-transparent !bg-transparent !px-0 text-sm text-ink-secondary hover:!border-line focus:!border-line-focus focus:!px-2" />
        </section>

        {canEdit ? <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={board.slides[0]?.id === active.id} onClick={() => reorder(-1)}><ArrowUp size={14} /> Naikkan slide</Button>
          <Button size="sm" variant="secondary" disabled={board.slides.at(-1)?.id === active.id} onClick={() => reorder(1)}><ArrowDown size={14} /> Turunkan slide</Button>
          <Button size="sm" variant="danger" onClick={() => act(() => deletePresentationSlideAction({ projectId, slideId: active.id }), () => setActiveSlideId(null))}><Trash2 size={14} /> Hapus slide</Button>
        </div> : null}
      </div>

      <aside aria-label="Panel" className="grid content-start gap-4 rounded-card border border-line bg-surface p-4">
        {selectedPin ? (
          <form action={saveAnnotation} className="grid gap-3" key={selectedPin.id}>
            <div className="font-semibold">Pin {pinNumbers.get(selectedPin.id)}</div>
            <Field label="Product Schedule"><Select name="scheduleEntryId" defaultValue={selectedPin.scheduleEntryId ?? ""} disabled={!canEdit}><option value="">No linked item</option>{scheduleEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.code}{entry.productName ? ` — ${entry.productName}` : ""}</option>)}</Select></Field>
            <Field label="Label position"><Select name="labelSide" defaultValue={selectedPin.labelSide} disabled={!canEdit}><option value="auto">Automatic</option><option value="left">Left</option><option value="right">Right</option></Select></Field>
            <Field label="Note"><Textarea name="note" defaultValue={selectedPin.note ?? ""} disabled={!canEdit} /></Field>
            {canEdit ? <><Button type="submit" pending={pending}>Save pin</Button><Button type="button" variant="danger" onClick={() => act(() => deletePresentationAnnotationAction({ projectId, annotationId: selectedPin.id }), () => setSelectedPinId(null))}><Trash2 size={16} /> Delete pin</Button></> : null}
            <Button type="button" variant="ghost" onClick={() => setSelectedPinId(null)}>Kembali ke gambar</Button>
          </form>
        ) : selectedImage ? (
          <div className="grid gap-4" key={selectedImage.id}>
            <div><div className="text-xs uppercase tracking-[0.12em] text-ink-tertiary">Gambar terpilih</div><div className="mt-1 font-semibold">Kotak {selectedImage.slot + 1}</div></div>
            <div className="grid gap-1.5">
              <span className="text-sm text-ink-secondary">Cara isi kotak</span>
              <div role="group" aria-label="Cara isi kotak" className="flex gap-1 rounded-control bg-surface-muted p-1">
                {(["cover", "contain"] as const).map((fit) => <button key={fit} type="button" disabled={!canEdit || pending} aria-pressed={selectedImage.fit === fit} onClick={() => act(() => updatePresentationImageAction({ projectId, imageId: selectedImage.id, fit }))} className={`h-8 flex-1 rounded-action text-sm ${selectedImage.fit === fit ? "bg-surface font-semibold shadow-raise" : "text-ink-secondary"}`}>{fit === "cover" ? "Penuh (crop)" : "Utuh"}</button>)}
              </div>
              {!selectedImage.imageRatio ? <span className="text-xs text-ink-tertiary">Gambar lama ini selalu tampil utuh; ganti gambarnya untuk memakai crop.</span> : null}
            </div>
            {selectedImage.fit === "cover" && selectedImage.imageRatio ? (
              <div className="grid gap-2">
                <span className="text-sm text-ink-secondary">Posisi potongan</span>
                {(["focusX", "focusY"] as const).map((axis) => (
                  <label key={axis} className="grid gap-0.5 text-xs text-ink-tertiary">
                    {axis === "focusX" ? "Kiri ↔ kanan" : "Atas ↕ bawah"}
                    <input type="range" min={0} max={100} step={1} disabled={!canEdit} defaultValue={selectedImage[axis]} onPointerUp={(event) => { const value = Number((event.target as HTMLInputElement).value); act(() => updatePresentationImageAction({ projectId, imageId: selectedImage.id, [axis]: value })); }} onKeyUp={(event) => { const value = Number((event.target as HTMLInputElement).value); act(() => updatePresentationImageAction({ projectId, imageId: selectedImage.id, [axis]: value })); }} />
                  </label>
                ))}
              </div>
            ) : null}
            <div className="grid gap-2">
              <span className="text-sm text-ink-secondary">Pin di gambar ini</span>
              {selectedImage.annotations.length === 0 ? <span className="text-xs text-ink-tertiary">Klik gambar sekali lagi untuk memasang pin.</span> : null}
              {selectedImage.annotations.map((annotation) => (
                <button key={annotation.id} type="button" onClick={() => setSelectedPinId(annotation.id)} className="flex items-center gap-2 rounded-control border border-line bg-surface p-2 text-left text-sm hover:bg-surface-muted">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-action text-xs font-bold text-action-ink">{pinNumbers.get(annotation.id)}</span>
                  <span className="min-w-0 truncate">{annotation.scheduleEntry ? `${annotation.scheduleEntry.code}${annotation.scheduleEntry.productName ? ` ${annotation.scheduleEntry.productName}` : ""}` : annotation.note ?? "Pin tanpa keterangan"}</span>
                </button>
              ))}
            </div>
            {canEdit ? <div className="grid gap-2">
              <Button variant="secondary" disabled={pending} onClick={() => pickForBox(selectedImage.slot)}>Ganti gambar</Button>
              <Button variant="ghost" disabled={pending} onClick={() => act(() => removePresentationImageAction({ projectId, imageId: selectedImage.id }), () => setSelectedImageId(null))}>Keluarkan dari slide</Button>
            </div> : null}
          </div>
        ) : (
          <div className="grid gap-2 text-sm text-ink-secondary">
            <p className="m-0">Klik sebuah gambar untuk mengatur cara isi kotaknya dan memasang pin.</p>
            <p className="m-0">Kotak kosong: klik untuk memilih gambar, atau seret gambar dari komputer ke kotaknya. Seret gambar ke kotak lain untuk memindahkannya.</p>
          </div>
        )}
      </aside>
    </div> : <div className="rounded-card border border-dashed border-line p-8 text-center text-ink-secondary">{canEdit ? "Tambahkan slide baru atau gambar untuk memulai presentasi ini." : "Presentasi ini belum punya slide."}</div>}
  </div>;
}
