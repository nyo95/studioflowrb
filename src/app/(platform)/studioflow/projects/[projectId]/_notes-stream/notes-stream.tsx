"use client";

import { FileText, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { currentDateOnly, formatInstant } from "@platform/utilities/date";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { Badge, Button, FormattedInstant, FormattedText, IconButton, ImageGallery, InlineError, PillTabs, RichTextEditor, RowActionMenu, SectionCard, Text, useConfirm } from "@/platform/ui_engine";

import { phaseNoteAction, type PhaseNoteCommandInput } from "../../../actions";
import { NOTE_MAX, NoteComposer, type NoteImage } from "../../../_components/phase-note-composer";
import { NoteImageActions } from "../round-labels";

export type NotesStreamRow = {
  id: string;
  body: string;
  starred: boolean;
  clientFeedback: boolean;
  origin: "NOTE" | "CLIENT_ANSWER" | "SITE_VISIT";
  /** Recorded by a phase step: whether it is client feedback cannot change. */
  workflowRecord: boolean;
  authorName: string | null;
  createdAt: Date;
  editedAt: Date | null;
  iterationId: string | null;
  iterationLabel: string | null;
  kind: "TEXT" | "IMAGE" | "FILE";
  images: readonly NoteImage[];
  file: { url: string | null; name: string; contentType: string; bytes: number } | null;
};

type Filter = "all" | "starred" | "client" | `round:${string}`;
type NoteCommand = DistributiveOmit<PhaseNoteCommandInput, "projectId" | "phaseId">;
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The phase's notes as a chat to yourself (owner 2026-10-08, WO-SF-NOTEFEED-01; back as the Phases page's default in
 * R9.09 while the Workspace board module is off): type, Enter, and it is posted with time, author and the round it was
 * written in; pasted images and files are their own messages. Starred messages sit on top; a message can be marked as
 * client feedback (except what a phase step recorded), edited or deleted. It reads the same notes as the board.
 */
