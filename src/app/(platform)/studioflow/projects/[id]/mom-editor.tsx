"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";

import type { ActionResult } from "@platform/core/actions";
import { Button, Checkbox, Field, ImageWorkspace, InlineError, Input, Select, SimpleTextEditor, Textarea, useFormDraftGuard, useUnsavedChangesGuard } from "@/platform/ui_engine";
import { updateMomAction, updateMomContentAction, uploadMomImageAction } from "./mom-actions";

type MomImage = { sort_order: number; storage_key: string; alt_text: string | null; read_url: string | null };
type MomPoint = { sort_order: number; text: string; style: "TEXT" | "BULLET" | "NUMBERED" };
type MomItem = { sort_order: number; is_text_only: boolean; list_style: "NONE" | "BULLET" | "NUMBERED"; points: MomPoint[]; images: MomImage[] };

export type MomMetadataValues = { topic: string; meeting_at: string; venue: string | null; attendees_text: string | null; prepared_by_name: string };

const emptyItem = (sortOrder: number): MomItem => ({ sort_order: sortOrder, is_text_only: true, list_style: "NONE", points: [{ sort_order: 0, text: "", style: "TEXT" }], images: [] });

function serialiseItems(items: MomItem[]) {
  return JSON.stringify({ items: items.map((item, itemIndex) => ({
    ...item,
    sort_order: itemIndex,
    points: item.points.map((point, pointIndex) => ({ ...point, sort_order: pointIndex })),
    images: item.images.map(({ read_url: _readUrl, ...image }, imageIndex) => ({ ...image, sort_order: imageIndex })),
  })) });
}

