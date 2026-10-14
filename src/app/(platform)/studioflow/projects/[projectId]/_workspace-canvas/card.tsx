"use client";

import { FileText, Send, Star } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type Ref } from "react";

import { Button, Checkbox, FormattedText, ImageGallery, InlineError, RichTextEditor, RowActionMenu, Select, Text, shrinkImageFile, toggleCheckItem, useFileIntake, type RowActionItem } from "@/platform/ui_engine";

import { createWorkspaceFileAction, createWorkspaceImageAction, workspaceAction, type WorkspaceCommandInput } from "../../../actions";
import { NOTE_MAX, NoteDraftFields, useNoteDraft, type NoteImage } from "../../../_components/phase-note-composer";
import { NoteImageActions } from "../round-labels";

export type WorkspaceCardView = {
  id: string;
  version: number;
  body: string;
  pinned: boolean;
  origin: "NOTE" | "CLIENT_ANSWER" | "SITE_VISIT";
  /** Recorded by a phase step (the client answer, a site visit): its origin and phase/round labels cannot change. */
  workflowRecord: boolean;
  phaseId: string | null;
  phaseName: string | null;
  iterationId: string | null;
  iterationLabel: string | null;
  authorName: string | null;
  createdAt: Date;
  editedAt: Date | null;
  /** An image element carries its one image here; text and file elements have none. */
  images: readonly NoteImage[];
  kind: "TEXT" | "IMAGE" | "FILE";
  textStyle: "PLAIN" | "HEADING" | "STICKY";
  file: { url: string | null; name: string; contentType: string; bytes: number } | null;
  canvas: { x: number; y: number; w: number } | null;
};

export type PhaseOption = { id: string; name: string };
export type LabelChoices = { allowNone: boolean; phases: readonly PhaseOption[] };

/** What a failed command tells the screen; a stale version is told apart so the card can offer a merge. */
export type CommandOutcome = { ok: true; data: unknown } | { ok: false; message: string; stale: boolean };
export type RunCommand = (input: WorkspaceCommandInput) => Promise<CommandOutcome>;

const NOTE_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
/** Files the board takes as file elements (server: domain/files.ts), besides images. */
export const WORKSPACE_FILE_ACCEPT = ".pdf,.dwg,.dxf,.skp,.xlsx,.xls,.docx,.doc,.pptx,.zip,.txt,.csv";

/**
 * Drops each file on the board as its own element: images as image elements, other files as file elements. Later
 * ones cascade a little below the first so none hides another. Returns what did not get through.
 */
export async function uploadBoardFiles(input: { projectId: string; phaseId: string | null; clientAnswer?: boolean; place?: { x: number; y: number; w: number }; files: readonly File[] }): Promise<{ problems: string[]; failed: File[] }> {
  const problems: string[] = [];
  const failed: File[] = [];
  for (const [index, file] of input.files.entries()) {
    try {
      const isImage = IMAGE_TYPES.includes(file.type);
      const form = new FormData();
      form.set("projectId", input.projectId);
      if (input.phaseId) form.set("phaseId", input.phaseId);
      if (input.clientAnswer) form.set("clientAnswer", "true");
      if (input.place) {
        form.set("x", String(input.place.x + index * 24));
        form.set("y", String(input.place.y + index * 24));
        form.set("w", String(isImage ? input.place.w : Math.max(input.place.w, 256)));
      }
      form.set("file", isImage ? await shrinkImageFile(file, { maxBytes: NOTE_IMAGE_BYTES }) : file);
      const result = isImage ? await createWorkspaceImageAction(form) : await createWorkspaceFileAction(form);
      if (!result.ok) { problems.push(result.error.safeMessage); failed.push(file); }
    } catch {
      problems.push(`${file.name || "A file"} could not be added.`);
      failed.push(file);
    }
  }
  return { problems, failed };
}

