"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, ChevronRight, ClipboardPaste, Copy, Eye, EyeOff, History, ImageIcon, LayoutGrid, Package, Palette, Plus, Printer, Search, SquareCheck, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";

import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";

import {
  SCHEDULE_CARD_FIELD_LABEL as CARD_FIELD_LABEL,
  SCHEDULE_EXTRA_LABEL_MAX,
  SCHEDULE_EXTRA_MAX,
  SCHEDULE_EXTRA_VALUE_MAX,
  SCHEDULE_HIGHLIGHTS,
  SCHEDULE_SECTION_LABEL as SECTION_LABEL,
  cardFieldLabel,
  cardFieldValuesOf,
  effectiveCardFields,
  extraFieldKey,
  extraChoicesOf,
  finalOf,
  isSpecPlaceholder,
  nextOptionLabel,
  resolveCardFields,
  shownOptionOf,
  similarScheduleCategories,
  specLine,
  templateSourceOf,
  type ScheduleEntryView,
  type ScheduleExtraField,
  type ScheduleHighlight,
  type ScheduleOptionView,
} from "@/apps/studioflow/domain/schedule";
import {
  Badge,
  Button,
  ButtonMenu,
  Checkbox,
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
  type RowActionItem,
  Select,
  SimpleTextEditor,
  SortToggle,
  canWriteClipboardImage,
  toSpreadsheetText,
  writeClipboardImage,
  writeClipboardText,
  TableFilters,
  Text,
  type SortDirection,
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
  deleteScheduleEntriesAction,
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
  setScheduleEntriesHiddenAction,
  setScheduleEntriesHighlightAction,
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
  section: Section;
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
  startInColor = false,
  onClose,
}: {
  projectId: string;
  entryCode: string;
  option: ScheduleOptionView;
  command: Command;
  /** A photo already pasted or dropped on the option's photo box; the file picker then stays shut. */
  initialFile: File | null;
  /** Opened from "Use a colour": start on the colour picker, no file dialog. */
  startInColor?: boolean;
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
          <Text size="sm" tone="tertiary">{startInColor ? "Pick the colour that stands for this option." : "Choose, drop or paste a photo, then crop it to the 4:5 catalog frame."}</Text>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={isPending(pendingKey)}>Cancel</Button>
      </div>
      <ImageWorkspace label="Schedule photo" aspect={PHOTO_ASPECT} maxDimension={1600} outputType="image/jpeg" allowColor startInColor={startInColor} onPrepared={onPrepared} disabled={isPending(pendingKey)} openOnMount={!initialFile && !startInColor} initialFile={initialFile} pasteFromPage />
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

type ListSortKey = "code" | "category" | "brand" | "type" | "initials" | "location" | "contact" | "qty" | "status";
type ListFilterKey = "category" | "brand" | "location" | "contact";
const LIST_FILTER_LABEL: Record<ListFilterKey, string> = { category: "Material type", brand: "Ex", location: "Location", contact: "Contact" };
const NO_LIST_FILTERS: Record<ListFilterKey, string> = { category: "ALL", brand: "ALL", location: "ALL", contact: "ALL" };
const BLANK = "__blank__";

/** The text a List column shows for one row: what it sorts and filters on. */
function listCellText(entry: ScheduleEntryView, key: ListSortKey | ListFilterKey): string {
  const shown = shownOptionOf(entry);
  switch (key) {
    case "code": return entry.code;
    case "category": return entry.category;
    case "brand": return shown?.brandName ?? "";
    case "type": return shown?.productName ?? "";
    case "initials": return shown ? initialsOf(shown) : "";
    case "location": return entry.location ?? "";
    case "contact": return shown?.contact ?? "";
    case "qty": return entry.qty ?? "";
    case "status": return entryBadges(entry)[0]?.label ?? "";
  }
}

/**
 * One item as a row of the studio's Google Sheet: CODE, MATERIAL TYPE, EX, TYPE, INITIALS TYPE, IMAGE, LOCATION,
 * CONTACT (Fixture adds QTY and UNIT). The IMAGE cell stays empty: the sheet cannot fetch a private photo, so the
 * photo is copied on its own and pasted into that cell.
 */
function sheetRowOf(entry: ScheduleEntryView): string[] {
  const shown = shownOptionOf(entry);
  const row = [entry.code, entry.category, shown?.brandName ?? "", shown?.productName ?? "", shown ? initialsOf(shown) : "", "", entry.location ?? "", shown?.contact ?? ""];
  return entry.section === "FIXTURE" ? [...row, entry.qty ?? "", entry.unit ?? ""] : row;
}

// ── Hide and highlight marks (WO-SF-SCHEDULE-MARKS-01) ───────────────────────
const HIGHLIGHT_LABEL: Record<ScheduleHighlight, string> = { yellow: "Yellow", green: "Green", blue: "Blue", red: "Red", purple: "Purple" };
type Visibility = "visible" | "all" | "hidden";
type HighlightFilter = "ALL" | "any" | ScheduleHighlight;

function Swatch({ highlight }: { highlight: ScheduleHighlight | null }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 shrink-0 rounded-full"
      style={highlight ? { background: `var(--ui-highlight-${highlight})` } : { boxShadow: "inset 0 0 0 1px var(--ui-border-strong)" }}
    />
  );
}

/** A List row's tint and colour edge. */
function rowHighlightStyle(highlight: ScheduleHighlight | null) {
  if (!highlight) return undefined;
  return { backgroundColor: `color-mix(in srgb, var(--ui-highlight-${highlight}) 14%, var(--ui-surface))`, boxShadow: `inset 3px 0 0 var(--ui-highlight-${highlight})` };
}

/** A Board card's colour frame, set off from the card by a thin gap. */
function cardHighlightStyle(highlight: ScheduleHighlight | null) {
  if (!highlight) return undefined;
  return { boxShadow: `0 0 0 3px var(--ui-surface), 0 0 0 6px var(--ui-highlight-${highlight})` };
}

/** The fields that make up the Initials type; a Board card shows them only as its title, when there is no Type yet. */
const INITIALS_FIELDS: ReadonlySet<string> = new Set(["color", "pattern", "finishing"]);

/** A real Type, not the empty / "-" / "TBA" placeholder or the sheet import's "Imported". */
function hasTypeOf(option: ScheduleOptionView): boolean {
  return !isSpecPlaceholder(option.productName) && option.productName !== "Imported";
}