export function MomEditor({ projectId, momId, metadata, initial }: { projectId: string; momId: string; metadata: MomMetadataValues; initial: MomItem[] }) {
  const baseline = useMemo(() => serialiseItems(initial.length ? initial : [emptyItem(0)]), [initial]);
  const [items, setItems] = useState<MomItem[]>(() => initial.length ? initial : [emptyItem(0)]);
  const [uploadingBlock, setUploadingBlock] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [contentState, contentAction, contentPending] = useActionState(updateMomContentAction.bind(null, projectId, momId), null as ActionResult<void> | null);
  const [, startContentTransition] = useTransition();
  const [metadataState, metadataAction, metadataPending] = useActionState(updateMomAction.bind(null, projectId, momId), null as ActionResult<void> | null);
  const metadataFormRef = useRef<HTMLFormElement>(null);
  const metadataGuard = useFormDraftGuard({ formRef: metadataFormRef, resetKey: momId, active: true, guardNavigation: true });
  const serialised = serialiseItems(items);
  const guard = useUnsavedChangesGuard({ value: serialised, initialValue: baseline, guardNavigation: true });
  const { markSaved } = guard;
  useEffect(() => { if (contentState?.ok) markSaved(serialised); }, [contentState, markSaved, serialised]);
  const { markSaved: markMetadataSaved } = metadataGuard;
  useEffect(() => { if (metadataState?.ok) markMetadataSaved(); }, [markMetadataSaved, metadataState]);

  const updateItem = (index: number, next: Partial<MomItem>) => setItems((all) => all.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item));
  const move = <T,>(values: T[], index: number, delta: number): T[] => {
    const target = index + delta;
    if (target < 0 || target >= values.length) return values;
    const next = [...values]; [next[index], next[target]] = [next[target], next[index]]; return next;
  };

  const upload = async (blockIndex: number, prepared: File) => {
    setUploadingBlock(blockIndex); setUploadError(null);
    const result = await uploadMomImageAction(projectId, momId, prepared);
    if (!result.ok) setUploadError(result.error.safeMessage);
    else setItems((current) => current.map((item, index) => index === blockIndex ? { ...item, images: [...item.images, { sort_order: item.images.length, storage_key: result.data.storageKey, alt_text: null, read_url: result.data.readUrl }] } : item));
    setUploadingBlock(null);
  };

  return <div className="grid gap-5">
    <form ref={metadataFormRef} action={metadataAction} onChange={metadataGuard.onFormChange} className="grid gap-3 rounded-control border border-line p-3">
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Topic" required><Input name="topic" required maxLength={255} defaultValue={metadata.topic} disabled={metadataPending} /></Field><Field label="Meeting date" required><Input name="meeting_at" type="datetime-local" required defaultValue={metadata.meeting_at} disabled={metadataPending} /></Field></div>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Venue"><Input name="venue" maxLength={255} defaultValue={metadata.venue ?? ""} disabled={metadataPending} /></Field><Field label="Prepared by" required><Input name="prepared_by_name" required maxLength={255} defaultValue={metadata.prepared_by_name} disabled={metadataPending} /></Field></div>
      <Field label="Attendees"><Textarea name="attendees_text" rows={2} maxLength={4000} defaultValue={metadata.attendees_text ?? ""} disabled={metadataPending} /></Field>
      {metadataState?.ok === false ? <InlineError>{metadataState.error.safeMessage}</InlineError> : null}
      <div><Button type="submit" variant="secondary" pending={metadataPending}>Save meeting details</Button></div>
    </form>

    {items.map((item, itemIndex) => <section key={itemIndex} className="grid gap-3 rounded-control border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Block {itemIndex + 1}</strong><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setItems((all) => move(all, itemIndex, -1))} disabled={itemIndex === 0}>Up</Button><Button size="sm" variant="ghost" onClick={() => setItems((all) => move(all, itemIndex, 1))} disabled={itemIndex === items.length - 1}>Down</Button><Button size="sm" variant="ghost" onClick={() => setItems((all) => all.filter((_, index) => index !== itemIndex))} disabled={items.length === 1}>Remove</Button></div></div>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Block list style"><Select value={item.list_style} onChange={(event) => updateItem(itemIndex, { list_style: event.target.value as MomItem["list_style"] })}><option value="NONE">None</option><option value="BULLET">Bullet</option><option value="NUMBERED">Numbered</option></Select></Field><Checkbox label="Text-only block" checked={item.is_text_only} onCheckedChange={(checked) => updateItem(itemIndex, { is_text_only: checked === true })} /></div>
      <div className="grid gap-2"><span className="text-xs font-semibold text-ink-secondary">Points</span>{item.points.map((point, pointIndex) => <div key={pointIndex} className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
        <SimpleTextEditor aria-label={`Block ${itemIndex + 1} point ${pointIndex + 1}`} value={point.text} rows={2} onChange={(event) => updateItem(itemIndex, { points: item.points.map((entry, index) => index === pointIndex ? { ...entry, text: event.target.value } : entry) })} />
        <Select aria-label={`Point ${pointIndex + 1} style`} value={point.style} onChange={(event) => updateItem(itemIndex, { points: item.points.map((entry, index) => index === pointIndex ? { ...entry, style: event.target.value as MomPoint["style"] } : entry) })}><option value="TEXT">Text</option><option value="BULLET">Bullet</option><option value="NUMBERED">Numbered</option></Select>
        <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => updateItem(itemIndex, { points: move(item.points, pointIndex, -1) })} disabled={pointIndex === 0}>↑</Button><Button size="sm" variant="ghost" onClick={() => updateItem(itemIndex, { points: move(item.points, pointIndex, 1) })} disabled={pointIndex === item.points.length - 1}>↓</Button><Button size="sm" variant="ghost" onClick={() => updateItem(itemIndex, { points: item.points.filter((_, index) => index !== pointIndex) })} disabled={item.points.length === 1}>Remove</Button></div>
      </div>)}<div><Button size="sm" variant="ghost" onClick={() => updateItem(itemIndex, { points: [...item.points, { sort_order: item.points.length, text: "", style: "TEXT" }] })}>Add point</Button></div></div>
      {item.images.length ? <div className="grid gap-2 sm:grid-cols-2">{item.images.map((image, imageIndex) => <div key={image.storage_key} className="grid gap-2 rounded-control border border-line-subtle p-2">{image.read_url ? <Image src={image.read_url} alt={image.alt_text || `MOM image ${imageIndex + 1}`} width={640} height={360} unoptimized className="max-h-48 w-full rounded-control object-contain" /> : <p className="text-xs text-ink-tertiary">Image preview unavailable</p>}<Input aria-label={`Image ${imageIndex + 1} alternative text`} placeholder="Alternative text" value={image.alt_text ?? ""} onChange={(event) => updateItem(itemIndex, { images: item.images.map((entry, index) => index === imageIndex ? { ...entry, alt_text: event.target.value || null } : entry) })} /><Button size="sm" variant="ghost" onClick={() => updateItem(itemIndex, { images: item.images.filter((_, index) => index !== imageIndex) })}>Remove image</Button></div>)}</div> : null}
      {item.images.length < 2 ? <ImageWorkspace label={`Prepare image for block ${itemIndex + 1}`} disabled={uploadingBlock !== null || contentPending} onPrepared={(file) => upload(itemIndex, file)} /> : <p className="text-xs text-ink-tertiary">This block has the maximum of two images.</p>}
    </section>)}
    {uploadingBlock !== null ? <p role="status" className="text-sm text-ink-secondary">Uploading prepared image…</p> : null}
    {uploadError ? <InlineError>{uploadError}</InlineError> : null}
    {contentState?.ok === false ? <InlineError>{contentState.error.safeMessage}</InlineError> : null}
    <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setItems((all) => [...all, emptyItem(all.length)])}>Add block</Button><form onSubmit={(event) => { event.preventDefault(); const payload = new FormData(); payload.set("content", serialised); startContentTransition(() => contentAction(payload)); }}><Button type="submit" variant="primary" pending={contentPending} disabled={uploadingBlock !== null || !guard.isDirty}>Save content</Button></form><Button variant="ghost" onClick={() => window.print()}>Print</Button></div>
    {guard.confirmDialog}
    {metadataGuard.confirmDialog}
  </div>;
}
