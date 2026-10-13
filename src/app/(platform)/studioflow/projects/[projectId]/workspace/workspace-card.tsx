"use client";

import { GripVertical, Pin, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";

import { Badge, Button, Checkbox, FormattedInstant, FormattedText, IconButton, ImageGallery, InlineError, Notice, RichTextEditor, RowActionMenu, Select, Text, shrinkImageFile, type RowActionItem } from "@/platform/ui_engine";

import { addWorkspaceCardImageAction, workspaceAction, type WorkspaceCommandInput } from "../../../actions";
import { NOTE_MAX, NoteDraftFields, useNoteDraft, type NoteImage } from "../../../_components/phase-note-composer";
import { NoteImageActions } from "../notes-workspace";

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
};

export type PhaseOption = { id: string; name: string };

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

const ORIGIN_BADGE: Record<WorkspaceCardView["origin"], { label: string; tone: "warning" | "neutral" } | null> = {
  NOTE: null,
  CLIENT_ANSWER: { label: "Client answer", tone: "warning" },
  SITE_VISIT: { label: "Site visit", tone: "neutral" },
};

export type CardDrag = {
  draggable: boolean;
  dragging: boolean;
  /** Where a dragged card would land relative to this one. */
  dropEdge: "before" | "after" | null;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent) => void;
};

/**
 * One Workspace card: its labels, formatted text and images, and (for whoever may write it) edit, pin, client-answer,
 * phase label, move and delete. Editing keeps the version it started from; when someone else saves first, both
 * texts are shown and the person chooses, so nothing is overwritten silently.
 */
