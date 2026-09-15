"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowLeftRight, ImagePlus, Plus, Printer, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  MOM_LIST_STYLES,
  MOM_LIST_STYLE_LABELS,
  MOM_POINT_STYLES,
  MOM_POINT_STYLE_LABELS,
  pointMarkers,
  type MomListStyle,
  type MomPointStyle,
} from "@/apps/studioflow/domain/mom";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import {
  Button,
  Dialog,
  Field,
  IconButton,
  ImageWorkspace,
  InlineError,
  Input,
  RowActionMenu,
  SectionCard,
  Select,
  Text,
  Textarea,
  useConfirm,
} from "@/platform/ui_engine";

import {
  addMomItemAction,
  addMomPointAction,
  deleteMomDocumentAction,
  deleteMomImageAction,
  deleteMomItemAction,
  deleteMomPointAction,
  moveMomItemAction,
  moveMomPointAction,
  setMomImageAction,
  swapMomImagesAction,
  updateMomDocumentAction,
  updateMomItemAction,
  updateMomPointAction,
} from "../../../../actions";
import { useCommand } from "../../../../_components/use-command";

type MomImage = { id: string; slot: 0 | 1; url: string | null };
type MomPoint = { id: string; text: string; style: MomPointStyle };
type MomItem = { id: string; isTextOnly: boolean; listStyle: MomListStyle; points: MomPoint[]; images: MomImage[] };
export type MomDocumentView = {
  id: string;
  topic: string;
  meetingDate: string;
  venue: string | null;
  attendees: string | null;
  preparedByName: string;
  items: MomItem[];
};

type Command = ReturnType<typeof useCommand>;

