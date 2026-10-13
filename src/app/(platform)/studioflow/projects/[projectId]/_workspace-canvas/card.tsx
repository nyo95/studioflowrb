"use client";

import { GripVertical, Send, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type Ref } from "react";

import { Button, Checkbox, FormattedText, ImageGallery, InlineError, RichTextEditor, RowActionMenu, Select, Text, shrinkImageFile, toggleCheckItem, useFileIntake, type RowActionItem } from "@/platform/ui_engine";

import { addWorkspaceCardImageAction, workspaceAction, type WorkspaceCommandInput } from "../../../actions";
import { NOTE_MAX, NoteDraftFields, useNoteDraft, type NoteImage } from "../../../_components/phase-note-composer";
import { NoteImageActions } from "../round-labels";

export type WorkspaceCardView = {
  id: string;
  version: number;
  body: string;
  pinned: boolean;
  origin: "NOTE" | "CLIENT_ANSWER" | "SITE_VISIT";
  phaseId: string | null;
  phaseName: string | null;
  iterationLabel: string | null;
  authorName: string | null;
  createdAt: Date;
  editedAt: Date | null;
  images: readonly NoteImage[];
  canvas: { x: number; y: number; w: number } | null;
};

export type PhaseOption = { id: string; name: string };
export type LabelChoices = { allowNone: boolean; phases: readonly PhaseOption[] };

/** What a failed command tells the screen; a stale version is told apart so the card can offer a merge. */
export type CommandOutcome = { ok: true; data: unknown } | { ok: false; message: string; stale: boolean };
export type RunCommand = (input: WorkspaceCommandInput) => Promise<CommandOutcome>;

const NOTE_IMAGE_BYTES = 3 * 1024 * 1024;

/** Uploads images onto one card, one request at a time so the order holds; returns what did not get through. */
export async function uploadCardImages(projectId: string, cardId: string, files: readonly File[]): Promise<{ problems: string[]; failed: File[] }> {
  const problems: string[] = [];
  const failed: File[] = [];
  for (const file of files) {
    try {
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("cardId", cardId);
      form.set("file", await shrinkImageFile(file, { maxBytes: NOTE_IMAGE_BYTES }));
      const result = await addWorkspaceCardImageAction(form);
      if (!result.ok) { problems.push(result.error.safeMessage); failed.push(file); }
    } catch {
      problems.push(`${file.name || "An image"} could not be added.`);
      failed.push(file);
    }
  }
  return { problems, failed };
}

export async function runWorkspaceCommand(input: WorkspaceCommandInput): Promise<CommandOutcome> {
  try {
    const result = await workspaceAction(input);
    if (result.ok) return { ok: true, data: result.data };
    const stale = result.error.code === "WORKSPACE_CARD_STALE" || result.error.code === "WORKSPACE_SECTION_STALE";
    return { ok: false, stale, message: stale ? "Someone else changed this a moment ago. The board now shows the latest; please try again." : result.error.safeMessage };
  } catch {
    return { ok: false, stale: false, message: "The change could not be saved. Please try again." };
  }
}

/**
 * One Workspace block on the canvas (owner, option A 2026-10-13): it reads as plain content, like a Notion block, and
 * its tools (grip, labels, star, menu) appear on hover or focus. Click it to write straight into it; the text saves
 * itself shortly after typing stops and when the block is left. An image pasted or dropped while writing is added at
 * once. A checklist ticks in place. If someone else changed the text first, both texts are shown and the person
 * chooses, so nothing is overwritten silently; a move or a star by someone else is absorbed.
 */
