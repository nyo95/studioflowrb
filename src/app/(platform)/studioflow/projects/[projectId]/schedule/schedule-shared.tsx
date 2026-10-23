"use client";

import { ImageIcon, Plus } from "lucide-react";
import { useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import {
  finalOf,
  isSpecPlaceholder,
  shownOptionOf,
  similarScheduleCategories,
  type ScheduleEntryView,
  type ScheduleExtraField,
  type ScheduleHighlight,
  type ScheduleOptionView,
} from "@/apps/studioflow/domain/schedule";
import {
  Button,
  CreatableSearch,
  Field,
  FormActions,
  ImageWorkspace,
  InlineError,
  Input,
  Text,
  type CreatableSearchGroup,
} from "@/platform/ui_engine";
import { createScheduleEntryAction, requestScheduleSampleAction, setScheduleOptionImageAction } from "../../../actions";
import { useCommand } from "../../../_components/use-command";

export type Section = "MATERIAL" | "FIXTURE";
export type Brand = { id: string; name: string };
/** A category the studio already knows (template category or prefix dictionary). */
export type CategoryChoice = { section: Section; category: string; prefix: string | null };

export type ReuseHit = {
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

export type Command = ReturnType<typeof useCommand>;

/** Legacy catalog photos are portrait 4:5. */
export const PHOTO_ASPECT = 4 / 5;

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
export function InlinePhotoEditor({
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
export function InlineSampleRequest({
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

export function Thumb({ url, alt, className = "h-14 w-11" }: { url: string | null; alt: string; className?: string }) {
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

export type ListSortKey = "code" | "category" | "brand" | "type" | "initials" | "location" | "contact" | "qty" | "status";
export type ListFilterKey = "category" | "brand" | "location" | "contact";
export const LIST_FILTER_LABEL: Record<ListFilterKey, string> = { category: "Material type", brand: "Ex", location: "Location", contact: "Contact" };
export const NO_LIST_FILTERS: Record<ListFilterKey, string> = { category: "ALL", brand: "ALL", location: "ALL", contact: "ALL" };
export const BLANK = "__blank__";
/** Ex filter value: options whose Brand was typed rather than chosen from Master Data. */
export const TYPED_BRAND = "__typed_brand__";

/** The text a List column shows for one row: what it sorts and filters on. */
export function listCellText(entry: ScheduleEntryView, key: ListSortKey | ListFilterKey): string {
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
 * then CONTACT only while the List shows that column (Fixture adds QTY and UNIT). The IMAGE cell stays empty: the
 * sheet cannot fetch a private photo, so the photo is copied on its own and pasted into that cell.
 */
export function sheetRowOf(entry: ScheduleEntryView, withContact: boolean): string[] {
  const shown = shownOptionOf(entry);
  const row = [entry.code, entry.category, shown?.brandName ?? "", shown?.productName ?? "", shown ? initialsOf(shown) : "", "", entry.location ?? "", ...(withContact ? [shown?.contact ?? ""] : [])];
  return entry.section === "FIXTURE" ? [...row, entry.qty ?? "", entry.unit ?? ""] : row;
}

/** Contact is optional in the studio's sheet (owner, 2026-10-23: sometimes asked for, often not), so its column is a per-browser choice. */
export const SHOW_CONTACT_KEY = "studioflow.schedule.showContact";

// ── Hide and highlight marks (WO-SF-SCHEDULE-MARKS-01) ───────────────────────
export const HIGHLIGHT_LABEL: Record<ScheduleHighlight, string> = { yellow: "Yellow", green: "Green", blue: "Blue", red: "Red", purple: "Purple", gray: "Gray" };
export type Visibility = "visible" | "all" | "hidden";
export type HighlightFilter = "ALL" | "any" | ScheduleHighlight;

export function Swatch({ highlight }: { highlight: ScheduleHighlight | null }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 shrink-0 rounded-full"
      style={highlight ? { background: `var(--ui-highlight-${highlight})` } : { boxShadow: "inset 0 0 0 1px var(--ui-border-strong)" }}
    />
  );
}

/** A List row's tint and colour edge. */
export function rowHighlightStyle(highlight: ScheduleHighlight | null): CSSProperties | undefined {
  // Only the colour travels inline; the tint, edge, hover and open states are classes, so they still show over it.
  return highlight ? ({ "--row-highlight": `var(--ui-highlight-${highlight})` } as CSSProperties) : undefined;
}

/**
 * A List row's background. A highlight is a tint with a thin colour edge that deepens on hover. The row open in the
 * inspector carries a thick dark edge instead (owner, 2026-10-23), so it never reads as a highlight, hover or selection.
 */
export function rowHighlightClass(highlight: ScheduleHighlight | null, open: boolean): string {
  const edge = open ? "shadow-[inset_4px_0_0_var(--color-ink)]" : highlight ? "shadow-[inset_3px_0_0_var(--row-highlight)]" : "";
  const tint = highlight
    ? "bg-[color-mix(in_srgb,var(--row-highlight)_14%,var(--ui-surface))] hover:bg-[color-mix(in_srgb,var(--row-highlight)_24%,var(--ui-surface))]"
    : open ? "bg-[color-mix(in_srgb,var(--color-ink)_3%,var(--ui-surface))]" : "hover:bg-surface-muted";
  return `${edge} ${tint}`;
}

/** A Board card's colour frame, set off from the card by a thin gap. */
export function cardHighlightStyle(highlight: ScheduleHighlight | null) {
  if (!highlight) return undefined;
  return { boxShadow: `0 0 0 3px var(--ui-surface), 0 0 0 6px var(--ui-highlight-${highlight})` };
}

/** The fields that make up the Initials type; a Board card shows them only as its title, when there is no Type yet. */
export const INITIALS_FIELDS: ReadonlySet<string> = new Set(["color", "pattern", "finishing"]);

/** A real Type, not the empty / "-" / "TBA" placeholder or the sheet import's "Imported". */
export function hasTypeOf(option: ScheduleOptionView): boolean {
  return !isSpecPlaceholder(option.productName) && option.productName !== "Imported";
}

/** The sheet's "Initials type": the rough description (colour, pattern, finishing) used before the exact product is known. */
export function initialsOf(option: ScheduleOptionView): string {
  return [option.color, option.pattern, option.finishing].filter(Boolean).join(" · ");
}

// ── Drag-reorder state (shared by the board grid and the list rows) ──────────

export function useRowDrag() {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const start = (id: string) => (event: DragEvent) => { setDraggingId(id); event.dataTransfer.effectAllowed = "move"; };
  const end = () => { setDraggingId(null); setDragOverId(null); };
  const over = (id: string, canEdit: boolean) => (event: DragEvent) => { if (!canEdit || !draggingId) return; event.preventDefault(); setDragOverId(id); };
  const leave = (id: string) => () => setDragOverId((current) => (current === id ? null : current));
  return { draggingId, dragOverId, start, end, over, leave };
}

export type ScheduleFilter = "all" | "decision" | "sample" | "empty";

export function scheduleFilterCounts(entries: readonly ScheduleEntryView[]) {
  return {
    all: entries.length,
    decision: entries.filter((entry) => entry.options.length > 0 && !finalOf(entry)).length,
    sample: entries.filter((entry) => entry.options.some((option) => option.sampleRequest?.status === "REQUESTED")).length,
    empty: entries.filter((entry) => entry.options.length === 0).length,
    final: entries.filter((entry) => finalOf(entry)).length,
  };
}

export function entryMatchesFilter(entry: ScheduleEntryView, filter: ScheduleFilter) {
  if (filter === "decision") return entry.options.length > 0 && !finalOf(entry);
  if (filter === "sample") return entry.options.some((option) => option.sampleRequest?.status === "REQUESTED");
  if (filter === "empty") return entry.options.length === 0;
  return true;
}

/**
 * `quiet` marks a settled state. The list shows every badge; a board card leaves the quiet ones out (Final becomes a
 * check beside the code) so the badges left on the board are only the ones that still need someone (owner 2026-10-22).
 */
export type EntryBadge = { label: string; tone: "success" | "neutral" | "warning"; quiet?: boolean };

/** Free-text search over what the board shows: code, category, location and the shown option's type and brand. */
export function entryMatchesQuery(entry: ScheduleEntryView, needle: string) {
  const shown = shownOptionOf(entry);
  return [entry.code, entry.category, entry.location, shown?.productName, shown?.brandName]
    .some((value) => value?.toLowerCase().includes(needle));
}

export function entryBadges(entry: ScheduleEntryView): EntryBadge[] {
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

export function QuickAddTile({ group, command, projectId, section }: { group: { category: string; rows: ScheduleEntryView[] }; command: Command; projectId: string; section: Section }) {
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
export const categoryKeyOf = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleUpperCase("id-ID");

/**
 * Category picker options: the project's own categories first, then the studio's (template categories,
 * then the prefix dictionary) that the project does not use yet. Typing a name nobody knows creates it.
 */
export function categoryGroups(projectCategories: readonly string[], studio: readonly CategoryChoice[], section: Section, projectLabel: string, disableProject: boolean, typed = ""): CreatableSearchGroup[] {
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
export function NewCategoryInline({ command, projectId, section, categories, categoryChoices, className = "justify-self-start" }: { command: Command; projectId: string; section: Section; categories: readonly string[]; categoryChoices: readonly CategoryChoice[]; className?: string }) {
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

// ── Product fields (manual snapshot) ─────────────────────────────────────────

export type ProductDraft = {
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

export const EMPTY_PRODUCT: ProductDraft = { brandId: "", brandName: "", productName: "", color: "", finishing: "", dimension: "", pattern: "", contact: "", notes: "", extra: [] };

export function productFromOption(option: ScheduleOptionView): ProductDraft {
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

export function toSnapshot(draft: ProductDraft) {
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

export function Footer({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2">{children}</div>;
}