export function MomEditor({ projectId, document, canEdit }: { projectId: string; document: MomDocumentView; canEdit: boolean }) {
  const router = useRouter();
  const command = useCommand();
  const confirm = useConfirm();
  const [upload, setUpload] = useState<{ itemId: string; slot: 0 | 1; label: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const removeDocument = async () => {
    const ok = await confirm.confirm({
      title: "Delete this MOM?",
      description: "All sections, notes, and photos in this MOM will be deleted permanently.",
      confirmLabel: "Delete MOM",
      tone: "danger",
    });
    if (!ok) return;
    await command.run("delete-doc", () => deleteMomDocumentAction({ projectId, documentId: document.id }), () => router.push(STUDIOFLOW_ROUTES.projectMom(projectId)));
  };

  const onPrepared = async (file: File) => {
    if (!upload) return;
    setUploadError(null);
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("itemId", upload.itemId);
    form.set("slot", String(upload.slot));
    form.set("file", file);
    const ok = await command.run(`img-${upload.itemId}`, async () => {
      const result = await setMomImageAction(form);
      if (!result.ok) setUploadError(result.error.safeMessage);
      return result;
    });
    if (ok) setUpload(null);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link prefetch={false} href={STUDIOFLOW_ROUTES.projectMom(projectId)} className="text-sm text-ink-secondary hover:text-ink hover:underline">
          ← All MOM
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            prefetch={false}
            target="_blank"
            href={STUDIOFLOW_ROUTES.projectMomPrint(projectId, document.id)}
            className="inline-flex min-h-(--ui-control-height-sm) items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-xs font-medium text-ink hover:border-line-strong"
          >
            <Printer aria-hidden="true" className="h-3.5 w-3.5" /> Print / PDF
          </Link>
          {canEdit ? (
            <Button size="sm" variant="danger" leadingIcon={<Trash2 className="h-3.5 w-3.5" />} pending={command.pendingKey === "delete-doc"} onClick={() => void removeDocument()}>
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      {command.error && !upload ? <InlineError>{command.error}</InlineError> : null}

      <HeaderCard projectId={projectId} document={document} canEdit={canEdit} command={command} />

      {document.items.map((item, index) => (
        <SectionEditor
          key={item.id}
          projectId={projectId}
          item={item}
          index={index}
          total={document.items.length}
          canEdit={canEdit}
          command={command}
          onPickImage={(slot) => { setUploadError(null); setUpload({ itemId: item.id, slot, label: `Section ${index + 1}, photo ${slot + 1}` }); }}
          confirm={confirm.confirm}
        />
      ))}

      {canEdit ? (
        <div>
          <Button leadingIcon={<Plus className="h-4 w-4" />} pending={command.pendingKey === "add-item"} onClick={() => command.run("add-item", () => addMomItemAction({ projectId, documentId: document.id }))}>
            Add section
          </Button>
        </div>
      ) : null}

      <Dialog
        open={upload !== null}
        onOpenChange={(open) => { if (!open) setUpload(null); }}
        title={upload ? `Photo — ${upload.label}` : "Photo"}
        description="Choose a photo, crop it to 4:3, and draw markups if needed."
        size="lg"
        dismissible={!command.pending}
      >
        {upload ? (
          <div className="grid gap-2">
            <ImageWorkspace label="MOM photo" aspect={4 / 3} maxDimension={1600} outputType="image/jpeg" onPrepared={onPrepared} disabled={command.pending} />
            {uploadError ? <InlineError>{uploadError}</InlineError> : null}
          </div>
        ) : null}
      </Dialog>
      {confirm.dialog}
    </div>
  );
}

function HeaderCard({ projectId, document, canEdit, command }: { projectId: string; document: MomDocumentView; canEdit: boolean; command: Command }) {
  const initial = {
    topic: document.topic,
    meetingDate: document.meetingDate,
    venue: document.venue ?? "",
    attendees: document.attendees ?? "",
    preparedByName: document.preparedByName,
  };
  const [draft, setDraft] = useState(initial);
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((key) => initial[key] !== draft[key]);
  const set = (key: keyof typeof initial) => (event: { target: { value: string } }) => setDraft((current) => ({ ...current, [key]: event.target.value }));

  return (
    <SectionCard
      title="Meeting details"
      description="Project and client come from the project record."
      action={canEdit ? (
        <Button size="sm" variant="primary" disabled={!dirty} pending={command.pendingKey === "header"} onClick={() => command.run("header", () => updateMomDocumentAction({ projectId, documentId: document.id, ...draft }))}>
          Save details
        </Button>
      ) : undefined}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Topic" required>
          <Input value={draft.topic} onChange={set("topic")} maxLength={200} disabled={!canEdit} />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={draft.meetingDate} onChange={set("meetingDate")} disabled={!canEdit} />
        </Field>
        <Field label="Venue">
          <Input value={draft.venue} onChange={set("venue")} maxLength={500} disabled={!canEdit} placeholder="Site, office, or online" />
        </Field>
        <Field label="Prepared by" required>
          <Input value={draft.preparedByName} onChange={set("preparedByName")} maxLength={200} disabled={!canEdit} />
        </Field>
        <Field label="Attendees" className="md:col-span-2">
          <Textarea value={draft.attendees} onChange={set("attendees")} maxLength={5000} disabled={!canEdit} rows={2} placeholder="One name per line" className="min-h-[64px]" />
        </Field>
      </div>
    </SectionCard>
  );
}

function SectionEditor({
  projectId,
  item,
  index,
  total,
  canEdit,
  command,
  onPickImage,
  confirm,
}: {
  projectId: string;
  item: MomItem;
  index: number;
  total: number;
  canEdit: boolean;
  command: Command;
  onPickImage: (slot: 0 | 1) => void;
  confirm: ReturnType<typeof useConfirm>["confirm"];
}) {
  const { run, pendingKey } = command;
  const markers = pointMarkers(item.listStyle, item.points.map((p) => p.style));
  const busy = pendingKey?.startsWith(item.id) ?? false;

  const updateItem = (patch: Partial<Pick<MomItem, "isTextOnly" | "listStyle">>) =>
    run(`${item.id}-item`, () => updateMomItemAction({ projectId, itemId: item.id, isTextOnly: patch.isTextOnly ?? item.isTextOnly, listStyle: patch.listStyle ?? item.listStyle }));

  const removeSection = async () => {
    const ok = await confirm({
      title: `Delete section ${index + 1}?`,
      description: "Its notes and photos will be deleted permanently.",
      confirmLabel: "Delete section",
      tone: "danger",
    });
    if (ok) await run(`${item.id}-delete`, () => deleteMomItemAction({ projectId, itemId: item.id }));
  };

  return (
    <SectionCard
      title={`Section ${String(index + 1).padStart(2, "0")}`}
      action={canEdit ? (
        <div className="flex items-center gap-2">
          <div className="w-32">
            <Select density="compact" aria-label="List style" value={item.listStyle} disabled={busy} onChange={(event) => updateItem({ listStyle: event.target.value as MomListStyle })}>
              {MOM_LIST_STYLES.map((style) => <option key={style} value={style}>{MOM_LIST_STYLE_LABELS[style]}</option>)}
            </Select>
          </div>
          <RowActionMenu
            label={`Section ${index + 1} actions`}
            pending={busy}
            items={[
              { label: item.isTextOnly ? "Show photo column" : "Text only (hide photos)", onSelect: () => void updateItem({ isTextOnly: !item.isTextOnly }) },
              { label: "Move up", icon: <ArrowUp className="h-3.5 w-3.5" />, disabled: index === 0, onSelect: () => void run(`${item.id}-move`, () => moveMomItemAction({ projectId, itemId: item.id, direction: "up" })) },
              { label: "Move down", icon: <ArrowDown className="h-3.5 w-3.5" />, disabled: index === total - 1, onSelect: () => void run(`${item.id}-move`, () => moveMomItemAction({ projectId, itemId: item.id, direction: "down" })) },
              { label: "Delete section", danger: true, separatorBefore: true, disabled: total <= 1, onSelect: () => void removeSection() },
            ]}
          />
        </div>
      ) : undefined}
    >
      <div className={item.isTextOnly ? "grid gap-3" : "grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]"}>
        {!item.isTextOnly ? (
          <div className="grid content-start gap-3">
            {([0, 1] as const).map((slot) => {
              const image = item.images.find((entry) => entry.slot === slot);
              if (!image && slot === 1 && item.images.length === 0) return null;
              return (
                <PhotoSlot
                  key={slot}
                  slot={slot}
                  image={image ?? null}
                  canEdit={canEdit}
                  busy={busy}
                  onPick={() => onPickImage(slot)}
                  onRemove={() => image && run(`${item.id}-img-del`, () => deleteMomImageAction({ projectId, imageId: image.id }))}
                />
              );
            })}
            {canEdit && item.images.length === 2 ? (
              <Button size="sm" variant="ghost" leadingIcon={<ArrowLeftRight className="h-3.5 w-3.5" />} disabled={busy} onClick={() => run(`${item.id}-swap`, () => swapMomImagesAction({ projectId, itemId: item.id }))}>
                Swap photo order
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="grid content-start gap-2">
          {item.points.map((point, pointIndex) => (
            <PointEditor
              key={`${point.id}:${point.text}`}
              projectId={projectId}
              point={point}
              marker={markers[pointIndex]}
              first={pointIndex === 0}
              last={pointIndex === item.points.length - 1}
              canEdit={canEdit}
              command={command}
            />
          ))}
          {canEdit ? (
            <div>
              <Button size="sm" variant="ghost" leadingIcon={<Plus className="h-3.5 w-3.5" />} pending={pendingKey === `${item.id}-add-point`} onClick={() => run(`${item.id}-add-point`, () => addMomPointAction({ projectId, itemId: item.id }))}>
                Add note
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

function PhotoSlot({ slot, image, canEdit, busy, onPick, onRemove }: { slot: 0 | 1; image: MomImage | null; canEdit: boolean; busy: boolean; onPick: () => void; onRemove: () => void }) {
  if (!image) {
    if (!canEdit) return null;
    return (
      <button
        type="button"
        onClick={onPick}
        disabled={busy}
        className={slot === 0
          ? "flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong bg-surface-muted text-ink-secondary hover:border-line-focus hover:text-ink disabled:opacity-50"
          : "flex w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong px-3 py-2 text-ink-secondary hover:border-line-focus hover:text-ink disabled:opacity-50"}
      >
        <ImagePlus aria-hidden="true" className={slot === 0 ? "h-5 w-5" : "h-4 w-4"} />
        <span className="text-xs font-medium">{slot === 0 ? "Add photo" : "Add second photo"}</span>
      </button>
    );
  }
  return (
    <figure className="m-0 grid gap-1.5">
      <div className="relative aspect-[4/3] overflow-hidden rounded-control border border-line bg-surface-muted">
        {image.url ? (
          <Image src={image.url} alt={`Photo ${slot + 1}`} fill unoptimized sizes="18rem" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-tertiary">Photo unavailable</div>
        )}
      </div>
      {canEdit ? (
        <figcaption className="flex items-center justify-between gap-2">
          <Text tone="tertiary" size="sm">Photo {slot + 1}</Text>
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={busy} onClick={onPick}>Replace</Button>
            <IconButton size="sm" variant="ghost" label={`Remove photo ${slot + 1}`} icon={<Trash2 className="h-3.5 w-3.5" />} disabled={busy} onClick={onRemove} />
          </span>
        </figcaption>
      ) : null}
    </figure>
  );
}

function PointEditor({ projectId, point, marker, first, last, canEdit, command }: { projectId: string; point: MomPoint; marker: string; first: boolean; last: boolean; canEdit: boolean; command: Command }) {
  const { run, pendingKey } = command;
  const [text, setText] = useState(point.text);
  const save = (style: MomPointStyle = point.style) => {
    if (text === point.text && style === point.style) return;
    void run(`${point.id}-save`, () => updateMomPointAction({ projectId, pointId: point.id, text, style }));
  };
  const busy = pendingKey?.startsWith(point.id) ?? false;

  if (!canEdit) {
    return (
      <div className="flex gap-2 text-sm">
        <span className="w-6 shrink-0 font-medium text-ink-secondary">{marker}</span>
        <p className="m-0 whitespace-pre-wrap text-ink">{point.text || "—"}</p>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2">
      <span className="mt-2 w-6 shrink-0 text-right text-sm font-medium tabular-nums text-ink-secondary" aria-hidden="true">{marker}</span>
      <Textarea
        aria-label="Note"
        value={text}
        rows={2}
        maxLength={5000}
        className="min-h-[60px] flex-1"
        placeholder="Describe the observation or decision…"
        onChange={(event) => setText(event.target.value)}
        onBlur={() => save()}
      />
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="w-24">
          <Select density="compact" aria-label="Note style" value={point.style} disabled={busy} onChange={(event) => save(event.target.value as MomPointStyle)}>
            {MOM_POINT_STYLES.map((style) => <option key={style} value={style}>{MOM_POINT_STYLE_LABELS[style]}</option>)}
          </Select>
        </div>
        <div className="flex gap-0.5 opacity-70 group-focus-within:opacity-100 group-hover:opacity-100">
          <IconButton size="sm" variant="ghost" label="Move note up" icon={<ArrowUp className="h-3.5 w-3.5" />} disabled={first || busy} onClick={() => run(`${point.id}-move`, () => moveMomPointAction({ projectId, pointId: point.id, direction: "up" }))} />
          <IconButton size="sm" variant="ghost" label="Move note down" icon={<ArrowDown className="h-3.5 w-3.5" />} disabled={last || busy} onClick={() => run(`${point.id}-move`, () => moveMomPointAction({ projectId, pointId: point.id, direction: "down" }))} />
          <IconButton size="sm" variant="ghost" label="Delete note" icon={<Trash2 className="h-3.5 w-3.5" />} disabled={busy} onClick={() => run(`${point.id}-delete`, () => deleteMomPointAction({ projectId, pointId: point.id }))} />
        </div>
      </div>
    </div>
  );
}