/** The sheet's "Initials type": the rough description (colour, pattern, finishing) used before the exact product is known. */
function initialsOf(option: ScheduleOptionView): string {
  return [option.color, option.pattern, option.finishing].filter(Boolean).join(" · ");
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

/**
 * `quiet` marks a settled state. The list shows every badge; a board card leaves the quiet ones out (Final becomes a
 * check beside the code) so the badges left on the board are only the ones that still need someone (owner 2026-10-22).
 */
type EntryBadge = { label: string; tone: "success" | "neutral" | "warning"; quiet?: boolean };

/** Free-text search over what the board shows: code, category, location and the shown option's type and brand. */
function entryMatchesQuery(entry: ScheduleEntryView, needle: string) {
  const shown = shownOptionOf(entry);
  return [entry.code, entry.category, entry.location, shown?.productName, shown?.brandName]
    .some((value) => value?.toLowerCase().includes(needle));
}

function entryBadges(entry: ScheduleEntryView): EntryBadge[] {
  const final = finalOf(entry);
  const shown = shownOptionOf(entry);
  const badges: EntryBadge[] = [];
  if (entry.hidden) badges.push({ label: "Hidden", tone: "neutral" });
  if (final) badges.push({ label: "Final", tone: "success", quiet: true });
  else if (entry.options.length > 1) badges.push({ label: `${entry.options.length} options`, tone: "neutral" });
  else if (entry.options.length === 1) badges.push({ label: "Not final", tone: "neutral", quiet: true });
  if (shown?.sampleRequest?.status === "REQUESTED") badges.push({ label: "Sample waiting", tone: "warning" });
  else if (shown?.sampleRequest?.status === "RECEIVED") badges.push({ label: "Sample received", tone: "success", quiet: true });
  else if (shown?.sampleRequest?.status === "DECLINED") badges.push({ label: "Sample declined", tone: "warning" });
  return badges.slice(0, 2);
}

function QuickAddTile({ group, command, projectId, section }: { group: { category: string; rows: ScheduleEntryView[] }; command: Command; projectId: string; section: Section }) {
  const [productName, setProductName] = useState("");
  const prefix = group.rows[0]?.code.split("-")[0] ?? "";
  // The number comes from the server: a group never hands out a number twice, even after its last entry was deleted.
  const nextCode = `${prefix}-${String(group.rows[0]?.nextNumber ?? 1).padStart(2, "0")}`;
  const key = `quick-add-${section}-${group.category}`;
  const submit = async () => {
    const value = productName.trim();
    const ok = await command.run(key, () => createScheduleEntryAction({ projectId, section, category: group.category, qty: null, unit: null, location: null, snapshot: value ? { productName: value } : null }));
    if (ok) setProductName("");
  };
  return (
    <form className="grid gap-1.5 rounded-control border border-dashed border-line p-2" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Input aria-label={`Quick add to ${group.category}`} value={productName} onChange={(event) => setProductName(event.target.value)} maxLength={200} placeholder="Name, or leave empty" density="compact" />
      <Button type="submit" size="sm" variant="ghost" leadingIcon={<Plus className="h-3.5 w-3.5" />} pending={command.isPending(key)}>{`Add ${nextCode}`}</Button>
    </form>
  );
}

/** Same comparison as the server's category key: trimmed, single-spaced, case-insensitive. */
const categoryKeyOf = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleUpperCase("id-ID");

/**
 * Category picker options: the project's own categories first, then the studio's (template categories,
 * then the prefix dictionary) that the project does not use yet. Typing a name nobody knows creates it.
 */
function categoryGroups(projectCategories: readonly string[], studio: readonly CategoryChoice[], section: Section, projectLabel: string, disableProject: boolean, typed = ""): CreatableSearchGroup[] {
  const inProject = new Set(projectCategories.map(categoryKeyOf));
  const fromStudio = studio.filter((choice) => choice.section === section && !inProject.has(categoryKeyOf(choice.category)));
  // WO-SF-CATEGORY-SIMILAR-01: a typed name that looks like a studio category (HPL, Homogeneus Tile) offers it first,
  // so its codes take the studio prefix; the typed name can still be created.
  const similar = typed.trim().length >= 2 ? similarScheduleCategories(typed, fromStudio) : [];
  return [
    { label: "Mungkin maksud Anda", options: similar.map((choice) => ({ id: `similar:${choice.category}`, label: choice.category, keywords: [typed], badge: choice.prefix ? <span className="font-ui-mono text-xs text-ink-tertiary">{choice.prefix}</span> : undefined })) },
    { label: projectLabel, options: projectCategories.map((name) => ({ id: name, label: name, disabled: disableProject })) },
    { label: "Studio categories", options: fromStudio.map((choice) => ({ id: choice.category, label: choice.category, badge: choice.prefix ? <span className="font-ui-mono text-xs text-ink-tertiary">{choice.prefix}</span> : undefined })) },
  ].filter((group) => group.options.length > 0);
}

/** "New category": pick a studio category or type a new one; it reserves that category's first code at once. */
function NewCategoryInline({ command, projectId, section, categories, categoryChoices, className = "justify-self-start" }: { command: Command; projectId: string; section: Section; categories: readonly string[]; categoryChoices: readonly CategoryChoice[]; className?: string }) {
  const [hint, setHint] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [typed, setTyped] = useState("");
  const key = `new-category-${section}`;
  const pick = async (picked: string) => {
    const value = picked.replace(/^similar:/, "").trim();
    if (!value) return;
    const existing = categories.find((category) => categoryKeyOf(category) === categoryKeyOf(value));
    if (existing) { setHint(`${existing} is already in this project. Add to it with its own add tile.`); return; }
    setHint(null);
    const ok = await command.run(key, () => createScheduleEntryAction({ projectId, section, category: value, qty: null, unit: null, location: null, snapshot: null }));
    if (ok) { setRound((current) => current + 1); setTyped(""); }
  };
  return (
    <div className={`grid gap-1 ${className}`}>
      <CreatableSearch
        key={round}
        label="New category"
        groups={categoryGroups(categories, categoryChoices, section, "Already in this project", true, typed)}
        value=""
        onValueChange={(name) => void pick(name)}
        onQueryChange={setTyped}
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

/** Card fields whose value names itself, so the board joins them into one line without labels. */
const SPEC_LINE_FIELDS: ReadonlySet<string> = new Set(["color", "pattern", "finishing", "dimension", "qty"]);

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
  menuItems,
  categoryChoices,
  openId,
  selecting,
  selectedIds,
  onToggle,
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
  /** Copy, hide and highlight for one card; shared with the List row menu. */
  menuItems: (entry: ScheduleEntryView) => RowActionItem[];
  categoryChoices: readonly CategoryChoice[];
  openId: string | null;
  selecting: boolean;
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const { draggingId, dragOverId, start, end, over, leave } = useRowDrag();
  const reorderEnabled = canEdit && filter === "all" && !selecting;
  const pick = (id: string) => (selecting ? onToggle(id) : onOpen(id));
  return (
    <div className="@container grid gap-8 p-(--ui-section-px)">
      {groups.map((group) => (
        <section key={group.category} className="grid gap-3" aria-label={group.category}>
          <GroupHeader title={<span className="inline-flex items-baseline gap-2"><span>{group.category}</span><span className="font-ui-mono font-normal text-ink-tertiary">{group.rows[0]?.code.split("-")[0]}</span></span>} count={group.rows.length} />
          <div className="grid min-w-0 grid-cols-2 items-start gap-x-3 gap-y-5 @xl:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]">
            {group.rows.map((entry) => {
              const shown = shownOptionOf(entry);
              const extras = extraChoicesOf(entry);
              const fieldValue = cardFieldValuesOf(entry);
              const fields = effectiveCardFields(entry);
              const brand = fields.includes("brand") ? fieldValue.brand : null;
              // Self-describing specs read as one line ("Pink · Texture Paint · Matte"); only fields that need a name keep one.
              // The Board is a viewer, not the print (owner, 2026-10-23): the title is the Type, or the Initials type
              // while there is no Type yet, never both; below it only the active card fields, minus the initials.
              const title = shown ? (hasTypeOf(shown) ? shown.productName : initialsOf(shown) || shown.productName) : null;
              const spec = fields.filter((key) => SPEC_LINE_FIELDS.has(key) && !INITIALS_FIELDS.has(key)).map((key) => fieldValue[key]).filter(Boolean).join(" · ");
              const details = fields.filter((key) => key !== "brand" && !SPEC_LINE_FIELDS.has(key))
                .map((key) => [cardFieldLabel(key, extras), fieldValue[key]] as [string, string | null | undefined])
                .filter(([, value]) => !!value);
              const allBadges = entryBadges(entry);
              const isFinal = allBadges.some((badge) => badge.label === "Final");
              const badges = allBadges.filter((badge) => !badge.quiet);
              return (
                <ContextActionMenu
                  key={entry.id}
                  items={!selecting ? [
                    { label: "Open", onSelect: () => onOpen(entry.id) },
                    ...menuItems(entry),
                    ...(canEdit ? [{ label: "Delete", danger: true, separatorBefore: true, onSelect: () => onDelete(entry) }] : []),
                  ] : []}
                >
                <article
                  id={`schedule-entry-${entry.id}`}
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
                  style={cardHighlightStyle(entry.highlight)}
                  className={`group relative grid min-w-0 content-start text-left ${entry.hidden ? "opacity-55" : ""} ${reorderEnabled ? "cursor-grab active:cursor-grabbing" : ""} ${draggingId === entry.id ? "opacity-40" : ""} ${openId === entry.id || selectedIds.has(entry.id) ? "outline-2 outline-offset-2 outline-line-focus" : ""} ${dragOverId === entry.id && draggingId && draggingId !== entry.id ? "outline-2 outline-dashed outline-offset-2 outline-line-focus" : ""}`}
                >
                  <button type="button" aria-pressed={selecting ? selectedIds.has(entry.id) : undefined} onClick={() => pick(entry.id)} className="relative mb-2 block aspect-[4/5] w-full overflow-hidden bg-surface-muted text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
                    {shown?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={shown.imageUrl} alt={shown.productName} className="h-full w-full object-cover transition-opacity group-hover:opacity-90" draggable={false} />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center text-micro tracking-[0.18em] text-ink-tertiary">NO IMAGE</span>
                    )}
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-action bg-surface/90 px-1.5 py-0.5 font-ui-mono text-micro font-bold tabular-nums text-ink">
                      {isFinal ? <><Check aria-hidden="true" className="h-3 w-3 text-success" strokeWidth={3} /><span className="sr-only">Final, </span></> : null}
                      {entry.code}
                    </span>
                  </button>
                  {selecting ? (
                    <span className="absolute left-2 top-2 rounded-[4px] bg-surface p-0.5">
                      <Checkbox checked={selectedIds.has(entry.id)} onCheckedChange={() => onToggle(entry.id)} label={<span className="sr-only">Select {entry.code}</span>} />
                    </span>
                  ) : null}
                  <button type="button" onClick={() => pick(entry.id)} className="grid min-w-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
                  {badges.length ? <span className="mb-1 flex flex-wrap gap-1">{badges.map((badge) => <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>)}</span> : null}
                  {brand ? <span className="truncate text-micro uppercase tracking-[0.08em] text-ink-tertiary">{brand}</span> : null}
                  {title ? (
                    <span className="line-clamp-2 font-ui-sans text-xs font-semibold uppercase leading-snug text-ink" title={title}>{title}</span>
                  ) : (
                    <span className="text-xs italic text-ink-tertiary">Reserved, no product yet</span>
                  )}
                  {spec ? <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-ink-secondary" title={spec}>{spec}</span> : null}
                  {details.length ? (
                    <span className="mt-1.5 grid gap-1 border-t border-line pt-1.5">
                      {/* Run-in label: the value wraps under it at full card width instead of losing a label column. */}
                      {details.map(([label, value]) => (
                        <span key={label} className="line-clamp-2 text-xs leading-snug text-ink [overflow-wrap:anywhere]" title={`${label}: ${value}`}>
                          <span className="mr-1.5 text-micro uppercase tracking-[0.06em] text-ink-tertiary">{label}</span>{value}
                        </span>
                      ))}
                    </span>
                  ) : null}
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
  initialOpenId = null,
  projectId,
  entries,
  brands,
  categoryChoices,
  canEdit,
  canManageTemplates,
  templatesHref,
}: {
  initialOpenId?: string | null;
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
  const { run, error } = command;
  const confirm = useConfirm();
  const [section, setSection] = useState<Section>(() => entries.find((entry) => entry.id === initialOpenId)?.section ?? (entries.some((e) => e.section === "MATERIAL") || !entries.length ? "MATERIAL" : "FIXTURE"));
  const [viewMode, setViewMode] = useState<"list" | "board">("list"); // List is the default view (owner, 2026-10-23)
  const [filter, setFilter] = useState<ScheduleFilter>("all");
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const scrolledInitial = useRef(false);
  useEffect(() => {
    if (scrolledInitial.current || !initialOpenId) return;
    scrolledInitial.current = true;
    document.getElementById(`schedule-entry-${initialOpenId}`)?.scrollIntoView({ block: "nearest" });
  }, [initialOpenId]);
  const [autoPhotoOptionId, setAutoPhotoOptionId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "add" | "import" | { move: ScheduleEntryView }>(null);
  const [printAsk, setPrintAsk] = useState(false);
  const openPrint = (includeHidden: boolean) => {
    setPrintAsk(false);
    window.open(`${STUDIOFLOW_ROUTES.projectSchedulePrint(projectId)}${includeHidden ? "?hidden=include" : ""}`, "_blank", "noopener");
  };
  const [notice, setNotice] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const editorDirtyRef = useRef(false);
  const listDrag = useRowDrag();

  /** Every path that opens the entry panel goes through here, so a stale
   * auto-photo target from a previous image click never leaks into a plain
   * "open the item" click (owner, 2026-09-24: one modal, not two). */
  const openEntry = (id: string, photoOptionId: string | null = null) => {
    setOpenId(id);
    setAutoPhotoOptionId(photoOptionId);
  };

  // Hidden items leave every count and the progress (owner, 2026-10-23); they are still loaded, so they can be shown.
  const counts = useMemo(() => ({
    MATERIAL: entries.filter((e) => e.section === "MATERIAL" && !e.hidden).length,
    FIXTURE: entries.filter((e) => e.section === "FIXTURE" && !e.hidden).length,
  }), [entries]);

  const sectionEntries = useMemo(() => entries.filter((entry) => entry.section === section), [entries, section]);
  const progress = useMemo(() => scheduleFilterCounts(sectionEntries.filter((entry) => !entry.hidden)), [sectionEntries]);
  const hiddenCount = sectionEntries.filter((entry) => entry.hidden).length;
  const highlightedCount = sectionEntries.filter((entry) => entry.highlight).length;
  const [visibility, setVisibility] = useState<Visibility>("visible");
  const [highlightFilter, setHighlightFilter] = useState<HighlightFilter>("ALL");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visibleEntries = useMemo(() => sectionEntries.filter((entry) =>
    (visibility === "all" || entry.hidden === (visibility === "hidden"))
    && (highlightFilter === "ALL" || (highlightFilter === "any" ? entry.highlight !== null : entry.highlight === highlightFilter))
    && entryMatchesFilter(entry, filter) && (!needle || entryMatchesQuery(entry, needle))), [sectionEntries, visibility, highlightFilter, filter, needle]);

  const groups = useMemo(() => {
    const map = new Map<string, ScheduleEntryView[]>();
    for (const entry of visibleEntries) {
      map.set(entry.category, [...(map.get(entry.category) ?? []), entry]);
    }
    return [...map.entries()].map(([category, rows]) => ({ category, rows }));
  }, [visibleEntries]);

  // List-only sort and per-column filters (owner, 2026-10-23). The studio's manual order stays the default;
  // reordering is offered only while neither is in use, because a moved row would jump away from where it was dropped.
  const [listSort, setListSort] = useState<{ key: ListSortKey; direction: SortDirection } | null>(null);
  const [listFilters, setListFilters] = useState<Record<ListFilterKey, string>>(NO_LIST_FILTERS);
  // Collapsed category groups of the List; a group holding the open item always shows it.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const toggleGroup = (category: string) => setCollapsedGroups((current) => {
    const next = new Set(current);
    if (!next.delete(category)) next.add(category);
    return next;
  });
  // Copy for the studio's Google Sheet, which is still kept by hand alongside the app (owner, 2026-10-23).
  const copyRows = async (rows: readonly ScheduleEntryView[]) => {
    try {
      await writeClipboardText(toSpreadsheetText(rows.map(sheetRowOf)));
      setNotice(rows.length === 1
        ? `${rows[0].code} copied. Paste it into the sheet; paste the photo into IMAGE with Copy image.`
        : `${rows.length} rows copied. Paste them into the sheet; photos are copied one at a time with Copy image.`);
    } catch {
      setNotice("Could not copy. Allow clipboard access for this site and try again.");
    }
  };
  const copyImage = async (entry: ScheduleEntryView) => {
    const url = shownOptionOf(entry)?.imageUrl;
    if (!url) return;
    try {
      await writeClipboardImage(url);
      setNotice(`Photo of ${entry.code} copied. Click its IMAGE cell in the sheet and paste.`);
    } catch (copyError) {
      setNotice(copyError instanceof Error ? copyError.message : "Could not copy the photo.");
    }
  };
  const setHidden = async (rows: readonly ScheduleEntryView[], hidden: boolean) => {
    const entryIds = rows.map((row) => row.id);
    const ok = await run("mark-hidden", () => setScheduleEntriesHiddenAction({ projectId, entryIds, hidden }));
    if (!ok) return;
    const what = rows.length === 1 ? rows[0].code : `${rows.length} items`;
    setNotice(hidden ? `${what} hidden. Choose "Show hidden" to see ${rows.length === 1 ? "it" : "them"} again.` : `${what} shown again.`);
  };
  const setHighlight = (rows: readonly ScheduleEntryView[], highlight: ScheduleHighlight | null) =>
    void run("mark-highlight", () => setScheduleEntriesHighlightAction({ projectId, entryIds: rows.map((row) => row.id), highlight }));
  /** Hide / Unhide and Highlight for one or several items; empty for a viewer who cannot edit. */
  const markItems = (rows: readonly ScheduleEntryView[]): RowActionItem[] => {
    if (!canEdit || rows.length === 0) return [];
    const allHidden = rows.every((row) => row.hidden);
    return [
      { label: allHidden ? "Unhide" : "Hide", icon: allHidden ? <Eye /> : <EyeOff />, separatorBefore: true, onSelect: () => void setHidden(rows, !allHidden) },
      {
        label: "Highlight",
        icon: <Palette />,
        items: [
          ...SCHEDULE_HIGHLIGHTS.map((highlight) => ({ label: HIGHLIGHT_LABEL[highlight], icon: <Swatch highlight={highlight} />, onSelect: () => setHighlight(rows, highlight) })),
          { label: "No colour", icon: <Swatch highlight={null} />, separatorBefore: true, onSelect: () => setHighlight(rows, null) },
        ],
      },
    ];
  };
  const copyItems = (entry: ScheduleEntryView): RowActionItem[] => [
    { label: "Copy row", icon: <Copy className="h-3.5 w-3.5" />, separatorBefore: true, onSelect: () => void copyRows([entry]) },
    ...(shownOptionOf(entry)?.imageUrl && canWriteClipboardImage() ? [{ label: "Copy image", icon: <ImageIcon className="h-3.5 w-3.5" />, onSelect: () => void copyImage(entry) }] : []),
  ];
  const listFiltered = Object.values(listFilters).some((value) => value !== "ALL");
  const listManual = filter === "all" && listSort === null && !listFiltered && highlightFilter === "ALL" && visibility !== "hidden";
  const listGroups = useMemo(() => {
    const keep = (entry: ScheduleEntryView) => (Object.keys(listFilters) as ListFilterKey[]).every((key) => {
      const wanted = listFilters[key];
      return wanted === "ALL" || (listCellText(entry, key) || BLANK) === wanted;
    });
    const filtered = groups.map((group) => ({ ...group, rows: group.rows.filter(keep) })).filter((group) => group.rows.length > 0);
    if (!listSort) return filtered;
    const sign = listSort.direction === "asc" ? 1 : -1;
    const compare = (a: string, b: string) => {
      if (!a !== !b) return a ? -1 : 1; // blanks always last
      return sign * a.localeCompare(b, "id-ID", { numeric: true, sensitivity: "base" });
    };
    if (listSort.key === "category") return [...filtered].sort((a, b) => compare(a.category, b.category));
    return filtered.map((group) => ({ ...group, rows: [...group.rows].sort((a, b) => compare(listCellText(a, listSort.key), listCellText(b, listSort.key))) }));
  }, [groups, listFilters, listSort]);
  const listFilterOptions = (key: ListFilterKey) => {
    const values = [...new Set(sectionEntries.map((entry) => listCellText(entry, key) || BLANK))]
      .sort((a, b) => (a === BLANK ? 1 : b === BLANK ? -1 : a.localeCompare(b, "id-ID", { numeric: true })));
    return [{ id: "ALL", label: "All" }, ...values.map((value) => ({ id: value, label: value === BLANK ? "(blank)" : value }))];
  };
  const sortHead = (key: ListSortKey, label: string) => (
    <SortToggle
      direction={listSort?.key === key ? listSort.direction : null}
      onChange={(direction) => setListSort({ key, direction })}
      label={(direction) => `Sort by ${label}, ${direction === "asc" ? "A to Z" : "Z to A"}`}
    >
      {label}
    </SortToggle>
  );

  const categoriesBySection = useMemo(() => ({
    MATERIAL: [...new Set(entries.filter((e) => e.section === "MATERIAL").map((e) => e.category))],
    FIXTURE: [...new Set(entries.filter((e) => e.section === "FIXTURE").map((e) => e.category))],
  }), [entries]);
  const categories = categoriesBySection[section];
  const open = entries.find((entry) => entry.id === openId) ?? null;
  const visibleIds = useMemo(() => new Set(visibleEntries.map((entry) => entry.id)), [visibleEntries]);
  // Only rows still in view count: switching filter or section never deletes something the user cannot see.
  const pickedIds = useMemo(() => [...selectedIds].filter((id) => visibleIds.has(id)), [selectedIds, visibleIds]);
  const toggleSelected = (id: string) => setSelectedIds((current) => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; });
  const stopSelecting = () => { setSelecting(false); setSelectedIds(new Set()); };
  const allPicked = visibleEntries.length > 0 && pickedIds.length === visibleEntries.length;
  const toggleAllVisible = () => setSelectedIds(allPicked ? new Set() : new Set(visibleEntries.map((entry) => entry.id)));
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
    setListFilters(NO_LIST_FILTERS);
    setSection(next);
  };
  const navigateEntry = async (id: string) => {
    if (id === openId || !(await askDiscard())) return;
    editorDirtyRef.current = false;
    openEntry(id);
  };

  const startSelecting = async () => {
    if (open && !(await askDiscard())) return;
    editorDirtyRef.current = false;
    setOpenId(null);
    setAutoPhotoOptionId(null);
    setSelecting(true);
  };

  const removeSelected = async () => {
    const count = pickedIds.length;
    if (!count) return;
    const ok = await confirm.confirm({
      title: `Delete ${count} item${count === 1 ? "" : "s"}?`,
      description: `The ${count === 1 ? "item" : "items"} and all ${count === 1 ? "its" : "their"} options are removed. This can't be undone. Other codes stay as they are.`,
      confirmLabel: `Delete ${count} item${count === 1 ? "" : "s"}`,
      cancelLabel: "Keep items",
      tone: "danger",
    });
    if (!ok) return;
    if (await run("bulk-delete", () => deleteScheduleEntriesAction({ projectId, entryIds: pickedIds }))) {
      setNotice(`${count} item${count === 1 ? "" : "s"} deleted.`);
      stopSelecting();
    }
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
    // The server reorders a whole category, so rows out of view (hidden ones) keep their place in the list sent.
    const ids = sectionEntries.filter((entry) => entry.category === rows[0]?.category).map((entry) => entry.id);
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

  const inspectorItem = open && !selecting ? open : null;
  const bulkOpen = selecting && pickedIds.length > 0;

  return (
    <div className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
      {/* Toolbar: on wide screens it never scrolls; only the board and the inspector below it do (owner, 2026-10-22). */}
      <div className="sticky top-0 z-20 grid shrink-0 gap-2.5 border-b border-line-subtle bg-surface px-(--ui-section-px) py-2.5 lg:static">
        <div className="flex flex-wrap items-center gap-2">
          {/* changeSection reads the draft ref only when this browser event fires; passing it through the shared tab contract keeps the existing discard guard intact. */}
          {/* eslint-disable-next-line react-hooks/refs */}
          <PillTabs label="Schedule section" items={(["MATERIAL", "FIXTURE"] as const).map((key) => ({ key, label: SECTION_LABEL[key], active: section === key, count: counts[key], onSelect: changeSection.bind(null, key) }))} />
          <PillTabs label="Schedule view" items={[{ key: "board", label: "Board", active: viewMode === "board", onSelect: () => setViewMode("board") }, { key: "list", label: "List", active: viewMode === "list", onSelect: () => setViewMode("list") }]} />
          <label className="flex h-(--ui-control-height-sm) w-full items-center gap-2 rounded-control border border-line bg-surface px-2.5 text-ink-tertiary focus-within:border-line-focus sm:w-60">
            <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="sr-only">Search items</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, type, brand…" className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-tertiary focus:outline-none" />
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canEdit && sectionEntries.length > 0 ? (
              selecting
                ? <Button size="sm" variant="secondary" leadingIcon={<SquareCheck className="h-3.5 w-3.5" />} onClick={stopSelecting}>Done selecting</Button>
                : <Button size="sm" variant="ghost" leadingIcon={<SquareCheck className="h-3.5 w-3.5" />} onClick={() => void startSelecting()}>Select</Button>
            ) : null}
            <Link
              prefetch={false}
              target="_blank"
              href={STUDIOFLOW_ROUTES.projectSchedulePrint(projectId)}
              onClick={(event) => {
                // With hidden items in the project, ask each time whether they are printed (owner, 2026-10-23).
                if (!entries.some((entry) => entry.hidden)) return;
                event.preventDefault();
                setPrintAsk(true);
              }}
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2.5">
            <span className="whitespace-nowrap text-sm font-medium text-ink">{progress.final} of {progress.all} final</span>
            <ProgressBar value={progress.final} max={progress.all} label={`${progress.final} of ${progress.all} final`} className="!w-28 shrink-0" />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Schedule progress filter">
            <FilterChip selected={filter === "all"} count={progress.all} onClick={() => setFilter("all")}>All</FilterChip>
            <FilterChip selected={filter === "decision"} count={progress.decision} onClick={() => setFilter("decision")}>Needs a decision</FilterChip>
            <FilterChip selected={filter === "sample"} count={progress.sample} onClick={() => setFilter("sample")}>Sample waiting</FilterChip>
            <FilterChip selected={filter === "empty"} count={progress.empty} onClick={() => setFilter("empty")}>No product yet</FilterChip>
          </div>
          {hiddenCount > 0 || visibility !== "visible" ? (
            <Select aria-label="Hidden items" className="!h-8 !w-auto text-xs" value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility)}>
              <option value="visible">Hidden items: off ({hiddenCount})</option>
              <option value="all">Show hidden</option>
              <option value="hidden">Hidden only</option>
            </Select>
          ) : null}
          {highlightedCount > 0 || highlightFilter !== "ALL" ? (
            <Select aria-label="Highlight colour" className="!h-8 !w-auto text-xs" value={highlightFilter} onChange={(event) => setHighlightFilter(event.target.value as HighlightFilter)}>
              <option value="ALL">All colours</option>
              <option value="any">Any highlight</option>
              {SCHEDULE_HIGHLIGHTS.map((highlight) => <option key={highlight} value={highlight}>{HIGHLIGHT_LABEL[highlight]}</option>)}
            </Select>
          ) : null}
          {viewMode === "list" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <TableFilters
                resultLabel={`${listGroups.reduce((total, group) => total + group.rows.length, 0)} of ${progress.all} items`}
                filters={(Object.keys(LIST_FILTER_LABEL) as ListFilterKey[]).map((key) => ({
                  id: key,
                  label: key === "category" && section === "FIXTURE" ? "Category" : LIST_FILTER_LABEL[key],
                  value: listFilters[key],
                  defaultValue: "ALL",
                  options: listFilterOptions(key),
                  onValueChange: (value: string) => setListFilters((current) => ({ ...current, [key]: value })),
                }))}
              />
              <Button size="sm" variant="ghost" onClick={() => setCollapsedGroups(collapsedGroups.size > 0 ? new Set() : new Set(listGroups.map((group) => group.category)))}>
                {collapsedGroups.size > 0 ? "Expand all" : "Collapse all"}
              </Button>
              {listSort ? (
                <FilterChip selected aria-label="Back to the studio order" onClick={() => setListSort(null)}>
                  Sorted · studio order<X size={12} aria-hidden="true" />
                </FilterChip>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Narrow screens have no inspector column: bulk actions sit in a bar instead. */}
      {selecting ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle bg-surface-muted px-(--ui-section-px) py-2 lg:hidden" role="region" aria-label="Bulk actions">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-ink" role="status">{pickedIds.length} selected</span>
            <Button size="sm" variant="ghost" onClick={toggleAllVisible}>{allPicked ? "Clear selection" : `Select all ${visibleEntries.length}`}</Button>
          </div>
          <Button size="sm" variant="ghost" leadingIcon={<Copy className="h-3.5 w-3.5" />} disabled={pickedIds.length === 0} onClick={() => void copyRows(visibleEntries.filter((entry) => selectedIds.has(entry.id)))}>Copy rows</Button>
          <Button size="sm" variant="danger" leadingIcon={<Trash2 className="h-3.5 w-3.5" />} disabled={pickedIds.length === 0} pending={command.pendingKeys.includes("bulk-delete")} onClick={() => void removeSelected()}>Delete{pickedIds.length ? ` ${pickedIds.length}` : ""}</Button>
        </div>
      ) : null}

      <div className="flex min-w-0 lg:min-h-0 lg:flex-1">
        <div className={`min-w-0 flex-1 lg:overscroll-contain ${viewMode === "list" ? "overflow-x-auto lg:overflow-auto" : "lg:overflow-y-auto"}`}>
          {error && !open && !dialog ? <InlineError className="px-(--ui-section-px) pt-2">{error}</InlineError> : null}
          {notice ? <Text size="sm" tone="secondary" role="status" className="px-(--ui-section-px) pt-2">{notice}</Text> : null}
          {groups.length === 0 ? (
            <div className="grid">
              <EmptyState
                title={progress.all === 0 ? `No ${SECTION_LABEL[section].toLowerCase()} items yet` : needle ? `Nothing matches "${query.trim()}"` : "No items match this filter"}
                description={progress.all === 0 && canEdit ? "Start a category below, add an item, apply the studio templates, or import the Google Sheets schedule." : progress.all === 0 ? "This project has no schedule items in this section." : needle ? "Try another word, or clear the search." : "Choose another progress filter to see more items."}
                className="py-10"
              />
              {progress.all === 0 && canEdit ? <NewCategoryInline command={command} projectId={projectId} section={section} categories={[]} categoryChoices={categoryChoices} className="mb-8 justify-self-center" /> : null}
            </div>
          ) : (
            <>
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
                    menuItems={(entry) => [...copyItems(entry), ...markItems([entry])]}
                    categoryChoices={categoryChoices}
                    openId={openId}
                    selecting={selecting}
                    selectedIds={selectedIds}
                    onToggle={toggleSelected}
                  />
                ) : (
                  // Columns follow the studio's Google Sheet (WO-SF-SCHEDULE-SHEET-01). The heading row stays
                  // put while the rows scroll; narrow screens scroll the whole list sideways.
                  <div className="grid min-w-[1160px]">
                    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface px-(--ui-section-px) py-1.5 text-micro uppercase tracking-[0.06em] text-ink-tertiary">
                      {selecting ? <span className="w-5 shrink-0" /> : null}
                      <span className="w-16 shrink-0">{sortHead("code", "Code")}</span>
                      <span className="w-24 shrink-0">{sortHead("category", section === "MATERIAL" ? "Material type" : "Category")}</span>
                      <span className="w-24 shrink-0">{sortHead("brand", "Ex")}</span>
                      <span className="min-w-0 flex-1">{sortHead("type", "Type")}</span>
                      <span className="w-32 shrink-0">{sortHead("initials", "Initials type")}</span>
                      <span className="w-11 shrink-0">Image</span>
                      <span className="w-40 shrink-0">{sortHead("location", "Location")}</span>
                      <span className="w-32 shrink-0">{sortHead("contact", "Contact")}</span>
                      {section === "FIXTURE" ? <span className="w-20 shrink-0 text-right">{sortHead("qty", "Qty")}</span> : null}
                      <span className="w-28 shrink-0">{sortHead("status", "Status")}</span>
                      <span className="w-8 shrink-0" />
                    </div>
                    {listGroups.length === 0 ? <EmptyState title="No items match these filters" description="Clear a column filter to see more items." className="py-10" /> : null}
                    {listGroups.map((group) => {
                      const collapsed = collapsedGroups.has(group.category) && !group.rows.some((row) => row.id === openId);
                      return (
                      <section key={group.category} className="border-b border-line-subtle last:border-b-0">
                        <h3 className="m-0 bg-surface-muted">
                          <button
                            type="button"
                            aria-expanded={!collapsed}
                            onClick={() => toggleGroup(group.category)}
                            className="flex w-full items-center gap-2 px-(--ui-section-px) py-1.5 text-left [&:hover_span]:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-line-focus"
                          >
                            {collapsed ? <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-ink-tertiary" /> : <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-ink-tertiary" />}
                            <span className="text-label text-ink-secondary">{group.category}</span>
                            <Text as="span" size="sm" tone="tertiary">{group.rows.length}</Text>
                          </button>
                        </h3>
                        <ul hidden={collapsed} className="m-0 list-none divide-y divide-line-subtle p-0">
                          {group.rows.map((entry, index) => {
                            const shown = shownOptionOf(entry);
                            const busy = command.pendingKeys.some((key) => key.startsWith(entry.id));
                            // One action list for the row's … menu and its right-click menu, as on the Board.
                            const rowItems = !selecting ? [
                              { label: "Open", onSelect: () => openEntry(entry.id) },
                              ...copyItems(entry),
                              ...markItems([entry]),
                              ...(canManageTemplates && templateSourceOf(entry)
                                ? [{ label: "Save as template item", separatorBefore: true, onSelect: () => void run(`${entry.id}-template`, () => saveScheduleEntryAsTemplateAction({ projectId, entryId: entry.id })) }]
                                : []),
                              ...(canEdit ? [
                                { label: "Move up", icon: <ArrowUp className="h-3.5 w-3.5" />, disabled: !listManual || index === 0, separatorBefore: true, onSelect: () => void run(`${entry.id}-move`, () => moveScheduleEntryAction({ projectId, entryId: entry.id, direction: "up" })) },
                                { label: "Move down", icon: <ArrowDown className="h-3.5 w-3.5" />, disabled: !listManual || index === group.rows.length - 1, onSelect: () => void run(`${entry.id}-move`, () => moveScheduleEntryAction({ projectId, entryId: entry.id, direction: "down" })) },
                                { label: "Move to category…", onSelect: () => setDialog({ move: entry }) },
                                { label: "Delete", danger: true, separatorBefore: true, onSelect: () => void removeEntry(entry) },
                              ] : []),
                            ] : [];
                            return (
                              <ContextActionMenu key={entry.id} items={rowItems}>
                              <li
                                id={`schedule-entry-${entry.id}`}
                                draggable={canEdit && listManual && !selecting}
                                onDragStart={listDrag.start(entry.id)}
                                onDragEnd={listDrag.end}
                                onDragOver={listDrag.over(entry.id, canEdit && listManual)}
                                onDragLeave={listDrag.leave(entry.id)}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  if (listDrag.draggingId) reorderGroup(group.rows, listDrag.draggingId, entry.id);
                                  listDrag.end();
                                }}
                                style={rowHighlightStyle(entry.highlight)}
                                className={`flex items-center gap-3 px-(--ui-section-px) py-2.5 ${entry.hidden ? "opacity-55" : ""} ${canEdit && listManual ? "cursor-grab active:cursor-grabbing" : ""} ${open?.id === entry.id ? "bg-surface-muted" : "hover:bg-surface-muted"} ${listDrag.draggingId === entry.id ? "opacity-40" : ""} ${listDrag.dragOverId === entry.id && listDrag.draggingId && listDrag.draggingId !== entry.id ? "outline-2 outline-dashed outline-offset-[-2px] outline-line-focus" : ""}`}
                              >
                                {selecting ? <Checkbox checked={selectedIds.has(entry.id)} onCheckedChange={() => toggleSelected(entry.id)} label={<span className="sr-only">Select {entry.code}</span>} /> : null}
                                <button type="button" onClick={() => (selecting ? toggleSelected(entry.id) : openEntry(entry.id))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                                  <span className="w-16 shrink-0 font-ui-mono text-sm font-semibold tabular-nums text-ink">{entry.code}</span>
                                  <span className="w-24 shrink-0 line-clamp-2 text-sm text-ink-secondary">{entry.category}</span>
                                  <span className="w-24 shrink-0 line-clamp-2 text-sm text-ink-secondary">{shown?.brandName ?? ""}</span>
                                  <span className="min-w-0 flex-1 line-clamp-2 text-sm font-medium text-ink">
                                    {shown ? shown.productName : <span className="font-normal italic text-ink-tertiary">Reserved — no product yet</span>}
                                  </span>
                                  <span className="w-32 shrink-0 line-clamp-2 text-sm text-ink-secondary">{shown ? initialsOf(shown) : ""}</span>
                                  <Thumb url={shown?.imageUrl ?? null} alt={shown ? shown.productName : `${entry.code} has no photo`} />
                                  <span className="w-40 shrink-0 line-clamp-2 text-sm text-ink-secondary" title={entry.location ?? undefined}>{entry.location ?? ""}</span>
                                  <span className="w-32 shrink-0 line-clamp-2 text-sm text-ink-secondary" title={shown?.contact ?? undefined}>{shown?.contact ?? ""}</span>
                                  {section === "FIXTURE" ? <span className="w-20 shrink-0 text-right text-sm tabular-nums text-ink-secondary">{entry.qty ? `${entry.qty} ${entry.unit ?? ""}` : ""}</span> : null}
                                  <span className="flex w-28 shrink-0 flex-wrap gap-1">{entryBadges(entry).map((badge) => <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>)}</span>
                                </button>
                                {rowItems.length > 0 ? <RowActionMenu label={`Actions for ${entry.code}`} pending={busy} items={rowItems} /> : null}
                              </li>
                              </ContextActionMenu>
                            );
                          })}
                        </ul>
                      </section>
                      );
                    })}
                  </div>
                )}
            </>
          )}
        </div>

        {/* The inspector: docked to the right edge on wide screens, always there, with its own scroll (owner, 2026-10-22).
            On narrow screens it only appears, full screen, while one item is open. */}
        <aside
          aria-label={inspectorItem ? `Edit ${inspectorItem.code}` : bulkOpen ? "Selected items" : "Inspector"}
          onKeyDown={(event) => { if (event.key === "Escape" && inspectorItem && !event.defaultPrevented) void closeEditor(); }}
          className={`${inspectorItem ? "fixed inset-0 z-40 flex" : "hidden"} min-h-0 flex-col bg-surface lg:static lg:z-auto lg:flex lg:w-[24rem] lg:shrink-0 lg:border-l lg:border-line-subtle xl:w-[26rem]`}
        >
          {inspectorItem ? (
            <DockedEntryPanel
              key={inspectorItem.id}
              projectId={projectId}
              entry={inspectorItem}
              brands={brands}
              canEdit={canEdit}
              command={command}
              confirm={confirm.confirm}
              canManageTemplates={canManageTemplates}
              categories={categories}
              previousId={visibleOpenIndex > 0 ? visibleEntries[visibleOpenIndex - 1]?.id ?? null : null}
              nextId={visibleOpenIndex >= 0 ? visibleEntries[visibleOpenIndex + 1]?.id ?? null : null}
              onNavigate={(id) => void navigateEntry(id)}
              onMove={() => setDialog({ move: inspectorItem })}
              onDelete={() => void removeEntry(inspectorItem)}
              onClose={() => void closeEditor()}
              onDirtyChange={(dirty) => { editorDirtyRef.current = dirty; }}
              initialPhotoOptionId={autoPhotoOptionId}
            />
          ) : bulkOpen ? (
            <BulkPanel
              picked={visibleEntries.filter((entry) => selectedIds.has(entry.id))}
              total={visibleEntries.length}
              allPicked={allPicked}
              onToggleAll={toggleAllVisible}
              onClear={() => setSelectedIds(new Set())}
              onDelete={() => void removeSelected()}
              onCopy={() => void copyRows(visibleEntries.filter((entry) => selectedIds.has(entry.id)))}
              marks={markItems(visibleEntries.filter((entry) => selectedIds.has(entry.id)))}
              deleting={command.pendingKeys.includes("bulk-delete")}
            />
          ) : (
            <div className="grid flex-1 place-content-center justify-items-center gap-2 p-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-control bg-surface-muted text-ink-secondary"><LayoutGrid aria-hidden="true" className="h-5 w-5" /></span>
              <Text weight="semibold">{selecting ? "Tick the items to act on" : "Pick an item to edit it here"}</Text>
              <Text size="sm" tone="secondary" className="max-w-64">{selecting ? "What you can do with them shows here. Done selecting goes back to editing." : "The board stays in view while you edit. Select acts on several items at once."}</Text>
            </div>
          )}
        </aside>
      </div>

      {dialog === "add" ? (
        <AddItemDrawer projectId={projectId} section={section} categoriesBySection={categoriesBySection} categoryChoices={categoryChoices} brands={brands} command={command} confirm={confirm.confirm} onClose={() => setDialog(null)} />
      ) : null}
      <Dialog
        open={printAsk}
        onOpenChange={setPrintAsk}
        title="Include hidden items?"
        description={`${entries.filter((entry) => entry.hidden).length} hidden item(s) in this schedule. Hidden items are left out of the print unless you include them.`}
        size="sm"
        footer={<><Button variant="ghost" onClick={() => openPrint(true)}>Include hidden</Button><Button variant="primary" onClick={() => openPrint(false)}>Leave them out</Button></>}
      >
        {null}
      </Dialog>
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
  contact: string;
  notes: string;
  extra: ScheduleExtraField[];
};

const EMPTY_PRODUCT: ProductDraft = { brandId: "", brandName: "", productName: "", color: "", finishing: "", dimension: "", pattern: "", contact: "", notes: "", extra: [] };

function productFromOption(option: ScheduleOptionView): ProductDraft {
  return {
    brandId: option.brandId ?? "",
    brandName: option.brandId ? "" : option.brandName ?? "",
    productName: option.productName,
    color: option.color ?? "",
    finishing: option.finishing ?? "",
    dimension: option.dimension ?? "",
    pattern: option.pattern ?? "",
    contact: option.contact ?? "",
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
    contact: text(draft.contact),
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
  // A product picked from another project: Save copies it whole (photo and notes included), so the product fields give way to a summary.
  const [reuseHit, setReuseHit] = useState<ReuseHit | null>(null);
  const [searchingPast, setSearchingPast] = useState(false);
  const isFixture = targetSection === "FIXTURE";
  const pending = command.isPending("add-item");
  const hasProduct = reuseHit !== null || preparedPhoto !== null || Object.entries(product).some(([key, value]) => key === "extra" ? (value as ScheduleExtraField[]).length > 0 : String(value).trim().length > 0);
  const canSave = Boolean(category.trim()) && (!hasProduct || reuseHit !== null || Boolean(product.productName.trim()));
  const pickReuse = (hit: ReuseHit) => {
    setTargetSection(hit.section);
    setCategory(hit.category);
    setProduct(EMPTY_PRODUCT);
    setPreparedPhoto(null);
    setCardFields(null);
    setReuseHit(hit);
    setSearchingPast(false);
  };
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
    if (reuseHit) {
      const reuseOk = await command.run("add-item-option", () => copyReusableScheduleOptionAction({ projectId, entryId: entryId!, sourceOptionId: reuseHit.optionId }));
      if (!reuseOk) return;
    } else if (hasProduct) {
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
        <div className="grid gap-3 rounded-control border border-line-subtle bg-surface-muted p-3">
          <div className="flex items-start justify-between gap-2">
            <div><Text weight="semibold">From a past project</Text><Text size="sm" tone="tertiary">Start from a product another project already uses. It is copied, so the other project never changes.</Text></div>
            {!reuseHit ? <Button size="sm" variant="secondary" leadingIcon={<History className="h-3.5 w-3.5" />} onClick={() => setSearchingPast(!searchingPast)} disabled={pending}>{searchingPast ? "Close" : "Search"}</Button> : null}
          </div>
          {reuseHit ? (
            <div className="flex items-center gap-3 rounded-control border border-line bg-surface px-3 py-2">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-sm font-medium">{reuseHit.productName}{reuseHit.brandName ? <span className="font-normal text-ink-secondary"> · ex. {reuseHit.brandName}</span> : null}</span>
                <span className="truncate text-xs text-ink-tertiary">{[specLine(reuseHit), `${reuseHit.sourceProjectName} · ${reuseHit.category}`].filter(Boolean).join(" — ")}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setReuseHit(null)} disabled={pending}>Remove</Button>
            </div>
          ) : null}
          {searchingPast && !reuseHit ? <ReuseSearch projectId={projectId} useLabel="Use as start" onUse={pickReuse} /> : null}
        </div>
        {reuseHit ? (
          <div className="grid gap-3 border-t border-line-subtle pt-4">
            <Text weight="semibold">Item details</Text>
            <Text size="sm" tone="tertiary">The product, photo and notes come from the past project. Edit them on the card after saving.</Text>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Location"><Input value={qty.location} onChange={(event) => setQty({ ...qty, location: event.target.value })} maxLength={160} /></Field>
              {isFixture ? <Field label="Qty and unit"><div className="grid grid-cols-2 gap-2"><Input aria-label="Qty" inputMode="decimal" value={qty.qty} onChange={(event) => setQty({ ...qty, qty: event.target.value })} maxLength={20} /><Input aria-label="Unit" value={qty.unit} onChange={(event) => setQty({ ...qty, unit: event.target.value })} maxLength={40} placeholder="Unit" /></div></Field> : null}
            </div>
          </div>
        ) : (
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
          <div className="grid gap-2"><Text weight="semibold">Photo</Text><ImageWorkspace label="Schedule option photo" aspect={PHOTO_ASPECT} maxDimension={1600} outputType="image/jpeg" allowColor onPrepared={setPreparedPhoto} disabled={pending} />{preparedPhoto ? <Text size="sm" tone="secondary">Photo ready: {preparedPhoto.name}</Text> : null}</div>
        </div>
        )}
        {hasProduct && !reuseHit && !product.productName.trim() ? <InlineError>Enter a Type, or clear the product fields to only reserve the code.</InlineError> : null}
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Drawer>
  );
}

// ── Entry drawer content ───────────────────────────────────────────────────────

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
  const [photoInColor, setPhotoInColor] = useState(false);
  const [newPhotoOpen, setNewPhotoOpen] = useState(false);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
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
  const visibilityAction = (key: string, label: string) => {
    const on = displayCardFields.includes(key);
    return (
      <button type="button" aria-label={on ? `Hide ${label} from card` : `Show ${label} on card`} title={on ? "Shown on the card and in print" : "Hidden on the card"} aria-pressed={on} disabled={disabled} onClick={() => toggleCardField(key)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-line-focus disabled:opacity-50">
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full border-[1.5px] ${on ? "border-action bg-action" : "border-line-strong bg-transparent"}`} />
      </button>
    );
  };
  const busyKey = selected ? `${entry.id}-opt-${selected.id}` : "";
  const isNew = selectedId === "new";
  const startNewOption = () => { setSelectedId("new"); setDrafts((current) => ({ ...current, new: current.new ?? EMPTY_PRODUCT })); setReuse(false); setPhotoFor(null); setSampleFor(null); setNewPhotoOpen(false); };
  const startReuse = () => { setReuse(true); setPhotoFor(null); setSampleFor(null); };
  const pickOption = (id: string) => { setSelectedId(id); setReuse(false); setPhotoFor(null); setSampleFor(null); setPhotoInColor(false); };

  // The photo opens a choice (owner 2026-10-23: "Change photo" must not jump straight to the file dialog when a colour is also possible).
  const pasteFromClipboard = async (optionId: string) => {
    setPasteHint(null);
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((value) => value.startsWith("image/"));
        if (type) { const blob = await item.getType(type); openPhoto(optionId, new File([blob], "pasted-image", { type })); return; }
      }
      setPasteHint("No image on the clipboard. Copy one, then press Ctrl+V here.");
    } catch {
      setPasteHint("The browser did not allow reading the clipboard. Press Ctrl+V here instead.");
    }
  };
  const photoMenu = (option: ScheduleOptionView) => [
    { label: "Upload a photo…", icon: <Upload aria-hidden="true" />, onSelect: () => { setPhotoInColor(false); openPhoto(option.id); } },
    { label: "Paste from clipboard", icon: <ClipboardPaste aria-hidden="true" />, onSelect: () => void pasteFromClipboard(option.id) },
    { label: "Use a colour", icon: <Palette aria-hidden="true" />, onSelect: () => { setPhotoInColor(true); openPhoto(option.id); } },
    ...(option.imageUrl ? [{ label: "Remove photo", danger: true, separatorBefore: true, onSelect: () => void removePhoto(option) }] : []),
  ];

  const sample = selected?.sampleRequest ?? null;
  const sampleText = !sample ? "No sample requested"
    : sample.status === "REQUESTED" ? `Sample asked${sample.requestedFrom ? ` from ${sample.requestedFrom}` : ", supplier to be found"}`
    : sample.status === "RECEIVED" ? `Sample received${sample.receivedNote ? `: ${sample.receivedNote}` : ""}`
    : `Sample declined${sample.declineReason ? `: ${sample.declineReason}` : ""}`;

  const specRows: Array<{ key: string; label: string; value: string; placeholder: string; maxLength: number; onChange: (value: string) => void }> = [
    { key: "color", label: CARD_FIELD_LABEL.color, value: draft.color, placeholder: "Add", maxLength: 160, onChange: (value) => updateDraft({ color: value }) },
    { key: "pattern", label: CARD_FIELD_LABEL.pattern, value: draft.pattern, placeholder: "Add", maxLength: 160, onChange: (value) => updateDraft({ pattern: value }) },
    { key: "finishing", label: CARD_FIELD_LABEL.finishing, value: draft.finishing, placeholder: "Add", maxLength: 160, onChange: (value) => updateDraft({ finishing: value }) },
    { key: "dimension", label: "Size", value: draft.dimension, placeholder: "e.g. 60 × 60 cm", maxLength: 160, onChange: (value) => updateDraft({ dimension: value }) },
  ];
  const ROW = "flex min-h-9 items-center gap-2 border-t border-line-subtle";
  const ROW_LABEL = "w-20 shrink-0 text-xs text-ink-secondary";
  const ROW_INPUT = "h-8 min-w-0 flex-1 rounded-[6px] border border-transparent bg-transparent px-2 text-sm text-ink placeholder:text-ink-tertiary hover:border-line-subtle focus:border-line-focus focus:bg-surface focus:outline-none disabled:opacity-70";

  // Item-level rows: they belong to the code, not to an option, so they show even before the first option exists.
  const itemRows = (
    <>
      <label className={ROW}>
        <span className={ROW_LABEL}>Location</span>
        <input value={fields.location} onChange={(event) => setFields({ ...fields, location: event.target.value })} disabled={disabled} maxLength={160} placeholder="Where it goes" className={ROW_INPUT} />
        {visibilityAction("location", "Location")}
      </label>
      {/* Qty only for Fixture — a Material line is specified, not counted (owner decision 2026-09-23). */}
      {entry.section === "FIXTURE" ? (
        <div className={ROW}>
          <span className={ROW_LABEL}>Qty</span>
          <input aria-label="Qty" inputMode="decimal" value={fields.qty} onChange={(event) => setFields({ ...fields, qty: event.target.value })} disabled={disabled} maxLength={20} placeholder="0" className={`${ROW_INPUT} !flex-none w-20`} />
          <input aria-label="Unit" value={fields.unit} onChange={(event) => setFields({ ...fields, unit: event.target.value })} disabled={disabled} maxLength={40} placeholder="Unit" className={ROW_INPUT} />
          {visibilityAction("qty", "Qty")}
        </div>
      ) : null}
    </>
  );

  const hero = (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3.5">
      <div className="relative">
        {isNew ? (
          <button type="button" onClick={() => setNewPhotoOpen((value) => !value)} aria-expanded={newPhotoOpen} className="grid aspect-[4/5] w-full place-content-center justify-items-center gap-1.5 rounded-control border border-dashed border-line-strong bg-surface-muted text-xs text-ink-secondary hover:border-line-focus">
            {preparedNewPhoto ? <Check aria-hidden="true" className="h-5 w-5 text-success" /> : <ImageIcon aria-hidden="true" className="h-5 w-5" />}
            {preparedNewPhoto ? "Photo ready" : "Add photo"}
          </button>
        ) : selected && canEdit ? (
          <RowActionMenu
            align="start"
            items={photoMenu(selected)}
            trigger={
              <button type="button" {...photoIntake.target} aria-label={`Photo of option ${selected.label}`} title="Choose a photo or a colour, or drop / paste one (Ctrl+V)" className={`relative block w-full rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus ${photoIntake.active ? "outline-2 outline-dashed outline-offset-2 outline-line-focus" : ""}`}>
                <Thumb url={selected.imageUrl} alt={selected.productName} className="aspect-[4/5] !h-auto w-full !rounded-control" />
                <span className="pointer-events-none absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-medium text-ink">{selected.imageUrl ? "Photo" : "Add photo"}<ChevronDown aria-hidden="true" className="h-3 w-3" /></span>
              </button>
            }
          />
        ) : (
          <Thumb url={selected?.imageUrl ?? null} alt={selected?.productName ?? "No photo"} className="aspect-[4/5] !h-auto w-full !rounded-control" />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label className="grid gap-0.5">
          <span className="text-[11px] uppercase tracking-[0.06em] text-ink-tertiary">Type</span>
          <input
            aria-label="Type"
            value={draft.productName}
            onChange={(event) => updateDraft({ productName: event.target.value })}
            disabled={disabled}
            maxLength={200}
            placeholder="e.g. Nude Pro - ATS 1132 M"
            className="-ml-1.5 h-9 w-[calc(100%+0.375rem)] rounded-[6px] border border-transparent bg-transparent px-1.5 text-base font-semibold leading-tight text-ink placeholder:text-sm placeholder:font-normal placeholder:text-ink-tertiary hover:border-line-subtle focus:border-line-focus focus:bg-surface focus:outline-none"
          />
        </label>
        <div className="grid gap-0.5">
          <span className="flex items-center justify-between text-[11px] uppercase tracking-[0.06em] text-ink-tertiary">Brand{visibilityAction("brand", "Brand")}</span>
          <CreatableSearch
            label="Brand"
            options={brandSearchOptions}
            value={draft.brandId || draft.brandName}
            onValueChange={handleBrandChange}
            onCreate={(text) => text}
            createLabel={(text) => `Use "${text}" (not in Master Data)`}
            placeholder="Search or type a brand"
            searchPlaceholder="Search brands…"
            emptyLabel="No brands found"
            allowClear
            disabled={disabled}
            className="-ml-1.5 w-[calc(100%+0.375rem)] min-w-0 !h-8 !min-h-8 !border-transparent !bg-transparent !px-1.5 !text-sm"
          />
        </div>
        {/* Where the product is bought; internal, so it is never on the card or in print. */}
        <label className="grid gap-0.5">
          <span className="text-[11px] uppercase tracking-[0.06em] text-ink-tertiary">Contact</span>
          <input
            aria-label="Contact"
            value={draft.contact}
            onChange={(event) => updateDraft({ contact: event.target.value })}
            disabled={disabled}
            maxLength={160}
            placeholder="Shop or supplier"
            className="-ml-1.5 h-8 w-[calc(100%+0.375rem)] rounded-[6px] border border-transparent bg-transparent px-1.5 text-sm text-ink placeholder:text-ink-tertiary hover:border-line-subtle focus:border-line-focus focus:bg-surface focus:outline-none"
          />
        </label>
        <div className="mt-auto pt-1">
          {!isNew && selected?.isFinal ? (
            <div className="flex min-h-8 items-center gap-2 rounded-action bg-success-surface px-2.5 text-sm font-semibold text-success">
              <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />
              <span className="mr-auto">Chosen as final</span>
              {canEdit ? <button type="button" disabled={isPending(busyKey)} onClick={() => void run(busyKey, () => unmarkScheduleFinalAction({ projectId, optionId: selected.id }))} className="text-xs font-medium underline underline-offset-2 disabled:opacity-50">Undo</button> : null}
            </div>
          ) : !isNew && selected && canEdit ? (
            <Button size="sm" variant="primary" className="w-full" pending={isPending(busyKey)} onClick={() => void run(busyKey, () => markScheduleFinalAction({ projectId, optionId: selected.id }))}>Set option {selected.label} as final</Button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Option strip: same-size tabs, one + for every way to add; it stays put while the details scroll. */}
      {entry.options.length || isNew ? (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line-subtle bg-surface-raised px-4 py-2.5" role="group" aria-label="Spec options">
          {entry.options.map((option) => {
            const active = !isNew && option.id === selected?.id;
            return (
              <button key={option.id} type="button" aria-pressed={active} title={`Option ${option.label}: ${option.productName}${option.isFinal ? " (final)" : option.status === "NOT_USED" ? " (not used)" : ""}`} onClick={() => pickOption(option.id)} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-action border bg-surface pl-1 pr-2.5 text-sm text-ink ${active ? "border-line-focus font-bold shadow-[inset_0_0_0_1px_var(--ui-border-focus)]" : "border-line font-medium hover:border-line-strong"} ${option.status === "NOT_USED" ? "opacity-60" : ""}`}>
                <Thumb url={option.imageUrl} alt="" className="h-7 w-[1.375rem] !rounded-[5px]" />
                {option.label}
                {option.isFinal ? <Check aria-label="Final" className="h-3.5 w-3.5 text-success" strokeWidth={3} /> : null}
              </button>
            );
          })}
          {isNew ? <span className="inline-flex h-9 shrink-0 items-center rounded-action border border-line-focus bg-surface px-2.5 text-sm font-bold shadow-[inset_0_0_0_1px_var(--ui-border-focus)]">{nextOptionLabel(entry.options.map((option) => option.label))} · new</span> : null}
          {canEdit ? <ButtonMenu label="Option" variant="secondary" align="start" leadingIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />} items={[
            { label: `Blank option ${nextOptionLabel(entry.options.map((option) => option.label))}`, onSelect: startNewOption },
            { label: "Copy from a past project…", onSelect: startReuse },
          ]} /> : null}
          <span className="ml-auto" />
          {canEdit && selected && !isNew ? (
            <RowActionMenu
              label={`Option ${selected.label} actions`}
              pending={isPending(busyKey)}
              items={[
                ...(sample?.status === "REQUESTED" ? [{ label: "Cancel sample request", danger: true, onSelect: () => void cancelSample(selected) }] : []),
                { label: `Delete option ${selected.label}`, danger: true, separatorBefore: sample?.status === "REQUESTED", onSelect: () => void removeOption(selected) },
              ]}
            />
          ) : null}
        </div>
      ) : null}

      <div className={`grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain px-4 pt-4 ${canEdit ? "pb-4" : "pb-6"}`}>
        {reuse ? <InlineReuse projectId={projectId} entry={entry} command={command} onClose={() => setReuse(false)} /> : null}

        {entry.options.length === 0 && !isNew ? (
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Text weight="semibold">This code is reserved, no product yet</Text>
              <Text size="sm" tone="secondary">Start option A here, or copy a product used in a past project.</Text>
            </div>
            {canEdit ? (
              <div className="grid gap-2">
                <Button variant="primary" className="justify-start" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={startNewOption}>Add option A</Button>
                <Button variant="secondary" className="justify-start" leadingIcon={<History className="h-3.5 w-3.5" />} onClick={startReuse}>Copy from a past project</Button>
              </div>
            ) : null}
            <div className="grid">{itemRows}</div>
          </div>
        ) : (
          <>
            {photoFor && entry.options.some((option) => option.id === photoFor) ? (
              <InlinePhotoEditor projectId={projectId} entryCode={entry.code} option={entry.options.find((option) => option.id === photoFor)!} command={command} initialFile={handedPhoto} startInColor={photoInColor} onClose={() => { setPhotoFor(null); setHandedPhoto(null); setPhotoInColor(false); }} />
            ) : hero}
            {pasteHint ? <Text size="sm" tone="secondary" role="status">{pasteHint}</Text> : null}
            {isNew && newPhotoOpen && canEdit ? (
              <div className="grid gap-1"><ImageWorkspace label="New option photo" aspect={PHOTO_ASPECT} maxDimension={1600} outputType="image/jpeg" allowColor onPrepared={(file) => { setPreparedNewPhoto(file); setNewPhotoOpen(false); }} disabled={savePending} pasteFromPage /></div>
            ) : null}

            {/* Sample: one quiet line, always in the same place. */}
            {!isNew && selected ? (
              <div className="grid gap-2">
                <div className="flex min-h-10 items-center gap-2.5 rounded-control border border-line-subtle bg-surface-raised py-1 pl-3 pr-1">
                  <Package aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-secondary" />
                  <Text size="sm" tone="secondary" className="mr-auto min-w-0 truncate" title={sampleText}>{sampleText}</Text>
                  {canEdit ? (
                    sample?.status === "REQUESTED"
                      ? <Button size="sm" variant="ghost" pending={isPending(busyKey)} onClick={() => void run(busyKey, () => receiveScheduleSampleAction({ projectId, requestId: sample.id }))}>Mark received</Button>
                      : <Button size="sm" variant="ghost" onClick={() => { setSampleFor(selected); setPhotoFor(null); setReuse(false); }}>{sample ? "Ask again" : "Request"}</Button>
                  ) : null}
                </div>
                {sampleFor ? <InlineSampleRequest projectId={projectId} option={sampleFor} command={command} onClose={() => setSampleFor(null)} /> : null}
              </div>
            ) : null}

            {/* Specs: one column of rows; the dot at the end puts the field on the card and in print. */}
            <div className="grid">
              <div className="flex items-center justify-between gap-2 pb-1.5">
                <Text size="sm" weight="semibold">Specs</Text>
                <span className="flex items-center gap-1.5 text-[11px] text-ink-tertiary">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-action" />on card &amp; print
                  {canEdit && cardFieldsDraft !== null ? <button type="button" disabled={savePending} onClick={() => setCardFieldsDraft(null)} className="ml-1 underline underline-offset-2 hover:text-ink">Use default</button> : null}
                </span>
              </div>
              {specRows.map((row) => (
                <label key={row.key} className={ROW}>
                  <span className={ROW_LABEL}>{row.label}</span>
                  <input value={row.value} onChange={(event) => row.onChange(event.target.value)} disabled={disabled} maxLength={row.maxLength} placeholder={row.placeholder} className={ROW_INPUT} />
                  {visibilityAction(row.key, row.label)}
                </label>
              ))}
              {itemRows}
              {draft.extra.map((extra, index) => {
                const key = extraFieldKey(extra.label);
                const setExtra = (patch: Partial<ScheduleExtraField>) => updateDraft({ extra: draft.extra.map((field, position) => (position === index ? { ...field, ...patch } : field)) });
                return (
                  <div key={index} className={ROW}>
                    <input aria-label={`Spec label ${index + 1}`} value={extra.label} onChange={(event) => setExtra({ label: event.target.value })} disabled={disabled} maxLength={SCHEDULE_EXTRA_LABEL_MAX} placeholder="Label" className={`${ROW_INPUT} !flex-none w-20 !px-0 text-xs !text-ink-secondary`} />
                    <input aria-label={extra.label || `Spec value ${index + 1}`} value={extra.value} onChange={(event) => setExtra({ value: event.target.value })} disabled={disabled} maxLength={SCHEDULE_EXTRA_VALUE_MAX} placeholder="Value" className={ROW_INPUT} />
                    {extra.label.trim() ? visibilityAction(key, extra.label) : <span className="w-7 shrink-0" />}
                    <IconButton size="sm" variant="ghost" label={`Remove ${extra.label || `spec ${index + 1}`}`} icon={<X aria-hidden="true" />} disabled={disabled} onClick={() => updateDraft({ extra: draft.extra.filter((_, position) => position !== index) })} className="!h-7 !min-h-7 !w-7" />
                  </div>
                );
              })}
              {canEdit ? (
                <Button size="sm" variant="ghost" className="mt-1 justify-self-start" leadingIcon={<Plus className="h-3.5 w-3.5" />} disabled={disabled || draft.extra.length >= SCHEDULE_EXTRA_MAX} onClick={() => updateDraft({ extra: [...draft.extra, { label: "", value: "" }] })}>Add a spec line</Button>
              ) : null}
            </div>

            <div className="grid gap-1">
              <div className="flex items-center justify-between"><Text size="sm" weight="semibold">Notes</Text>{visibilityAction("notes", "Notes")}</div>
              <SimpleTextEditor value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} disabled={disabled} maxLength={2000} rows={2} />
            </div>
          </>
        )}

        {optionNeedsType ? <InlineError>Enter a Type before saving product details.</InlineError> : null}
        {saveError ? <InlineError>{saveError}</InlineError> : null}
        {command.error && !reuse && !photoFor && !sampleFor ? <InlineError>{command.error}</InlineError> : null}
      </div>

      {canEdit ? (
        <div className={`flex shrink-0 items-center gap-2 border-t border-line-subtle px-4 py-2.5 ${isDirty ? "bg-surface-raised" : "bg-surface"}`}>
          <Text size="sm" tone="secondary" className="mr-auto" role="status">{isDirty ? "Unsaved changes" : "No changes"}</Text>
          <Button type="button" variant="ghost" disabled={!isDirty || savePending} onClick={discardDraft}>Discard</Button>
          <Button type="button" variant="primary" pending={savePending} disabled={!isDirty || optionNeedsType} onClick={() => void saveAll().catch((error) => setSaveError(error instanceof Error ? error.message : "Could not save."))}>
            Save
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ── Entry drawer ───────────────────────────────────────────────────────────────

/**
 * The one item editor (WO-SF-SCHED-RELAYOUT-01; docked, owner 2026-10-22): a pane fixed beside the board instead of a pop-up, so the board stays in view and clickable, with
 * previous/next across the current section and filter, and the item menu (move, save as template, delete).
 */
function DockedEntryPanel({
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
  const state = finalOf(entry) ? "Final" : entry.options.length ? "Needs a decision" : "No product yet";
  const source = templateSourceOf(entry);
  return (
    <>
      <header className="grid shrink-0 gap-0.5 border-b border-line-subtle py-2.5 pl-4 pr-2">
        <div className="flex min-w-0 items-center gap-0.5">
          <h2 className="m-0 mr-auto min-w-0 truncate text-base font-semibold text-ink"><span className="font-ui-mono">{entry.code}</span> <span className="text-ink-secondary">· {entry.category}</span></h2>
          <IconButton size="sm" variant="ghost" label="Previous item" icon={<ArrowLeft aria-hidden="true" />} disabled={!previousId} onClick={() => { if (previousId) onNavigate(previousId); }} />
          <IconButton size="sm" variant="ghost" label="Next item" icon={<ArrowRight aria-hidden="true" />} disabled={!nextId} onClick={() => { if (nextId) onNavigate(nextId); }} />
          <RowActionMenu label={`Actions for ${entry.code}`} items={[
            { label: "Move to category…", disabled: categories.length < 2, onSelect: onMove },
            ...(canManageTemplates && source ? [{ label: "Save as template item", onSelect: () => { void command.run(`${entry.id}-template`, () => saveScheduleEntryAsTemplateAction({ projectId, entryId: entry.id })); } }] : []),
            { label: "Delete", danger: true, separatorBefore: true, onSelect: onDelete },
          ]} />
          <IconButton size="sm" variant="ghost" label="Close editor" icon={<X aria-hidden="true" />} onClick={onClose} />
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={finalOf(entry) ? "success" : entry.options.length ? "warning" : "neutral"}>{state}</Badge>
          <Text size="sm" tone="tertiary">{SECTION_LABEL[entry.section]}</Text>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
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
      </div>
    </>
  );
}

/** The inspector while several items are ticked: what is picked, and what can be done with all of them at once. */
function BulkPanel({ picked, total, allPicked, onToggleAll, onClear, onDelete, onCopy, marks, deleting }: { picked: readonly ScheduleEntryView[]; total: number; allPicked: boolean; onToggleAll: () => void; onClear: () => void; onDelete: () => void; onCopy: () => void; marks: readonly RowActionItem[]; deleting: boolean }) {
  const count = picked.length;
  const items = `${count} item${count === 1 ? "" : "s"}`;
  return (
    <>
      <header className="flex shrink-0 items-center gap-1 border-b border-line-subtle py-2.5 pl-4 pr-2">
        <h2 className="m-0 mr-auto text-base font-semibold text-ink" role="status">{count} selected</h2>
        <Button size="sm" variant="ghost" onClick={onToggleAll}>{allPicked ? "Clear all" : `Select all ${total}`}</Button>
        <IconButton size="sm" variant="ghost" label="Clear selection" icon={<X aria-hidden="true" />} onClick={onClear} />
      </header>
      <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain p-4">
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Selected items">
          {picked.map((entry) => {
            const shown = shownOptionOf(entry);
            return (
              <li key={entry.id} className="inline-flex max-w-full items-center gap-1.5 rounded-action bg-surface-muted py-1 pl-1 pr-2 text-xs">
                <Thumb url={shown?.imageUrl ?? null} alt="" className="h-6 w-5" />
                <span className="font-ui-mono font-semibold tabular-nums text-ink">{entry.code}</span>
                <span className="truncate text-ink-secondary">{shown?.productName ?? "No product yet"}</span>
              </li>
            );
          })}
        </ul>
        {marks.length ? (
          <div className="grid gap-2 rounded-control border border-line-subtle p-3">
            <Text size="sm" weight="semibold">Hide or highlight</Text>
            <div className="flex flex-wrap items-center gap-1.5">
              {marks.filter((mark) => !mark.items).map((mark) => <Button key={mark.label} size="sm" variant="secondary" leadingIcon={mark.icon} onClick={mark.onSelect}>{mark.label} {items}</Button>)}
              {marks.flatMap((mark) => mark.items ?? []).map((choice) => (
                <IconButton key={choice.label} size="sm" variant="ghost" label={`Highlight ${items}: ${choice.label}`} icon={choice.icon} onClick={choice.onSelect} />
              ))}
            </div>
          </div>
        ) : null}
        <div className="grid gap-2 rounded-control border border-line-subtle p-3">
          <Text size="sm" weight="semibold">Copy for the sheet</Text>
          <Text size="sm" tone="secondary">Rows come in the sheet&apos;s column order, ready to paste. Photos are copied one at a time from each row&apos;s menu.</Text>
          <Button size="sm" variant="secondary" className="justify-self-start" leadingIcon={<Copy className="h-3.5 w-3.5" />} onClick={onCopy}>Copy {items}</Button>
        </div>
        <div className="grid gap-2 rounded-control border border-danger-line bg-danger-surface p-3">
          <Text size="sm" weight="semibold" className="text-danger">Delete {items}</Text>
          <Text size="sm" tone="secondary">Each item and all its options are removed. Their codes are left empty; other codes do not shift.</Text>
          <Button size="sm" variant="danger-primary" className="justify-self-start" leadingIcon={<Trash2 className="h-3.5 w-3.5" />} pending={deleting} onClick={onDelete}>Delete {items}</Button>
        </div>
      </div>
    </>
  );
}

/** Search the other projects' products. Shared by the entry panel (copy into an item) and Add item (start an item from one). */
function ReuseSearch({ projectId, section, initialQuery = "", useLabel = "Use", pendingFor, onUse }: { projectId: string; section?: Section; initialQuery?: string; useLabel?: string; pendingFor?: (hit: ReuseHit) => boolean; onUse: (hit: ReuseHit) => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<ReuseHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const search = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const result = await searchReusableScheduleOptionsAction({ projectId, query: query.trim(), ...(section ? { section } : {}) });
      if (result.ok) setHits(result.data as ReuseHit[]);
      else setSearchError(result.error.safeMessage);
    } catch {
      setSearchError("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="grid gap-3">
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
              <Button size="sm" variant="primary" pending={pendingFor?.(hit)} onClick={() => onUse(hit)}>{useLabel}</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InlineReuse({ projectId, entry, command, onClose }: { projectId: string; entry: ScheduleEntryView; command: Command; onClose: () => void }) {
  const use = async (hit: ReuseHit) => {
    const ok = await command.run(`${entry.id}-reuse-${hit.optionId}`, () => copyReusableScheduleOptionAction({ projectId, entryId: entry.id, sourceOptionId: hit.optionId }));
    if (ok) onClose();
  };

  return (
    <div className="grid gap-3 rounded-control border border-line-subtle bg-surface-muted p-3">
      <div className="flex items-start justify-between gap-2"><div><Text weight="semibold">From past project</Text><Text size="sm" tone="tertiary">Copy a product into {entry.code} as a new option.</Text></div><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>
      <ReuseSearch projectId={projectId} section={entry.section as Section} initialQuery={entry.category} pendingFor={(hit) => command.isPending(`${entry.id}-reuse-${hit.optionId}`)} onUse={(hit) => void use(hit)} />
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
  /** WO-SF-CATEGORY-SIMILAR-01: the user confirms that look-alike new categories in the file are intended. */
  const [acceptNewCategories, setAcceptNewCategories] = useState(false);
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
    await command.run("import", () => importScheduleCsvAction({ projectId, section: target, acceptNewCategories, ...(file ? { file } : { csv }) }), (data) => setResult(data as { created: number; updated: number }));
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
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={acceptNewCategories} onChange={(event) => setAcceptNewCategories(event.target.checked)} />
          <span>Kategori baru di file ini memang dimaksudkan<span className="block text-xs text-ink-tertiary">Biarkan kosong: import berhenti dulu kalau ada kategori baru yang mirip kategori studio (misalnya HPL vs High Pressure Laminate).</span></span>
        </label>
        {result ? <Text size="sm">Imported: {result.created} new, {result.updated} updated.</Text> : null}
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Dialog>
  );
}
