"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowLeftRight, History, ImagePlus, Plus, Printer, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { versionLabel } from "@/apps/studioflow/domain/revisions";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import {
  Badge,
  Button,
  Dialog,
  Field,
  FormattedInstant,
  IconButton,
  ImageWorkspace,
  InlineError,
  Input,
  RowActionMenu,
  SectionCard,
  SimpleTextEditor,
  Text,
  Textarea,
  useConfirm,
} from "@/platform/ui_engine";

import {
  addMomItemAction,
  deleteMomDocumentAction,
  deleteMomImageAction,
  deleteMomItemAction,
  moveMomItemAction,
  restoreMomRevisionAction,
  saveMomRevisionAction,
  setMomImageAction,
  swapMomImagesAction,
  updateMomDocumentAction,
  updateMomItemAction,
  updateMomItemContentAction,
} from "../../../../actions";
import { useCommand } from "../../../../_components/use-command";

type MomImage = { id: string; slot: 0 | 1; url: string | null };
type MomItem = { id: string; isTextOnly: boolean; content: string; images: MomImage[] };
export type MomDocumentView = {
  id: string;
  topic: string;
  meetingDate: string;
  venue: string | null;
  attendees: string | null;
  preparedByName: string;
  items: MomItem[];
  revisions: Array<{ id: string; number: number; note: string | null; createdByName: string; createdAt: Date }>;
  hasUnsavedChanges: boolean;
  revisionRetention: number;
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

      <RevisionsCard projectId={projectId} document={document} canEdit={canEdit} command={command} confirm={confirm.confirm} />

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
  // Topic/date/prepared-by are required at creation, so there's no genuine
  // "never filled in" state to gate on — collapse by default and let the
  // summary row expand it, rather than trying to infer completeness.
  const [expanded, setExpanded] = useState(false);
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((key) => initial[key] !== draft[key]);
  const set = (key: keyof typeof initial) => (event: { target: { value: string } }) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  const summary = [document.topic, document.meetingDate, document.venue].filter(Boolean).join(" · ");

  if (!expanded) {
    return (
      <SectionCard title="Meeting details">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-between gap-3 rounded-action px-1 py-1.5 text-left hover:bg-surface-muted"
        >
          <Text weight="medium" className="truncate">{summary}</Text>
          <Text tone="tertiary" size="sm" className="shrink-0">{canEdit ? "Edit" : "Show"}</Text>
        </button>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Meeting details"
      description="Project and client come from the project record."
      action={
        <div className="flex gap-2">
          {canEdit ? (
            <Button size="sm" variant="primary" disabled={!dirty} pending={command.pendingKey === "header"} onClick={() => command.run("header", () => updateMomDocumentAction({ projectId, documentId: document.id, ...draft }))}>
              Save details
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}>Collapse</Button>
        </div>
      }
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

function RevisionsCard({ projectId, document, canEdit, command, confirm }: {
  projectId: string;
  document: MomDocumentView;
  canEdit: boolean;
  command: Command;
  confirm: ReturnType<typeof useConfirm>["confirm"];
}) {
  const { locale, timezone } = useDisplaySettings();
  const [naming, setNaming] = useState(false);
  const [note, setNote] = useState("");
  const latest = document.revisions[0] ?? null;
  const status = latest === null
    ? "No revision saved yet."
    : document.hasUnsavedChanges
      ? `Edits since ${versionLabel(latest.number)} are not saved as a revision.`
      : `Everything is saved as ${versionLabel(latest.number)}.`;

  const save = () =>
    command.run("save-revision", () => saveMomRevisionAction({ projectId, documentId: document.id, note: note.trim() || undefined }), () => setNaming(false));

  const restore = async (revision: MomDocumentView["revisions"][number]) => {
    const ok = await confirm({
      title: `Restore ${versionLabel(revision.number)}?`,
      description: document.hasUnsavedChanges
        ? `The MOM goes back to ${versionLabel(revision.number)}. Your current edits are saved as a new revision first, so nothing is lost.`
        : `The MOM goes back to ${versionLabel(revision.number)}. The current version stays available in the history.`,
      confirmLabel: "Restore",
    });
    if (ok) await command.run(`restore-${revision.id}`, () => restoreMomRevisionAction({ projectId, documentId: document.id, revisionId: revision.id }));
  };

  return (
    <SectionCard
      title="Revisions"
      count={document.revisions.length}
      description={`The latest ${document.revisionRetention} are kept; saving another replaces the oldest.`}
      action={canEdit ? (
        <Button size="sm" variant="primary" leadingIcon={<History className="h-3.5 w-3.5" />} disabled={latest !== null && !document.hasUnsavedChanges} onClick={() => { setNote(""); setNaming(true); }}>
          Save revision
        </Button>
      ) : undefined}
      padded={false}
    >
      <p className="m-0 border-b border-line-subtle px-(--ui-section-px) py-2.5 text-sm text-ink-secondary">{status}</p>
      {document.revisions.length === 0 ? null : (
        <ul className="m-0 list-none divide-y divide-line-subtle p-0">
          {document.revisions.map((revision, index) => (
            <li key={revision.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-(--ui-section-px) py-2.5">
              <Badge tone={index === 0 ? "success" : "neutral"} className="shrink-0">{versionLabel(revision.number)}</Badge>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-sm text-ink">{revision.note ?? "Saved revision"}</span>
                <Text tone="tertiary" size="sm" className="truncate">
                  {revision.createdByName}{" · "}
                  <FormattedInstant value={revision.createdAt} locale={locale} timeZone={timezone} style="datetime" />
                </Text>
              </div>
              {canEdit ? (
                <Button size="sm" variant="ghost" leadingIcon={<RotateCcw className="h-3.5 w-3.5" />} pending={command.pendingKey === `restore-${revision.id}`} onClick={() => void restore(revision)}>
                  Restore
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={naming}
        onOpenChange={setNaming}
        title="Save revision"
        description={`Freezes the MOM as ${versionLabel((latest?.number ?? 0) + 1)}. You can keep editing afterwards.`}
        size="sm"
        dismissible={command.pendingKey !== "save-revision"}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setNaming(false)} disabled={command.pendingKey === "save-revision"}>Cancel</Button>
            <Button variant="primary" type="submit" form="save-revision-form" pending={command.pendingKey === "save-revision"}>Save revision</Button>
          </>
        )}
      >
        <form id="save-revision-form" className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <Field label="Note">
            <Input id="save-revision-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} autoFocus placeholder="Optional, e.g. Sent to client" />
          </Field>
          {command.error ? <InlineError>{command.error}</InlineError> : null}
        </form>
      </Dialog>
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
  const { run, pendingKeys } = command;
  const busy = pendingKeys.some((key) => key.startsWith(item.id));

  const updateItem = (patch: Partial<Pick<MomItem, "isTextOnly">>) =>
    run(`${item.id}-item`, () => updateMomItemAction({ projectId, itemId: item.id, isTextOnly: patch.isTextOnly ?? item.isTextOnly }));

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

        <ItemContentEditor projectId={projectId} item={item} canEdit={canEdit} command={command} />
      </div>
    </SectionCard>
  );
}

function ItemContentEditor({ projectId, item, canEdit, command }: { projectId: string; item: MomItem; canEdit: boolean; command: Command }) {
  const { run } = command;
  const [text, setText] = useState(item.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCursor = useRef<number | null>(null);
  const save = () => {
    if (text === item.content) return;
    void run(`${item.id}-content`, () => updateMomItemContentAction({ projectId, itemId: item.id, content: text }));
  };

  useEffect(() => {
    if (pendingCursor.current === null || !textareaRef.current) return;
    textareaRef.current.setSelectionRange(pendingCursor.current, pendingCursor.current);
    pendingCursor.current = null;
  }, [text]);

  // Auto-continues a typed "1." / "-" / "•" list on Enter, the way any modern
  // editor (or WhatsApp) does — the marker is a literal typed character here,
  // not a computed style, so this always applies.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    const cursor = event.currentTarget.selectionStart;
    const before = text.slice(0, cursor);
    const lineStart = before.lastIndexOf("\n") + 1;
    const currentLine = before.slice(lineStart);
    const numbered = currentLine.match(/^(\d+)\.\s/);
    const bulleted = currentLine.match(/^([-•])\s/);
    if (!numbered && !bulleted) return;
    event.preventDefault();
    const prefix = numbered ? numbered[0] : bulleted![0];
    if (currentLine.slice(prefix.length).trim() === "") {
      // Enter on an empty marker line ends the list instead of repeating it forever.
      setText(text.slice(0, lineStart) + text.slice(cursor));
      pendingCursor.current = lineStart;
      return;
    }
    const insertion = `\n${numbered ? `${Number(numbered[1]) + 1}. ` : bulleted![0] + " "}`;
    setText(text.slice(0, cursor) + insertion + text.slice(cursor));
    pendingCursor.current = cursor + insertion.length;
  };

  if (!canEdit) {
    return <p className="m-0 whitespace-pre-wrap text-sm text-ink">{item.content || "—"}</p>;
  }

  return (
    <SimpleTextEditor
      ref={textareaRef}
      aria-label="Section notes"
      value={text}
      rows={4}
      maxLength={20000}
      placeholder="Describe the observations or decisions for this section…"
      onChange={(event) => setText(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={save}
    />
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

