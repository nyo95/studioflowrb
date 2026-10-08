"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { currentDateOnly, formatInstant } from "@platform/utilities/date";
import { Badge, Button, FormattedInstant, FormattedText, IconButton, ImageGallery, InlineError, PillTabs, RichTextEditor, RowActionMenu, SectionCard, Text, useConfirm, useFileIntake } from "@/platform/ui_engine";

import { phaseNoteAction, type PhaseNoteCommandInput } from "../../actions";
import { NOTE_MAX, NoteComposer, uploadNoteImages, type NoteImage } from "../../_components/phase-note-composer";
import type { IterationView } from "../../_components/phase-commands";

export type IterationRow = { id: string; name: string; shortName: string; state: IterationView["state"]; createdAt: Date; sentAt: Date | null; answeredAt: Date | null; doneAt: Date | null; visitDate: string | null };

export type PhaseNoteRow = {
  id: string;
  body: string;
  starred: boolean;
  clientFeedback: boolean;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
  editedAt: Date | null;
  iterationId: string | null;
  iterationLabel: string | null;
  images: readonly NoteImage[];
};

export const ITERATION_STATE_LABEL: Record<IterationView["state"], string> = { NOT_SENT: "In progress", SENT: "With client", ANSWERED: "Client answered", REVISED: "Revision asked", DONE: "Approved" };
export const ITERATION_STATE_TONE: Record<IterationView["state"], "neutral" | "warning" | "success"> = { NOT_SENT: "neutral", SENT: "warning", ANSWERED: "success", REVISED: "neutral", DONE: "success" };

const ACCEPTED = "image/png,image/jpeg,image/webp";

type Filter = "all" | "starred" | "client" | string;

type NoteCommand = DistributiveOmit<PhaseNoteCommandInput, "projectId" | "phaseId">;
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

/**
 * The phase's notes as a chat to yourself (owner, 2026-10-08, WO-SF-NOTEFEED-01): type, Enter, and it is posted with
 * time, author and the iteration it was written in. Starred messages sit on top as the phase's pinned notes; a
 * message can be marked as client feedback, edited or deleted. Nothing here is a phase step, so there is no Undo bar.
 */