export function WorkspaceCard({ card, projectId, canWrite, labelChoices, canUseIdeas, locale, timezone, menuExtra, drag, run, onDelete }: {
  card: WorkspaceCardView;
  projectId: string;
  canWrite: boolean;
  /** Phase labels this person may move the card to (empty: the label menu is hidden). */
  labelChoices: { allowNone: boolean; phases: readonly PhaseOption[] };
  canUseIdeas: boolean;
  locale: string;
  timezone: string;
  menuExtra: readonly RowActionItem[];
  drag: CardDrag;
  run: RunCommand;
  onDelete: (card: WorkspaceCardView) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.body);
  // The text and version the edit started from: a pin or a move by someone else bumps the version but keeps the text,
  // so only a change of the text itself is a conflict to show.
  const [editBase, setEditBase] = useState({ body: card.body, version: card.version });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [labelOpen, setLabelOpen] = useState(false);
  const added = useNoteDraft(!editing);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());

  const changedMeanwhile = editing && card.body !== editBase.body;
  const adopt = () => setEditBase({ body: card.body, version: card.version });

  const startEdit = () => { setDraft(card.body); adopt(); setProblems([]); added.clear(); setRemoved(new Set()); setEditing(true); };
  const cancel = () => { added.clear(); setRemoved(new Set()); setProblems([]); setEditing(false); };

  const command = async (input: WorkspaceCommandInput) => {
    setBusy(true); setProblems([]);
    const result = await run(input);
    setBusy(false);
    if (!result.ok) setProblems([result.message]);
    return result.ok;
  };

  const save = async () => {
    setSaving(true); setProblems([]);
    try {
      const body = draft.trim() || null;
      if (body !== (card.body || null)) {
        const result = await run({ command: "updateCard", projectId, cardId: card.id, body, version: card.body === editBase.body ? card.version : editBase.version });
        if (!result.ok) {
          // A stale save refreshes the card; the editor keeps the text so the person can compare and decide.
          setProblems([result.stale ? "Someone else saved this card while you were editing. Their text is shown above yours; choose which to keep." : result.message]);
          return;
        }
      }
      // New images first, so removing the last old image never leaves the card empty on the way.
      const { problems: failed, failed: left } = await uploadCardImages(projectId, card.id, added.files);
      for (const imageId of removed) {
        const result = await run({ command: "removeCardImage", projectId, imageId });
        if (!result.ok) { failed.push(result.message); break; }
      }
      setRemoved(new Set());
      router.refresh();
      if (failed.length > 0) { added.keepOnly(left); setProblems(failed); return; }
      added.clear();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const origin = ORIGIN_BADGE[card.origin];
  const canLabel = canWrite && (labelChoices.allowNone || labelChoices.phases.length > 0);
  const menu: RowActionItem[] = canWrite ? [
    { label: "Edit", onSelect: startEdit },
    { label: card.origin === "CLIENT_ANSWER" ? "Not a client answer" : "Mark as client answer", onSelect: () => void command({ command: "setClientAnswer", projectId, cardId: card.id, clientAnswer: card.origin !== "CLIENT_ANSWER", version: card.version }) },
    ...(canLabel ? [{ label: card.phaseId ? "Change phase label" : "Add phase label", onSelect: () => setLabelOpen(true) }] : []),
    ...menuExtra,
    { label: "Delete", danger: true, separatorBefore: true, onSelect: () => onDelete(card) },
  ] : [];

  return (
    <article
      draggable={drag.draggable && !editing}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      onDragOver={drag.onDragOver}
      aria-label={`Card${card.phaseName ? ` · ${card.phaseName}` : ""}${card.authorName ? ` · ${card.authorName}` : ""}`}
      className={[
        "group relative grid gap-2 rounded-control border px-3 py-2.5",
        card.origin === "CLIENT_ANSWER" ? "border-warning/40 bg-warning/5" : card.pinned ? "border-line-strong bg-surface" : "border-line-subtle bg-surface",
        drag.dragging ? "opacity-40" : "",
        drag.draggable && !editing ? "cursor-grab active:cursor-grabbing" : "",
      ].join(" ")}
    >
      {drag.dropEdge ? <span aria-hidden="true" className={`pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-line-focus ${drag.dropEdge === "before" ? "-top-1.5" : "-bottom-1.5"}`} /> : null}

      <div className="flex items-start gap-1.5">
        {drag.draggable && !editing ? <GripVertical aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-tertiary opacity-50 group-hover:opacity-100" /> : null}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {card.phaseName ? <Badge tone="neutral">{card.phaseName}{card.iterationLabel ? ` · ${card.iterationLabel}` : ""}</Badge> : null}
          {origin ? <Badge tone={origin.tone}>{origin.label}</Badge> : null}
        </div>
        <div className="-mr-1 -mt-1 flex shrink-0 items-center">
          <IconButton
            size="sm"
            variant="ghost"
            label={card.pinned ? "Unpin" : "Pin"}
            aria-pressed={card.pinned}
            disabled={!canWrite}
            pending={busy}
            icon={<Pin aria-hidden="true" className={card.pinned ? "fill-current text-ink" : ""} />}
            onClick={() => void command({ command: "pinCard", projectId, cardId: card.id, pinned: !card.pinned, version: card.version })}
            className={card.pinned || !canWrite ? "" : "opacity-50 group-hover:opacity-100 focus-visible:opacity-100"}
          />
          {menu.length > 0 && !editing ? <RowActionMenu label="Card actions" items={menu} /> : null}
        </div>
      </div>

      {editing ? (
        <div className={`grid gap-2 rounded-control ${added.intake.active ? "outline-2 outline-dashed outline-offset-4 outline-line-focus" : ""}`} {...added.intake.target}>
          {changedMeanwhile ? (
            <div className="grid gap-2 rounded-control border border-warning-line bg-warning-surface p-2">
              <Text size="sm" weight="semibold">Their newer text</Text>
              {card.body ? <FormattedText text={card.body} className="text-sm" /> : <Text size="sm" tone="tertiary">(no text)</Text>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => { setDraft(card.body); adopt(); setProblems([]); }}>Use theirs</Button>
                <Button size="sm" variant="secondary" onClick={() => { adopt(); setProblems([]); }}>Keep mine</Button>
              </div>
            </div>
          ) : null}
          <RichTextEditor aria-label="Edit card" maxLength={NOTE_MAX} value={draft} autoFocus onChange={setDraft} onSubmit={() => void save()} />
          <ImageGallery
            images={[...card.images.filter((image) => !removed.has(image.id)), ...added.attachments.map((item) => ({ id: item.url, url: item.url }))]}
            size="sm"
            onRemove={(image) => {
              const index = added.attachments.findIndex((item) => item.url === image.id);
              if (index >= 0) added.remove(index); else setRemoved((current) => new Set(current).add(image.id));
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" pending={saving} disabled={changedMeanwhile} onClick={() => void save()}>Save</Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={cancel}>Cancel</Button>
            <Text size="sm" tone="tertiary">Paste or drop an image to add it.</Text>
          </div>
          {added.problem ? <InlineError>{added.problem}</InlineError> : null}
        </div>
      ) : (
        <>
          {card.body ? <FormattedText text={card.body} className="text-sm" /> : null}
          {card.images.length > 0 ? <ImageGallery images={card.images} size="sm" viewerActions={(image) => <NoteImageActions image={image} projectId={projectId} phaseId={card.phaseId} canUseIdeas={canUseIdeas} />} /> : null}
        </>
      )}

      {labelOpen ? (
        <PhaseLabelPicker
          card={card}
          choices={labelChoices}
          onCancel={() => setLabelOpen(false)}
          onPick={async (phaseId) => { if (await command({ command: "setCardPhase", projectId, cardId: card.id, phaseId, version: card.version })) setLabelOpen(false); }}
        />
      ) : null}

      <Text size="sm" tone="tertiary">
        {card.authorName ? `${card.authorName} · ` : ""}<FormattedInstant value={card.createdAt} locale={locale} timeZone={timezone} style="datetime" />{card.editedAt ? " · edited" : ""}
      </Text>
      {problems.length > 0 ? <InlineError>{problems.join(" ")}</InlineError> : null}
    </article>
  );
}

/** Inline phase-label choice; clearing or changing the label also drops the round label (the service rule). */
function PhaseLabelPicker({ card, choices, onPick, onCancel }: { card: WorkspaceCardView; choices: { allowNone: boolean; phases: readonly PhaseOption[] }; onPick: (phaseId: string | null) => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState(card.phaseId ?? "");
  const [pending, setPending] = useState(false);
  const options = card.phaseId && !choices.phases.some((phase) => phase.id === card.phaseId) ? [{ id: card.phaseId, name: card.phaseName ?? "Current phase" }, ...choices.phases] : choices.phases;
  return (
    <div className="grid gap-2 rounded-control border border-line-subtle bg-surface-muted/40 p-2">
      <Select aria-label="Phase label" value={value} onChange={(event) => setValue(event.target.value)}>
        {choices.allowNone || !card.phaseId ? <option value="">No phase</option> : null}
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
 * Writes a new card at the end of a section. Enter sends, Shift+Enter is a new line; images paste, drop or pick in.
 * The phase label starts from the board's phase filter, so a card written while looking at one phase belongs to it.
 */
export function CardComposer({ projectId, sectionId, labelChoices, defaultPhaseId, run, onDone, autoFocus = false }: {
  projectId: string;
  sectionId?: string;
  labelChoices: { allowNone: boolean; phases: readonly PhaseOption[] };
  defaultPhaseId: string | null;
  run: RunCommand;
  onDone?: () => void;
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

  const send = async () => {
    if (sending || draft.empty) return;
    const body = draft.text.trim();
    const files = draft.files;
    setSending(true); setErrors([]);
    try {
      let target = pending.current;
      if (!target || body) {
        const created = await run({ command: "createCard", projectId, sectionId, phaseId: phaseId || null, body: body || null, clientAnswer, withImages: !target && files.length > 0 });
        if (!created.ok) { setErrors([created.message]); return; }
        target = (created.data as { cardId: string }).cardId;
      }
      const { problems, failed } = await uploadCardImages(projectId, target, files);
      router.refresh();
      if (failed.length > 0) { pending.current = target; draft.keepOnly(failed); setErrors(problems); return; }
      pending.current = null;
      draft.clear();
      setClientAnswer(false);
      onDone?.();
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
          {labelChoices.allowNone ? <option value="">No phase</option> : null}
          {labelChoices.phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
        </Select>
        <Checkbox label="Client answer" checked={clientAnswer} onCheckedChange={(checked) => setClientAnswer(checked === true)} />
        {onDone ? <Button type="button" size="sm" variant="ghost" disabled={sending} onClick={() => { draft.clear(); onDone(); }}>Cancel</Button> : null}
      </div>
      {errors.length > 0 ? <InlineError>{errors.join(" ")}</InlineError> : null}
    </div>
  );
}

export function ReadOnlyBoardNotice({ reason }: { reason: "archived" | "inactive" | "permission" | "limited" }) {
  const text = {
    archived: "This project is archived, so its Workspace is read-only.",
    inactive: "The Workspace can be changed once the project is active.",
    permission: "You can read this Workspace. Only the project's designer or drafter can change it.",
    limited: "You can write cards for your own phases only; the other cards are read-only for you.",
  }[reason];
  return <Notice tone="neutral">{text}</Notice>;
}
