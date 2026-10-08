"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crown, Eye, EyeOff, History, ImageIcon, Plus, Printer, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";

import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";

import {
  SCHEDULE_CARD_FIELD_LABEL as CARD_FIELD_LABEL,
  SCHEDULE_SECTION_LABEL as SECTION_LABEL,
  cardFieldLabel,
  cardFieldValuesOf,
  effectiveCardFields,
  extraFieldKey,
  extraChoicesOf,
  finalOf,
  nextOptionLabel,
  resolveCardFields,
  shownOptionOf,
  specLine,
  templateSourceOf,
  type ScheduleEntryView,
  type ScheduleExtraField,
  type ScheduleOptionView,
} from "@/apps/studioflow/domain/schedule";
import {
  Badge,
  Button,
  ButtonMenu,
  CreatableSearch,
  Dialog,
  Drawer,
  EmptyState,
  Field,
  FilterChip,
  FormActions,
  GroupHeader,
  ImageWorkspace,
  IconButton,
  InlineError,
  Input,
  ProgressBar,
  PillTabs,
  ContextActionMenu,
  RowActionMenu,
  Select,
  SimpleTextEditor,
  Text,
  Textarea,
  useConfirm,
  useFileIntake,
  type CreatableSearchGroup,
  type CreatableSearchOption,
} from "@/platform/ui_engine";

import {
  applyScheduleTemplatesAction,
  cancelScheduleSampleAction,
  copyReusableScheduleOptionAction,
  createScheduleEntryAction,
  createScheduleOptionAction,
  deleteScheduleEntryAction,
  deleteScheduleOptionAction,
  importScheduleCsvAction,
  scheduleImportTemplateAction,
  markScheduleFinalAction,
  moveScheduleEntryAction,
  moveScheduleEntryToCategoryAction,
  removeScheduleOptionImageAction,
  receiveScheduleSampleAction,
  reorderScheduleEntriesAction,
  requestScheduleSampleAction,
  saveScheduleEntryAsTemplateAction,
  searchReusableScheduleOptionsAction,
  setScheduleOptionImageAction,
  updateScheduleEntryAction,
  updateScheduleEntryCardFieldsAction,
  unmarkScheduleFinalAction,
  updateScheduleOptionAction,
} from "../../../actions";
import { ExtraFieldsEditor } from "../../../_components/extra-fields-editor";
import { useCommand } from "../../../_components/use-command";

type Section = "MATERIAL" | "FIXTURE";
type Brand = { id: string; name: string };
/** A category the studio already knows (template category or prefix dictionary). */
type CategoryChoice = { section: Section; category: string; prefix: string | null };

type ReuseHit = {
  optionId: string;
  sourceProjectName: string;
  category: string;
  brandName: string | null;
  productName: string;
  color: string | null;
  pattern: string | null;
  finishing: string | null;
  dimension: string | null;
  isFinal: boolean;
};

type Command = ReturnType<typeof useCommand>;

/** Legacy catalog photos are portrait 4:5. */
const PHOTO_ASPECT = 4 / 5;

/**
 * Photo crop/upload panel for one option. Renders inline in place of the
 * option row (same swap pattern as `OptionInlineForm`) rather than as its
 * own `Dialog` — the entry panel is already a modal, and stacking a second
 * modal on top of it read as two disconnected popups for one action (owner,
 * 2026-09-24: "modalnya jd 1 aja"). `ImageWorkspace` opens the OS file
 * picker itself as soon as it mounts (`openOnMount`), so "Change photo" goes
 * straight to choosing a file; "Choose image" stays as the fallback when the
 * browser declines to open it.
 */
function InlinePhotoEditor({
  projectId,
  entryCode,
  option,
  command,
  initialFile,
  onClose,
}: {
  projectId: string;
  entryCode: string;
  option: ScheduleOptionView;
  command: Command;
  /** A photo already pasted or dropped on the option's photo box; the file picker then stays shut. */
  initialFile: File | null;
  onClose: () => void;
}) {
  const { run, isPending } = command;
  const [photoError, setPhotoError] = useState<string | null>(null);
  const pendingKey = `${option.id}-photo`;

  const onPrepared = async (file: File) => {
    setPhotoError(null);
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("optionId", option.id);
    form.set("file", file);
    const ok = await run(pendingKey, async () => {
      const result = await setScheduleOptionImageAction(form);
      if (!result.ok) setPhotoError(result.error.safeMessage);
      return result;
    });
    if (ok) onClose();
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Text size="sm" weight="semibold">{`Photo — ${entryCode} option ${option.label}`}</Text>
          <Text size="sm" tone="tertiary">Choose, drop or paste a photo, then crop it to the 4:5 catalog frame.</Text>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={isPending(pendingKey)}>Cancel</Button>
      </div>
      <ImageWorkspace label="Schedule photo" aspect={PHOTO_ASPECT} maxDimension={1600} outputType="image/jpeg" onPrepared={onPrepared} disabled={isPending(pendingKey)} openOnMount={!initialFile} initialFile={initialFile} pasteFromPage />
      {photoError ? <InlineError>{photoError}</InlineError> : null}
    </div>
  );
}

/** Physical sample request (owner, 2026-09-23): stays entirely inside StudioFlow — never writes to Master Data. */
function InlineSampleRequest({
  projectId,
  option,
  command,
  onClose,
}: {
  projectId: string;
  option: ScheduleOptionView;
  command: Command;
  onClose: () => void;
}) {
  const { run, isPending, error } = command;
  const pendingKey = `${option.id}-sample`;
  const [requestedFrom, setRequestedFrom] = useState("");
  const [note, setNote] = useState("");

  return (
      <form className="grid gap-3 rounded-control border border-line-subtle bg-surface-muted p-3" onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(pendingKey, () => requestScheduleSampleAction({ projectId, optionId: option.id, requestedFrom, note: note || undefined }));
        if (ok) onClose();
      }}>
        <div>
          <Text weight="semibold">Request sample — {option.productName}</Text>
          <Text size="sm" tone="secondary">Master Data staff are told so they can get a quote.</Text>
        </div>
        <Field label="Requested from (optional)" description="Not sure? Leave it blank and Master Data will find a supplier.">
          <Input autoFocus value={requestedFrom} maxLength={200} placeholder="Vendor or supplier name, if you know it" onChange={(e) => setRequestedFrom(e.target.value)} />
        </Field>
        <Field label="Note (optional)"><Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" onClick={onClose} disabled={isPending(pendingKey)}>Cancel</Button>
          <Button type="submit" variant="primary" pending={isPending(pendingKey)}>Request sample</Button>
        </FormActions>
      </form>
  );
}