export function NotesWorkspace({ projectId, phaseId, notes, iterations, currentId, closedBySkipId, canEdit, locale, timezone, onRename }: {
  projectId: string;
  phaseId: string;
  notes: readonly PhaseNoteRow[];
  iterations: IterationRow[];
  currentId: string | null;
  closedBySkipId: string | null;
  canEdit: boolean;
  locale: string;
  timezone: string;
  onRename: (iteration: IterationRow) => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const ordered = [...iterations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
  const remove = async (note: PhaseNoteRow) => {
    const ok = await confirm.confirm({ title: "Delete this note?", description: note.images.length ? "The note and its images are removed. This cannot be undone." : "The note is removed. This cannot be undone.", confirmLabel: "Delete note", tone: "danger" });
    if (ok) await run(`delete:${note.id}`, { command: "delete", noteId: note.id });
  };

  const starred = notes.filter((note) => note.starred);
  const clientCount = notes.filter((note) => note.clientFeedback).length;
  const shown = filter === "all" ? notes : filter === "starred" ? starred : filter === "client" ? notes.filter((note) => note.clientFeedback) : notes.filter((note) => note.iterationId === filter);
  const iterationShown = ordered.find((item) => item.id === filter) ?? null;
  const outcomeOf = (row: IterationRow) => row.visitDate ? `Visit ${row.visitDate}` : row.id === closedBySkipId ? "Closed by skip" : row.id === currentId ? ITERATION_STATE_LABEL[row.state] : row.state === "DONE" ? "Approved" : row.state === "REVISED" ? "Revision asked" : "Closed";

  const bubbleProps = { projectId, phaseId, canEdit, locale, timezone, busy, run, onDelete: (note: PhaseNoteRow) => void remove(note) };
  let lastDay: string | null = null;
  const today = currentDateOnly({ timeZone: timezone });

  return (
    <SectionCard title="Notes" count={notes.length || undefined}>
      <div className="grid gap-3">
        {notes.length > 0 ? (
          <PillTabs
            label="Show notes"
            items={[
              { key: "all", label: "All", active: filter === "all", onSelect: () => setFilter("all") },
              { key: "starred", label: "Starred", count: starred.length || undefined, active: filter === "starred", onSelect: () => setFilter("starred") },
              { key: "client", label: "Client feedback", count: clientCount || undefined, active: filter === "client", onSelect: () => setFilter("client") },
              ...ordered.map((row) => ({ key: row.id, label: row.shortName, count: row.id === currentId ? "now" : undefined, active: filter === row.id, onSelect: () => setFilter(row.id) })),
            ]}
          />
        ) : null}

        {iterationShown ? (
          <div className="flex flex-wrap items-start justify-between gap-2 rounded-control border border-line-subtle bg-surface-muted/40 px-3 py-2">
            <div className="grid gap-0.5">
              <div className="flex flex-wrap items-center gap-2"><Text size="sm" weight="semibold"><span title={iterationShown.name}>{iterationShown.shortName}</span></Text><Badge tone={ITERATION_STATE_TONE[iterationShown.state]}>{outcomeOf(iterationShown)}</Badge></div>
              <Text size="sm" tone="tertiary">{iterationShown.sentAt ? <>sent <FormattedInstant value={iterationShown.sentAt} locale={locale} timeZone={timezone} /></> : <>created <FormattedInstant value={iterationShown.createdAt} locale={locale} timeZone={timezone} /></>}{iterationShown.answeredAt ? <> · answered <FormattedInstant value={iterationShown.answeredAt} locale={locale} timeZone={timezone} /></> : null}</Text>
            </div>
            {canEdit ? <RowActionMenu items={[{ label: "Rename iteration", onSelect: () => onRename(iterationShown) }]} label={`${iterationShown.shortName} actions`} /> : null}
          </div>
        ) : null}

        {filter === "all" && starred.length > 0 ? (
          <div className="grid gap-1.5 rounded-control border border-line-subtle bg-surface-muted/40 p-3">
            <Text size="sm" weight="semibold">Starred</Text>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {starred.map((note) => (
                <li key={note.id} className="flex items-start gap-2">
                  <Star aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-warning text-warning" />
                  <div className="min-w-0 flex-1">
                    {note.body ? <div className="line-clamp-3"><FormattedText text={note.body} className="text-sm" /></div> : <Text size="sm" tone="tertiary">{note.images.length} image{note.images.length === 1 ? "" : "s"}</Text>}
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
                <NoteBubble note={note} {...bubbleProps} />
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

function NoteBubble({ note, projectId, phaseId, canEdit, locale, timezone, busy, run, onDelete }: {
  note: PhaseNoteRow;
  projectId: string;
  phaseId: string;
  canEdit: boolean;
  locale: string;
  timezone: string;
  busy: string | null;
  run: (key: string, command: NoteCommand) => Promise<boolean>;
  onDelete: (note: PhaseNoteRow) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [uploading, setUploading] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);

  // While editing, a pasted or dropped image is added to this message straight away.
  const intake = useFileIntake({
    accept: ACCEPTED,
    multiple: true,
    disabled: !editing,
    onFiles: async (files, refused) => {
      setUploading(files.length);
      const { problems: failed } = await uploadNoteImages(projectId, phaseId, note.id, files);
      setUploading(0);
      setProblems([...(refused.length ? ["Only PNG, JPEG or WebP images can be added."] : []), ...failed]);
      router.refresh();
    },
  });

  const save = async () => {
    if (await run(`edit:${note.id}`, { command: "edit", noteId: note.id, body: draft.trim() || null })) setEditing(false);
  };

  return (
    <article className={`group grid gap-1.5 rounded-control border px-3 py-2 ${note.clientFeedback ? "border-warning/40 bg-warning/5" : "border-line-subtle bg-surface"}`} aria-label={`Note from ${formatInstant(new Date(note.createdAt), { locale, timeZone: timezone, style: "datetime" })}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {note.iterationLabel ? <Badge tone="neutral">{note.iterationLabel}</Badge> : null}
        {note.clientFeedback ? <Badge tone="warning">Client feedback</Badge> : null}
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
          {canEdit && !editing ? (
            <RowActionMenu
              label="Note actions"
              pending={busy === `delete:${note.id}` || busy === `client:${note.id}`}
              items={[
                { label: "Edit", onSelect: () => { setDraft(note.body); setProblems([]); setEditing(true); } },
                { label: note.clientFeedback ? "Not client feedback" : "Mark as client feedback", onSelect: () => void run(`client:${note.id}`, { command: "flags", noteId: note.id, clientFeedback: !note.clientFeedback }) },
                { label: "Delete", danger: true, separatorBefore: true, onSelect: () => onDelete(note) },
              ]}
            />
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className={`grid gap-2 rounded-control ${intake.active ? "outline-2 outline-dashed outline-offset-4 outline-line-focus" : ""}`} {...intake.target}>
          <RichTextEditor aria-label="Edit note" maxLength={NOTE_MAX} value={draft} autoFocus onChange={setDraft} />
          <ImageGallery images={note.images} size="sm" onRemove={(image) => void run(`image:${image.id}`, { command: "removeImage", imageId: image.id })} removingId={busy?.startsWith("image:") ? busy.slice(6) : null} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" pending={busy === `edit:${note.id}`} disabled={uploading > 0} onClick={() => void save()}>Save</Button>
            <Button size="sm" variant="ghost" disabled={busy === `edit:${note.id}`} onClick={() => setEditing(false)}>Cancel</Button>
            <Text size="sm" tone="tertiary">{uploading > 0 ? `Adding ${uploading} image${uploading === 1 ? "" : "s"}…` : "Paste or drop an image to add it."}</Text>
          </div>
          {problems.length > 0 ? <InlineError>{problems.join(" ")}</InlineError> : null}
        </div>
      ) : (
        <>
          {note.body ? <FormattedText text={note.body} className="text-sm" /> : null}
          <ImageGallery images={note.images} />
        </>
      )}
    </article>
  );
}