export function NotesStream({ projectId, projectName, phaseId, phaseName, notes, canEdit, canUseIdeas }: {
  projectId: string;
  projectName: string;
  phaseId: string;
  phaseName: string;
  notes: readonly NotesStreamRow[];
  canEdit: boolean;
  canUseIdeas: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { locale, timezone } = useDisplaySettings();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  // The newest message sits next to the composer: open at the bottom, and follow new messages.
  useEffect(() => {
    const stream = streamRef.current;
    if (stream) stream.scrollTop = stream.scrollHeight;
  }, [notes.length, filter]);

  const run = async (key: string, command: NoteCommand) => {
    setBusy(key); setError(null);
    try {
      const result = await phaseNoteAction({ ...command, projectId, phaseId } as PhaseNoteCommandInput);
      if (!result.ok) { setError(result.error.safeMessage); return false; }
      router.refresh();
      return true;
    } catch {
      setError("The change could not be saved. Please try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };
  const remove = async (note: NotesStreamRow) => {
    const what = note.kind === "IMAGE" ? "image" : note.kind === "FILE" ? "file" : "note";
    const ok = await confirm.confirm({ title: `Delete this ${what}?`, description: "This cannot be undone.", confirmLabel: `Delete ${what}`, tone: "danger" });
    if (ok) await run(`delete:${note.id}`, { command: "delete", noteId: note.id });
  };

  // Rounds by id: two rounds may show the same label.
  const rounds = [...new Map(notes.filter((note) => note.iterationId && note.iterationLabel).map((note) => [note.iterationId!, note.iterationLabel!])).entries()];
  const starred = notes.filter((note) => note.starred);
  const clientCount = notes.filter((note) => note.clientFeedback).length;
  const shown = filter === "all" ? notes
    : filter === "starred" ? starred
    : filter === "client" ? notes.filter((note) => note.clientFeedback)
    : notes.filter((note) => `round:${note.iterationId}` === filter);

  let lastDay: string | null = null;
  const today = currentDateOnly({ timeZone: timezone });

  return (
    <SectionCard title={`Notes · ${phaseName}`} count={notes.length || undefined}>
      <div className="grid gap-3">
        {notes.length > 0 ? (
          <PillTabs
            label="Show notes"
            items={[
              { key: "all", label: "All", active: filter === "all", onSelect: () => setFilter("all") },
              { key: "starred", label: "Starred", count: starred.length || undefined, active: filter === "starred", onSelect: () => setFilter("starred") },
              { key: "client", label: "Client feedback", count: clientCount || undefined, active: filter === "client", onSelect: () => setFilter("client") },
              ...rounds.map(([id, label]) => ({ key: `round:${id}`, label, active: filter === `round:${id}`, onSelect: () => setFilter(`round:${id}`) })),
            ]}
          />
        ) : null}

        {filter === "all" && starred.length > 0 ? (
          <div className="grid gap-1.5 rounded-control border border-line-subtle bg-surface-muted/40 p-3">
            <Text size="sm" weight="semibold">Starred</Text>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {starred.map((note) => (
                <li key={note.id} className="flex items-start gap-2">
                  <Star aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-warning text-warning" />
                  <div className="min-w-0 flex-1">
                    {note.body ? <div className="line-clamp-3"><FormattedText text={note.body} className="text-sm" /></div> : <Text size="sm" tone="tertiary">{note.kind === "FILE" ? note.file?.name ?? "File" : "Image"}</Text>}
                    <Text size="sm" tone="tertiary">{[note.iterationLabel, note.authorName].filter(Boolean).join(" · ")}</Text>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div ref={streamRef} className="grid max-h-[34rem] gap-2 overflow-y-auto pr-1" aria-label="Notes" role="log">
          {shown.length === 0 ? (
            <Text as="p" size="sm" tone="tertiary">{notes.length === 0 ? "Nothing here yet. Drop anything you learn about this phase below: info, client feedback, screenshots." : "No notes match this view."}</Text>
          ) : shown.map((note) => {
            const day = currentDateOnly({ now: new Date(note.createdAt), timeZone: timezone });
            const header = day !== lastDay ? (day === today ? "Today" : formatInstant(new Date(note.createdAt), { locale, timeZone: timezone, style: "date" })) : null;
            lastDay = day;
            return (
              <div key={note.id} className="grid gap-2">
                {header ? <div className="my-1 flex items-center gap-2 text-xs text-ink-tertiary"><span className="h-px flex-1 bg-line-subtle" />{header}<span className="h-px flex-1 bg-line-subtle" /></div> : null}
                <NoteBubble note={note} projectId={projectId} projectName={projectName} phaseId={phaseId} canEdit={canEdit} canUseIdeas={canUseIdeas} locale={locale} timezone={timezone} busy={busy} run={run} onDelete={(target) => void remove(target)} />
              </div>
            );
          })}
        </div>

        {error ? <InlineError>{error}</InlineError> : null}
        {canEdit ? <div className="border-t border-line-subtle pt-3"><NoteComposer projectId={projectId} phaseId={phaseId} /></div> : null}
      </div>
      {confirm.dialog}
    </SectionCard>
  );
}

function NoteBubble({ note, projectId, projectName, phaseId, canEdit, canUseIdeas, locale, timezone, busy, run, onDelete }: {
  note: NotesStreamRow;
  projectId: string;
  projectName: string;
  phaseId: string;
  canEdit: boolean;
  canUseIdeas: boolean;
  locale: string;
  timezone: string;
  busy: string | null;
  run: (key: string, command: NoteCommand) => Promise<boolean>;
  onDelete: (note: NotesStreamRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [saving, setSaving] = useState(false);
  const isText = note.kind === "TEXT";

  const save = async () => {
    setSaving(true);
    try {
      if (await run(`edit:${note.id}`, { command: "edit", noteId: note.id, body: draft.trim() || null })) setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const items = [
    ...(isText ? [{ label: "Edit", onSelect: () => { setDraft(note.body); setEditing(true); } }] : []),
    // What a phase step recorded stays client feedback (or a site visit) as recorded.
    ...(note.workflowRecord ? [] : [{ label: note.clientFeedback ? "Not client feedback" : "Mark as client feedback", onSelect: () => void run(`client:${note.id}`, { command: "flags", noteId: note.id, clientFeedback: !note.clientFeedback }) }]),
    { label: "Delete", danger: true, separatorBefore: true, onSelect: () => onDelete(note) },
  ];

  return (
    <article className={`group grid gap-1.5 rounded-control border px-3 py-2 ${note.clientFeedback ? "border-warning/40 bg-warning/5" : "border-line-subtle bg-surface"}`} aria-label={`${note.kind === "IMAGE" ? "Image" : note.kind === "FILE" ? "File" : "Note"} from ${formatInstant(new Date(note.createdAt), { locale, timeZone: timezone, style: "datetime" })}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {note.iterationLabel ? <Badge tone="neutral">{note.iterationLabel}</Badge> : null}
        {note.clientFeedback ? <Badge tone="warning">Client feedback</Badge> : null}
        {note.origin === "SITE_VISIT" ? <Badge tone="neutral">Site visit</Badge> : null}
        <Text size="sm" tone="tertiary">
          {note.authorName ? `${note.authorName} · ` : ""}<FormattedInstant value={note.createdAt} locale={locale} timeZone={timezone} style="time" />{note.editedAt ? " · edited" : ""}
        </Text>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton
            size="sm"
            variant="ghost"
            label={note.starred ? "Unstar" : "Star"}
            aria-pressed={note.starred}
            disabled={!canEdit}
            pending={busy === `star:${note.id}`}
            icon={<Star aria-hidden="true" className={note.starred ? "fill-warning text-warning" : ""} />}
            onClick={() => void run(`star:${note.id}`, { command: "flags", noteId: note.id, starred: !note.starred })}
            className={note.starred || !canEdit ? "" : "opacity-60 group-hover:opacity-100 focus-visible:opacity-100"}
          />
          {canEdit && !editing ? <RowActionMenu label="Note actions" pending={busy === `delete:${note.id}` || busy === `client:${note.id}`} items={items} /> : null}
        </div>
      </div>

      {editing ? (
        <div className="grid gap-2">
          <RichTextEditor aria-label="Edit note" maxLength={NOTE_MAX} value={draft} autoFocus onChange={setDraft} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" pending={saving} disabled={!draft.trim()} onClick={() => void save()}>Save</Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          {note.body ? <FormattedText text={note.body} className="text-sm" /> : null}
          {note.images.length > 0 ? <ImageGallery images={note.images} viewerActions={(image) => <NoteImageActions image={image} projectId={projectId} projectName={projectName} phaseId={phaseId} canUseIdeas={canUseIdeas} />} /> : null}
          {note.file ? (
            <div className="flex items-center gap-3">
              <FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-secondary" />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-semibold text-ink">{note.file.name}</span>
                <span className="text-xs text-ink-tertiary">{formatBytes(note.file.bytes)}</span>
              </span>
              {note.file.url ? <a href={note.file.url} download={note.file.name} className="inline-flex h-8 shrink-0 items-center rounded-action bg-action px-3 text-xs font-medium text-action-ink hover:bg-action-hover">Open</a> : <Text size="sm" tone="tertiary">Unavailable</Text>}
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}