function Thumb({ url, alt, className = "h-14 w-11" }: { url: string | null; alt: string; className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-[4px] border border-line-subtle bg-surface-muted ${className}`}>
      {url ? (
        // Signed private URLs are short-lived; next/image optimization would cache them.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <ImageIcon aria-hidden="true" className="h-3.5 w-3.5 text-ink-tertiary" />
      )}
    </span>
  );
}

// ── Drag-reorder state (shared by the board grid and the list rows) ──────────

function useRowDrag() {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const start = (id: string) => (event: DragEvent) => { setDraggingId(id); event.dataTransfer.effectAllowed = "move"; };
  const end = () => { setDraggingId(null); setDragOverId(null); };
  const over = (id: string, canEdit: boolean) => (event: DragEvent) => { if (!canEdit || !draggingId) return; event.preventDefault(); setDragOverId(id); };
  const leave = (id: string) => () => setDragOverId((current) => (current === id ? null : current));
  return { draggingId, dragOverId, start, end, over, leave };
}

type ScheduleFilter = "all" | "decision" | "sample" | "empty";

function scheduleFilterCounts(entries: readonly ScheduleEntryView[]) {
  return {
    all: entries.length,
    decision: entries.filter((entry) => entry.options.length > 0 && !finalOf(entry)).length,
    sample: entries.filter((entry) => entry.options.some((option) => option.sampleRequest?.status === "REQUESTED")).length,
    empty: entries.filter((entry) => entry.options.length === 0).length,
    final: entries.filter((entry) => finalOf(entry)).length,
  };
}

function entryMatchesFilter(entry: ScheduleEntryView, filter: ScheduleFilter) {
  if (filter === "decision") return entry.options.length > 0 && !finalOf(entry);
  if (filter === "sample") return entry.options.some((option) => option.sampleRequest?.status === "REQUESTED");
  if (filter === "empty") return entry.options.length === 0;
  return true;
}

function entryBadges(entry: ScheduleEntryView): Array<{ label: string; tone: "success" | "neutral" | "warning" }> {
  const final = finalOf(entry);
  const shown = shownOptionOf(entry);
  const badges: Array<{ label: string; tone: "success" | "neutral" | "warning" }> = [];
  if (final) badges.push({ label: "Final", tone: "success" });
  else if (entry.options.length > 1) badges.push({ label: `${entry.options.length} options`, tone: "neutral" });
  else if (entry.options.length === 1) badges.push({ label: "Not final", tone: "neutral" });
  if (shown?.sampleRequest?.status === "REQUESTED") badges.push({ label: "Sample waiting", tone: "warning" });
  else if (shown?.sampleRequest?.status === "RECEIVED") badges.push({ label: "Sample received", tone: "success" });
  return badges.slice(0, 2);
}

function QuickAddTile({ group, command, projectId, section }: { group: { category: string; rows: ScheduleEntryView[] }; command: Command; projectId: string; section: Section }) {
  const [productName, setProductName] = useState("");
  const prefix = group.rows[0]?.code.split("-")[0] ?? "";
  // One past the highest number, as the server numbers it: a deleted code is left empty, never reused in between.
  const highest = group.rows.reduce((max, row) => Math.max(max, Number(row.code.split("-")[1]) || 0), 0);
  const nextCode = `${prefix}-${String(highest + 1).padStart(2, "0")}`;
  const key = `quick-add-${section}-${group.category}`;
  const submit = async () => {
    const value = productName.trim();
    const ok = await command.run(key, () => createScheduleEntryAction({ projectId, section, category: group.category, qty: null, unit: null, location: null, snapshot: value ? { productName: value } : null }));
    if (ok) setProductName("");
  };
  return (
    <form className="grid min-h-36 content-center gap-2 border border-dashed border-line px-3 py-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Input aria-label={`Quick add to ${group.category}`} value={productName} onChange={(event) => setProductName(event.target.value)} maxLength={200} placeholder="Type, or leave empty to reserve" density="compact" />
      <Button type="submit" size="sm" variant="secondary" pending={command.isPending(key)}>{`Add ${nextCode}`}</Button>
    </form>
  );
}

/** Same comparison as the server's category key: trimmed, single-spaced, case-insensitive. */
const categoryKeyOf = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleUpperCase("id-ID");

/**
 * Category picker options: the project's own categories first, then the studio's (template categories,
 * then the prefix dictionary) that the project does not use yet. Typing a name nobody knows creates it.
 */
function categoryGroups(projectCategories: readonly string[], studio: readonly CategoryChoice[], section: Section, projectLabel: string, disableProject: boolean): CreatableSearchGroup[] {
  const inProject = new Set(projectCategories.map(categoryKeyOf));
  const fromStudio = studio.filter((choice) => choice.section === section && !inProject.has(categoryKeyOf(choice.category)));
  return [
    { label: projectLabel, options: projectCategories.map((name) => ({ id: name, label: name, disabled: disableProject })) },
    { label: "Studio categories", options: fromStudio.map((choice) => ({ id: choice.category, label: choice.category, badge: choice.prefix ? <span className="font-ui-mono text-xs text-ink-tertiary">{choice.prefix}</span> : undefined })) },
  ].filter((group) => group.options.length > 0);
}

/** "New category": pick a studio category or type a new one; it reserves that category's first code at once. */
function NewCategoryInline({ command, projectId, section, categories, categoryChoices, className = "justify-self-start" }: { command: Command; projectId: string; section: Section; categories: readonly string[]; categoryChoices: readonly CategoryChoice[]; className?: string }) {
  const [hint, setHint] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const key = `new-category-${section}`;
  const pick = async (name: string) => {
    const value = name.trim();
    if (!value) return;
    const existing = categories.find((category) => categoryKeyOf(category) === categoryKeyOf(value));
    if (existing) { setHint(`${existing} is already in this project. Add to it with its own add tile.`); return; }
    setHint(null);
    const ok = await command.run(key, () => createScheduleEntryAction({ projectId, section, category: value, qty: null, unit: null, location: null, snapshot: null }));
    if (ok) setRound((current) => current + 1);
  };
  return (
    <div className={`grid gap-1 ${className}`}>
      <CreatableSearch
        key={round}
        label="New category"
        groups={categoryGroups(categories, categoryChoices, section, "Already in this project", true)}
        value=""
        onValueChange={(name) => void pick(name)}
        onCreate={(name) => name.trim()}
        createLabel={(name) => `New category “${name}”`}
        placeholder="+ New category"
        searchPlaceholder="Pick a studio category or type a new one…"
        emptyLabel="No studio category yet. Type a new one."
        disabled={command.isPending(key)}
      />
      {hint ? <Text size="sm" tone="tertiary">{hint}</Text> : null}
    </div>
  );
}

// ── Board view ─────────────────────────────────────────────────────────────

function BoardView({
  projectId,
  groups,
  command,
  onOpen,
  canEdit,
  filter,
  section,
  onReorder,
  onDelete,
  categoryChoices,
}: {
  projectId: string;
  groups: Array<{ category: string; rows: ScheduleEntryView[] }>;
  command: Command;
  onOpen: (id: string) => void;
  canEdit: boolean;
  filter: ScheduleFilter;
  section: Section;
  onReorder: (rows: ScheduleEntryView[], draggedId: string, targetId: string) => void;
  onDelete: (entry: ScheduleEntryView) => void;
  categoryChoices: readonly CategoryChoice[];
}) {
  const { draggingId, dragOverId, start, end, over, leave } = useRowDrag();
  const reorderEnabled = canEdit && filter === "all";
  return (
    <div className="@container grid gap-8 p-(--ui-section-px)">
      {groups.map((group) => (
        <section key={group.category} className="grid gap-3" aria-label={group.category}>
          <GroupHeader title={<span className="inline-flex items-baseline gap-2"><span>{group.category}</span><span className="font-ui-mono font-normal text-ink-tertiary">{group.rows[0]?.code.split("-")[0]}</span></span>} count={group.rows.length} />
          <div className="grid min-w-0 grid-cols-2 items-start gap-x-4 gap-y-7 @2xl:grid-cols-3 @4xl:grid-cols-4">
            {group.rows.map((entry) => {
              const shown = shownOptionOf(entry);
              const extras = extraChoicesOf(entry);
              const fieldValue = cardFieldValuesOf(entry);
              const details: Array<[string, string | null | undefined]> = effectiveCardFields(entry)
                .map((key) => [cardFieldLabel(key, extras), fieldValue[key]] as [string, string | null | undefined]);
              const badges = entryBadges(entry);
              return (
                <ContextActionMenu
                  key={entry.id}
                  items={canEdit ? [
                    { label: "Open", onSelect: () => onOpen(entry.id) },
                    { label: "Delete", danger: true, separatorBefore: true, onSelect: () => onDelete(entry) },
                  ] : []}
                >
                <article
                  draggable={reorderEnabled}
                  onDragStart={start(entry.id)}
                  onDragEnd={end}
                  onDragOver={over(entry.id, reorderEnabled)}
                  onDragLeave={leave(entry.id)}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggingId) onReorder(group.rows, draggingId, entry.id);
                    end();
                  }}
                  className={`group grid min-w-0 content-start text-left ${reorderEnabled ? "cursor-grab active:cursor-grabbing" : ""} ${draggingId === entry.id ? "opacity-40" : ""} ${dragOverId === entry.id && draggingId && draggingId !== entry.id ? "outline-2 outline-dashed outline-offset-2 outline-line-focus" : ""}`}
                >
                  <button type="button" onClick={() => onOpen(entry.id)} className="relative mb-2.5 block aspect-[4/5] w-full overflow-hidden bg-surface-muted text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
                    {shown?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={shown.imageUrl} alt={shown.productName} className="h-full w-full object-cover transition-opacity group-hover:opacity-90" draggable={false} />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center text-micro tracking-[0.18em] text-ink-tertiary">NO IMAGE</span>
                    )}
                    <span className="absolute right-2 top-2 rounded-action bg-surface/90 px-1.5 py-0.5 font-ui-mono text-micro font-bold tabular-nums text-ink">{entry.code}</span>
                  </button>
                  <button type="button" onClick={() => onOpen(entry.id)} className="grid min-w-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
                  <span className="mb-1 flex flex-wrap gap-1">{badges.map((badge) => <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>)}</span>
                  {shown ? (
                    <span className="font-ui-sans text-sm font-semibold uppercase leading-tight text-ink">{shown.productName}</span>
                  ) : (
                    <span className="text-sm italic text-ink-tertiary">Reserved, no product yet</span>
                  )}
                  <span className="mt-2 grid">
                    {details.map(([label, value]) => value ? (
                      <span key={label} className="flex items-start justify-between gap-3 border-t border-line py-1">
                        <span className="text-micro uppercase tracking-[0.06em] text-ink-tertiary">{label}</span>
                        <span className="max-w-[70%] text-right text-xs text-ink [overflow-wrap:anywhere]">{value}</span>
                      </span>
                    ) : null)}
                  </span>
                  </button>
                </article>
                </ContextActionMenu>
              );
            })}
            {canEdit && filter === "all" ? <QuickAddTile group={group} command={command} projectId={projectId} section={section} /> : null}
          </div>
        </section>
      ))}
      {canEdit && filter === "all" ? <NewCategoryInline command={command} projectId={projectId} section={section} categories={groups.map((group) => group.category)} categoryChoices={categoryChoices} /> : null}
    </div>
  );
}

export function ScheduleBoard({
  projectId,
  entries,
  brands,
  categoryChoices,
  canEdit,
  canManageTemplates,
  templatesHref,
}: {
  projectId: string;
  entries: readonly ScheduleEntryView[];
  brands: readonly Brand[];
  categoryChoices: readonly CategoryChoice[];
  canEdit: boolean;
  /** Studio settings permission: template settings link and "Save as template". */
  canManageTemplates: boolean;
  templatesHref: string;
}) {
  const router = useRouter();
  const command = useCommand();
  const { run, isPending, error } = command;
  const confirm = useConfirm();
  const [section, setSection] = useState<Section>(() => (entries.some((e) => e.section === "MATERIAL") || !entries.length ? "MATERIAL" : "FIXTURE"));
  const [viewMode, setViewMode] = useState<"list" | "board">("board");
  const [filter, setFilter] = useState<ScheduleFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [autoPhotoOptionId, setAutoPhotoOptionId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "add" | "import" | { move: ScheduleEntryView }>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const editorDirtyRef = useRef(false);
  const listDrag = useRowDrag();

  /** Every path that opens the entry panel goes through here, so a stale
   * auto-photo target from a previous image click never leaks into a plain
   * "open the item" click (owner, 2026-09-24: one modal, not two). */
  const openEntry = (id: string, photoOptionId: string | null = null) => {
    setOpenId(id);
    setAutoPhotoOptionId(photoOptionId);
  };

  const counts = useMemo(() => ({
    MATERIAL: entries.filter((e) => e.section === "MATERIAL").length,
    FIXTURE: entries.filter((e) => e.section === "FIXTURE").length,
  }), [entries]);

  const sectionEntries = useMemo(() => entries.filter((entry) => entry.section === section), [entries, section]);
  const progress = useMemo(() => scheduleFilterCounts(sectionEntries), [sectionEntries]);
  const visibleEntries = useMemo(() => sectionEntries.filter((entry) => entryMatchesFilter(entry, filter)), [sectionEntries, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, ScheduleEntryView[]>();
    for (const entry of visibleEntries) {
      map.set(entry.category, [...(map.get(entry.category) ?? []), entry]);
    }
    return [...map.entries()].map(([category, rows]) => ({ category, rows }));
  }, [visibleEntries]);

  const categoriesBySection = useMemo(() => ({
    MATERIAL: [...new Set(entries.filter((e) => e.section === "MATERIAL").map((e) => e.category))],
    FIXTURE: [...new Set(entries.filter((e) => e.section === "FIXTURE").map((e) => e.category))],
  }), [entries]);
  const categories = categoriesBySection[section];
  const open = entries.find((entry) => entry.id === openId) ?? null;
  const visibleOpenIndex = open ? visibleEntries.findIndex((entry) => entry.id === open.id) : -1;

  const askDiscard = async () => {
    if (!editorDirtyRef.current) return true;
    return confirm.confirm({
      title: "Discard changes?",
      description: "You have unsaved changes in this item.",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
      tone: "danger",
    });
  };
  const closeEditor = async () => {
    if (!(await askDiscard())) return;
    editorDirtyRef.current = false;
    setOpenId(null);
    setAutoPhotoOptionId(null);
  };
  const changeSection = async (next: Section) => {
    if (next === section || !(await askDiscard())) return;
    editorDirtyRef.current = false;
    setOpenId(null);
    setAutoPhotoOptionId(null);
    setFilter("all");
    setSection(next);
  };
  const navigateEntry = async (id: string) => {
    if (id === openId || !(await askDiscard())) return;
    editorDirtyRef.current = false;
    openEntry(id);
  };

  const removeEntry = async (entry: ScheduleEntryView) => {
    const ok = await confirm.confirm({
      title: `Delete ${entry.code}?`,
      description: `The item and all its options are removed. Other codes stay as they are; ${entry.code} is left empty.`,
      confirmLabel: "Delete item",
      tone: "danger",
    });
    if (!ok) return;
    if (await run(`${entry.id}-delete`, () => deleteScheduleEntryAction({ projectId, entryId: entry.id }))) setOpenId(null);
  };

  const applyTemplates = async () => {
    setNotice(null);
    const ok = await confirm.confirm({
      title: "Apply studio templates?",
      description: "Every active studio template item this project does not have yet is added, as a proposal (not final). Items already here are not changed.",
      confirmLabel: "Apply templates",
    });
    if (!ok) return;
    await run("templates", () => applyScheduleTemplatesAction({ projectId }), (data) => {
      const created = data && typeof data === "object" && "created" in data && typeof data.created === "number" ? data.created : 0;
      setNotice(created === 0 ? "Nothing to add: this project already has every studio template item." : `${created} template item${created === 1 ? "" : "s"} added.`);
    });
  };

  /** Reorder within one category group (one code prefix); drag targets never span groups. */
  const reorderGroup = (rows: ScheduleEntryView[], draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const ids = rows.map((row) => row.id);
    const from = ids.indexOf(draggedId);
    if (from === -1 || !ids.includes(targetId)) return;
    ids.splice(from, 1);
    // Recompute the target's index after removing the dragged item — its position
    // shifted left by one for a forward drag, so reusing the pre-removal index here
    // would insert one slot past the intended drop target.
    const to = ids.indexOf(targetId);
    if (to === -1) return;
    ids.splice(to, 0, draggedId);
    const prefix = rows[0]?.code.split("-")[0];
    if (!prefix) return;
    void run(`reorder-${prefix}`, () => reorderScheduleEntriesAction({ projectId, section, prefix, orderedIds: ids }));
  };

  return (
    <div className="grid">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle px-(--ui-section-px) py-2.5">
        {/* changeSection reads the draft ref only when this browser event fires; passing it through the shared tab contract keeps the existing discard guard intact. */}
        {/* eslint-disable-next-line react-hooks/refs */}
        <div className="flex min-w-0 flex-wrap items-center gap-2"><PillTabs label="Schedule section" items={(["MATERIAL", "FIXTURE"] as const).map((key) => ({ key, label: SECTION_LABEL[key], active: section === key, count: counts[key], onSelect: changeSection.bind(null, key) }))} /><PillTabs label="Schedule view" items={[{ key: "board", label: "Board", active: viewMode === "board", onSelect: () => setViewMode("board") }, { key: "list", label: "List", active: viewMode === "list", onSelect: () => setViewMode("list") }]} /></div>
        <div className="flex flex-wrap gap-2">
          <Link
            prefetch={false}
            target="_blank"
            href={STUDIOFLOW_ROUTES.projectSchedulePrint(projectId)}
            className="inline-flex min-h-(--ui-control-height-sm) items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-xs font-medium text-ink hover:border-line-strong"
          >
            <Printer aria-hidden="true" className="h-3.5 w-3.5" /> Print / PDF
          </Link>
          {canEdit || canManageTemplates ? <ButtonMenu label="Set up" variant="secondary" items={[
            ...(canEdit ? [
              { label: "Apply studio templates", onSelect: () => void applyTemplates() },
              { label: "Import CSV", onSelect: () => setDialog("import") },
            ] : []),
            ...(canManageTemplates ? [{ label: "Schedule templates", onSelect: () => router.push(templatesHref) }] : []),
          ]} /> : null}
          {canEdit ? (
          <Button size="sm" variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDialog("add")}>
            Add item
          </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 border-b border-line-subtle px-(--ui-section-px) py-3">
        <div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium text-ink">{progress.final} of {progress.all} final</span><span className="text-ink-tertiary">{progress.all ? Math.round((progress.final / progress.all) * 100) : 0}%</span></div>
        <ProgressBar value={progress.final} max={progress.all} label={`${progress.final} of ${progress.all} final`} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Schedule progress filter">
          <FilterChip selected={filter === "all"} count={progress.all} onClick={() => setFilter("all")}>All</FilterChip>
          <FilterChip selected={filter === "decision"} count={progress.decision} onClick={() => setFilter("decision")}>Needs a decision</FilterChip>
          <FilterChip selected={filter === "sample"} count={progress.sample} onClick={() => setFilter("sample")}>Sample waiting</FilterChip>
          <FilterChip selected={filter === "empty"} count={progress.empty} onClick={() => setFilter("empty")}>No product yet</FilterChip>
        </div>
      </div>

      {error && !open && !dialog ? <InlineError className="px-(--ui-section-px) pt-2">{error}</InlineError> : null}
      {notice ? <Text size="sm" tone="secondary" role="status" className="px-(--ui-section-px) pt-2">{notice}</Text> : null}

      {groups.length === 0 ? (
        <div className="grid">
          <EmptyState
            title={progress.all === 0 ? `No ${SECTION_LABEL[section].toLowerCase()} items yet` : "No items match this filter"}
            description={progress.all === 0 && canEdit ? "Start a category below, add an item, apply the studio templates, or import the Google Sheets schedule." : progress.all === 0 ? "This project has no schedule items in this section." : "Choose another progress filter to see more items."}
            className="py-10"
          />
          {progress.all === 0 && canEdit ? <NewCategoryInline command={command} projectId={projectId} section={section} categories={[]} categoryChoices={categoryChoices} className="mb-8 justify-self-center" /> : null}
        </div>
      ) : (
        <div className="grid">
          <div className="min-w-0">
            {viewMode === "board" ? (
              <BoardView
                projectId={projectId}
                groups={groups}
                command={command}
                onOpen={(id) => openEntry(id)}
                canEdit={canEdit}
                filter={filter}
                section={section}
                onReorder={reorderGroup}
                onDelete={(entry) => void removeEntry(entry)}
                categoryChoices={categoryChoices}
              />
            ) : (
              <div className="grid">
                <div className="hidden items-center gap-3 border-b border-line px-(--ui-section-px) py-1.5 text-micro uppercase tracking-[0.06em] text-ink-tertiary sm:flex" aria-hidden="true">
                  <span className="w-11 shrink-0" />
                  <span className="w-14 shrink-0">Code</span>
                  <span className="min-w-0 flex-1">Type</span>
                  <span className="w-28 shrink-0">Location</span>
                  <span className="w-20 shrink-0 text-right">Qty</span>
                  <span className="w-8 shrink-0" />
                </div>
                {groups.map((group) => (
                  <section key={group.category} className="border-b border-line-subtle last:border-b-0">
                    <div className="flex items-baseline gap-2 bg-surface-muted px-(--ui-section-px) py-1.5">
                      <h3 className="m-0 text-label text-ink-secondary">{group.category}</h3>
                      <Text size="sm" tone="tertiary">{group.rows.length}</Text>
                    </div>
                    <ul className="m-0 list-none divide-y divide-line-subtle p-0">
                      {group.rows.map((entry, index) => {
                        const shown = shownOptionOf(entry);
                        const busy = command.pendingKeys.some((key) => key.startsWith(entry.id));
                        return (
                          <li
                            key={entry.id}
                            draggable={canEdit && filter === "all"}
                            onDragStart={listDrag.start(entry.id)}
                            onDragEnd={listDrag.end}
                            onDragOver={listDrag.over(entry.id, canEdit && filter === "all")}
                            onDragLeave={listDrag.leave(entry.id)}
                            onDrop={(event) => {
                              event.preventDefault();
                              if (listDrag.draggingId) reorderGroup(group.rows, listDrag.draggingId, entry.id);
                              listDrag.end();
                            }}
                            className={`flex items-center gap-3 px-(--ui-section-px) py-2.5 ${canEdit && filter === "all" ? "cursor-grab active:cursor-grabbing" : ""} ${open?.id === entry.id ? "bg-surface-muted" : "hover:bg-surface-muted"} ${listDrag.draggingId === entry.id ? "opacity-40" : ""} ${listDrag.dragOverId === entry.id && listDrag.draggingId && listDrag.draggingId !== entry.id ? "outline-2 outline-dashed outline-offset-[-2px] outline-line-focus" : ""}`}
                          >
                            <button type="button" onClick={() => openEntry(entry.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                              <Thumb url={shown?.imageUrl ?? null} alt={shown ? shown.productName : `${entry.code} has no photo`} />
                              <span className="w-14 shrink-0 font-ui-mono text-sm font-semibold tabular-nums text-ink">{entry.code}</span>
                              <span className="grid min-w-0 flex-1 gap-0.5">
                                {shown ? (
                                  <>
                                    <span className="truncate text-sm font-medium text-ink">
                                      {shown.productName}
                                      {shown.brandName ? <span className="font-normal text-ink-secondary"> · ex. {shown.brandName}</span> : null}
                                    </span>
                                    {specLine(shown) ? <span className="truncate text-xs text-ink-tertiary">{specLine(shown)}</span> : null}
                                  </>
                                ) : (
                                  <span className="text-sm italic text-ink-tertiary">Reserved — no product yet</span>
                                )}
                              </span>
                              <span className="hidden w-28 shrink-0 truncate text-sm text-ink-secondary sm:block">{entry.location ?? ""}</span>
                              <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums text-ink-secondary sm:block">{entry.qty ? `${entry.qty} ${entry.unit ?? ""}` : ""}</span>
                              {entryBadges(entry).map((badge) => <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>)}
                            </button>
                            {canEdit || canManageTemplates ? (
                              <RowActionMenu
                                label={`Actions for ${entry.code}`}
                                pending={busy}
                                items={[
                                  { label: "Open", onSelect: () => openEntry(entry.id) },
                                  ...(canManageTemplates && templateSourceOf(entry)
                                    ? [{ label: "Save as template item", onSelect: () => void run(`${entry.id}-template`, () => saveScheduleEntryAsTemplateAction({ projectId, entryId: entry.id })) }]
                                    : []),
                                  ...(canEdit ? [
                                    { label: "Move up", icon: <ArrowUp className="h-3.5 w-3.5" />, disabled: filter !== "all" || index === 0, separatorBefore: true, onSelect: () => void run(`${entry.id}-move`, () => moveScheduleEntryAction({ projectId, entryId: entry.id, direction: "up" })) },
                                    { label: "Move down", icon: <ArrowDown className="h-3.5 w-3.5" />, disabled: filter !== "all" || index === group.rows.length - 1, onSelect: () => void run(`${entry.id}-move`, () => moveScheduleEntryAction({ projectId, entryId: entry.id, direction: "down" })) },
                                    { label: "Move to category…", onSelect: () => setDialog({ move: entry }) },
                                    { label: "Delete", danger: true, separatorBefore: true, onSelect: () => void removeEntry(entry) },
                                  ] : []),
                                ]}
                              />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {open ? (
        <EntryDrawer
          key={open.id}
          projectId={projectId}
          entry={open}
          brands={brands}
          canEdit={canEdit}
          command={command}
          confirm={confirm.confirm}
          canManageTemplates={canManageTemplates}
          categories={categories}
          previousId={visibleOpenIndex > 0 ? visibleEntries[visibleOpenIndex - 1]?.id ?? null : null}
          nextId={visibleOpenIndex >= 0 ? visibleEntries[visibleOpenIndex + 1]?.id ?? null : null}
          onNavigate={(id) => void navigateEntry(id)}
          onMove={() => setDialog({ move: open })}
          onDelete={() => void removeEntry(open)}
          onClose={() => void closeEditor()}
          onDirtyChange={(dirty) => { editorDirtyRef.current = dirty; }}
          initialPhotoOptionId={autoPhotoOptionId}
        />
      ) : null}

      {dialog === "add" ? (
        <AddItemDrawer projectId={projectId} section={section} categoriesBySection={categoriesBySection} categoryChoices={categoryChoices} brands={brands} command={command} confirm={confirm.confirm} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "import" ? <ImportDialog projectId={projectId} section={section} command={command} onClose={() => setDialog(null)} /> : null}
      {dialog && typeof dialog === "object" ? (
        <MoveDialog projectId={projectId} entry={dialog.move} categories={categories} command={command} onClose={() => setDialog(null)} />
      ) : null}
      {confirm.dialog}
    </div>
  );
}

// ── Product fields (manual snapshot) ─────────────────────────────────────────

type ProductDraft = {
  brandId: string;
  brandName: string;
  productName: string;
  color: string;
  finishing: string;
  dimension: string;
  pattern: string;
  notes: string;
  extra: ScheduleExtraField[];
};

const EMPTY_PRODUCT: ProductDraft = { brandId: "", brandName: "", productName: "", color: "", finishing: "", dimension: "", pattern: "", notes: "", extra: [] };

function productFromOption(option: ScheduleOptionView): ProductDraft {
  return {
    brandId: option.brandId ?? "",
    brandName: option.brandId ? "" : option.brandName ?? "",
    productName: option.productName,
    color: option.color ?? "",
    finishing: option.finishing ?? "",
    dimension: option.dimension ?? "",
    pattern: option.pattern ?? "",
    notes: option.notes ?? "",
    extra: option.extra.map((field) => ({ ...field })),
  };
}

function toSnapshot(draft: ProductDraft) {
  const text = (value: string) => value.trim() || null;
  return {
    brandId: draft.brandId || null,
    brandName: draft.brandId ? null : text(draft.brandName),
    productName: draft.productName.trim(),
    color: text(draft.color),
    finishing: text(draft.finishing),
    pattern: text(draft.pattern),
    dimension: text(draft.dimension),
    notes: text(draft.notes),
    extra: draft.extra.map((field) => ({ label: field.label.trim(), value: field.value.trim() })).filter((field) => field.label && field.value),
  };
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2">{children}</div>;
}

function VisibilityField({ label, visible, onToggle, disabled, children, always = false }: { label: string; visible: boolean; onToggle: () => void; disabled: boolean; children: ReactNode; always?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_2rem] items-end gap-2">
      <div className="grid gap-1"><Text size="sm" weight="semibold">{label}</Text>{children}</div>
      {always ? <span className="mb-1 grid h-8 place-items-center text-xs text-ink-tertiary">Always</span> : <IconButton size="sm" variant="ghost" label={visible ? `Hide ${label} from card` : `Show ${label} on card`} icon={visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />} disabled={disabled} onClick={onToggle} className="mb-0.5" />}
    </div>
  );
}

function AddItemDrawer({ projectId, section, categoriesBySection, categoryChoices, brands, command, confirm, onClose }: { projectId: string; section: Section; categoriesBySection: Record<Section, string[]>; categoryChoices: readonly CategoryChoice[]; brands: readonly Brand[]; command: Command; confirm: ReturnType<typeof useConfirm>["confirm"]; onClose: () => void }) {
  const [targetSection, setTargetSection] = useState<Section>(section);
  // Categories belong to a section: Material and Fixture number separately, so switching the section
  // switches the list and never carries a Material category into a Fixture row.
  const categories = categoriesBySection[targetSection];
  const [category, setCategory] = useState(categories[0] ?? "");
  const switchSection = (next: Section) => {
    if (next === targetSection) return;
    setTargetSection(next);
    setCategory(categoriesBySection[next][0] ?? "");
  };
  const [product, setProduct] = useState<ProductDraft>(EMPTY_PRODUCT);
  const [qty, setQty] = useState({ qty: "", unit: "", location: "" });
  const [cardFields, setCardFields] = useState<string[] | null>(null);
  const [preparedPhoto, setPreparedPhoto] = useState<File | null>(null);
  const isFixture = targetSection === "FIXTURE";
  const pending = command.isPending("add-item");
  const hasProduct = preparedPhoto !== null || Object.entries(product).some(([key, value]) => key === "extra" ? (value as ScheduleExtraField[]).length > 0 : String(value).trim().length > 0);
  const canSave = Boolean(category.trim()) && (!hasProduct || Boolean(product.productName.trim()));
  const extraKeys = product.extra.map((field) => extraFieldKey(field.label));
  const displayed = resolveCardFields(cardFields, extraKeys);
  const toggle = (key: string) => setCardFields(displayed.includes(key) ? displayed.filter((field) => field !== key) : [...displayed, key]);
  const setProductField = (key: keyof ProductDraft) => (event: { target: { value: string } }) => setProduct({ ...product, [key]: event.target.value });
  const brandOptions: CreatableSearchOption[] = [
    ...brands.map((brand) => ({ id: brand.id, label: brand.name })),
    ...(!product.brandId && product.brandName.trim() ? [{ id: product.brandName, label: product.brandName, description: "Typed — not in Master Data" }] : []),
  ];
  const isDirty = targetSection !== section || category !== (categoriesBySection[section][0] ?? "") || hasProduct || Object.values(qty).some(Boolean) || cardFields !== null || preparedPhoto !== null;

  const requestClose = async () => {
    if (isDirty) {
      const ok = await confirm({ title: "Discard changes?", description: "This new item has not been saved.", confirmLabel: "Discard changes", cancelLabel: "Keep editing", tone: "danger" });
      if (!ok) return;
    }
    onClose();
  };

  const save = async () => {
    let entryId: string | null = null;
    let optionId: string | null = null;
    const ok = await command.run("add-item", () => createScheduleEntryAction({
      projectId,
      section: targetSection,
      category: category.trim(),
      // Qty and unit only exist for Fixture: a Material line is specified, not counted.
      qty: isFixture ? qty.qty.trim() || null : null,
      unit: isFixture ? qty.unit.trim() || null : null,
      location: qty.location.trim() || null,
      snapshot: null,
    }), (data) => { if (data && typeof data === "object" && "entryId" in data && typeof data.entryId === "string") entryId = data.entryId; });
    if (!ok || !entryId) return;
    if (hasProduct) {
      const optionOk = await command.run("add-item-option", () => createScheduleOptionAction({ projectId, entryId: entryId!, snapshot: toSnapshot(product) }), (data) => { if (data && typeof data === "object" && "optionId" in data && typeof data.optionId === "string") optionId = data.optionId; });
      if (!optionOk) return;
    }
    if (cardFields !== null) {
      const fieldsOk = await command.run("add-item-fields", () => updateScheduleEntryCardFieldsAction({ projectId, entryId: entryId!, fields: cardFields }));
      if (!fieldsOk) return;
    }
    if (preparedPhoto && optionId) {
      const form = new FormData(); form.set("projectId", projectId); form.set("optionId", optionId); form.set("file", preparedPhoto);
      const photoOk = await command.run("add-item-photo", () => setScheduleOptionImageAction(form));
      if (!photoOk) return;
    }
    if (ok) onClose();
  };

  return (
    <Drawer
      open
      onOpenChange={(value) => { if (!value) void requestClose(); }}
      title="Add item"
      description="It gets a code from the category, like PT-03. A new category gets its own code letters."
      size="lg"
      dismissible={!pending}
      footer={<Footer><Button variant="ghost" onClick={() => void requestClose()} disabled={pending}>Discard</Button><Button variant="primary" pending={pending || command.isPending("add-item-option") || command.isPending("add-item-fields") || command.isPending("add-item-photo")} disabled={!canSave} onClick={save}>Save item</Button></Footer>}
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Section">
          <FilterChip selected={targetSection === "MATERIAL"} onClick={() => switchSection("MATERIAL")}>Material</FilterChip>
          <FilterChip selected={targetSection === "FIXTURE"} onClick={() => switchSection("FIXTURE")}>Fixture</FilterChip>
        </div>
        <div className="grid gap-3">
          <Field label="Category" required>
            <CreatableSearch
              key={targetSection}
              label="Category"
              groups={categoryGroups(categories, categoryChoices, targetSection, "In this project", false)}
              value={category}
              onValueChange={setCategory}
              onCreate={(name) => name.trim()}
              createLabel={(name) => `New category “${name}”`}
              placeholder="Pick or type a category, e.g. Paint"
              searchPlaceholder="Search categories…"
              emptyLabel="No category yet. Type a new one."
              className="w-full"
            />
          </Field>
        </div>
        <div className="grid gap-3 border-t border-line-subtle pt-4">
          <Text weight="semibold">Product and card fields</Text>
          <Text size="sm" tone="tertiary">The eye controls what appears on the card. Hidden fields stay editable.</Text>
          <div className="grid gap-3 sm:grid-cols-2">
            <VisibilityField label="Type" visible onToggle={() => {}} disabled={pending} always><Input value={product.productName} onChange={setProductField("productName")} maxLength={200} placeholder="Type, or leave every product field empty to reserve" /></VisibilityField>
            <VisibilityField label="Brand" visible={displayed.includes("brand")} onToggle={() => toggle("brand")} disabled={pending}><CreatableSearch label="Brand" options={brandOptions} value={product.brandId || product.brandName} onValueChange={(next) => setProduct(brands.some((brand) => brand.id === next) ? { ...product, brandId: next, brandName: "" } : { ...product, brandId: "", brandName: next })} onCreate={(text) => text} createLabel={(text) => `Use "${text}" (not in Master Data)`} placeholder="Pick or type a brand" searchPlaceholder="Search brands…" emptyLabel="No brands found" allowClear className="w-full" /></VisibilityField>
            <VisibilityField label="Color" visible={displayed.includes("color")} onToggle={() => toggle("color")} disabled={pending}><Input value={product.color} onChange={setProductField("color")} maxLength={160} /></VisibilityField>
            <VisibilityField label="Pattern" visible={displayed.includes("pattern")} onToggle={() => toggle("pattern")} disabled={pending}><Input value={product.pattern} onChange={setProductField("pattern")} maxLength={160} /></VisibilityField>
            <VisibilityField label="Finishing" visible={displayed.includes("finishing")} onToggle={() => toggle("finishing")} disabled={pending}><Input value={product.finishing} onChange={setProductField("finishing")} maxLength={160} /></VisibilityField>
            <VisibilityField label="Size" visible={displayed.includes("dimension")} onToggle={() => toggle("dimension")} disabled={pending}><Input value={product.dimension} onChange={setProductField("dimension")} maxLength={160} /></VisibilityField>
            <VisibilityField label="Location" visible={displayed.includes("location")} onToggle={() => toggle("location")} disabled={pending}><Input value={qty.location} onChange={(event) => setQty({ ...qty, location: event.target.value })} maxLength={160} /></VisibilityField>
            {isFixture ? <VisibilityField label="Qty" visible={displayed.includes("qty")} onToggle={() => toggle("qty")} disabled={pending}><div className="grid grid-cols-2 gap-2"><Input aria-label="Qty" inputMode="decimal" value={qty.qty} onChange={(event) => setQty({ ...qty, qty: event.target.value })} maxLength={20} /><Input aria-label="Unit" value={qty.unit} onChange={(event) => setQty({ ...qty, unit: event.target.value })} maxLength={40} placeholder="Unit" /></div></VisibilityField> : null}
          </div>
          <ExtraFieldsEditor value={product.extra} onChange={(extra) => setProduct({ ...product, extra })} />
          <div className="grid grid-cols-[minmax(0,1fr)_2rem] items-start gap-2"><Field label="Notes"><SimpleTextEditor value={product.notes} onChange={(event) => setProduct({ ...product, notes: event.target.value })} maxLength={2000} rows={3} /></Field><IconButton size="sm" variant="ghost" label={displayed.includes("notes") ? "Hide Notes from card" : "Show Notes on card"} icon={displayed.includes("notes") ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />} onClick={() => toggle("notes")} className="mt-6" /></div>
          {cardFields !== null ? <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => setCardFields(null)}>Use default</Button> : null}
          <div className="grid gap-2"><Text weight="semibold">Photo</Text><ImageWorkspace label="Schedule option photo" aspect={PHOTO_ASPECT} maxDimension={1600} outputType="image/jpeg" onPrepared={setPreparedPhoto} disabled={pending} />{preparedPhoto ? <Text size="sm" tone="secondary">Photo ready: {preparedPhoto.name}</Text> : null}</div>
        </div>
        {hasProduct && !product.productName.trim() ? <InlineError>Enter a Type, or clear the product fields to only reserve the code.</InlineError> : null}
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Drawer>
  );
}

// ── Entry drawer content ───────────────────────────────────────────────────────

/** A slim, borderless field that reads as text until it is hovered or focused: how the card is edited in place. */
const PLATE_INPUT = "h-7 w-full rounded-[6px] border border-transparent bg-transparent px-0 text-sm font-medium text-ink placeholder:font-normal placeholder:text-ink-tertiary hover:border-line-subtle focus:border-line-focus focus:bg-surface focus:px-1.5 focus:outline-none disabled:opacity-70";

function CardPlate({ label, children, action, className = "" }: { label: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 overflow-hidden rounded-control border border-line-subtle bg-surface px-2.5 pb-1 pt-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2"><span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">{label}</span>{action}</div>
      {children}
    </div>
  );
}


/**
 * One local-draft editor for item fields, option specs and card visibility.
 * Several options may be edited before the explicit Save; the eye controls
 * presentation only and never gates or clears the corresponding value.
 */
function EntryPanelContent({
  projectId,
  entry,
  brands,
  canEdit,
  command,
  confirm,
  onClose,
  onDirtyChange,
  initialPhotoOptionId,
}: {
  projectId: string;
  entry: ScheduleEntryView;
  brands: readonly Brand[];
  canEdit: boolean;
  command: Command;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** Set once, from the board card's photo click, to open the panel with
   * that option selected and its photo editor already active — this component owns
   * consuming it (a ref, not a prop echoed back) so a stale value can never
   * leak into a later, unrelated open of the same mounted panel. */
  initialPhotoOptionId?: string | null;
}) {
  const { run, isPending } = command;
  const [reuse, setReuse] = useState(false);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const [preparedNewPhoto, setPreparedNewPhoto] = useState<File | null>(null);
  const [sampleFor, setSampleFor] = useState<ScheduleOptionView | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const wanted = initialPhotoOptionId && entry.options.some((option) => option.id === initialPhotoOptionId) ? initialPhotoOptionId : null;
    return wanted ?? shownOptionOf(entry)?.id ?? null;
  });

  // Adjust-during-render, not useEffect: this fires once per fresh mount
  // (the panel fully unmounts on close, so the ref always starts at null),
  // and the ref guard keeps it from re-firing on every re-render.
  const normalizedInitialPhotoOptionId = initialPhotoOptionId ?? null;
  const autoPhotoAppliedRef = useRef<string | null>(null);
  if (autoPhotoAppliedRef.current !== normalizedInitialPhotoOptionId) {
    autoPhotoAppliedRef.current = normalizedInitialPhotoOptionId;
    if (normalizedInitialPhotoOptionId && entry.options.some((option) => option.id === normalizedInitialPhotoOptionId)) setPhotoFor(normalizedInitialPhotoOptionId);
  }

  const selected = selectedId === "new" ? null : entry.options.find((option) => option.id === selectedId) ?? shownOptionOf(entry);

  // Paste a photo like in Notes (owner, 2026-10-08): Ctrl+V anywhere outside a text field, or a drop on the photo box,
  // opens the photo editor with that image already in it.
  const [handedPhoto, setHandedPhoto] = useState<File | null>(null);
  const openPhoto = (optionId: string, file: File | null = null) => { setHandedPhoto(file); setPhotoFor(optionId); setReuse(false); setSampleFor(null); };
  const photoIntake = useFileIntake({
    accept: "image/*",
    disabled: !canEdit || !selected || photoFor !== null,
    pasteFromPage: true,
    onFiles: (files, refused) => { const file = files[0] ?? refused[0]; if (file && selected) openPhoto(selected.id, file); },
  });

  // Owner decision 2026-09-24: nothing auto-saves per field. `baseline` is what is persisted for the item-level
  // pieces; `optionBaseline` holds what was last saved per option (props catch up after the refresh);
  // `drafts` holds only the options the person has touched.
  const [baseline, setBaseline] = useState(() => ({ fields: { qty: entry.qty ?? "", unit: entry.unit ?? "", location: entry.location ?? "" }, cardFields: entry.cardFields }));
  const [fields, setFields] = useState(baseline.fields);
  const [cardFieldsDraft, setCardFieldsDraft] = useState<string[] | null>(baseline.cardFields);
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>({});
  const [optionBaseline, setOptionBaseline] = useState<Record<string, ProductDraft>>({});

  const baselineOfOption = (option: ScheduleOptionView | null): ProductDraft => (option ? optionBaseline[option.id] ?? productFromOption(option) : EMPTY_PRODUCT);
  const draftKey = selectedId === "new" ? "new" : selected?.id ?? "new";
  const draft = drafts[draftKey] ?? baselineOfOption(selected);
  const updateDraft = (patch: Partial<ProductDraft>) => setDrafts((current) => ({ ...current, [draftKey]: { ...(current[draftKey] ?? baselineOfOption(selected)), ...patch } }));
  const extraChoices = draft.extra.map((field) => ({ key: extraFieldKey(field.label), label: field.label }));
  const extraKeys = extraChoices.map((extra) => extra.key);

  const displayCardFields = resolveCardFields(cardFieldsDraft, extraKeys);
  const dirtyOptionKeys = Object.keys(drafts).filter((key) => {
    const option = entry.options.find((row) => row.id === key) ?? null;
    if (key !== "new" && !option) return false; // the option was deleted meanwhile
    return JSON.stringify(drafts[key]) !== JSON.stringify(baselineOfOption(option));
  });
  const fieldsChanged = fields.qty !== baseline.fields.qty || fields.unit !== baseline.fields.unit || fields.location !== baseline.fields.location;
  const cardFieldsChanged = JSON.stringify(resolveCardFields(cardFieldsDraft, extraKeys)) !== JSON.stringify(resolveCardFields(baseline.cardFields, extraKeys));
  const isDirty = dirtyOptionKeys.length > 0 || fieldsChanged || cardFieldsChanged || preparedNewPhoto !== null;
  // Tell the dialog wrapper whether it's safe to close without confirming —
  // a ref write in the parent, not a state update.
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
  // Every option needs a Type before it can be saved.
  const optionNeedsType = dirtyOptionKeys.some((key) => !drafts[key].productName.trim()) || Boolean(preparedNewPhoto && !drafts.new?.productName.trim());

  const entryFieldsKey = `${entry.id}-fields`;
  const optionFieldsKey = `${entry.id}-option-fields`;
  const cardFieldsKey = `${entry.id}-card-fields`;
  const newPhotoKey = `${entry.id}-new-option-photo`;
  const savePending = isPending(entryFieldsKey) || isPending(optionFieldsKey) || isPending(cardFieldsKey) || isPending(newPhotoKey);

  const saveAll = async () => {
    setSaveError(null);
    if (optionNeedsType) return;
    for (const key of dirtyOptionKeys) {
      const snapshot = toSnapshot(drafts[key]);
      let createdOptionId: string | null = null;
      const ok = await run(optionFieldsKey, () => key === "new"
        ? createScheduleOptionAction({ projectId, entryId: entry.id, snapshot })
        : updateScheduleOptionAction({ projectId, optionId: key, snapshot }), (data) => {
          if (key === "new" && data && typeof data === "object" && "optionId" in data && typeof data.optionId === "string") createdOptionId = data.optionId;
        });
      if (!ok) return;
      if (key === "new" && preparedNewPhoto && createdOptionId) {
        const form = new FormData(); form.set("projectId", projectId); form.set("optionId", createdOptionId); form.set("file", preparedNewPhoto);
        const photoOk = await run(newPhotoKey, () => setScheduleOptionImageAction(form));
        if (!photoOk) return;
        setPreparedNewPhoto(null);
      }
      setOptionBaseline((current) => ({ ...current, [key]: drafts[key] }));
      setDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
      // Show the option just added, not an empty "new option" form that reads as if it vanished.
      if (key === "new" && createdOptionId) setSelectedId(createdOptionId);
    }
    if (fieldsChanged) {
      const ok = await run(entryFieldsKey, () => updateScheduleEntryAction({
        projectId, entryId: entry.id,
        qty: fields.qty.trim() || null, unit: fields.unit.trim() || null, location: fields.location.trim() || null,
      }));
      if (!ok) return;
    }
    if (cardFieldsChanged) {
      const ok = await run(cardFieldsKey, () => updateScheduleEntryCardFieldsAction({ projectId, entryId: entry.id, fields: cardFieldsDraft === null ? null : [...cardFieldsDraft] }));
      if (!ok) return;
    }
    setBaseline({ fields, cardFields: cardFieldsDraft });
  };
  const discardDraft = () => {
    setFields(baseline.fields);
    setDrafts({});
    setPreparedNewPhoto(null);
    setCardFieldsDraft(baseline.cardFields);
    setSaveError(null);
  };

  const brandOptions = selected?.brandId && !brands.some((b) => b.id === selected.brandId)
    ? [{ id: selected.brandId, name: selected.brandName ?? "Brand" }, ...brands]
    : brands;
  // One combobox instead of a select-plus-fallback-input pair: search Master
  // Data, or type a name that is not in it — no Master Data write happens
  // either way (StudioFlow never writes Master Data; brand text with no
  // catalogued id is the documented, ordinary case, §11.3).
  const isKnownBrandId = (id: string) => brandOptions.some((b) => b.id === id);
  const brandSearchOptions: CreatableSearchOption[] = [
    ...brandOptions.map((b) => ({ id: b.id, label: b.name })),
    ...(!draft.brandId && draft.brandName.trim()
      ? [{ id: draft.brandName, label: draft.brandName, description: "Typed — not in Master Data" }]
      : []),
  ];
  const handleBrandChange = (next: string) => {
    updateDraft(isKnownBrandId(next) ? { brandId: next, brandName: "" } : { brandId: "", brandName: next });
  };

  // Unchecking everything is a real choice (photo, code and title only), not a
  // reset — `null` is the reset, and "Use default" is how it is reached.
  // Ticking is never blocked by the field being empty: ticking is how a field starts being filled in.
  const toggleCardField = (field: string) =>
    setCardFieldsDraft(displayCardFields.includes(field) ? displayCardFields.filter((key) => key !== field) : [...displayCardFields, field]);

  const removePhoto = async (option: ScheduleOptionView) => {
    const ok = await confirm({
      title: `Remove the photo of option ${option.label}?`,
      description: "The option keeps its product details.",
      confirmLabel: "Remove photo",
      tone: "danger",
    });
    if (ok) await run(`${entry.id}-opt-${option.id}`, () => removeScheduleOptionImageAction({ projectId, optionId: option.id }));
  };

  const cancelSample = async (option: ScheduleOptionView) => {
    const ok = await confirm({
      title: "Cancel this sample request?",
      description: `${option.sampleRequest?.requestedFrom || "Master Data"} will not be asked further. This cannot be undone.`,
      confirmLabel: "Cancel request",
      tone: "danger",
    });
    if (ok) await run(`${entry.id}-opt-${option.id}`, () => cancelScheduleSampleAction({ projectId, requestId: option.sampleRequest!.id }));
  };

  const removeOption = async (option: ScheduleOptionView) => {
    const ok = await confirm({
      title: `Delete option ${option.label}?`,
      description: option.isFinal ? "This is the final option. The item goes back to needing a decision; no other option becomes final by itself." : "The option is removed from this item.",
      confirmLabel: "Delete option",
      tone: "danger",
    });
    if (ok) await run(`${entry.id}-opt-${option.id}`, () => deleteScheduleOptionAction({ projectId, optionId: option.id }));
  };

  // ── What is on the card, and how full it is ──
  const disabled = !canEdit || savePending;
  const extraValue = (label: string) => draft.extra.find((field) => field.label === label)?.value ?? "";
  const setExtraValue = (label: string, value: string) => updateDraft({
    extra: draft.extra.some((field) => field.label === label)
      ? draft.extra.map((field) => (field.label === label ? { ...field, value } : field))
      : [...draft.extra, { label, value }],
  });
  const visibilityAction = (key: string, label: string) => {
    const on = displayCardFields.includes(key);
    return <IconButton size="sm" variant="ghost" label={on ? `Hide ${label} from card` : `Show ${label} on card`} icon={on ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />} aria-pressed={on} disabled={disabled} onClick={() => toggleCardField(key)} className="!h-6 !min-h-6 !w-6 !p-1" />;
  };
  const busyKey = selected ? `${entry.id}-opt-${selected.id}` : "";

  const optionActions = canEdit && selected ? (
    <div className="flex flex-wrap items-center gap-2 rounded-control bg-surface-muted px-3 py-2">
      <Text size="sm" tone="secondary" className="mr-auto">
        {`Option ${selected.label}`}
        {selected.sampleRequest?.status === "REQUESTED" ? ` · sample asked${selected.sampleRequest.requestedFrom ? ` from ${selected.sampleRequest.requestedFrom}` : ", supplier to be found"}` : selected.sampleRequest?.status === "RECEIVED" ? " · sample received" : ""}
      </Text>
      {selected.isFinal ? (
        <Badge tone="success"><Crown aria-hidden="true" className="h-3 w-3" />Final</Badge>
      ) : (
        <Button size="sm" variant="primary" pending={isPending(busyKey)} onClick={() => void run(busyKey, () => markScheduleFinalAction({ projectId, optionId: selected.id }))}>Set as final</Button>
      )}
      {selected.sampleRequest?.status === "REQUESTED" ? (
        <Button size="sm" variant="secondary" pending={isPending(busyKey)} onClick={() => void run(busyKey, () => receiveScheduleSampleAction({ projectId, requestId: selected.sampleRequest!.id }))}>Sample received</Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => { setSampleFor(selected); setPhotoFor(null); setReuse(false); }}>{selected.sampleRequest ? "Request sample again" : "Request sample"}</Button>
      )}
      <RowActionMenu
        label={`Option ${selected.label} actions`}
        pending={isPending(busyKey)}
        items={[
          { label: selected.imageUrl ? "Change photo" : "Add photo", onSelect: () => openPhoto(selected.id) },
          ...(selected.imageUrl ? [{ label: "Remove photo", onSelect: () => void removePhoto(selected) }] : []),
          ...(selected.isFinal ? [{ label: "Unset final", separatorBefore: true, onSelect: () => void run(busyKey, () => unmarkScheduleFinalAction({ projectId, optionId: selected.id })) }] : []),
          ...(selected.sampleRequest?.status === "REQUESTED" ? [{ label: "Cancel sample request", danger: true, separatorBefore: true, onSelect: () => void cancelSample(selected) }] : []),
          { label: "Delete option", danger: true, separatorBefore: true, onSelect: () => void removeOption(selected) },
        ]}
      />
    </div>
  ) : null;

  return (
    <div className="grid gap-4">
      {/* Options, then what can be done with the selected one: the decisions sit above the form, not below it. */}
      <div className="grid gap-2">
        <div className="flex flex-wrap items-stretch gap-2" role="group" aria-label="Spec options">
          {entry.options.map((option) => (
            <button key={option.id} type="button" aria-pressed={selectedId !== "new" && option.id === selected?.id} onClick={() => { setSelectedId(option.id); setReuse(false); setPhotoFor(null); setSampleFor(null); }} className={`flex min-w-28 max-w-44 items-center gap-2 rounded-control border px-2 py-1.5 text-left ${selectedId !== "new" && option.id === selected?.id ? "border-line-focus bg-surface-muted" : "border-line hover:border-line-strong"}`}>
              <Thumb url={option.imageUrl} alt="" className="h-9 w-7" />
              <span className="grid min-w-0"><span className="text-xs font-semibold">Option {option.label}{option.isFinal ? " · Final" : option.status === "NOT_USED" ? " · Not used" : ""}</span><span className="truncate text-xs text-ink-tertiary">{option.productName}</span></span>
            </button>
          ))}
          {canEdit ? <Button size="sm" variant="secondary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => { setSelectedId("new"); setDrafts((current) => ({ ...current, new: current.new ?? EMPTY_PRODUCT })); setReuse(false); setPhotoFor(null); setSampleFor(null); }}>Option {nextOptionLabel(entry.options.map((option) => option.label))}</Button> : null}
          {canEdit ? <Button size="sm" variant="ghost" leadingIcon={<History className="h-3.5 w-3.5" />} onClick={() => { setReuse(true); setPhotoFor(null); setSampleFor(null); }}>From past project</Button> : null}
        </div>
        {reuse ? <InlineReuse projectId={projectId} entry={entry} command={command} onClose={() => setReuse(false)} /> : null}
        {selectedId !== "new" ? optionActions : null}
        {sampleFor ? <InlineSampleRequest projectId={projectId} option={sampleFor} command={command} onClose={() => setSampleFor(null)} /> : null}
        {entry.options.length === 0 && selectedId !== "new" ? <Text size="sm" tone="tertiary">No product yet. Fill in the Type and fields below and Save, or copy one from a past project.</Text> : null}
      </div>

      {photoFor && entry.options.some((option) => option.id === photoFor) ? (
        <InlinePhotoEditor projectId={projectId} entryCode={entry.code} option={entry.options.find((option) => option.id === photoFor)!} command={command} initialFile={handedPhoto} onClose={() => { setPhotoFor(null); setHandedPhoto(null); }} />
      ) : (
        <div className="grid items-start gap-4 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
          {/* Photo of the selected option (4:5, as on the board). */}
          <div className="relative">
            {selectedId === "new" && canEdit ? (
              <div className="grid gap-1"><ImageWorkspace label="New option photo" aspect={PHOTO_ASPECT} maxDimension={1600} outputType="image/jpeg" onPrepared={setPreparedNewPhoto} disabled={savePending} pasteFromPage />{preparedNewPhoto ? <Text size="sm" tone="secondary">Photo ready: {preparedNewPhoto.name}</Text> : null}</div>
            ) : selected && canEdit ? (
              <button type="button" onClick={() => openPhoto(selected.id)} {...photoIntake.target} aria-label={selected.imageUrl ? `Change photo of option ${selected.label}` : `Add photo to option ${selected.label}`} title="Click to choose, or drop / paste a photo (Ctrl+V)" className={`relative block w-full rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus ${photoIntake.active ? "outline-2 outline-dashed outline-offset-2 outline-line-focus" : ""}`}>
                <Thumb url={selected.imageUrl} alt={selected.productName} className="aspect-[4/5] !h-auto w-full !rounded-control" />
                <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-surface/90 px-2 py-0.5 text-[11px] font-medium text-ink-secondary">{selected.imageUrl ? "Change photo" : "Add photo"}</span>
              </button>
            ) : (
              <Thumb url={selected?.imageUrl ?? null} alt={selected?.productName ?? "No photo"} className="aspect-[4/5] !h-auto w-full !rounded-control" />
            )}
            {selectedId !== "new" && selected && canEdit ? <Text as="p" size="sm" tone="tertiary" className="mt-1 text-center">Or paste a photo (Ctrl+V)</Text> : null}
          </div>

          <div className="grid min-w-0 gap-2.5">
            <input
              aria-label="Type"
              value={draft.productName}
              onChange={(event) => updateDraft({ productName: event.target.value })}
              disabled={disabled}
              maxLength={200}
              placeholder="Type, e.g. Nude Pro - ATS 1132 M"
              className="h-10 w-full rounded-[6px] border border-transparent bg-transparent px-0 text-lg font-semibold leading-tight tracking-tight text-ink placeholder:text-sm placeholder:font-normal placeholder:text-ink-tertiary hover:border-line-subtle focus:border-line-focus focus:bg-surface focus:px-1.5 focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <CardPlate label="Brand" action={visibilityAction("brand", "Brand")}>
                <CreatableSearch
                  label="Brand"
                  options={brandSearchOptions}
                  value={draft.brandId || draft.brandName}
                  onValueChange={handleBrandChange}
                  onCreate={(text) => text}
                  createLabel={(text) => `Use "${text}" (not in Master Data)`}
                  placeholder="Tap to add"
                  searchPlaceholder="Search brands…"
                  emptyLabel="No brands found"
                  allowClear
                  disabled={disabled}
                  className="w-full min-w-0 !h-7 !min-h-7 !border-transparent !bg-transparent !px-0 !text-sm !font-medium"
                />
              </CardPlate>
              {(["color", "pattern", "finishing"] as const).map((key) => (
                <CardPlate key={key} label={CARD_FIELD_LABEL[key]} action={visibilityAction(key, CARD_FIELD_LABEL[key])}>
                  <input aria-label={CARD_FIELD_LABEL[key]} value={draft[key]} onChange={(event) => updateDraft({ [key]: event.target.value })} disabled={disabled} maxLength={160} placeholder="Tap to add" className={PLATE_INPUT} />
                </CardPlate>
              ))}
              <CardPlate label="Size" action={visibilityAction("dimension", "Size")}>
                <input aria-label="Size" value={draft.dimension} onChange={(event) => updateDraft({ dimension: event.target.value })} disabled={disabled} maxLength={160} placeholder="e.g. 60 × 60 cm" className={PLATE_INPUT} />
              </CardPlate>
              <CardPlate label="Location" action={visibilityAction("location", "Location")}>
                <input aria-label="Location" value={fields.location} onChange={(event) => setFields({ ...fields, location: event.target.value })} disabled={disabled} maxLength={160} placeholder="Tap to add" className={PLATE_INPUT} />
              </CardPlate>
              {/* Qty only for Fixture — a Material line is specified, not counted (owner decision 2026-09-23). */}
              {entry.section === "FIXTURE" ? (
                <CardPlate label="Qty" action={visibilityAction("qty", "Qty")}>
                  <div className="grid grid-cols-[1fr_4rem] gap-1.5">
                    <input aria-label="Qty" inputMode="decimal" value={fields.qty} onChange={(event) => setFields({ ...fields, qty: event.target.value })} disabled={disabled} maxLength={20} placeholder="0" className={PLATE_INPUT} />
                    <input aria-label="Unit" placeholder="Unit" value={fields.unit} onChange={(event) => setFields({ ...fields, unit: event.target.value })} disabled={disabled} maxLength={40} className={PLATE_INPUT} />
                  </div>
                </CardPlate>
              ) : null}
              {extraChoices.map((extra) => (
                <CardPlate key={extra.key} label={extra.label} action={visibilityAction(extra.key, extra.label)}>
                  <input aria-label={extra.label} value={extraValue(extra.label)} onChange={(event) => setExtraValue(extra.label, event.target.value)} disabled={disabled} maxLength={400} placeholder="Tap to add" className={PLATE_INPUT} />
                </CardPlate>
              ))}
            </div>
            <ExtraFieldsEditor value={draft.extra} onChange={(extra) => updateDraft({ extra })} />
          </div>
        </div>
      )}

      <div className="grid gap-1">
        <div className="flex items-center justify-between"><Text size="sm" weight="semibold">Notes</Text>{visibilityAction("notes", "Notes")}</div>
        <SimpleTextEditor value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} disabled={disabled} maxLength={2000} rows={2} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Eye aria-hidden="true" className="h-3.5 w-3.5 text-ink-tertiary" />
        <Text size="sm" tone="tertiary">The eye shows a field on the board card and in print. Hidden fields stay editable.</Text>
        {canEdit && cardFieldsDraft !== null ? <Button type="button" size="sm" variant="ghost" disabled={savePending} onClick={() => setCardFieldsDraft(null)}>Use default</Button> : null}
      </div>

      {optionNeedsType ? <InlineError>Enter a Type before saving product details.</InlineError> : null}
      {saveError ? <InlineError>{saveError}</InlineError> : null}
      {command.error && !reuse && !photoFor && !sampleFor ? <InlineError>{command.error}</InlineError> : null}
      {canEdit ? (
        <FormActions className="sticky bottom-0 z-10 -mx-4 -mb-4 border-t border-line-subtle bg-surface px-4 py-3">
          <Button type="button" variant="ghost" disabled={!isDirty || savePending} onClick={discardDraft}>Discard</Button>
          <Button type="button" variant="primary" pending={savePending} disabled={!isDirty || optionNeedsType} onClick={() => void saveAll().catch((error) => setSaveError(error instanceof Error ? error.message : "Could not save."))}>
            Save
          </Button>
        </FormActions>
      ) : null}
    </div>
  );
}

// ── Entry drawer ───────────────────────────────────────────────────────────────

/**
 * The one item editor (WO-SF-SCHED-RELAYOUT-01): a right-side drawer so the board stays in view, with
 * previous/next across the current section and filter, and the item menu (move, save as template, delete).
 */
function EntryDrawer({
  projectId,
  entry,
  brands,
  canEdit,
  command,
  confirm,
  canManageTemplates,
  categories,
  previousId,
  nextId,
  onNavigate,
  onMove,
  onDelete,
  onClose,
  onDirtyChange,
  initialPhotoOptionId,
}: {
  projectId: string;
  entry: ScheduleEntryView;
  brands: readonly Brand[];
  canEdit: boolean;
  command: Command;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  canManageTemplates: boolean;
  categories: string[];
  previousId: string | null;
  nextId: string | null;
  onNavigate: (id: string) => void;
  onMove: () => void;
  onDelete: () => void;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  initialPhotoOptionId?: string | null;
}) {
  const state = finalOf(entry) ? "Final chosen" : entry.options.length ? "Needs a decision" : "No product yet";
  const source = templateSourceOf(entry);
  return (
    <Drawer
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title={<div className="flex min-w-0 items-center gap-2"><span className="truncate">{entry.code} · {entry.category}</span><IconButton size="sm" variant="ghost" label="Previous item" icon={<ArrowLeft aria-hidden="true" />} disabled={!previousId} onClick={() => { if (previousId) onNavigate(previousId); }} /><IconButton size="sm" variant="ghost" label="Next item" icon={<ArrowRight aria-hidden="true" />} disabled={!nextId} onClick={() => { if (nextId) onNavigate(nextId); }} /><RowActionMenu label={`Actions for ${entry.code}`} items={[
        { label: "Move to category…", disabled: categories.length < 2, onSelect: onMove },
        ...(canManageTemplates && source ? [{ label: "Save as template item", onSelect: () => { void command.run(`${entry.id}-template`, () => saveScheduleEntryAsTemplateAction({ projectId, entryId: entry.id })); } }] : []),
        { label: "Delete", danger: true, separatorBefore: true, onSelect: onDelete },
      ]} /></div>}
      description={`${SECTION_LABEL[entry.section]} · ${state}`}
      size="lg"
    >
      <EntryPanelContent
        projectId={projectId}
        entry={entry}
        brands={brands}
        canEdit={canEdit}
        command={command}
        confirm={confirm}
        onClose={onClose}
        onDirtyChange={onDirtyChange}
        initialPhotoOptionId={initialPhotoOptionId}
      />
    </Drawer>
  );
}

function InlineReuse({ projectId, entry, command, onClose }: { projectId: string; entry: ScheduleEntryView; command: Command; onClose: () => void }) {
  const [query, setQuery] = useState(entry.category);
  const [hits, setHits] = useState<ReuseHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const search = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const result = await searchReusableScheduleOptionsAction({ projectId, query: query.trim(), section: entry.section });
      if (result.ok) setHits(result.data as ReuseHit[]);
      else setSearchError(result.error.safeMessage);
    } catch {
      setSearchError("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  const use = async (hit: ReuseHit) => {
    const ok = await command.run(`${entry.id}-reuse-${hit.optionId}`, () => copyReusableScheduleOptionAction({ projectId, entryId: entry.id, sourceOptionId: hit.optionId }));
    if (ok) onClose();
  };

  return (
      <div className="grid gap-3 rounded-control border border-line-subtle bg-surface-muted p-3">
        <div className="flex items-start justify-between gap-2"><div><Text weight="semibold">From past project</Text><Text size="sm" tone="tertiary">Copy a product into {entry.code} as a new option.</Text></div><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void search(); }}>
          <Input aria-label="Search products" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Brand, product, SKU, color…" maxLength={120} />
          <Button type="submit" variant="secondary" leadingIcon={<Search className="h-3.5 w-3.5" />} pending={searching} disabled={query.trim().length < 2}>Search</Button>
        </form>
        {searchError ? <InlineError>{searchError}</InlineError> : null}
        {hits === null ? null : hits.length === 0 ? (
          <Text tone="tertiary" size="sm">No matching products in other projects.</Text>
        ) : (
          <ul className="m-0 grid max-h-[50vh] list-none gap-1 overflow-y-auto p-0">
            {hits.map((hit) => (
              <li key={hit.optionId} className="flex items-center gap-3 rounded-control border border-line px-3 py-2">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm font-medium">{hit.productName}{hit.brandName ? <span className="font-normal text-ink-secondary"> · ex. {hit.brandName}</span> : null}</span>
                  <span className="truncate text-xs text-ink-tertiary">{[specLine(hit), `${hit.sourceProjectName} · ${hit.category}`].filter(Boolean).join(" — ")}</span>
                </div>
                {hit.isFinal ? <Badge tone="success">Final there</Badge> : null}
                <Button size="sm" variant="primary" pending={command.isPending(`${entry.id}-reuse-${hit.optionId}`)} onClick={() => void use(hit)}>Use</Button>
              </li>
            ))}
          </ul>
        )}
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
  );
}

// ── Move / import ────────────────────────────────────────────────────────────

function MoveDialog({ projectId, entry, categories, command, onClose }: { projectId: string; entry: ScheduleEntryView; categories: string[]; command: Command; onClose: () => void }) {
  const [category, setCategory] = useState("");
  const key = `${entry.id}-recategorize`;
  const pending = command.isPending(key);
  const save = async () => {
    const ok = await command.run(key, () => moveScheduleEntryToCategoryAction({ projectId, entryId: entry.id, category: category.trim() }));
    if (ok) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title={`Move ${entry.code} to another category`}
      description="The item gets the next code in the target category. Its old code is left empty; other codes do not change."
      size="sm"
      dismissible={!pending}
      footer={<Footer><Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button><Button variant="primary" pending={pending} disabled={!category.trim() || category.trim() === entry.category} onClick={save}>Move</Button></Footer>}
    >
      <div className="grid gap-2">
        <Field label="Target category" required>
          <Input list="schedule-move-categories" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={80} autoFocus />
        </Field>
        <datalist id="schedule-move-categories">{categories.filter((c) => c !== entry.category).map((c) => <option key={c} value={c} />)}</datalist>
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Dialog>
  );
}

function ImportDialog({ projectId, section, command, onClose }: { projectId: string; section: Section; command: Command; onClose: () => void }) {
  const [target, setTarget] = useState<Section>(section);
  const [csv, setCsv] = useState("");
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const pending = command.isPending("import");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setCsv("");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    setFile({ name: file.name, base64: btoa(binary) });
  };

  const downloadTemplate = async (format: "xlsx" | "csv") => {
    await command.run("import-template", () => scheduleImportTemplateAction({ projectId, format }), (data) => {
      const { filename, mimeType, base64 } = data as { filename: string; mimeType: string; base64: string };
      const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], { type: mimeType }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    });
  };

  const submit = async () => {
    setResult(null);
    await command.run("import", () => importScheduleCsvAction({ projectId, section: target, ...(file ? { file } : { csv }) }), (data) => setResult(data as { created: number; updated: number }));
  };

  return (
    <Dialog
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title="Import schedule"
      description="Use an Excel (.xlsx) or CSV file: the Google Sheets export, or the plain template. Rows whose code already exists update that item's brand, type and notes (its photo, other specs and final choice stay). New codes are added under the same code."
      size="lg"
      dismissible={!pending}
      footer={<Footer><Button variant="ghost" onClick={onClose} disabled={pending}>{result ? "Close" : "Cancel"}</Button><Button variant="primary" pending={pending} disabled={!file && !csv.trim()} onClick={submit}>Import</Button></Footer>}
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sheet">
            <Select value={target} onChange={(e) => setTarget(e.target.value as Section)}>
              <option value="MATERIAL">Material (needs a Product Category column)</option>
              <option value="FIXTURE">Fixture</option>
            </Select>
          </Field>
          <Field label="Excel or CSV file" description={fileName ?? undefined}>
            <Input type="file" accept=".xlsx,.csv,text/csv" onChange={(e) => void pick(e.target.files?.[0])} />
          </Field>
        </div>
        <Field label="Or paste CSV">
          <Textarea rows={6} value={csv} onChange={(e) => { setCsv(e.target.value); setFileName(null); setFile(null); }} placeholder={"Code,Product Category,Ex,Type,Initials Type,Image,Location,Contact,Qty,Unit"} className="font-ui-mono text-xs" />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Text size="sm" tone="secondary">Need a blank sheet?</Text>
          <Button variant="ghost" size="sm" pending={command.isPending("import-template")} onClick={() => void downloadTemplate("xlsx")}>Excel template</Button>
          <Button variant="ghost" size="sm" pending={command.isPending("import-template")} onClick={() => void downloadTemplate("csv")}>CSV template</Button>
        </div>
        {result ? <Text size="sm">Imported: {result.created} new, {result.updated} updated.</Text> : null}
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Dialog>
  );
}
