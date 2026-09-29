"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { ArrowLeft, ArrowDown, ArrowUp, FileDown, ImagePlus, Trash2 } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@/platform/ui_engine";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";

import { addPresentationAnnotationAction, addPresentationSlidesAction, deletePresentationAnnotationAction, deletePresentationBoardAction, deletePresentationSlideAction, reorderPresentationSlidesAction, updatePresentationAnnotationAction, updatePresentationBoardAction } from "../../../actions";

type Annotation = { id: string; pinX: number; pinY: number; scheduleEntryId: string | null; labelSide: "auto" | "left" | "right"; note: string | null; scheduleEntry: { code: string; productName: string | null } | null };
type Slide = { id: string; imageUrl: string | null; annotations: Annotation[] };
type Board = { id: string; title: string; slides: Slide[] };
type ScheduleEntry = { id: string; code: string; productName: string | null };

export function PresentationEditor({ projectId, board, scheduleEntries, canEdit }: { projectId: string; board: Board; scheduleEntries: ScheduleEntry[]; canEdit: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(board.slides[0]?.id ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState(board.title);
  const [pending, startTransition] = useTransition();
  const active = board.slides.find((slide) => slide.id === activeSlideId) ?? board.slides[0] ?? null;
  const selected = active?.annotations.find((annotation) => annotation.id === selectedId) ?? null;

  const refresh = () => router.refresh();
  const upload = () => startTransition(async () => {
    const files = fileInput.current?.files;
    if (!files?.length) return;
    const form = new FormData(); form.set("projectId", projectId); form.set("boardId", board.id); for (const file of files) form.append("files", file);
    await addPresentationSlidesAction(form); if (fileInput.current) fileInput.current.value = ""; refresh();
  });
  const addPin = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canEdit || !active) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pinX = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const pinY = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    startTransition(async () => { const result = await addPresentationAnnotationAction({ projectId, slideId: active.id, pinX, pinY }); if (result.ok && result.data) setSelectedId(result.data.annotationId); refresh(); });
  };
  const saveAnnotation = (form: FormData) => startTransition(async () => {
    if (!selected) return;
    await updatePresentationAnnotationAction({ projectId, annotationId: selected.id, scheduleEntryId: (form.get("scheduleEntryId") as string) || null, labelSide: form.get("labelSide") as "auto" | "left" | "right", note: (form.get("note") as string) || null }); refresh();
  });
  const reorder = (direction: -1 | 1) => {
    if (!active) return; const index = board.slides.findIndex((slide) => slide.id === active.id); const next = index + direction; if (next < 0 || next >= board.slides.length) return;
    const ids = board.slides.map((slide) => slide.id); [ids[index], ids[next]] = [ids[next], ids[index]];
    startTransition(async () => { await reorderPresentationSlidesAction({ projectId, boardId: board.id, orderedIds: ids }); setActiveSlideId(ids[next]); refresh(); });
  };
  return <div className="grid gap-4">
    <div className="flex flex-wrap items-center gap-2"><Link href={STUDIOFLOW_ROUTES.projectPresentation(projectId)} className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:underline"><ArrowLeft size={16} /> Back to Presentation</Link><div className="ml-auto flex gap-2"><Link href={STUDIOFLOW_ROUTES.projectPresentationPrint(projectId, board.id)} target="_blank"><Button variant="secondary"><FileDown size={16} /> Print / Save PDF</Button></Link>{canEdit ? <Button variant="danger" onClick={() => startTransition(async () => { await deletePresentationBoardAction({ projectId, boardId: board.id }); router.push(STUDIOFLOW_ROUTES.projectPresentation(projectId)); })}><Trash2 size={16} /> Delete board</Button> : null}</div></div>
    <div className="flex flex-wrap items-end gap-2">{canEdit ? <><Field label="Board title"><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field><Button pending={pending} onClick={() => startTransition(async () => { await updatePresentationBoardAction({ projectId, boardId: board.id, title }); refresh(); })}>Save title</Button><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={upload} /><Button variant="secondary" onClick={() => fileInput.current?.click()} pending={pending}><ImagePlus size={16} /> Add images</Button></> : null}</div>
    {active ? <div className="grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)_260px]"><aside className="flex gap-2 overflow-x-auto lg:flex-col">{board.slides.map((slide, index) => <button type="button" key={slide.id} onClick={() => { setActiveSlideId(slide.id); setSelectedId(null); }} className={`shrink-0 rounded-card border p-2 text-left text-sm ${slide.id === active.id ? "border-action bg-action/5" : "border-line"}`}>Slide {index + 1}</button>)}</aside><div className="min-w-0"><div className="relative cursor-crosshair overflow-hidden rounded-card border border-line bg-surface-muted" onClick={addPin}>{active.imageUrl ? <img src={active.imageUrl} alt="Presentation slide" className="block h-auto w-full" /> : <div className="aspect-video" />}{active.annotations.map((annotation, index) => <button key={annotation.id} type="button" onClick={(event) => { event.stopPropagation(); setSelectedId(annotation.id); }} style={{ left: `${annotation.pinX}%`, top: `${annotation.pinY}%` }} className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-action text-xs font-bold text-white shadow">{index + 1}</button>)}</div>{canEdit ? <div className="mt-2 flex gap-2"><Button size="sm" variant="secondary" disabled={board.slides[0]?.id === active.id} onClick={() => reorder(-1)}><ArrowUp size={14} /> Move up</Button><Button size="sm" variant="secondary" disabled={board.slides.at(-1)?.id === active.id} onClick={() => reorder(1)}><ArrowDown size={14} /> Move down</Button><Button size="sm" variant="danger" onClick={() => startTransition(async () => { await deletePresentationSlideAction({ projectId, slideId: active.id }); setActiveSlideId(null); refresh(); })}><Trash2 size={14} /> Delete slide</Button></div> : null}</div><aside className="rounded-card border border-line p-3">{selected ? <form action={saveAnnotation} className="grid gap-3"><div className="font-semibold">Pin</div><Field label="Product Schedule"><Select name="scheduleEntryId" defaultValue={selected.scheduleEntryId ?? ""}><option value="">No linked item</option>{scheduleEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.code}{entry.productName ? ` — ${entry.productName}` : ""}</option>)}</Select></Field><Field label="Label position"><Select name="labelSide" defaultValue={selected.labelSide}><option value="auto">Automatic</option><option value="left">Left</option><option value="right">Right</option></Select></Field><Field label="Note"><Textarea name="note" defaultValue={selected.note ?? ""} /></Field><Button type="submit" pending={pending}>Save pin</Button>{canEdit ? <Button type="button" variant="danger" onClick={() => startTransition(async () => { await deletePresentationAnnotationAction({ projectId, annotationId: selected.id }); setSelectedId(null); refresh(); })}><Trash2 size={16} /> Delete pin</Button> : null}</form> : <div className="text-sm text-ink-secondary">Select a pin to link it to Product Schedule or add a note.</div>}</aside></div> : <div className="rounded-card border border-dashed border-line p-8 text-center text-ink-secondary">Add images to start this presentation.</div>}
  </div>;
}
