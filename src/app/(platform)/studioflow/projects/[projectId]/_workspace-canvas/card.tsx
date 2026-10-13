"use client";

import { GripVertical, Send, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type Ref } from "react";

import { Button, Checkbox, FormattedText, ImageGallery, InlineError, RichTextEditor, RowActionMenu, Select, Text, shrinkImageFile, type RowActionItem } from "@/platform/ui_engine";

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
 * One Workspace card on the canvas: labels, formatted text and images; for whoever may write it, a grip to drag,
 * a width handle, star, and a menu (edit, client feedback, phase label, move, delete). Its height always follows its
 * content. Editing keeps the text and version it started from; when someone else changed the text first, both texts
 * are shown and the person chooses, so nothing is overwritten silently. A move or a star by someone else is absorbed.
 */
export function WorkspaceCard({ card, projectId, canWrite, labelChoices, canUseIdeas, dimmed, style, measureRef, menuExtra, run, onDelete, onGripDown, onWidthDown, dragging }: {
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
  /** Starts a drag of the card (canvas only); absent where the card cannot move. */
  onGripDown?: (event: ReactPointerEvent) => void;
  onWidthDown?: (event: ReactPointerEvent) => void;
  dragging?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.body);
  const [editBase, setEditBase] = useState({ body: card.body, version: card.version });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [labelOpen, setLabelOpen] = useState(false);
  const added = useNoteDraft(!editing);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());

  const changedMeanwhile = editing && card.body !== editBase.body;
  const adopt = () => setEditBase({ body: card.body, version: card.version });

  const startEdit = () => {
    setDraft(card.body); adopt(); setProblems([]); added.clear(); setRemoved(new Set());
    // After the menu closes and hands focus back to its button, so the editor keeps the caret.
    window.setTimeout(() => setEditing(true), 0);
  };
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
          setProblems([result.stale ? "Someone else saved this card while you were editing. Their text is shown above yours; choose which to keep." : result.message]);
          return;
        }
      }
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

  const feedback = card.origin === "CLIENT_ANSWER";
  const canLabel = canWrite && (labelChoices.allowNone || labelChoices.phases.length > 0);
  const menu: RowActionItem[] = canWrite ? [
    { label: "Edit", onSelect: startEdit },
    { label: feedback ? "Not client feedback" : "Mark as client feedback", onSelect: () => void command({ command: "setClientAnswer", projectId, cardId: card.id, clientAnswer: !feedback, version: card.version }) },
    ...(canLabel ? [{ label: card.phaseId ? "Change phase label" : "Add phase label", onSelect: () => setLabelOpen(true) }] : []),
    ...menuExtra,
    { label: "Delete", danger: true, separatorBefore: true, onSelect: () => onDelete(card) },
  ] : [];

  return (
    <article
      ref={measureRef as Ref<HTMLElement>}
      style={style}
      aria-label={`Card${card.phaseName ? ` · ${card.phaseName}` : ""}${card.authorName ? ` · ${card.authorName}` : ""}`}
      className={[
        "group/card grid gap-1.5 rounded-[12px] px-3 pb-2 pt-2 transition-[opacity,box-shadow] duration-150",
        feedback ? "bg-[color-mix(in_srgb,var(--ui-warning-bg)_70%,var(--ui-surface))] shadow-[0_0_0_1px_var(--ui-warning-border)]" : "bg-surface shadow-plane hover:shadow-raise focus-within:shadow-raise",
        dimmed ? "pointer-events-none opacity-25" : "",
        dragging ? "z-40 shadow-elevated" : "",
      ].join(" ")}
    >
      <div className="flex min-h-6 items-center gap-1">
        {onGripDown && !editing ? (
          <button type="button" aria-label="Drag to move" onPointerDown={onGripDown} className="-ml-1.5 grid h-6 w-5 cursor-grab touch-none place-items-center rounded text-ink-tertiary opacity-40 group-hover/card:opacity-100 active:cursor-grabbing">
            <GripVertical aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <span className="inline-flex h-5 items-center rounded-pill bg-surface-muted px-2 text-xs text-ink-secondary">{card.phaseName ? `${card.phaseName}${card.iterationLabel ? ` · ${card.iterationLabel}` : ""}` : "General"}</span>
          {feedback ? <span className="inline-flex h-5 items-center rounded-pill bg-warning-surface px-2 text-xs text-warning shadow-[0_0_0_1px_var(--ui-warning-border)]">Client feedback</span> : null}
          {card.origin === "SITE_VISIT" ? <span className="inline-flex h-5 items-center rounded-pill bg-surface-muted px-2 text-xs text-ink-secondary">Site visit</span> : null}
        </div>
        <div className="-mr-1.5 flex shrink-0 items-center">
          <button
            type="button"
            aria-label={card.pinned ? "Unstar" : "Star"}
            aria-pressed={card.pinned}
            disabled={!canWrite || busy}
            onClick={() => void command({ command: "pinCard", projectId, cardId: card.id, pinned: !card.pinned, version: card.version })}
            className={`grid h-6 w-6 place-items-center rounded hover:bg-surface-muted disabled:cursor-default ${card.pinned ? "text-warning" : "text-ink-tertiary opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100"}`}
          >
            <Star aria-hidden="true" className={`h-3.5 w-3.5 ${card.pinned ? "fill-current" : ""}`} />
          </button>
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
          <RichTextEditor compact aria-label="Edit card" maxLength={NOTE_MAX} value={draft} autoFocus onChange={setDraft} onSubmit={() => void save()} />
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
          </div>
          {added.problem ? <InlineError>{added.problem}</InlineError> : null}
        </div>
      ) : (
        <div
          className={canWrite ? "cursor-text" : undefined}
          onDoubleClick={canWrite ? startEdit : undefined}
          title={canWrite ? "Double-click to edit" : undefined}
        >
          {card.body ? <FormattedText text={card.body} className="text-sm" /> : null}
          {card.images.length > 0 ? <ImageGallery images={card.images} size="sm" viewerActions={(image) => <NoteImageActions image={image} projectId={projectId} phaseId={card.phaseId} canUseIdeas={canUseIdeas} />} /> : null}
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

      <Text size="sm" tone="tertiary" className="text-xs">{feedback && !card.authorName ? "Client" : card.authorName ?? ""}{card.editedAt ? " · edited" : ""}</Text>
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
export function CardComposer({ projectId, sectionId, labelChoices, defaultPhaseId, run, onClose, autoFocus = false }: {
  projectId: string;
  sectionId?: string;
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
