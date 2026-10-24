"use client";

import { FileText, Send, Star, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";

import { currentDateOnly, formatInstant } from "@platform/utilities/date";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { Button, Dialog, FormattedInstant, FormattedText, HoverCard, IconButton, ImageGallery, ImageMarkup, InlineError, PillTabs, RichTextEditor, RowActionMenu, Select, Text, useConfirm, type EditorToken } from "@/platform/ui_engine";

import { listNoteTagsAction, listProjectNotesAction, noteAction, phaseNoteAction, postThreadImageAction, searchNoteItemsAction, type NoteCommandInput } from "../../../actions";
import { NOTE_IMAGE_BYTES, NOTE_MAX, NoteDraftFields, uploadPhaseImages, useNoteDraft, type NoteImage } from "../../../_components/phase-note-composer";
import { NoteImageActions } from "../round-labels";
import { plainNoteText as plain, noteCodeKey as codeKey, resolveNoteItemIds } from "./note-mentions";
import { createNoteReadSequence } from "./note-read-sequence";
import { inlineNoteItem, NOTE_CODE_PATTERN, remainingNoteItems, suggestionPosition, suggestionState, type Suggestion } from "./note-suggestions";

export type ChatNote = {
  id: string;
  version: number;
  body: string;
  pinned: boolean;
  origin: "NOTE" | "CLIENT_ANSWER" | "SITE_VISIT";
  workflowRecord: boolean;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
  editedAt: Date | null;
  phaseId: string | null;
  phaseName: string | null;
  iterationLabel: string | null;
  kind: "TEXT" | "IMAGE" | "FILE";
  images: readonly NoteImage[];
  file: { url: string | null; name: string; contentType: string; bytes: number } | null;
  replyTo: { id: string; kind: "TEXT" | "IMAGE" | "FILE"; excerpt: string; authorName: string | null; clientFeedback: boolean } | null;
  tags: readonly string[];
  items: readonly { entryId: string; code: string; name: string | null; location: string | null; thumbnailUrl: string | null }[];
  /** Set on a message of a Workspace board thread (WO-SF-BOARD-THREADS-01). */
  threadId?: string | null;
  /** Messages in board threads attached to this element; deleting it deletes them too. */
  anchoredThreadMessages?: number;
};

/** Which notes this chat shows: a board thread (`null` before its first message exists) or every thread's messages. */
export type NoteScope = { threadId: string | null } | { inThreads: true };
type PostedText = { phaseId: string; body: string; clientFeedback: boolean; replyToId?: string; tags: string[]; itemEntryIds: string[] };
type PostedImages = { phaseId: string; clientFeedback: boolean; replyToId?: string; tags: string[] };
/** Where the composer sends: the project Notes stream by default, or a board thread. */
export type NotePoster = {
  text: (input: PostedText) => Promise<{ ok: true } | { ok: false; message: string }>;
  images: (input: PostedImages, files: readonly File[]) => Promise<{ problems: string[]; failed: File[] }>;
};
const scopeQuery = (scope: NoteScope | undefined): { threadId?: string; inThreads?: true } =>
  !scope ? {} : "inThreads" in scope ? { inThreads: true } : scope.threadId ? { threadId: scope.threadId } : {};
function notesPoster(projectId: string): NotePoster {
  return {
    text: async (input) => {
      const posted = await phaseNoteAction({ command: "post", projectId, ...input });
      return posted.ok ? { ok: true } : { ok: false, message: posted.error.safeMessage };
    },
    images: (input, files) => uploadPhaseImages({ projectId, ...input }, files),
  };
}

export type ChatPhase = { id: string; label: string; iteration: string | null };

type Filter = { kind: "all" } | { kind: "phase"; id: string } | { kind: "feedback" } | { kind: "starred" } | { kind: "tag"; name: string };
type NoteCommand = DistributiveOmit<NoteCommandInput, "projectId">;
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
type NoteChange = { ok: true } | { ok: false; code?: string };

/** Consecutive images from one person, sent within this window and labelled alike, read as one album (like WhatsApp). */
const ALBUM_WINDOW_MS = 60_000;
const PAGE = 100;

/** One message, or several images that arrived together. */
type Entry = { key: string; notes: ChatNote[] };

function groupAlbums(notes: readonly ChatNote[]): Entry[] {
  const entries: Entry[] = [];
  for (const note of notes) {
    const last = entries.at(-1);
    const head = last?.notes[0];
    const tail = last?.notes.at(-1);
    const joins = head && tail && note.kind === "IMAGE" && head.kind === "IMAGE" && !note.replyTo && !note.body
      && note.authorId !== null && note.authorId === head.authorId && note.phaseId === head.phaseId && note.origin === head.origin
      && note.tags.join() === head.tags.join()
      && new Date(note.createdAt).getTime() - new Date(tail.createdAt).getTime() <= ALBUM_WINDOW_MS;
    if (joins) last!.notes.push(note);
    else entries.push({ key: note.id, notes: [note] });
  }
  return entries;
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const TAG = /(?:^|\s)#([A-Za-z0-9_-]{1,32})(?=$|[\s.,!?;:)])/g;
const TOKEN_TRIGGERS = ["@", "#"];

/**
 * The project's notes as one chat to yourself (owner 2026-10-14, mockup "Notes — gaya chat"): every phase in one
 * stream, newest at the bottom; images sent together read as an album; a message can answer another; `#` tags a
 * topic (the phase tag comes from the composer), `@HT1` links a Product Schedule item. Writing follows each phase's
 * rule, so the composer offers only the phases this person may write.
 */
export function NotesChat({ projectId, projectName, currentUserId, phases, writablePhaseIds, canEditGeneral, defaultPhaseId, initial, canUseIdeas, canUsePresentation, canUseInSchedule, scopeOf, poster, header, composer = true, emptyText, onLocate }: {
  projectId: string;
  projectName: string;
  currentUserId: string;
  phases: readonly ChatPhase[];
  writablePhaseIds: readonly string[];
  canEditGeneral: boolean;
  defaultPhaseId: string | null;
  initial: { notes: readonly ChatNote[]; cursor: string | null };
  canUseIdeas: boolean;
  canUsePresentation: boolean;
  /** A book reader who may edit the Schedule: offers "Use in schedule" under a note image. */
  canUseInSchedule: boolean;
  /** Read at request time, so a thread created by the first message is followed at once. Without it: every note. */
  scopeOf?: () => NoteScope;
  poster?: NotePoster;
  /** Replaces the title and filters (a board thread window has its own header). */
  header?: ReactNode;
  composer?: boolean;
  emptyText?: string;
  /** Offers "Show on board" on board-thread messages. */
  onLocate?: (note: ChatNote) => void;
}) {
  const confirm = useConfirm();
  const { locale, timezone } = useDisplaySettings();
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [notes, setNotes] = useState<readonly ChatNote[]>(initial.notes);
  const [cursor, setCursor] = useState<string | null>(initial.cursor);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatNote | null>(null);
  const [markup, setMarkup] = useState<{ note: ChatNote; url: string } | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const readSequence = useRef(createNoteReadSequence());
  const view = useRef({ filter: { kind: "all" } as Filter, count: initial.notes.length });
  const position = useRef<{ top: number; anchorId?: string; offset?: number } | null>(null);
  const writable = useMemo(() => new Set(writablePhaseIds), [writablePhaseIds]);

  const scopeRef = useRef(scopeOf);
  useEffect(() => { scopeRef.current = scopeOf; });
  const query = useCallback((target: Filter) => ({
    ...scopeQuery(scopeRef.current?.()),
    projectId,
    ...(target.kind === "phase" ? { phaseId: target.id } : {}),
    ...(target.kind === "feedback" ? { clientFeedback: true } : {}),
    ...(target.kind === "starred" ? { starred: true } : {}),
    ...(target.kind === "tag" ? { tag: target.name } : {}),
  }), [projectId]);

  const rememberPosition = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || stickToBottom.current) { position.current = null; return; }
    const top = stream.getBoundingClientRect().top;
    const anchor = [...stream.querySelectorAll<HTMLElement>("article[id]")].find((item) => item.getBoundingClientRect().bottom > top);
    position.current = { top: stream.scrollTop, anchorId: anchor?.id, offset: anchor ? anchor.getBoundingClientRect().top - top : undefined };
  }, []);

  const replacePage = useCallback((page: { notes: readonly ChatNote[]; cursor: string | null }) => {
    rememberPosition();
    view.current.count = page.notes.length;
    setNotes(page.notes); setCursor(page.cursor);
  }, [rememberPosition]);

  const reload = useCallback(async (target: Filter = view.current.filter, options: { keepError?: boolean; newest?: boolean; firstPage?: boolean } = {}) => {
    const current = readSequence.current.begin();
    const scope = scopeRef.current?.();
    if (scope && "threadId" in scope && !scope.threadId) { replacePage({ notes: [], cursor: null }); return true; }
    setLoading(true);
    try {
      // Keep enough authoritative pages for a reader who has already loaded older notes.
      const count = options.firstPage ? PAGE : Math.max(PAGE, view.current.count);
      const fetched: ChatNote[] = [];
      let next: string | null = null;
      do {
        const result = await listProjectNotesAction({ ...query(target), limit: PAGE, ...(next ? { cursor: next } : {}) });
        if (!current()) return false;
        if (!result.ok) { setError(result.error.safeMessage); return false; }
        fetched.push(...result.data.notes as ChatNote[]); next = result.data.cursor;
      } while (next && fetched.length < count);
      if (options.newest) stickToBottom.current = true;
      replacePage({ notes: fetched, cursor: next });
      if (!options.keepError) setError(null);
      return true;
    } catch {
      if (current()) setError("The notes could not be loaded. Please try again.");
      return false;
    } finally {
      if (current()) setLoading(false);
    }
  }, [query, replacePage]);

  useEffect(() => {
    const sequence = readSequence.current;
    sequence.resume();
    return () => sequence.dispose();
  }, []);

  // A board thread or the all-threads stream has no server-rendered first page: read it once mounted.
  useEffect(() => {
    if (scopeRef.current) void reload(undefined, { newest: true, firstPage: true });
  }, [reload]);

  const served = useRef(initial);
  useEffect(() => {
    if (served.current === initial) return;
    served.current = initial;
    const current = readSequence.current.begin();
    // Defer state updates to the refresh task; do not reset the reader's filter or edit components.
    const timer = setTimeout(() => {
      if (!current()) return;
      if (view.current.filter.kind === "all" && view.current.count <= PAGE) {
        replacePage(initial); setLoading(false);
      } else void reload();
    }, 0);
    return () => clearTimeout(timer);
  }, [initial, reload, replacePage]);

  const olderPage = async () => {
    if (!cursor || loading) return;
    const current = readSequence.current.begin();
    setLoading(true);
    try {
      const result = await listProjectNotesAction({ ...query(filter), limit: PAGE, cursor });
      if (!current()) return;
      if (!result.ok) { setError(result.error.safeMessage); return; }
      stickToBottom.current = false;
      replacePage({ notes: [...new Map([...notes, ...result.data.notes as ChatNote[]].map((note) => [note.id, note])).values()], cursor: result.data.cursor });
    } catch {
      if (current()) setError("The notes could not be loaded. Please try again.");
    } finally {
      if (current()) setLoading(false);
    }
  };
  const choose = (target: Filter) => {
    view.current.filter = target;
    setFilter(target);
    void reload(target, { newest: true, firstPage: true });
  };

  // The server sends newest first; the chat reads oldest to newest with the newest next to the composer.
  const ordered = useMemo(() => [...notes].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [notes]);
  const entries = useMemo(() => groupAlbums(ordered), [ordered]);
  useLayoutEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    if (stickToBottom.current) stream.scrollTop = stream.scrollHeight;
    else if (position.current) {
      const saved = position.current;
      const anchor = [...stream.querySelectorAll<HTMLElement>("article[id]")].find((item) => item.id === saved.anchorId);
      stream.scrollTop = anchor && saved.offset !== undefined
        ? stream.scrollTop + anchor.getBoundingClientRect().top - stream.getBoundingClientRect().top - saved.offset
        : saved.top;
    }
    position.current = null;
  }, [entries]);

  const run = async (key: string, command: NoteCommand): Promise<NoteChange> => {
    setBusy(key); setError(null);
    try {
      const result = await noteAction({ ...command, projectId });
      if (!result.ok) { setError(result.error.safeMessage); return { ok: false, code: result.error.code }; }
      return { ok: true };
    } catch {
      setError("The change could not be saved. Please try again.");
      return { ok: false };
    } finally {
      setBusy(null);
    }
  };
  const runAll = async (key: string, group: readonly ChatNote[], command: (note: ChatNote) => NoteCommand) => {
    for (const note of group) if (!(await run(key, command(note))).ok) break;
    await reload(undefined, { keepError: true });
  };
  const remove = async (group: readonly ChatNote[]) => {
    const what = group.length > 1 ? `these ${group.length} images` : group[0]!.kind === "IMAGE" ? "this image" : group[0]!.kind === "FILE" ? "this file" : "this note";
    const attached = group.reduce((sum, note) => sum + (note.anchoredThreadMessages ?? 0), 0);
    const ok = await confirm.confirm({ title: `Delete ${what}?`, description: attached ? `The ${attached} board note${attached === 1 ? "" : "s"} attached to it will be deleted too. This cannot be undone.` : "This cannot be undone.", confirmLabel: "Delete", tone: "danger" });
    if (ok) await runAll(`delete:${group[0]!.id}`, group, (note) => ({ command: "delete", noteId: note.id, version: note.version }));
  };

  // A marked-up copy is a new image replying to the original (owner 2026-10-15); the original is never changed.
  const replyPhase = (note: ChatNote) => (note.phaseId && writable.has(note.phaseId) ? note.phaseId : defaultPhaseId && writable.has(defaultPhaseId) ? defaultPhaseId : writablePhaseIds[0] ?? null);
  const postMarkup = async (note: ChatNote, file: File) => {
    const phaseId = replyPhase(note);
    if (!phaseId) { setError("You can read these notes but not reply to them."); return; }
    if (note.threadId) {
      const form = new FormData();
      form.set("projectId", projectId); form.set("phaseId", phaseId); form.set("threadId", note.threadId);
      form.set("replyToId", note.id); form.set("clientFeedback", "false"); form.set("file", file);
      const result = await postThreadImageAction(form);
      // With the board switched off a board note is still a project note: reply in the Notes stream instead.
      if (!result.ok && result.error.code !== "MODULE_DISABLED") { setError(result.error.safeMessage); return; }
      if (result.ok) { setMarkup(null); stickToBottom.current = true; await reload(undefined, { newest: true }); return; }
    }
    const { problems } = await uploadPhaseImages({ projectId, phaseId, clientFeedback: false, replyToId: note.id }, [file]);
    if (problems.length) { setError(problems.join(" ")); return; }
    setMarkup(null);
    stickToBottom.current = true;
    await reload(undefined, { newest: true });
  };

  const today = currentDateOnly({ timeZone: timezone });
  let lastDay: string | null = null;
  const active = (target: Filter) => JSON.stringify(target) === JSON.stringify(filter);

  return (
    <section aria-label="Project notes" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-line-subtle bg-surface">
      {header ?? <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-subtle px-4 py-2.5">
        <h2 className="m-0 text-[15px] font-semibold text-ink">Notes</h2>
        <PillTabs
          label="Show notes"
          className="!p-0.5"
          items={[
            { key: "all", label: "All", active: active({ kind: "all" }), onSelect: () => choose({ kind: "all" }) },
            ...phases.map((phase) => ({ key: phase.id, label: phase.label, active: active({ kind: "phase", id: phase.id }), onSelect: () => choose({ kind: "phase", id: phase.id }) })),
            { key: "feedback", label: "#feedback", active: active({ kind: "feedback" }), onSelect: () => choose({ kind: "feedback" }) },
            { key: "starred", label: "Starred", active: active({ kind: "starred" }), onSelect: () => choose({ kind: "starred" }) },
            ...(filter.kind === "tag" ? [{ key: "tag", label: `#${filter.name}`, active: true, onSelect: () => choose({ kind: "all" }) }] : []),
          ]}
        />
      </div>}

      <div ref={streamRef} role="log" aria-label="Notes" aria-busy={loading} onScroll={(event) => { const stream = event.currentTarget; stickToBottom.current = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 32; }} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-surface-raised px-4 py-3 sm:px-6">
        {cursor ? <Button size="sm" variant="ghost" className="self-center" pending={loading} onClick={() => void olderPage()}>Show older notes</Button> : null}
        {entries.length === 0 ? (
          <Text as="p" size="sm" tone="tertiary" className="m-auto text-center">{filter.kind !== "all" ? "No notes match this view." : emptyText ?? (composer ? "Nothing here yet. Write what you learn about this project below: info, client feedback, photos." : "Nothing here yet. You can read the client’s answers here when they arrive.")}</Text>
        ) : entries.map((entry) => {
          const first = entry.notes[0]!;
          const day = currentDateOnly({ now: new Date(first.createdAt), timeZone: timezone });
          const header = day !== lastDay ? (day === today ? "Today" : formatInstant(new Date(first.createdAt), { locale, timeZone: timezone, style: "date" })) : null;
          lastDay = day;
          const canEdit = first.phaseId ? writable.has(first.phaseId) : canEditGeneral;
          return (
            <div key={entry.key} className="flex flex-col gap-2">
              {header ? <div className="self-center rounded-pill bg-surface-muted px-2.5 py-0.5 text-xs text-ink-secondary">{header}</div> : null}
              <Bubble
                group={entry.notes}
                projectId={projectId}
                projectName={projectName}
                currentUserId={currentUserId}
                canEdit={canEdit}
                canUseIdeas={canUseIdeas}
                canUsePresentation={canUsePresentation}
                canUseInSchedule={canUseInSchedule}
                locale={locale}
                timezone={timezone}
                busy={busy}
                onReply={(note) => setReplyTo(note)}
                onTag={(name) => choose({ kind: "tag", name })}
                onStar={(note) => void runAll(`star:${note.id}`, [note], () => ({ command: "flags", noteId: note.id, version: note.version, starred: !note.pinned }))}
                onFeedback={(group) => void runAll(`client:${group[0]!.id}`, group, (note) => ({ command: "flags", noteId: note.id, version: note.version, clientFeedback: note.origin !== "CLIENT_ANSWER" }))}
                onEdit={async (note, body, version) => {
                  let itemEntryIds: string[];
                  try { itemEntryIds = await resolveNoteItemIds(body ?? "", (query) => searchNoteItemsAction(projectId, query)); }
                  catch (cause) { setError(cause instanceof Error ? cause.message : "Schedule items could not be loaded. Please try again."); return { ok: false }; }
                  const result = await run(`edit:${note.id}`, { command: "edit", noteId: note.id, version, body, tags: tagsOf(body ?? ""), itemEntryIds });
                  if (result.ok) await reload();
                  return result;
                }}
                onReload={() => reload(undefined, { keepError: true })}
                onLocate={onLocate}
                onMarkup={writablePhaseIds.length > 0 ? (note, url) => { setError(null); setMarkup({ note, url }); } : undefined}
                onDelete={(group) => void remove(group)}
              />
            </div>
          );
        })}
      </div>

      {error ? <div className="shrink-0 px-4 pt-2"><InlineError>{error}</InlineError></div> : null}
      {!composer ? null : writablePhaseIds.length > 0 ? (
        <ChatComposer
          poster={poster ?? notesPoster(projectId)}
          projectId={projectId}
          phases={phases.filter((phase) => writable.has(phase.id))}
          defaultPhaseId={defaultPhaseId && writable.has(defaultPhaseId) ? defaultPhaseId : writablePhaseIds[0]!}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSent={() => { setReplyTo(null); stickToBottom.current = true; void reload(undefined, { newest: true }); }}
        />
      ) : (
        <Text as="p" size="sm" tone="secondary" className="shrink-0 border-t border-line-subtle px-4 py-3">You can read these notes. Only a phase&apos;s designer or drafter can write them.</Text>
      )}
      {markup ? (
        <Dialog open onOpenChange={(open) => { if (!open) setMarkup(null); }} title="Mark up a copy" description="Zoom in and draw on the picture. The marked copy is sent as a reply; the original stays as it was." size="xl">
          <ImageMarkup src={markup.url} fileName="marked-up" maxBytes={NOTE_IMAGE_BYTES} saveLabel="Send as reply" onCancel={() => setMarkup(null)} onSave={(file) => postMarkup(markup.note, file)} />
          {error ? <InlineError>{error}</InlineError> : null}
        </Dialog>
      ) : null}
      {confirm.dialog}
    </section>
  );
}