export function WorkspaceCard({ card, projectId, canWrite, labelChoices, canUseIdeas, dimmed, style, measureRef, menuExtra, run, onDelete, onGripDown, onWidthDown }: {
  card: WorkspaceCardView;
  projectId: string;
  canWrite: boolean;
  labelChoices: LabelChoices;
  canUseIdeas: boolean;
  dimmed: boolean;
  style?: CSSProperties;
  measureRef?: Ref<HTMLElement>;
  menuExtra: readonly RowActionItem[];
  run: RunCommand;
  onDelete: (card: WorkspaceCardView) => void;
  /** Starts a drag of the block (canvas only); absent where it cannot move. */
  onGripDown?: (event: ReactPointerEvent) => void;
  onWidthDown?: (event: ReactPointerEvent) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.body);
  // The text and version the block last saved (or opened with). A star or a move by someone else bumps the version but
  // keeps the text, so only a different text is a conflict.
  const [baseBody, setBaseBody] = useState(card.body);
  const base = useRef({ body: card.body, version: card.version });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "conflict">("idle");
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const latest = useRef(card);
  const draftRef = useRef(draft);
  useEffect(() => { latest.current = card; draftRef.current = draft; });

  const changedMeanwhile = editing && card.body !== baseBody;

  const adopt = (body: string, version: number) => { base.current = { body, version }; setBaseBody(body); };

  const startEdit = () => {
    if (!canWrite || editing) return;
    setDraft(card.body); adopt(card.body, card.version); setProblems([]); setStatus("idle");
    // After a menu closes and hands focus back to its button, so the editor keeps the caret.
    window.setTimeout(() => setEditing(true), 0);
  };

  /** Saves the text unless it is unchanged, empty with no image (the old text stays), or waiting on a conflict. */
  const saveNow = async (text: string) => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    const body = text.trim();
    const now = latest.current;
    if (body === base.current.body.trim()) return true;
    if (!body && now.images.length === 0) return true;
    if (now.body !== base.current.body) { setStatus("conflict"); return false; }
    setStatus("saving");
    const result = await run({ command: "updateCard", projectId, cardId: card.id, body: body || null, version: Math.max(now.version, base.current.version) });
    if (!result.ok) {
      setStatus(result.stale ? "conflict" : "idle");
      if (!result.stale) setProblems([result.message]);
      return false;
    }
    adopt(body, (result.data as { version: number }).version);
    setStatus("saved");
    return true;
  };

  const onType = (text: string) => {
    setDraft(text);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void saveNow(text), 700);
  };

  const leave = async () => {
    if (status === "conflict" || changedMeanwhile) return;
    if (await saveNow(draftRef.current)) setEditing(false);
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
      router.refresh();
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
  const canLabel = canWrite && (labelChoices.allowNone || labelChoices.phases.length > 0);
  const menu: RowActionItem[] = canWrite ? [
    { label: "Edit", onSelect: startEdit },
    { label: feedback ? "Not client feedback" : "Mark as client feedback", onSelect: () => void command({ command: "setClientAnswer", projectId, cardId: card.id, clientAnswer: !feedback, version: card.version }) },
    ...(canLabel ? [{ label: card.phaseId ? "Change phase label" : "Add phase label", onSelect: () => setLabelOpen(true) }] : []),
    ...menuExtra,
    { label: "Delete", danger: true, separatorBefore: true, onSelect: () => onDelete(card) },
  ] : [];
  const label = card.phaseName ? `${card.phaseName}${card.iterationLabel ? ` · ${card.iterationLabel}` : ""}` : "General";
  const byline = [feedback && !card.authorName ? "Client" : card.authorName, card.editedAt ? "edited" : null].filter(Boolean).join(" · ");
  const tools = editing || labelOpen || problems.length > 0;

  return (
    <article
      ref={measureRef as Ref<HTMLElement>}
      style={style}
      aria-label={`Block · ${label}${byline ? ` · ${byline}` : ""}`}
      title={byline || undefined}
      {...(editing ? intake.target : {})}
      className={[
        "group/card relative grid gap-1.5 rounded-[10px] px-3 py-2.5 transition-[opacity,box-shadow,background-color] duration-150",
        feedback ? "bg-[color-mix(in_srgb,var(--ui-warning-bg)_70%,var(--ui-surface))] shadow-[0_0_0_1px_var(--ui-warning-border)]" : editing ? "bg-surface shadow-raise" : "bg-surface shadow-[0_0_0_1px_transparent] hover:shadow-plane",
        intake.active ? "outline-2 outline-dashed outline-offset-2 outline-line-focus" : "",
        dimmed ? "pointer-events-none opacity-25" : "",
      ].join(" ")}
    >
      {onGripDown && !editing ? (
        <button type="button" aria-label="Drag to move" onPointerDown={onGripDown} className="absolute -left-5 top-2 grid h-6 w-5 cursor-grab touch-none place-items-center rounded text-ink-tertiary opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100 active:cursor-grabbing">
          <GripVertical aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {/* Labels float above the block on hover, so plain content is all the block shows at rest. */}
      <div className={`pointer-events-none absolute -top-3 left-2 flex max-w-[calc(100%-4rem)] items-center gap-1 transition-opacity ${tools ? "opacity-100" : "opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100"}`}>
        <span className="truncate rounded-pill bg-surface px-2 py-0.5 text-[11px] text-ink-secondary shadow-float">{label}</span>
        {feedback ? <span className="rounded-pill bg-warning-surface px-2 py-0.5 text-[11px] text-warning shadow-float">Client feedback</span> : null}
        {card.origin === "SITE_VISIT" ? <span className="rounded-pill bg-surface px-2 py-0.5 text-[11px] text-ink-secondary shadow-float">Site visit</span> : null}
      </div>
      <div className={`absolute -top-3 right-2 flex items-center rounded-pill bg-surface shadow-float transition-opacity ${tools ? "opacity-100" : card.pinned ? "opacity-100" : "opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100"}`}>
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
        {menu.length > 0 && !editing ? <span className={card.pinned ? "hidden group-hover/card:inline-flex group-focus-within/card:inline-flex" : "inline-flex"}><RowActionMenu label="Block actions" items={menu} /></span> : null}
      </div>

      {editing ? (
        <div className="grid gap-2">
          {changedMeanwhile || status === "conflict" ? (
            <div className="grid gap-2 rounded-control border border-warning-line bg-warning-surface p-2">
              <Text size="sm" weight="semibold">Someone else changed this block. Their text:</Text>
              {card.body ? <FormattedText text={card.body} className="text-sm" /> : <Text size="sm" tone="tertiary">(no text)</Text>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => { setDraft(card.body); adopt(card.body, card.version); setStatus("idle"); setProblems([]); }}>Use theirs</Button>
                <Button size="sm" variant="secondary" onClick={() => { adopt(card.body, card.version); setStatus("idle"); setProblems([]); void saveNow(draftRef.current); }}>Keep mine</Button>
              </div>
            </div>
          ) : null}
          <RichTextEditor bare slashMenu aria-label="Block text" placeholder="Write, or type / for headings, lists and checklists" maxLength={NOTE_MAX} value={draft} autoFocus onChange={onType} onBlur={() => void leave()} />
          {card.images.length > 0 ? (
            <ImageGallery images={card.images} size="sm" onRemove={(image) => void command({ command: "removeCardImage", projectId, imageId: image.id })} />
          ) : null}
          <Text size="sm" tone="tertiary" className="text-xs">{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Paste or drop an image to add it"}{busy ? " · adding image…" : ""}</Text>
        </div>
      ) : (
        <div
          className={canWrite ? "cursor-text" : undefined}
          onClick={(event) => { if (!(event.target as HTMLElement).closest("a, button, input, img, [role=button]")) startEdit(); }}
        >
          {card.body ? <FormattedText text={card.body} className="text-sm" onToggleCheck={canWrite ? toggleCheck : undefined} /> : null}
          {card.images.length > 0 ? <ImageGallery images={card.images} size="sm" viewerActions={(image) => <NoteImageActions image={image} projectId={projectId} phaseId={card.phaseId} canUseIdeas={canUseIdeas} />} /> : null}
          {!card.body && card.images.length === 0 ? <Text size="sm" tone="tertiary">Empty block</Text> : null}
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
 * Quick capture: write a card into a frame. Enter sends, Shift+Enter is a new line; images paste, drop or pick in.
 * It stays open after sending so several points from one conversation go in one after another. The phase label
 * starts from the phase chosen above the board, so a card written while working on a phase belongs to it.
 */
export function CardComposer({ projectId, sectionId, place, labelChoices, defaultPhaseId, run, onClose, autoFocus = false }: {
  projectId: string;
  sectionId?: string;
  /** Where the first block goes (a double-clicked spot); the ones after it stack under the frame's blocks. */
  place?: { x: number; y: number; w: number };
  labelChoices: LabelChoices;
  defaultPhaseId: string | null;
  run: RunCommand;
  onClose?: () => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const draft = useNoteDraft();
  const initialPhase = defaultPhaseId && labelChoices.phases.some((phase) => phase.id === defaultPhaseId) ? defaultPhaseId : labelChoices.allowNone ? "" : labelChoices.phases[0]?.id ?? "";
  const [phaseId, setPhaseId] = useState(initialPhase);
  const [clientAnswer, setClientAnswer] = useState(false);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  // A card whose images did not all get through: sending again retries them on that card, so one card stays one card.
  const pending = useRef<string | null>(null);
  useEffect(() => { if (draft.attachments.length === 0) pending.current = null; }, [draft.attachments.length]);
  const spot = useRef(place);

  const send = async () => {
    if (sending || draft.empty) return;
    const body = draft.text.trim();
    const files = draft.files;
    setSending(true); setErrors([]);
    try {
      let target = pending.current;
      if (!target || body) {
        const created = await run({ command: "createCard", projectId, sectionId, phaseId: phaseId || null, body: body || null, clientAnswer, withImages: !target && files.length > 0, ...(spot.current ?? {}) });
        if (!created.ok) { setErrors([created.message]); return; }
        spot.current = undefined;
        target = (created.data as { cardId: string }).cardId;
      }
      const { problems, failed } = await uploadCardImages(projectId, target, files);
      router.refresh();
      if (failed.length > 0) { pending.current = target; draft.keepOnly(failed); setErrors(problems); return; }
      pending.current = null;
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