/** Adds images that belong with one element: each lands beside it as its own element with its labels. Returns what did not get through. */
export async function uploadCardImages(projectId: string, besideId: string, files: readonly File[]): Promise<{ problems: string[]; failed: File[] }> {
  const problems: string[] = [];
  const failed: File[] = [];
  for (const file of files) {
    try {
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("besideId", besideId);
      form.set("file", await shrinkImageFile(file, { maxBytes: NOTE_IMAGE_BYTES }));
      const result = await createWorkspaceImageAction(form);
      if (!result.ok) { problems.push(result.error.safeMessage); failed.push(file); }
    } catch {
      problems.push(`${file.name || "An image"} could not be added.`);
      failed.push(file);
    }
  }
  return { problems, failed };
}

function fileExtension(name: string): string | null {
  const match = /\.([A-Za-z0-9]{1,4})$/.exec(name);
  return match ? match[1].toUpperCase() : null;
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export async function runWorkspaceCommand(input: WorkspaceCommandInput): Promise<CommandOutcome> {
  try {
    const result = await workspaceAction(input);
    if (result.ok) return { ok: true, data: result.data };
    const stale = result.error.code === "WORKSPACE_CARD_STALE";
    return { ok: false, stale, message: stale ? "Someone else changed this a moment ago. The board now shows the latest; please try again." : result.error.safeMessage };
  } catch {
    return { ok: false, stale: false, message: "The change could not be saved. Please try again." };
  }
}

const TEXT_STYLES: { value: WorkspaceCardView["textStyle"]; label: string }[] = [
  { value: "PLAIN", label: "Text" },
  { value: "HEADING", label: "Heading" },
  { value: "STICKY", label: "Sticky note" },
];

/**
 * One element on the Workspace board (WO-SF-WORKSPACE-04): a text (plain, heading or sticky note), one image, or one
 * file. It reads as plain content; its labels, star and menu appear on hover, focus or selection. Press and drag it to
 * move it (with everything selected); click a text to write straight into it — the text saves itself shortly after
 * typing stops and when it is left, one save after another (a save never overtakes the one before it). An image pasted
 * while writing lands beside the text as its own element. A checklist ticks in place. If someone else changed the text
 * first, both texts are shown and the person chooses, so nothing is overwritten silently; a move or a star by someone
 * else is absorbed.
 */
export function WorkspaceCard({ card, projectId, projectName, canWrite, labelChoices, canUseIdeas, canUsePresentation, dimmed, selected = false, style, measureRef, menuExtra, run, onDelete, onPress, ignoreClick, onWidthDown }: {
  card: WorkspaceCardView;
  projectId: string;
  projectName: string;
  canWrite: boolean;
  labelChoices: LabelChoices;
  canUseIdeas: boolean;
  canUsePresentation: boolean;
  dimmed: boolean;
  style?: CSSProperties;
  measureRef?: Ref<HTMLElement>;
  /** Shown as part of the board's selection. */
  selected?: boolean;
  menuExtra: readonly RowActionItem[];
  run: RunCommand;
  onDelete: (card: WorkspaceCardView) => void;
  /** Selects the element and may start moving it (board only); absent where it cannot move. */
  onPress?: (event: ReactPointerEvent) => void;
  /** True right after a move, so the click that ends it does not also open the text. */
  ignoreClick?: () => boolean;
  onWidthDown?: (event: ReactPointerEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.body);
  // The text and version the block last saved (or opened with). A star or a move by someone else bumps the version but
  // keeps the text, so only a different text is a conflict, and only from a version newer than ours: right after our
  // own save the board can still show the text from before it.
  const [baseText, setBaseText] = useState({ body: card.body, version: card.version });
  const base = useRef({ body: card.body, version: card.version });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "conflict">("idle");
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const timer = useRef<number | null>(null);
  // The save on its way to the server; the next one waits for it, so it names the version that save produced.
  const saving = useRef<Promise<boolean> | null>(null);
  const latest = useRef(card);
  const draftRef = useRef(draft);
  useEffect(() => { latest.current = card; });

  const changedMeanwhile = editing && card.body !== baseText.body && card.version > baseText.version;

  const adopt = (body: string, version: number) => { base.current = { body, version }; setBaseText({ body, version }); };

  const isText = card.kind === "TEXT";
  const startEdit = () => {
    if (!canWrite || editing || !isText) return;
    setDraft(card.body); draftRef.current = card.body; adopt(card.body, card.version); setProblems([]); setStatus("idle");
    // After a menu closes and hands focus back to its button, so the editor keeps the caret.
    window.setTimeout(() => setEditing(true), 0);
  };

  /** Saves the latest text unless it is unchanged, empty (the old text stays), or waiting on a conflict. */
  const saveOnce = async () => {
    const body = draftRef.current.trim();
    const now = latest.current;
    if (body === base.current.body.trim() || !body) return true;
    if (now.body !== base.current.body && now.version > base.current.version) { setStatus("conflict"); return false; }
    setStatus("saving");
    const result = await run({ command: "updateCard", projectId, cardId: card.id, body, version: Math.max(now.version, base.current.version) });
    if (!result.ok) {
      setStatus(result.stale ? "conflict" : "idle");
      if (!result.stale) setProblems([result.message]);
      return false;
    }
    adopt(body, (result.data as { version: number }).version);
    setStatus("saved");
    return true;
  };
  /** Queues a save behind the one in flight, so saves reach the server one at a time and in order. */
  const saveNow = (): Promise<boolean> => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    const previous = saving.current;
    const next = previous ? previous.then(saveOnce, saveOnce) : saveOnce();
    saving.current = next;
    void next.finally(() => { if (saving.current === next) saving.current = null; });
    return next;
  };

  const onType = (text: string) => {
    setDraft(text);
    draftRef.current = text;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void saveNow(), 700);
  };

  const leave = async () => {
    if (status === "conflict" || changedMeanwhile) return;
    if (await saveNow()) setEditing(false);
  };
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  // While writing, an image pasted or dropped onto the block is added to it straight away.
  const intake = useFileIntake({
    accept: "image/png,image/jpeg,image/webp",
    multiple: true,
    disabled: !editing,
    onFiles: async (files) => {
      if (files.length === 0) return;
      setBusy(true);
      const { problems: failed } = await uploadCardImages(projectId, card.id, files);
      setBusy(false);
      setProblems(failed);
    },
  });

  const command = async (input: WorkspaceCommandInput) => {
    setBusy(true); setProblems([]);
    const result = await run(input);
    setBusy(false);
    if (!result.ok) setProblems([result.message]);
    return result.ok;
  };
  const toggleCheck = (index: number) => void command({ command: "updateCard", projectId, cardId: card.id, body: toggleCheckItem(card.body, index), version: card.version });

  const feedback = card.origin === "CLIENT_ANSWER";
  // What a phase step recorded keeps its origin and phase: those menu items are not offered on it.
  const record = card.workflowRecord;
  const canLabel = canWrite && !record && (labelChoices.allowNone || labelChoices.phases.length > 0);
  const styleItems: RowActionItem[] = isText ? TEXT_STYLES.map((option, index) => ({
    label: option.value === card.textStyle ? `${option.label} (current)` : `Make ${option.label.toLowerCase()}`,
    disabled: option.value === card.textStyle,
    separatorBefore: index === 0,
    onSelect: () => void command({ command: "setTextStyle", projectId, cardId: card.id, textStyle: option.value, version: card.version }),
  })) : [];
  const menu: RowActionItem[] = canWrite ? [
    { label: "Edit", onSelect: startEdit, disabled: !isText },
    ...(record ? [] : [{ label: feedback ? "Not client feedback" : "Mark as client feedback", onSelect: () => void command({ command: "setClientAnswer", projectId, cardId: card.id, clientAnswer: !feedback, version: card.version }) }]),
    ...(canLabel ? [{ label: card.phaseId ? "Change phase label" : "Add phase label", onSelect: () => setLabelOpen(true) }] : []),
    ...styleItems,
    ...menuExtra,
    { label: "Delete", danger: true, separatorBefore: true, onSelect: () => onDelete(card) },
  ] : [];
  const label = card.phaseName ? `${card.phaseName}${card.iterationLabel ? ` · ${card.iterationLabel}` : ""}` : "General";
  const byline = [feedback && !card.authorName ? "Client" : card.authorName, record ? "recorded by the phase step" : null, card.editedAt ? "edited" : null].filter(Boolean).join(" · ");
  const tools = editing || labelOpen || problems.length > 0;

  const heading = isText && card.textStyle === "HEADING";
  const sticky = isText && card.textStyle === "STICKY";
  const image = card.kind === "IMAGE";
  const ring = selected ? "shadow-[0_0_0_2px_var(--ui-border-focus)]" : "";
  const surface = feedback
    ? `bg-[color-mix(in_srgb,var(--ui-warning-bg)_70%,var(--ui-surface))] ${ring || "shadow-[0_0_0_1px_var(--ui-warning-border)]"}`
    : sticky ? `rounded-[4px] bg-warning-surface ${ring || "shadow-float"}`
    : heading || image ? `bg-transparent ${ring}`
    : editing ? `bg-surface ${ring || "shadow-raise"}`
    : `bg-surface ${ring || "shadow-[0_0_0_1px_transparent] hover:shadow-plane"}`;
  const textClass = heading ? "text-2xl font-semibold leading-tight tracking-[-0.01em]" : "text-sm";

  return (
    <article
      ref={measureRef as Ref<HTMLElement>}
      style={style}
      aria-label={`${image ? "Image" : card.kind === "FILE" ? "File" : heading ? "Heading" : sticky ? "Sticky note" : "Text"} · ${label}${byline ? ` · ${byline}` : ""}`}
      title={byline || undefined}
      onPointerDown={!editing ? onPress : undefined}
      // The click that ends a move must not also open the text or an image.
      onClickCapture={(event) => { if (event.currentTarget.contains(event.target as Node) && ignoreClick?.()) { event.stopPropagation(); event.preventDefault(); } }}
      {...(editing ? intake.target : {})}
      className={[
        "group/card relative grid gap-1.5 rounded-[10px] transition-[opacity,box-shadow,background-color] duration-150",
        image ? "p-0" : heading ? "px-1.5 py-1" : "px-3 py-2.5",
        surface,
        onPress && !editing ? "touch-none" : "",
        intake.active ? "outline-2 outline-dashed outline-offset-2 outline-line-focus" : "",
        dimmed ? "pointer-events-none opacity-25" : "",
      ].join(" ")}
    >
      {/* Labels float above the element on hover, so plain content is all it shows at rest. */}
      <div className={`pointer-events-none absolute -top-3 left-2 z-10 flex max-w-[calc(100%-4rem)] items-center gap-1 transition-opacity ${tools || selected ? "opacity-100" : "opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100"}`}>
        <span className="truncate rounded-pill bg-surface px-2 py-0.5 text-[11px] text-ink-secondary shadow-float">{label}</span>
        {feedback ? <span className="rounded-pill bg-warning-surface px-2 py-0.5 text-[11px] text-warning shadow-float">Client feedback</span> : null}
        {card.origin === "SITE_VISIT" ? <span className="rounded-pill bg-surface px-2 py-0.5 text-[11px] text-ink-secondary shadow-float">Site visit</span> : null}
      </div>
      <div className={`absolute -top-3 right-2 z-10 flex items-center rounded-pill bg-surface shadow-float transition-opacity ${tools || selected ? "opacity-100" : card.pinned ? "opacity-100" : "opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100"}`}>
        <button
          type="button"
          aria-label={card.pinned ? "Unstar" : "Star"}
          aria-pressed={card.pinned}
          disabled={!canWrite || busy}
          onClick={() => void command({ command: "pinCard", projectId, cardId: card.id, pinned: !card.pinned, version: card.version })}
          className={`grid h-6 w-6 place-items-center rounded-pill hover:bg-surface-muted disabled:cursor-default ${card.pinned ? "text-warning" : "text-ink-tertiary"}`}
        >
          <Star aria-hidden="true" className={`h-3.5 w-3.5 ${card.pinned ? "fill-current" : ""}`} />
        </button>
        {menu.length > 0 && !editing ? <span className={card.pinned && !selected ? "hidden group-hover/card:inline-flex group-focus-within/card:inline-flex" : "inline-flex"}><RowActionMenu label="Element actions" items={menu} /></span> : null}
      </div>

      {editing ? (
        <div className="grid gap-2">
          {changedMeanwhile || status === "conflict" ? (
            <div className="grid gap-2 rounded-control border border-warning-line bg-warning-surface p-2">
              <Text size="sm" weight="semibold">Someone else changed this text. Their text:</Text>
              {card.body ? <FormattedText text={card.body} className="text-sm" /> : <Text size="sm" tone="tertiary">(no text)</Text>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => { setDraft(card.body); draftRef.current = card.body; adopt(card.body, card.version); setStatus("idle"); setProblems([]); }}>Use theirs</Button>
                <Button size="sm" variant="secondary" onClick={() => { adopt(card.body, card.version); setStatus("idle"); setProblems([]); void saveNow(); }}>Keep mine</Button>
              </div>
            </div>
          ) : null}
          <RichTextEditor bare slashMenu aria-label="Text" className={heading ? "text-2xl font-semibold" : undefined} placeholder="Write, or type / for headings, lists and checklists" maxLength={NOTE_MAX} value={draft} autoFocus onChange={onType} onBlur={() => void leave()} />
          <Text size="sm" tone="tertiary" className="text-xs">{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Paste an image to place it beside this text"}{busy ? " · adding image…" : ""}</Text>
        </div>
      ) : (
        <div
          className={canWrite && isText ? "cursor-text" : undefined}
          onClick={(event) => {
            if (ignoreClick?.() || event.shiftKey) return;
            if (!(event.target as HTMLElement).closest("a, button, input, img, [role=button]")) startEdit();
          }}
        >
          {card.body ? <FormattedText text={card.body} className={textClass} onToggleCheck={canWrite ? toggleCheck : undefined} /> : null}
          {card.images.length > 0 ? <ImageGallery images={card.images} size="fill" className={image ? "[&_button]:rounded-[10px] [&_button]:border-0" : card.body ? "mt-2" : undefined} viewerActions={(item) => <NoteImageActions image={item} projectId={projectId} projectName={projectName} phaseId={card.phaseId} canUseIdeas={canUseIdeas} canUsePresentation={canUsePresentation} />} /> : null}
          {card.file ? (
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="grid h-11 w-9 shrink-0 place-items-center rounded-[6px] bg-surface-muted text-[10px] font-bold uppercase text-ink-secondary shadow-[inset_0_0_0_1px_var(--ui-border-default)]">
                {fileExtension(card.file.name) ?? <FileText className="h-4 w-4" />}
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-semibold text-ink">{card.file.name}</span>
                <span className="text-xs text-ink-tertiary">{formatBytes(card.file.bytes)}</span>
              </span>
              {card.file.url ? (
                <a href={card.file.url} download={card.file.name} className="inline-flex h-8 shrink-0 items-center rounded-action bg-action px-3 text-xs font-medium text-action-ink hover:bg-action-hover">Open</a>
              ) : <Text size="sm" tone="tertiary">Unavailable</Text>}
            </div>
          ) : null}
          {!card.body && card.images.length === 0 && !card.file ? <Text size="sm" tone="tertiary">Empty text</Text> : null}
        </div>
      )}

      {labelOpen ? (
        <PhaseLabelPicker
          card={card}
          choices={labelChoices}
          onCancel={() => setLabelOpen(false)}
          onPick={async (phaseId) => { if (await command({ command: "setCardPhase", projectId, cardId: card.id, phaseId, version: card.version })) setLabelOpen(false); }}
        />
      ) : null}
      {problems.length > 0 ? <InlineError>{problems.join(" ")}</InlineError> : null}
      {onWidthDown && !editing ? <span aria-hidden="true" onPointerDown={onWidthDown} className="absolute bottom-1 right-1 h-3 w-3 cursor-ew-resize touch-none opacity-0 transition-opacity group-hover/card:opacity-100 [background:linear-gradient(135deg,transparent_50%,var(--ui-border-strong)_50%_60%,transparent_60%_72%,var(--ui-border-strong)_72%_82%,transparent_82%)]" /> : null}
    </article>
  );
}

/** Inline phase-label choice; clearing or changing the label also drops the round label (the service rule). */
function PhaseLabelPicker({ card, choices, onPick, onCancel }: { card: WorkspaceCardView; choices: LabelChoices; onPick: (phaseId: string | null) => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState(card.phaseId ?? "");
  const [pending, setPending] = useState(false);
  const options = card.phaseId && !choices.phases.some((phase) => phase.id === card.phaseId) ? [{ id: card.phaseId, name: card.phaseName ?? "Current phase" }, ...choices.phases] : choices.phases;
  return (
    <div className="grid gap-2 rounded-control border border-line-subtle bg-surface-muted/40 p-2">
      <Select aria-label="Phase label" value={value} onChange={(event) => setValue(event.target.value)}>
        {choices.allowNone || !card.phaseId ? <option value="">General</option> : null}
        {options.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
      </Select>
      {card.iterationLabel ? <Text size="sm" tone="tertiary">Changing the phase also removes the round label ({card.iterationLabel}).</Text> : null}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" pending={pending} disabled={value === (card.phaseId ?? "")} onClick={async () => { setPending(true); await onPick(value || null); setPending(false); }}>Apply</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

/**
 * Quick note: write a text onto the board. Enter sends, Shift+Enter is a new line; images paste, drop or pick in and
 * land beside it as their own elements. It stays open after sending so several points from one conversation go in one
 * after another. The phase label starts from the phase chosen above the board, so a note written while working on a
 * phase belongs to it.
 */
export function CardComposer({ projectId, place, labelChoices, defaultPhaseId, run, onClose, autoFocus = false }: {
  projectId: string;
  /** Where the first note goes; the ones after it stack under the board's elements. */
  place?: { x: number; y: number; w: number };
  labelChoices: LabelChoices;
  defaultPhaseId: string | null;
  run: RunCommand;
  onClose?: () => void;
  autoFocus?: boolean;
}) {
  const draft = useNoteDraft();
  const initialPhase = defaultPhaseId && labelChoices.phases.some((phase) => phase.id === defaultPhaseId) ? defaultPhaseId : labelChoices.allowNone ? "" : labelChoices.phases[0]?.id ?? "";
  const [phaseId, setPhaseId] = useState(initialPhase);
  const [clientAnswer, setClientAnswer] = useState(false);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  // The text whose images did not all get through: sending again retries them beside it.
  const pending = useRef<string | null>(null);
  useEffect(() => { if (draft.attachments.length === 0) pending.current = null; }, [draft.attachments.length]);
  const spot = useRef(place);

  const send = async () => {
    if (sending || draft.empty) return;
    const body = draft.text.trim();
    const files = draft.files;
    setSending(true); setErrors([]);
    try {
      let beside = pending.current;
      if (body) {
        const created = await run({ command: "createCard", projectId, phaseId: phaseId || null, body, clientAnswer, ...(spot.current ?? {}) });
        if (!created.ok) { setErrors([created.message]); return; }
        spot.current = undefined;
        beside = (created.data as { cardId: string }).cardId;
      }
      // Images sent with a text land beside it with its labels; images alone go where the note would have.
      const { problems, failed } = beside
        ? await uploadCardImages(projectId, beside, files)
        : await uploadBoardFiles({ projectId, phaseId: phaseId || null, clientAnswer, place: spot.current, files });
      if (failed.length > 0) { pending.current = beside; draft.keepOnly(failed); setErrors(problems); return; }
      pending.current = null;
      spot.current = undefined;
      draft.clear();
      setClientAnswer(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-2">
      <NoteDraftFields
        draft={draft}
        label="New card"
        placeholder="Write a card…"
        disabled={sending}
        autoFocus={autoFocus}
        onSubmit={() => void send()}
        footer={<Button type="button" size="sm" variant="primary" pending={sending} disabled={draft.empty} leadingIcon={<Send className="h-3.5 w-3.5" />} onClick={() => void send()}>Add</Button>}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Select aria-label="Phase label for the new card" value={phaseId} onChange={(event) => setPhaseId(event.target.value)} className="!w-auto min-w-0 max-w-full">
          {labelChoices.allowNone ? <option value="">General</option> : null}
          {labelChoices.phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
        </Select>
        <Checkbox label="Client feedback" checked={clientAnswer} onCheckedChange={(checked) => setClientAnswer(checked === true)} />
        {onClose ? <Button type="button" size="sm" variant="ghost" disabled={sending} onClick={() => { draft.clear(); onClose(); }}>Done</Button> : null}
      </div>
      {errors.length > 0 ? <InlineError>{errors.join(" ")}</InlineError> : null}
    </div>
  );
}