function tagsOf(text: string) {
  return [...new Set([...plain(text).matchAll(TAG)].map((match) => match[1]!).filter((name) => name.toLowerCase() !== "feedback"))].slice(0, 5);
}

function Bubble({ group, projectId, projectName, currentUserId, canEdit, canUseIdeas, canUsePresentation, canUseInSchedule, locale, timezone, busy, onReply, onTag, onStar, onFeedback, onEdit, onReload, onLocate, onMarkup, onDelete }: {
  group: readonly ChatNote[];
  projectId: string;
  projectName: string;
  currentUserId: string;
  canEdit: boolean;
  canUseIdeas: boolean;
  canUsePresentation: boolean;
  canUseInSchedule: boolean;
  locale: string;
  timezone: string;
  busy: string | null;
  onReply: (note: ChatNote) => void;
  onTag: (name: string) => void;
  onStar: (note: ChatNote) => void;
  onFeedback: (group: readonly ChatNote[]) => void;
  onEdit: (note: ChatNote, body: string | null, version: number) => Promise<NoteChange>;
  onReload: () => Promise<boolean>;
  onLocate?: (note: ChatNote) => void;
  /** Offers "Mark up" in the image viewer; the marked copy becomes a reply. */
  onMarkup?: (note: ChatNote, url: string) => void;
  onDelete: (group: readonly ChatNote[]) => void;
}) {
  const note = group[0]!;
  const ownMessage = note.authorId !== null && note.authorId === currentUserId;
  const album = group.length > 1;
  const feedback = note.origin === "CLIENT_ANSWER";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [saving, setSaving] = useState(false);
  const [editVersion, setEditVersion] = useState(note.version);
  const [stale, setStale] = useState(false);
  const images = group.flatMap((item) => item.images);
  const last = group.at(-1)!;

  const items = [
    { label: "Reply", onSelect: () => onReply(note) },
    ...(note.kind === "TEXT" && !album ? [{ label: "Edit", onSelect: () => { setDraft(note.body); setEditVersion(note.version); setStale(false); setEditing(true); } }] : []),
    ...(note.workflowRecord ? [] : [{ label: feedback ? "Not client feedback" : "Mark as client feedback", onSelect: () => onFeedback(group) }]),
    { label: album ? `Delete ${group.length} images` : "Delete", danger: true, separatorBefore: true, onSelect: () => onDelete(group) },
  ];

  return (
    <article
      id={`note-${note.id}`}
      className={`group flex w-fit max-w-[min(36rem,92%)] flex-col gap-1.5 rounded-[14px] border px-3 py-2 ${ownMessage ? "self-start rounded-bl-[4px]" : "self-end rounded-br-[4px]"} ${feedback ? "border-warning/40 bg-warning/5" : "border-line-subtle bg-surface"} ${images.length && !note.body ? "!px-1 !pt-1" : ""}`}
      aria-label={`${album ? `${group.length} images` : note.kind === "IMAGE" ? "Image" : note.kind === "FILE" ? "File" : "Note"} from ${note.authorName ?? "Unknown sender"} at ${formatInstant(new Date(note.createdAt), { locale, timeZone: timezone, style: "datetime" })}`}
    >
      <span className="text-xs font-semibold text-ink-secondary">{note.authorName ?? "Unknown sender"}</span>
      {note.replyTo ? (
        <a href={`#note-${note.replyTo.id}`} className={`block rounded-action border-l-[3px] bg-surface-raised px-2 py-1 text-xs text-ink-secondary no-underline ${note.replyTo.clientFeedback ? "border-warning" : "border-line-strong"}`}>
          <span className="font-semibold text-ink">{note.replyTo.authorName ?? "Note"}</span>
          <span className="line-clamp-2">{note.replyTo.excerpt ? plain(note.replyTo.excerpt) : note.replyTo.kind === "IMAGE" ? "Image" : "File"}</span>
        </a>
      ) : null}

      {editing ? (
        <div className="grid min-w-[18rem] gap-2">
          <RichTextEditor aria-label="Edit note" maxLength={NOTE_MAX} value={draft} autoFocus onChange={setDraft} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" pending={saving} disabled={!draft.trim()} onClick={async () => { setSaving(true); try { const result = await onEdit(note, draft.trim() || null, editVersion); if (result.ok) setEditing(false); else setStale(result.code === "WORKSPACE_CARD_STALE"); } finally { setSaving(false); } }}>Save</Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
            {stale ? <Button size="sm" variant="secondary" disabled={saving} onClick={() => void onReload()}>Reload</Button> : null}
          </div>
          {stale ? <Text size="sm" tone="secondary">Your draft is kept. Reload to see the latest note; cancel and edit again to use its latest version.</Text> : null}
          {stale && note.version !== editVersion ? <div className="grid gap-1"><Text size="sm" weight="semibold">Latest saved note</Text><FormattedText text={note.body} className="text-sm" /></div> : null}
        </div>
      ) : (
        <>
          {images.length > 0 ? (
            <ImageGallery
              images={images}
              size={album ? "album" : "fill"}
              className={album ? "w-[14rem]" : "w-[16rem] [&_img]:max-h-72 [&_img]:object-cover"}
              viewerActions={(image) => {
                const owner = group.find((item) => item.images.some((candidate) => candidate.id === image.id)) ?? note;
                return <>
                  {onMarkup && image.url ? <Button size="sm" variant="primary" onClick={() => onMarkup(owner, image.url!)}>Mark up</Button> : null}
                  {note.phaseId ? <NoteImageActions image={image} projectId={projectId} projectName={projectName} phaseId={note.phaseId} canUseIdeas={canUseIdeas} canUsePresentation={canUsePresentation} canUseInSchedule={canUseInSchedule} /> : null}
                </>;
              }}
            />
          ) : null}
          {note.body ? <FormattedText text={note.body} className="text-sm" tokens={{ pattern: NOTE_CODE_PATTERN, render: (match, key) => {
            const item = inlineNoteItem(match, note.items);
            return item ? <NoteItemChip key={key} projectId={projectId} item={item} /> : match;
          } }} /> : null}
          {note.file ? (
            <div className="flex items-center gap-3">
              <FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-secondary" />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-semibold text-ink">{note.file.name}</span>
                <span className="text-xs text-ink-secondary">{formatBytes(note.file.bytes)}</span>
              </span>
              {note.file.url ? <a href={note.file.url} download={note.file.name} className="inline-flex h-8 shrink-0 items-center rounded-action bg-action px-3 text-xs font-medium text-action-ink hover:bg-action-hover">Open</a> : <Text size="sm" tone="tertiary">Unavailable</Text>}
            </div>
          ) : null}
          {remainingNoteItems(note.body, note.items).length > 0 ? (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Linked schedule items">
              {remainingNoteItems(note.body, note.items).map((item) => <li key={item.entryId}><NoteItemChip projectId={projectId} item={item} /></li>)}
            </ul>
          ) : null}
        </>
      )}

      <div className={`flex flex-wrap items-center gap-1.5 text-[11px] text-ink-secondary ${images.length && !note.body ? "px-2 pb-1" : ""}`}>
        {note.phaseName ? <span className="rounded-pill bg-surface-muted px-1.5 py-px text-ink-secondary">#{note.phaseName}{note.iterationLabel ? ` · ${note.iterationLabel}` : ""}</span> : null}
        {feedback ? <span className="rounded-pill border border-warning/40 bg-warning/10 px-1.5 py-px text-warning">#feedback</span> : null}
        {note.origin === "SITE_VISIT" ? <span className="rounded-pill bg-surface-muted px-1.5 py-px text-ink-secondary">Site visit</span> : null}
        {note.tags.map((tag) => <button key={tag} type="button" onClick={() => onTag(tag)} className="rounded-pill bg-surface-muted px-1.5 py-px text-ink-secondary hover:text-ink">#{tag}</button>)}
        {onLocate && note.threadId ? <button type="button" onClick={() => onLocate(note)} className="rounded-pill px-1.5 py-px font-medium text-ink-secondary underline hover:text-ink">Show on board</button> : null}
        <span className="ml-auto flex items-center gap-1 pl-2">
          {album ? `${group.length} images · ` : ""}
          <FormattedInstant value={last.createdAt} locale={locale} timeZone={timezone} style="time" />{note.editedAt ? " · edited" : ""}
        </span>
        <IconButton
          size="sm"
          variant="ghost"
          label={note.pinned ? "Unstar" : "Star"}
          aria-pressed={note.pinned}
          disabled={!canEdit}
          pending={busy === `star:${note.id}`}
          icon={<Star aria-hidden="true" className={note.pinned ? "fill-warning text-warning" : ""} />}
          onClick={() => onStar(note)}
          className={`!h-6 !min-h-6 !w-6 ${note.pinned || !canEdit ? "" : "opacity-60 group-hover:opacity-100 focus-visible:opacity-100"}`}
        />
        {canEdit && !editing ? <RowActionMenu label="Note actions" pending={busy === `delete:${note.id}` || busy === `client:${note.id}` || busy === `edit:${note.id}`} items={items} /> : null}
      </div>
    </article>
  );
}

function ItemThumbnail({ url }: { url: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return url && failedUrl !== url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={url} alt="" className="h-16 w-16 shrink-0 rounded-control bg-surface-muted object-cover" onError={() => setFailedUrl(url)} />
    : <span aria-label="No product image" className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-control bg-surface-muted text-ink-secondary"><FileText aria-hidden="true" /></span>;
}

function NoteItemChip({ projectId, item }: { projectId: string; item: ChatNote["items"][number] }) {
  return <HoverCard label={`${item.code} · Product Schedule`} content={
    <div className="grid gap-3">
      <div className="flex items-start gap-3">
        <ItemThumbnail url={item.thumbnailUrl} />
        <div className="grid min-w-0 gap-1">
          <span className="text-xs font-semibold">{item.code} · Product Schedule</span>
          <span>{item.name || "No product name yet"}</span>
          {item.location ? <span className="text-xs text-ink-secondary">{item.location}</span> : null}
        </div>
      </div>
      <Link href={STUDIOFLOW_ROUTES.projectSchedule(projectId, item.entryId)} prefetch={false} className="inline-flex min-h-11 items-center font-semibold text-ink underline">Open item →</Link>
    </div>
  }>
    <button type="button" className="relative inline-flex min-h-6 items-center rounded-action bg-action px-1.5 text-xs font-semibold text-action-ink before:absolute before:-inset-y-2.5 before:inset-x-0 before:min-h-11">@{item.code}</button>
  </HoverCard>;
}

/**
 * Enter sends. The phase tag is set here and shown above the box; `#` and `@` under the caret open
 * suggestions (topic tags of this project, Product Schedule items by code or name). A typed `@HT1` that was not
 * picked from the list is still linked when exactly one item has that code.
 */
function ChatComposer({ poster, projectId, phases, defaultPhaseId, replyTo, onCancelReply, onSent }: {
  poster: NotePoster;
  projectId: string;
  phases: readonly ChatPhase[];
  defaultPhaseId: string;
  replyTo: ChatNote | null;
  onCancelReply: () => void;
  onSent: () => void;
}) {
  const draft = useNoteDraft();
  // The phase picked here, else the phase selected on the page.
  const [chosenPhaseId, setPhaseId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState(false);
  const [picked, setPicked] = useState<ReadonlyMap<string, string>>(new Map());
  const [token, setToken] = useState<EditorToken | null>(null);
  const [popup, dispatch] = useReducer(suggestionState, { request: 0, status: "closed", list: [] });
  const request = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState({ left: 8, bottom: 0 });
  const listboxId = useId();
  const [highlight, setHighlight] = useState(0);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const phase = phases.find((item) => item.id === (chosenPhaseId ?? defaultPhaseId)) ?? phases[0]!;

  const suggestions = popup.status === "results" ? popup.list : [];
  const closeSuggestions = () => {
    setToken(null);
    dispatch({ type: "close", request: ++request.current });
  };
  const onTokenChange = useCallback((next: EditorToken | null) => {
    setToken(next);
    setHighlight(0);
    dispatch({ type: next ? "start" : "close", request: ++request.current });
    const wrapper = wrapperRef.current?.getBoundingClientRect();
    if (next && wrapper) setPosition(suggestionPosition(next.caret, wrapper, Math.min(352, wrapper.width - 16)));
  }, []);
  const requestId = popup.request;
  useEffect(() => {
    if (!token) return;
    let live = true;
    const timer = setTimeout(async () => {
      const loaded = (list: readonly Suggestion[]) => { if (live) dispatch({ type: "loaded", request: requestId, list }); };
      const failed = (error: string) => { if (live) dispatch({ type: "failed", request: requestId, error }); };
      try {
        if (token.trigger === "#") {
          const result = await listNoteTagsAction(projectId, token.query || undefined);
          if (!result.ok) { failed(result.error.safeMessage); return; }
          const known: Suggestion[] = result.data.map((tag) => ({ key: tag.name, label: `#${tag.name}`, detail: `${tag.count} note${tag.count === 1 ? "" : "s"}`, insert: `#${tag.name}` }));
          const fresh = token.query && !known.some((tag) => tag.key.toLowerCase() === token.query.toLowerCase()) && token.query.toLowerCase() !== "feedback"
            ? [{ key: `new:${token.query}`, label: `#${token.query}`, detail: "New tag", insert: `#${token.query}` }] : [];
          const special = "feedback".startsWith(token.query.toLowerCase()) ? [{ key: "feedback", label: "#feedback", detail: "Client feedback", insert: "#feedback" }] : [];
          loaded([...special, ...known, ...fresh].slice(0, 8));
        } else {
          const result = await searchNoteItemsAction(projectId, token.query);
          if (!result.ok) { failed(result.error.safeMessage); return; }
          loaded(result.data.map((item) => ({ key: item.entryId, label: item.code, detail: item.name, location: item.location, thumbnailUrl: item.thumbnailUrl, insert: `@${item.code}`, entryId: item.entryId })));
        }
      } catch { failed("Suggestions could not be loaded. Please try again."); }
    }, 150);
    return () => { live = false; clearTimeout(timer); };
  }, [token, requestId, projectId]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[id="${listboxId}-${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight, popup.status, listboxId]);

  const pick = (suggestion: Suggestion) => {
    if (!token || sending) return;
    token.replace(suggestion.insert);
    if (suggestion.entryId) setPicked((current) => new Map(current).set(codeKey(suggestion.insert), suggestion.entryId!));
    closeSuggestions();
  };

  const send = async () => {
    if (sending || draft.empty) return;
    const body = draft.text.trim();
    const text = plain(body);
    const tags = tagsOf(text);
    const clientFeedback = feedback || /(?:^|\s)#feedback\b/i.test(text);
    setSending(true); setErrors([]); closeSuggestions();
    try {
      let entryIds: string[];
      try { entryIds = await resolveNoteItemIds(body, (query) => searchNoteItemsAction(projectId, query), picked); }
      catch (cause) { setErrors([cause instanceof Error ? cause.message : "Schedule items could not be loaded. Please try again."]); return; }
      if (body) {
        const posted = await poster.text({ phaseId: phase.id, body, clientFeedback, replyToId: replyTo?.id, tags, itemEntryIds: entryIds });
        if (!posted.ok) { setErrors([posted.message]); return; }
      }
      const { problems, failed } = await poster.images({ phaseId: phase.id, clientFeedback, replyToId: body ? undefined : replyTo?.id, tags }, draft.files);
      draft.keepOnly(failed);
      if (failed.length === 0) { setFeedback(false); setPicked(new Map()); }
      setErrors(problems);
      onSent();
    } catch {
      setErrors(["The note could not be sent. Please try again."]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div ref={wrapperRef} data-notes-composer className="relative shrink-0 border-t border-line-subtle bg-surface px-4 py-2.5"
      onKeyDownCapture={(event) => {
        if (event.nativeEvent.isComposing || sending) return;
        if (event.key === "Escape" && popup.status !== "closed") { event.preventDefault(); event.stopPropagation(); closeSuggestions(); return; }
        if (!suggestions.length) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); event.stopPropagation(); setHighlight((index) => (index + (event.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length); }
        if ((event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); pick(suggestions[highlight]!); }
      }}
    >
      {popup.status !== "closed" ? (
        <div style={position} className="absolute z-20 w-[22rem] max-w-[calc(100%-16px)] rounded-control border border-line-subtle bg-surface p-1 shadow-over">
          <div className="px-2 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{token?.trigger === "@" ? "PRODUCT SCHEDULE" : "TAGS"}</div>
          {popup.status === "loading" ? <div role="status" className="px-2 py-3 text-sm text-ink-secondary">Loading…</div> : null}
          {popup.status === "empty" ? <div role="status" className="px-2 py-3 text-sm text-ink-secondary">No suggestions found.</div> : null}
          {popup.status === "error" ? <div className="grid gap-1 px-2 py-2"><InlineError>{popup.error}</InlineError><Button size="sm" variant="ghost" onMouseDown={(event) => event.preventDefault()} onClick={() => dispatch({ type: "start", request: ++request.current })}>Retry</Button></div> : null}
        <ul ref={listRef} id={listboxId} role="listbox" aria-label={token?.trigger === "@" ? "Schedule items" : "Tags"} aria-busy={popup.status === "loading"} className="m-0 grid max-h-72 list-none gap-0.5 overflow-y-auto p-0">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.key} id={`${listboxId}-${index}`} role="option" aria-selected={index === highlight}>
              <button type="button" tabIndex={-1} onMouseDown={(event) => { event.preventDefault(); pick(suggestion); }} onMouseEnter={() => setHighlight(index)} className={`flex min-h-11 w-full items-center gap-2 rounded-action px-2 py-1.5 text-left text-sm ${index === highlight ? "bg-surface-muted" : ""}`}>
                {token?.trigger === "@" ? <span className="shrink-0 rounded-[5px] bg-action px-1 text-xs font-semibold text-action-ink">{suggestion.label}</span> : <span className="font-medium text-ink">{suggestion.label}</span>}
                <span className="min-w-0 flex-1 truncate text-xs text-ink">{suggestion.detail ?? "No product name yet"}</span>
                {suggestion.location ? <span className="ml-auto max-w-[35%] truncate text-right text-xs text-ink-secondary">{suggestion.location}</span> : null}
              </button>
            </li>
          ))}
        </ul>
        </div>
      ) : null}

      {replyTo ? (
        <div className={`mb-2 flex items-start gap-2 rounded-action border-l-[3px] bg-surface-raised px-2 py-1.5 text-xs ${replyTo.origin === "CLIENT_ANSWER" ? "border-warning" : "border-line-strong"}`}>
          <span className="min-w-0 flex-1"><span className="font-semibold text-ink">Replying to {replyTo.authorName ?? "a note"}</span><span className="line-clamp-1 text-ink-secondary">{replyTo.body ? plain(replyTo.body) : replyTo.kind === "IMAGE" ? "Image" : replyTo.file?.name ?? "File"}</span></span>
          <IconButton size="sm" variant="ghost" label="Cancel reply" icon={<X aria-hidden="true" />} onClick={onCancelReply} className="!h-6 !min-h-6 !w-6" />
        </div>
      ) : null}

      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
        <span>Tagged</span>
        {phases.length > 1 ? (
          <Select aria-label="Phase of this note" density="compact" value={phase.id} disabled={sending} onChange={(event) => setPhaseId(event.target.value)} className="!w-auto">
            {phases.map((item) => <option key={item.id} value={item.id}>#{item.label}{item.iteration ? ` · ${item.iteration}` : ""}</option>)}
          </Select>
        ) : <span className="rounded-pill bg-surface-muted px-2 py-0.5">#{phase.label}{phase.iteration ? ` · ${phase.iteration}` : ""}</span>}
        <button type="button" aria-pressed={feedback} onClick={() => setFeedback((value) => !value)} className={`rounded-pill border px-2 py-0.5 ${feedback ? "border-warning/40 bg-warning/10 text-warning" : "border-dashed border-line-strong text-ink-secondary hover:text-ink"}`}>{feedback ? "#feedback" : "+ #feedback"}</button>
        <span className="text-ink-tertiary">Type # for a topic, @ for a schedule item (@HT1)</span>
      </div>

      <NoteDraftFields
        draft={draft}
        label="New note"
        placeholder="Write a note…"
        disabled={sending}
        onSubmit={() => void send()}
        tokenTriggers={TOKEN_TRIGGERS}
        onTokenChange={onTokenChange}
        highlightPattern={NOTE_CODE_PATTERN}
        listboxId={popup.status === "closed" ? undefined : listboxId}
        activeOptionId={suggestions.length ? `${listboxId}-${highlight}` : undefined}
        roundAttach
        hint={null}
        footer={<IconButton type="button" variant="primary" label="Send" icon={<Send />} pending={sending} disabled={draft.empty} onClick={() => void send()} className="!h-11 !min-h-11 !w-11 !rounded-full !p-0" />}
      />
      {errors.length > 0 ? <InlineError>{errors.join(" ")}</InlineError> : null}
    </div>
  );
}
