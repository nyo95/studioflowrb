"use client";

import { ArrowDown, ArrowUp, FileUp, History, ImageIcon, Plus, Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type DragEvent, type ReactNode } from "react";

import {
  SCHEDULE_CARD_FIELD_KEYS,
  SCHEDULE_DEFAULT_CARD_FIELDS,
  extraFieldKey,
  orderCardFields,
  type ScheduleCardFieldKey,
  type ScheduleExtraField,
} from "@/apps/studioflow/domain/schedule";
import {
  Badge,
  Button,
  CreatableSearch,
  Dialog,
  EmptyState,
  Field,
  FilterChip,
  FormActions,
  ImageWorkspace,
  InlineError,
  Input,
  RowActionMenu,
  Select,
  SimpleTextEditor,
  Text,
  Textarea,
  useConfirm,
  type CreatableSearchOption,
} from "@/platform/ui_engine";

import {
  applyScheduleTemplatesAction,
  copyReusableScheduleOptionAction,
  createScheduleEntryAction,
  createScheduleOptionAction,
  deleteScheduleEntryAction,
  deleteScheduleOptionAction,
  importScheduleCsvAction,
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
  updateScheduleOptionAction,
} from "../../../actions";
import { ExtraFieldsEditor } from "../../../_components/extra-fields-editor";
import { useCommand } from "../../../_components/use-command";

type Section = "MATERIAL" | "FIXTURE";
type Brand = { id: string; name: string };

export type ScheduleOptionView = {
  id: string;
  label: string;
  isFinal: boolean;
  status: string;
  brandId: string | null;
  brandName: string | null;
  productName: string;
  color: string | null;
  pattern: string | null;
  finishing: string | null;
  dimension: string | null;
  notes: string | null;
  /** Free-form spec lines beyond the typed columns. */
  extra: ScheduleExtraField[];
  /** Short-lived signed URL of the option photo. */
  imageUrl: string | null;
  /** Latest physical sample request against this option, if any. */
  sampleRequest: ScheduleSampleRequestView | null;
};

export type ScheduleSampleRequestView = {
  id: string;
  status: "REQUESTED" | "RECEIVED";
  requestedFrom: string;
  note: string | null;
  requestedByName: string;
  requestedAt: Date;
  receivedByName: string | null;
  receivedAt: Date | null;
  receivedNote: string | null;
};

export type ScheduleEntryView = {
  id: string;
  section: Section;
  category: string;
  code: string;
  qty: string | null;
  unit: string | null;
  location: string | null;
  /** null = no override; the card renders SCHEDULE_DEFAULT_CARD_FIELDS. */
  cardFields: string[] | null;
  options: ScheduleOptionView[];
};

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

const SECTION_LABEL: Record<Section, string> = { MATERIAL: "Material", FIXTURE: "Fixture" };
const STATUS_LABEL: Record<string, { label: string; tone: "success" | "neutral" | "warning" }> = {
  APPROVED: { label: "Final", tone: "success" },
  DRAFT: { label: "Option", tone: "neutral" },
  NOT_USED: { label: "Not used", tone: "neutral" },
};

type Command = ReturnType<typeof useCommand>;

function specLine(option: Pick<ScheduleOptionView, "color" | "pattern" | "finishing" | "dimension">) {
  return [option.color, option.pattern, option.finishing, option.dimension].filter(Boolean).join(" · ");
}

function finalOf(entry: ScheduleEntryView) {
  return entry.options.find((option) => option.isFinal) ?? null;
}

/**
 * The option a card speaks for: the final one, else the first. Legacy fell back
 * the same way (`selectedCatalogOption`), so a row with one unapproved option
 * still shows its product instead of reading as empty.
 */
function shownOptionOf(entry: ScheduleEntryView) {
  return finalOf(entry) ?? entry.options[0] ?? null;
}

/** The option a template would be made from: the final one, or the only one. */
function templateSourceOf(entry: ScheduleEntryView) {
  return finalOf(entry) ?? (entry.options.length === 1 ? entry.options[0] : null);
}

/** Legacy catalog photos are portrait 4:5. */
const PHOTO_ASPECT = 4 / 5;

/**
 * Photo crop/upload dialog for one option. Shared by the board card's direct
 * "Add photo" overlay and the entry panel's per-option control, so a photo
 * can be set without first opening the panel — matching legacy, where the
 * card's own photo area is the upload trigger.
 */
function SchedulePhotoDialog({
  projectId,
  entryCode,
  option,
  command,
  onClose,
}: {
  projectId: string;
  entryCode: string;
  option: ScheduleOptionView;
  command: Command;
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
    <Dialog
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title={`Photo — ${entryCode} option ${option.label}`}
      description="Choose a photo and crop it to the 4:5 catalog frame."
      size="lg"
      dismissible={!isPending(pendingKey)}
    >
      <div className="grid gap-2">
        <ImageWorkspace label="Schedule photo" aspect={PHOTO_ASPECT} maxDimension={1600} outputType="image/jpeg" onPrepared={onPrepared} disabled={isPending(pendingKey)} />
        {photoError ? <InlineError>{photoError}</InlineError> : null}
      </div>
    </Dialog>
  );
}

/** Physical sample request (owner, 2026-09-23): stays entirely inside StudioFlow — never writes to Master Data. */
function SampleRequestDialog({
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
    <Dialog
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title={`Request sample — ${option.productName}`}
      description="Tracked in StudioFlow only; adding the SKU and price to Master Data once the sample arrives is a separate, manual step."
      size="sm"
      dismissible={!isPending(pendingKey)}
    >
      <form className="grid gap-3" onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(pendingKey, () => requestScheduleSampleAction({ projectId, optionId: option.id, requestedFrom, note: note || undefined }));
        if (ok) onClose();
      }}>
        <Field label="Requested from" required description="Vendor or supplier name">
          <Input autoFocus value={requestedFrom} maxLength={200} onChange={(e) => setRequestedFrom(e.target.value)} />
        </Field>
        <Field label="Note (optional)"><Textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" onClick={onClose} disabled={isPending(pendingKey)}>Cancel</Button>
          <Button type="submit" variant="primary" pending={isPending(pendingKey)} disabled={!requestedFrom.trim()}>Request sample</Button>
        </FormActions>
      </form>
    </Dialog>
  );
}

/**
 * One label per field, used on the card and in the edit form alike. Type is the
 * product designation ("Nude Pro - ATS 1132 M"): it is the card's title, always
 * shown, so it is not in this list.
 */
const CARD_FIELD_LABEL: Record<ScheduleCardFieldKey, string> = {
  brand: "Brand",
  color: "Color",
  pattern: "Pattern",
  finishing: "Finishing",
  dimension: "Size",
  location: "Location",
  qty: "Qty",
  notes: "Notes",
};

/** Simple single-input option fields between Type and Location in the checklist; Brand, Size and Notes get their own row shape. */
const SIMPLE_OPTION_FIELD_KEYS = ["color", "pattern", "finishing"] as const;

/** The free-form spec lines a card can caption, in the order they sit on the option. */
function extraChoicesOf(entry: ScheduleEntryView): Array<{ key: string; label: string }> {
  const shown = shownOptionOf(entry);
  return (shown?.extra ?? []).map((field) => ({ key: extraFieldKey(field.label), label: field.label }));
}

function cardFieldLabel(key: string, extras: ReadonlyArray<{ key: string; label: string }>): string {
  return CARD_FIELD_LABEL[key as ScheduleCardFieldKey] ?? extras.find((extra) => extra.key === key)?.label ?? key;
}

/**
 * Which fields caption a board card. `cardFields === null` means "no override"
 * and renders the default set plus every extra spec line the option carries;
 * an array is an explicit, ordered choice and may legitimately be empty.
 * Matches legacy's null-vs-list `catalog_fields` and its "Use project default".
 */
function effectiveCardFields(entry: ScheduleEntryView): string[] {
  const extras = extraChoicesOf(entry);
  if (entry.cardFields !== null) return orderCardFields(entry.cardFields, extras.map((extra) => extra.key));
  return orderCardFields([...SCHEDULE_DEFAULT_CARD_FIELDS, ...extras.map((extra) => extra.key)], extras.map((extra) => extra.key));
}

/** The current display value for each selectable card field — what the board card itself renders. */
function cardFieldValuesOf(entry: ScheduleEntryView): Record<string, string | null | undefined> {
  const shown = shownOptionOf(entry);
  const quantity = entry.qty ? `${entry.qty}${entry.unit ? ` ${entry.unit}` : ""}` : null;
  return {
    brand: shown?.brandName,
    color: shown?.color,
    pattern: shown?.pattern,
    finishing: shown?.finishing,
    dimension: shown?.dimension,
    location: entry.location,
    qty: quantity,
    notes: shown?.notes,
    ...Object.fromEntries((shown?.extra ?? []).map((field) => [extraFieldKey(field.label), field.value])),
  };
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

// ── Board view ─────────────────────────────────────────────────────────────

function BoardView({
  projectId,
  groups,
  command,
  onOpen,
  canEdit,
  canManageTemplates,
  onMoveCategory,
  onDelete,
  onReorder,
  onQuickPhoto,
}: {
  projectId: string;
  groups: Array<{ category: string; rows: ScheduleEntryView[] }>;
  command: Command;
  onOpen: (id: string) => void;
  canEdit: boolean;
  canManageTemplates: boolean;
  onMoveCategory: (entry: ScheduleEntryView) => void;
  onDelete: (entry: ScheduleEntryView) => void;
  onReorder: (rows: ScheduleEntryView[], draggedId: string, targetId: string) => void;
  onQuickPhoto: (entry: ScheduleEntryView, option: ScheduleOptionView) => void;
}) {
  const { draggingId, dragOverId, start, end, over, leave } = useRowDrag();
  return (
    <div className="@container grid gap-10 p-(--ui-section-px)">
      {groups.map((group) => (
        <section key={group.category} className="flex gap-4" aria-label={group.category}>
          {/* Legacy catalog: the category runs up a ruled rail beside its cards. */}
          <div className="flex w-6 shrink-0 justify-center border-l border-ink">
            <h3 className="m-0 whitespace-nowrap text-label text-ink [writing-mode:vertical-rl] rotate-180">
              {group.category}
              <span className="ml-2 font-normal text-ink-tertiary">{group.rows.length}</span>
            </h3>
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-2 items-start gap-x-5 gap-y-8 @2xl:grid-cols-3 @4xl:grid-cols-4">
            {group.rows.map((entry) => {
              const final = finalOf(entry);
              const shown = shownOptionOf(entry);
              const extras = extraChoicesOf(entry);
              const fieldValue = cardFieldValuesOf(entry);
              const details: Array<[string, string | null | undefined]> = effectiveCardFields(entry)
                .map((key) => [cardFieldLabel(key, extras), fieldValue[key]] as [string, string | null | undefined]);
              const photoTarget = templateSourceOf(entry);
              return (
                <button
                  key={entry.id}
                  type="button"
                  draggable={canEdit}
                  onDragStart={start(entry.id)}
                  onDragEnd={end}
                  onDragOver={over(entry.id, canEdit)}
                  onDragLeave={leave(entry.id)}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggingId) onReorder(group.rows, draggingId, entry.id);
                    end();
                  }}
                  onClick={() => onOpen(entry.id)}
                  className={`group grid min-w-0 content-start text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-line-focus ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${draggingId === entry.id ? "opacity-40" : ""} ${dragOverId === entry.id && draggingId && draggingId !== entry.id ? "outline-2 outline-dashed outline-offset-2 outline-line-focus" : ""}`}
                >
                  <span className="relative mb-2.5 block aspect-[4/5] w-full overflow-hidden bg-surface-muted">
                    {shown?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={shown.imageUrl} alt={shown.productName} className="h-full w-full object-cover transition-opacity group-hover:opacity-90" draggable={false} />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center text-micro tracking-[0.18em] text-ink-tertiary">NO IMAGE</span>
                    )}
                    <span className="absolute right-2 top-2 rounded-action bg-surface/90 px-1.5 py-0.5 font-ui-mono text-micro font-bold tabular-nums text-ink">{entry.code}</span>
                    {final?.status === "APPROVED" || entry.options.length > 1 ? (
                      <span className="absolute bottom-2 left-2 flex gap-1">
                        {final?.status === "APPROVED" ? <Badge tone="success">Final</Badge> : null}
                        {entry.options.length > 1 ? <Badge>{entry.options.length} options</Badge> : null}
                      </span>
                    ) : null}
                    {canEdit && photoTarget ? (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={photoTarget.imageUrl ? `Change photo of ${entry.code}` : `Add photo to ${entry.code}`}
                        title={photoTarget.imageUrl ? "Change photo" : "Add photo"}
                        onClick={(event) => { event.stopPropagation(); onQuickPhoto(entry, photoTarget); }}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onQuickPhoto(entry, photoTarget); } }}
                        className="absolute inset-0 grid place-items-center opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <span className="rounded-action bg-ink/70 px-2 py-1 text-micro font-semibold uppercase tracking-[0.1em] text-surface">
                          {photoTarget.imageUrl ? "Change photo" : "+ Add photo"}
                        </span>
                      </span>
                    ) : null}
                  </span>
                  {shown ? (
                    <span className="font-display text-sm font-semibold uppercase leading-tight text-ink">{shown.productName}</span>
                  ) : (
                    <span className="text-sm italic text-ink-tertiary">Reserved — no product yet</span>
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
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Stat bar ──────────────────────────────────────────────────────────────────

function StatBar({ entries, section }: { entries: readonly ScheduleEntryView[]; section: Section }) {
  const sectionEntries = useMemo(() => entries.filter((e) => e.section === section), [entries, section]);
  const total = sectionEntries.length;
  const finalized = sectionEntries.filter((e) => e.options.some((o) => o.isFinal)).length;
  const withPhotos = sectionEntries.filter((e) => e.options.some((o) => o.imageUrl !== null)).length;
  if (total === 0) return null;
  return (
    <div className="flex gap-4 border-b border-line-subtle px-(--ui-section-px) py-2 text-sm text-ink-secondary">
      <span><span className="font-semibold text-ink">{finalized}</span> / {total} finalized</span>
      <span><span className="font-semibold text-ink">{withPhotos}</span> photos</span>
    </div>
  );
}

export function ScheduleBoard({
  projectId,
  entries,
  brands,
  canEdit,
  canManageTemplates,
  settingsHref,
}: {
  projectId: string;
  entries: readonly ScheduleEntryView[];
  brands: readonly Brand[];
  canEdit: boolean;
  /** Studio settings permission: template settings link and "Save as template". */
  canManageTemplates: boolean;
  settingsHref: string;
}) {
  const command = useCommand();
  const { run, isPending, error } = command;
  const confirm = useConfirm();
  const [section, setSection] = useState<Section>(() => (entries.some((e) => e.section === "MATERIAL") || !entries.length ? "MATERIAL" : "FIXTURE"));
  const [viewMode, setViewMode] = useState<"list" | "board">("board");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "add" | "import" | { move: ScheduleEntryView }>(null);
  const [quickPhoto, setQuickPhoto] = useState<{ entry: ScheduleEntryView; option: ScheduleOptionView } | null>(null);
  const listDrag = useRowDrag();

  const counts = useMemo(() => ({
    MATERIAL: entries.filter((e) => e.section === "MATERIAL").length,
    FIXTURE: entries.filter((e) => e.section === "FIXTURE").length,
  }), [entries]);

  const groups = useMemo(() => {
    const map = new Map<string, ScheduleEntryView[]>();
    for (const entry of entries) {
      if (entry.section !== section) continue;
      map.set(entry.category, [...(map.get(entry.category) ?? []), entry]);
    }
    return [...map.entries()].map(([category, rows]) => ({ category, rows }));
  }, [entries, section]);

  const categories = useMemo(() => [...new Set(entries.filter((e) => e.section === section).map((e) => e.category))], [entries, section]);
  const open = entries.find((entry) => entry.id === openId) ?? null;

  const removeEntry = async (entry: ScheduleEntryView) => {
    const ok = await confirm.confirm({
      title: `Delete ${entry.code}?`,
      description: "The item and all its options are removed. Later codes in this group move up to close the gap.",
      confirmLabel: "Delete item",
      tone: "danger",
    });
    if (!ok) return;
    if (await run(`${entry.id}-delete`, () => deleteScheduleEntryAction({ projectId, entryId: entry.id }))) setOpenId(null);
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
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Schedule section">
          {(["MATERIAL", "FIXTURE"] as const).map((key) => (
            <FilterChip key={key} selected={section === key} count={counts[key]} onClick={() => setSection(key)}>
              {SECTION_LABEL[key]}
            </FilterChip>
          ))}
          <span className="mx-1 h-5 w-px bg-line-subtle" aria-hidden="true" />
          <button type="button" onClick={() => setViewMode("list")} className={`inline-flex min-h-[--ui-control-height-sm] items-center gap-1 rounded-control px-2 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-surface-muted text-ink" : "text-ink-secondary hover:bg-surface-muted hover:text-ink"}`} aria-pressed={viewMode === "list"}>List</button>
          <button type="button" onClick={() => setViewMode("board")} className={`inline-flex min-h-[--ui-control-height-sm] items-center gap-1 rounded-control px-2 text-xs font-medium transition-colors ${viewMode === "board" ? "bg-surface-muted text-ink" : "text-ink-secondary hover:bg-surface-muted hover:text-ink"}`} aria-pressed={viewMode === "board"}>Board</button>
        </div>
        {canEdit || canManageTemplates ? (
          <div className="flex flex-wrap gap-2">
            {canManageTemplates ? (
              <Link
                prefetch={false}
                href={`${settingsHref}#product-schedule`}
                className="inline-flex min-h-(--ui-control-height-sm) items-center gap-1.5 rounded-control px-2.5 text-xs font-medium text-ink-secondary hover:bg-surface-muted hover:text-ink"
              >
                <Settings2 aria-hidden="true" className="h-3.5 w-3.5" /> Template settings
              </Link>
            ) : null}
            {canEdit ? <>
            <Button size="sm" variant="ghost" pending={isPending("templates")} onClick={() => run("templates", () => applyScheduleTemplatesAction({ projectId }))}>
              Apply templates
            </Button>
            <Button size="sm" variant="secondary" leadingIcon={<FileUp className="h-3.5 w-3.5" />} onClick={() => setDialog("import")}>
              Import CSV
            </Button>
            <Button size="sm" variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDialog("add")}>
              Add item
            </Button>
            </> : null}
          </div>
        ) : null}
      </div>

      <StatBar entries={entries} section={section} />

      {error && !open && !dialog ? <InlineError className="px-(--ui-section-px) pt-2">{error}</InlineError> : null}

      {groups.length === 0 ? (
        <EmptyState
          title={`No ${SECTION_LABEL[section].toLowerCase()} items yet`}
          description={canEdit ? "Add an item, apply the studio templates, or import the Google Sheets schedule." : "This project has no schedule items in this section."}
          className="py-10"
        />
      ) : (
        <div className="grid">
          <div className="min-w-0">
            {viewMode === "board" ? (
              <BoardView
                projectId={projectId}
                groups={groups}
                command={command}
                onOpen={setOpenId}
                canEdit={canEdit}
                canManageTemplates={canManageTemplates}
                onMoveCategory={(entry) => setDialog({ move: entry })}
                onDelete={removeEntry}
                onReorder={reorderGroup}
                onQuickPhoto={(entry, option) => setQuickPhoto({ entry, option })}
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
                            draggable={canEdit}
                            onDragStart={listDrag.start(entry.id)}
                            onDragEnd={listDrag.end}
                            onDragOver={listDrag.over(entry.id, canEdit)}
                            onDragLeave={listDrag.leave(entry.id)}
                            onDrop={(event) => {
                              event.preventDefault();
                              if (listDrag.draggingId) reorderGroup(group.rows, listDrag.draggingId, entry.id);
                              listDrag.end();
                            }}
                            className={`flex items-center gap-3 px-(--ui-section-px) py-2.5 ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${open?.id === entry.id ? "bg-surface-muted" : "hover:bg-surface-muted"} ${listDrag.draggingId === entry.id ? "opacity-40" : ""} ${listDrag.dragOverId === entry.id && listDrag.draggingId && listDrag.draggingId !== entry.id ? "outline-2 outline-dashed outline-offset-[-2px] outline-line-focus" : ""}`}
                          >
                            <button type="button" onClick={() => setOpenId(entry.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
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
                              {entry.options.length > 1 ? <Badge>{entry.options.length} options</Badge> : null}
                            </button>
                            {canEdit || canManageTemplates ? (
                              <RowActionMenu
                                label={`Actions for ${entry.code}`}
                                pending={busy}
                                items={[
                                  { label: "Open", onSelect: () => setOpenId(entry.id) },
                                  ...(canManageTemplates && templateSourceOf(entry)
                                    ? [{ label: "Save as template item", onSelect: () => void run(`${entry.id}-template`, () => saveScheduleEntryAsTemplateAction({ projectId, entryId: entry.id })) }]
                                    : []),
                                  ...(canEdit ? [
                                    { label: "Move up", icon: <ArrowUp className="h-3.5 w-3.5" />, disabled: index === 0, separatorBefore: true, onSelect: () => void run(`${entry.id}-move`, () => moveScheduleEntryAction({ projectId, entryId: entry.id, direction: "up" })) },
                                    { label: "Move down", icon: <ArrowDown className="h-3.5 w-3.5" />, disabled: index === group.rows.length - 1, onSelect: () => void run(`${entry.id}-move`, () => moveScheduleEntryAction({ projectId, entryId: entry.id, direction: "down" })) },
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
        <EntryDialog
          key={open.id}
          projectId={projectId}
          entry={open}
          brands={brands}
          canEdit={canEdit}
          command={command}
          confirm={confirm.confirm}
          onClose={() => setOpenId(null)}
        />
      ) : null}

      {dialog === "add" ? (
        <AddItemDialog projectId={projectId} section={section} categories={categories} brands={brands} command={command} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "import" ? <ImportDialog projectId={projectId} section={section} command={command} onClose={() => setDialog(null)} /> : null}
      {dialog && typeof dialog === "object" ? (
        <MoveDialog projectId={projectId} entry={dialog.move} categories={categories} command={command} onClose={() => setDialog(null)} />
      ) : null}
      {quickPhoto ? (
        <SchedulePhotoDialog projectId={projectId} entryCode={quickPhoto.entry.code} option={quickPhoto.option} command={command} onClose={() => setQuickPhoto(null)} />
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

function ProductFields({ value, onChange, brands, extraBrand }: { value: ProductDraft; onChange: (next: ProductDraft) => void; brands: readonly Brand[]; extraBrand?: Brand | null }) {
  const set = (key: keyof ProductDraft) => (event: { target: { value: string } }) => onChange({ ...value, [key]: event.target.value });
  const brandOptions = extraBrand && !brands.some((b) => b.id === extraBrand.id) ? [extraBrand, ...brands] : brands;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Type" required className="sm:col-span-2" description="The product designation, e.g. “Nude Pro - ATS 1132 M”. It is the card title.">
        <Input value={value.productName} onChange={set("productName")} maxLength={200} placeholder="e.g. Nude Pro - ATS 1132 M" />
      </Field>
      <Field label="Brand">
        <Select value={value.brandId} onChange={(e) => onChange({ ...value, brandId: e.target.value, brandName: e.target.value ? "" : value.brandName })}>
          <option value="">Other (type the name)</option>
          {brandOptions.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </Select>
      </Field>
      <Field label="Brand name" description={value.brandId ? "Taken from Master Data." : undefined}>
        <Input value={value.brandId ? brandOptions.find((b) => b.id === value.brandId)?.name ?? "" : value.brandName} onChange={set("brandName")} disabled={!!value.brandId} maxLength={160} />
      </Field>
      <Field label="Color"><Input value={value.color} onChange={set("color")} maxLength={160} /></Field>
      <Field label="Pattern"><Input value={value.pattern} onChange={set("pattern")} maxLength={160} /></Field>
      <Field label="Finishing"><Input value={value.finishing} onChange={set("finishing")} maxLength={160} /></Field>
      <Field label="Size"><Input value={value.dimension} onChange={set("dimension")} maxLength={160} placeholder="e.g. 60 × 60 cm" /></Field>
      <Field label="Notes" className="sm:col-span-2">
        <Textarea value={value.notes} onChange={set("notes")} maxLength={2000} rows={2} className="min-h-[60px]" />
      </Field>
      <div className="sm:col-span-2">
        <ExtraFieldsEditor value={value.extra} onChange={(extra) => onChange({ ...value, extra })} />
      </div>
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2">{children}</div>;
}

/**
 * Edit an existing option's fields in place, no dialog. Legacy edits product
 * fields by clicking straight into them on the card; this keeps that "no
 * navigation, no modal" property while editing every field in one save
 * (rather than one commit per keystroke-field), since these fields are
 * naturally edited together as one product record.
 */
function OptionInlineForm({ projectId, option, brands, command, onClose }: { projectId: string; option: ScheduleOptionView; brands: readonly Brand[]; command: Command; onClose: () => void }) {
  const [product, setProduct] = useState<ProductDraft>(productFromOption(option));
  const key = `${option.id}-inline`;
  const pending = command.isPending(key);

  const save = async () => {
    const ok = await command.run(key, () => updateScheduleOptionAction({ projectId, optionId: option.id, snapshot: toSnapshot(product) }));
    if (ok) onClose();
  };

  return (
    <div className="grid gap-3">
      <ProductFields value={product} onChange={setProduct} brands={brands} extraBrand={option.brandId ? { id: option.brandId, name: option.brandName ?? "Brand" } : null} />
      {command.error ? <InlineError>{command.error}</InlineError> : null}
      <Footer>
        <Button type="button" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button type="button" variant="primary" pending={pending} disabled={!product.productName.trim()} onClick={() => void save()}>Save option</Button>
      </Footer>
    </div>
  );
}

// ── Add item ─────────────────────────────────────────────────────────────────

function AddItemDialog({ projectId, section, categories, brands, command, onClose }: { projectId: string; section: Section; categories: string[]; brands: readonly Brand[]; command: Command; onClose: () => void }) {
  const [targetSection, setTargetSection] = useState<Section>(section);
  const [category, setCategory] = useState(categories[0] ?? "");
  const [withProduct, setWithProduct] = useState(true);
  const [product, setProduct] = useState<ProductDraft>(EMPTY_PRODUCT);
  const [qty, setQty] = useState({ qty: "", unit: "", location: "" });
  const pending = command.isPending("add-item");
  const canSave = category.trim() && (!withProduct || product.productName.trim());

  const save = async () => {
    const ok = await command.run("add-item", () => createScheduleEntryAction({
      projectId,
      section: targetSection,
      category: category.trim(),
      qty: qty.qty.trim() || null,
      unit: qty.unit.trim() || null,
      location: qty.location.trim() || null,
      snapshot: withProduct ? toSnapshot(product) : null,
    }));
    if (ok) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title="Add schedule item"
      description="The code is assigned from the category prefix (for example PT-03)."
      size="lg"
      dismissible={!pending}
      footer={<Footer><Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button><Button variant="primary" pending={pending} disabled={!canSave} onClick={save}>Add item</Button></Footer>}
    >
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Section">
            <Select value={targetSection} onChange={(e) => setTargetSection(e.target.value as Section)}>
              <option value="MATERIAL">Material</option>
              <option value="FIXTURE">Fixture</option>
            </Select>
          </Field>
          <Field label="Category" required description="Pick an existing one or type a new category.">
            <Input list="schedule-categories" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={80} placeholder="e.g. Paint" />
          </Field>
          <datalist id="schedule-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <Field label="Location"><Input value={qty.location} onChange={(e) => setQty({ ...qty, location: e.target.value })} maxLength={160} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qty"><Input inputMode="decimal" value={qty.qty} onChange={(e) => setQty({ ...qty, qty: e.target.value })} maxLength={20} /></Field>
            <Field label="Unit"><Input value={qty.unit} onChange={(e) => setQty({ ...qty, unit: e.target.value })} maxLength={40} /></Field>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Item content">
          <FilterChip selected={withProduct} onClick={() => setWithProduct(true)}>With product</FilterChip>
          <FilterChip selected={!withProduct} onClick={() => setWithProduct(false)}>Reserve code only</FilterChip>
        </div>
        {withProduct ? <ProductFields value={product} onChange={setProduct} brands={brands} /> : <Text tone="secondary" size="sm">The code is reserved now; add options later from the item panel.</Text>}
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Dialog>
  );
}

/**
 * One row of the unified checklist: a checkbox and, only once it is checked,
 * the input(s) that fill the field in — so ticking a field is never blocked
 * by it being empty (that was the point of ticking it), and there is one
 * place per field instead of a visibility toggle here and a value form
 * elsewhere (owner decision 2026-09-23, closer to legacy's per-card inline
 * editing than a separate popover ever was).
 */
function ChecklistRow({
  label,
  checked,
  disabled,
  disabledHint,
  onToggle,
  className,
  children,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  disabledHint?: string;
  onToggle: () => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-control border ${checked ? "border-line-subtle" : "border-transparent"} ${className ?? ""}`}>
      <label
        title={disabled ? disabledHint : undefined}
        className={`flex items-center gap-2 rounded-control px-1.5 py-1.5 text-sm ${disabled ? "text-ink-tertiary" : "hover:bg-surface-muted"}`}
      >
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
        {label}
      </label>
      {checked && children ? <div className="px-1.5 pb-2 pt-0.5">{children}</div> : null}
    </div>
  );
}

// ── Entry panel content (the body of EntryDialog) ──────────────────────────────

function EntryPanelContent({
  projectId,
  entry,
  brands,
  canEdit,
  command,
  confirm,
  onClose,
}: {
  projectId: string;
  entry: ScheduleEntryView;
  brands: readonly Brand[];
  canEdit: boolean;
  command: Command;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  onClose: () => void;
}) {
  const { run, isPending } = command;
  const initial = { qty: entry.qty ?? "", unit: entry.unit ?? "", location: entry.location ?? "" };
  const [fields, setFields] = useState(initial);
  const [editing, setEditing] = useState<ScheduleOptionView | "new" | null>(null);
  const [reuse, setReuse] = useState(false);
  const [photoFor, setPhotoFor] = useState<ScheduleOptionView | null>(null);
  const [inlineEdit, setInlineEdit] = useState<string | null>(null);
  const [sampleFor, setSampleFor] = useState<ScheduleOptionView | null>(null);

  // The checklist edits the option the card itself speaks for — same rule as
  // the card face (shownOptionOf). Local draft mirrors it and resyncs if a
  // different option becomes shown (e.g. another one is marked final) while
  // this dialog stays open.
  const shown = shownOptionOf(entry);
  const [optionDraft, setOptionDraft] = useState<ProductDraft>(() => (shown ? productFromOption(shown) : EMPTY_PRODUCT));
  // Adjust state during render rather than in an effect (React's own pattern
  // for "reset a draft when its source identity changes"): only the shown
  // option's identity resyncs the draft, not every keystroke it holds.
  const [shownIdSeen, setShownIdSeen] = useState(shown?.id ?? null);
  if (shown?.id !== shownIdSeen) {
    setShownIdSeen(shown?.id ?? null);
    setOptionDraft(shown ? productFromOption(shown) : EMPTY_PRODUCT);
  }

  const entryFieldsKey = `${entry.id}-fields`;
  const saveLocation = () => {
    if (fields.location === initial.location) return;
    void run(entryFieldsKey, () => updateScheduleEntryAction({ projectId, entryId: entry.id, location: fields.location.trim() || null }));
  };
  const saveQty = () => {
    if (fields.qty === initial.qty && fields.unit === initial.unit) return;
    void run(entryFieldsKey, () => updateScheduleEntryAction({ projectId, entryId: entry.id, qty: fields.qty.trim() || null, unit: fields.unit.trim() || null }));
  };

  const optionFieldsKey = `${entry.id}-option-fields`;
  const setOptionField = (key: keyof ProductDraft) => (event: { target: { value: string } }) =>
    setOptionDraft((current) => ({ ...current, [key]: event.target.value }));
  const saveOptionDraft = (next: ProductDraft) => {
    if (!shown) return;
    void run(optionFieldsKey, () => updateScheduleOptionAction({ projectId, optionId: shown.id, snapshot: toSnapshot(next) }));
  };
  const brandOptions = shown?.brandId && !brands.some((b) => b.id === shown.brandId)
    ? [{ id: shown.brandId, name: shown.brandName ?? "Brand" }, ...brands]
    : brands;
  // One combobox instead of a select-plus-fallback-input pair: search Master
  // Data, or type a name that is not in it — no Master Data write happens
  // either way (StudioFlow never writes Master Data; brand text with no
  // catalogued id is the documented, ordinary case, §11.3). The typed name
  // itself doubles as its own option id so the trigger still shows it.
  const isKnownBrandId = (id: string) => brandOptions.some((b) => b.id === id);
  const brandSearchOptions: CreatableSearchOption[] = [
    ...brandOptions.map((b) => ({ id: b.id, label: b.name })),
    ...(!optionDraft.brandId && optionDraft.brandName.trim()
      ? [{ id: optionDraft.brandName, label: optionDraft.brandName, description: "Typed — not in Master Data" }]
      : []),
  ];
  const handleBrandChange = (next: string) => {
    const draft = isKnownBrandId(next)
      ? { ...optionDraft, brandId: next, brandName: "" }
      : { ...optionDraft, brandId: "", brandName: next };
    setOptionDraft(draft);
    saveOptionDraft(draft);
  };

  const cardFieldsKey = `${entry.id}-card-fields`;
  const extraChoices = extraChoicesOf(entry);
  const effectiveFields = effectiveCardFields(entry);
  const saveCardFields = (values: readonly string[] | null) =>
    void run(cardFieldsKey, () => updateScheduleEntryCardFieldsAction({ projectId, entryId: entry.id, fields: values === null ? null : [...values] }));
  // Unchecking everything is a real choice (photo, code and title only), not a
  // reset — `null` is the reset, and "Use default" below is how it is reached.
  // Ticking is never blocked by the field being empty — ticking is how a field
  // starts being filled in (owner decision 2026-09-23; the old "grey out an
  // empty field" rule made an empty field un-tickable, which was the opposite
  // of useful for "I don't know the brand yet, but note it here").
  const toggleCardField = (field: string) =>
    saveCardFields(effectiveFields.includes(field) ? effectiveFields.filter((key) => key !== field) : [...effectiveFields, field]);

  const removePhoto = async (option: ScheduleOptionView) => {
    const ok = await confirm({
      title: `Remove the photo of option ${option.label}?`,
      description: "The option keeps its product details.",
      confirmLabel: "Remove photo",
      tone: "danger",
    });
    if (ok) await run(`${entry.id}-opt-${option.id}`, () => removeScheduleOptionImageAction({ projectId, optionId: option.id }));
  };

  const removeOption = async (option: ScheduleOptionView) => {
    const ok = await confirm({
      title: `Delete option ${option.label}?`,
      description: option.isFinal ? "This is the final option; the next option becomes final." : "The option is removed from this item.",
      confirmLabel: "Delete option",
      tone: "danger",
    });
    if (ok) await run(`${entry.id}-opt-${option.id}`, () => deleteScheduleOptionAction({ projectId, optionId: option.id }));
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Text weight="semibold">Card content</Text>
        <Text size="sm" tone="tertiary">
          {entry.cardFields === null ? "Using the default set." : "Custom for this item."} Tick a field to fill it in and put it on
          the card; Type and the photo always show. Unticking hides it without losing what you typed.
        </Text>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <ChecklistRow
            label="Brand"
            checked={effectiveFields.includes("brand")}
            disabled={!canEdit || isPending(cardFieldsKey) || !shown}
            disabledHint={!shown ? "Add an option below first." : undefined}
            onToggle={() => toggleCardField("brand")}
          >
            <CreatableSearch
              label="Brand"
              options={brandSearchOptions}
              value={optionDraft.brandId || optionDraft.brandName}
              onValueChange={handleBrandChange}
              onCreate={(text) => text}
              createLabel={(text) => `Use "${text}" (not in Master Data)`}
              placeholder="Search or type a brand"
              searchPlaceholder="Search brands…"
              emptyLabel="No brands found"
              allowClear
              disabled={!canEdit || isPending(optionFieldsKey)}
              className="w-full"
            />
          </ChecklistRow>

          {/* Type has no checkbox — it is the card title and always shows (§11.3). */}
          <div className="rounded-control border border-line-subtle">
            <div
              title={!shown ? "Add an option below first." : undefined}
              className={`flex items-center gap-2 rounded-control px-1.5 py-1.5 text-sm ${!shown ? "text-ink-tertiary" : ""}`}
            >
              Type <span className="text-xs font-normal text-ink-tertiary">always shown</span>
            </div>
            <div className="px-1.5 pb-2 pt-0.5">
              <Input
                value={optionDraft.productName}
                onChange={setOptionField("productName")}
                onBlur={() => saveOptionDraft(optionDraft)}
                disabled={!canEdit || isPending(optionFieldsKey) || !shown}
                maxLength={200}
                placeholder="e.g. Nude Pro - ATS 1132 M"
              />
            </div>
          </div>

          {SIMPLE_OPTION_FIELD_KEYS.map((key) => (
            <ChecklistRow
              key={key}
              label={CARD_FIELD_LABEL[key]}
              checked={effectiveFields.includes(key)}
              disabled={!canEdit || isPending(cardFieldsKey) || !shown}
              disabledHint={!shown ? "Add an option below first." : undefined}
              onToggle={() => toggleCardField(key)}
            >
              <Input
                autoFocus
                value={optionDraft[key]}
                onChange={setOptionField(key)}
                onBlur={() => saveOptionDraft(optionDraft)}
                disabled={!canEdit || isPending(optionFieldsKey)}
                maxLength={160}
              />
            </ChecklistRow>
          ))}

          <ChecklistRow label="Location" checked={effectiveFields.includes("location")} disabled={!canEdit || isPending(cardFieldsKey)} onToggle={() => toggleCardField("location")}>
            <Input
              autoFocus
              value={fields.location}
              onChange={(e) => setFields({ ...fields, location: e.target.value })}
              onBlur={saveLocation}
              disabled={!canEdit || isPending(entryFieldsKey)}
              maxLength={160}
            />
          </ChecklistRow>

          {/* Qty only for Fixture — a Material line is specified, not counted; legacy's own sheet import already discards Qty on Material (owner decision 2026-09-23). */}
          {entry.section === "FIXTURE" ? (
            <ChecklistRow label="Qty" checked={effectiveFields.includes("qty")} disabled={!canEdit || isPending(cardFieldsKey)} onToggle={() => toggleCardField("qty")}>
              <div className="grid grid-cols-[1fr_5.5rem] gap-1.5">
                <Input autoFocus inputMode="decimal" value={fields.qty} onChange={(e) => setFields({ ...fields, qty: e.target.value })} onBlur={saveQty} disabled={!canEdit || isPending(entryFieldsKey)} maxLength={20} />
                <Input placeholder="Unit" value={fields.unit} onChange={(e) => setFields({ ...fields, unit: e.target.value })} onBlur={saveQty} disabled={!canEdit || isPending(entryFieldsKey)} maxLength={40} />
              </div>
            </ChecklistRow>
          ) : null}

          <ChecklistRow
            label="Size"
            checked={effectiveFields.includes("dimension")}
            disabled={!canEdit || isPending(cardFieldsKey) || !shown}
            disabledHint={!shown ? "Add an option below first." : undefined}
            onToggle={() => toggleCardField("dimension")}
          >
            <Input
              autoFocus
              value={optionDraft.dimension}
              onChange={setOptionField("dimension")}
              onBlur={() => saveOptionDraft(optionDraft)}
              disabled={!canEdit || isPending(optionFieldsKey)}
              maxLength={160}
              placeholder="e.g. 60 × 60 cm"
            />
          </ChecklistRow>

          <ChecklistRow
            className="sm:col-span-2"
            label="Notes"
            checked={effectiveFields.includes("notes")}
            disabled={!canEdit || isPending(cardFieldsKey) || !shown}
            disabledHint={!shown ? "Add an option below first." : undefined}
            onToggle={() => toggleCardField("notes")}
          >
            <SimpleTextEditor autoFocus value={optionDraft.notes} onChange={setOptionField("notes")} onBlur={() => saveOptionDraft(optionDraft)} disabled={!canEdit || isPending(optionFieldsKey)} maxLength={2000} rows={2} />
          </ChecklistRow>

          {extraChoices.map((extra) => (
            <ChecklistRow
              key={extra.key}
              label={extra.label}
              checked={effectiveFields.includes(extra.key)}
              disabled={!canEdit || isPending(cardFieldsKey)}
              onToggle={() => toggleCardField(extra.key)}
            />
          ))}
        </div>
        {canEdit && entry.cardFields !== null ? (
          <button type="button" disabled={isPending(cardFieldsKey)} onClick={() => saveCardFields(null)} className="justify-self-start text-xs font-medium text-ink-secondary hover:text-ink hover:underline">
            Use default
          </button>
        ) : null}
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text weight="semibold">Spec options</Text>
          {canEdit ? (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" leadingIcon={<History className="h-3.5 w-3.5" />} onClick={() => setReuse(true)}>From past project</Button>
              <Button size="sm" variant="secondary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing("new")}>Add option</Button>
            </div>
          ) : null}
        </div>

        {/* Option chip nav */}
        {entry.options.length > 1 ? (
          <div className="flex gap-1.5" role="group" aria-label="Jump to option">
            {entry.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => document.getElementById(`opt-${opt.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
                className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-2 text-xs font-semibold transition-colors ${
                  opt.isFinal
                    ? "border border-success-line bg-success-surface text-success-ink"
                    : "border border-line bg-surface-muted text-ink-secondary hover:border-line-subtle hover:text-ink"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}

        {entry.options.length === 0 ? (
          <Text tone="tertiary" size="sm">No product yet. Add an option or copy one from a past project.</Text>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {entry.options.map((option) => {
              const status = STATUS_LABEL[option.status] ?? STATUS_LABEL.DRAFT;
              if (inlineEdit === option.id) {
                return (
                  <li id={`opt-${option.id}`} key={option.id} className="rounded-control border border-line-focus bg-surface px-3 py-2.5">
                    <OptionInlineForm projectId={projectId} option={option} brands={brands} command={command} onClose={() => setInlineEdit(null)} />
                  </li>
                );
              }
              return (
                <li id={`opt-${option.id}`} key={option.id} className={`rounded-control border px-3 py-2 ${option.isFinal ? "border-success-line bg-success-surface/40" : "border-line"}`}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 font-ui-mono text-sm font-semibold">{option.label}</span>
                    <div className="grid shrink-0 justify-items-center gap-1">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => { setPhotoFor(option); }}
                          aria-label={option.imageUrl ? `Change photo of option ${option.label}` : `Add photo to option ${option.label}`}
                          title={option.imageUrl ? "Change photo" : "Add photo"}
                          className="rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus"
                        >
                          <Thumb url={option.imageUrl} alt={option.productName} className="h-20 w-16" />
                        </button>
                      ) : (
                        <Thumb url={option.imageUrl} alt={option.productName} className="h-20 w-16" />
                      )}
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => { setPhotoFor(option); }}
                          className="text-xs font-medium text-ink-secondary hover:text-ink hover:underline"
                        >
                          {option.imageUrl ? "Change photo" : "Add photo"}
                        </button>
                      ) : null}
                    </div>
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      {canEdit ? (
                        <button type="button" onClick={() => setInlineEdit(option.id)} className="w-fit text-left hover:underline" title="Click to edit product details">
                          <span className="text-sm font-medium">{option.productName}{option.brandName ? <span className="font-normal text-ink-secondary"> · ex. {option.brandName}</span> : null}</span>
                        </button>
                      ) : (
                        <span className="text-sm font-medium">{option.productName}{option.brandName ? <span className="font-normal text-ink-secondary"> · ex. {option.brandName}</span> : null}</span>
                      )}
                      {specLine(option) ? <span className="text-xs text-ink-tertiary">{specLine(option)}</span> : null}
                      {option.notes ? <span className="whitespace-pre-wrap text-xs text-ink-secondary">{option.notes}</span> : null}
                      {/* Set final button on card face */}
                      {!option.isFinal && canEdit ? (
                        <div className="mt-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            pending={isPending(`${entry.id}-opt-${option.id}`)}
                            onClick={() => void run(`${entry.id}-opt-${option.id}`, () => markScheduleFinalAction({ projectId, optionId: option.id }))}
                          >
                            Set final
                          </Button>
                        </div>
                      ) : null}
                      {option.sampleRequest ? (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge tone={option.sampleRequest.status === "RECEIVED" ? "success" : "warning"}>
                            {option.sampleRequest.status === "RECEIVED" ? "Sample received" : "Sample requested"}
                          </Badge>
                          <Text tone="tertiary" size="sm">from {option.sampleRequest.requestedFrom}</Text>
                        </div>
                      ) : null}
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {canEdit ? (
                      <RowActionMenu
                        label={`Option ${option.label} actions`}
                        pending={isPending(`${entry.id}-opt-${option.id}`)}
                        items={[
                          ...(option.isFinal ? [] : [{ label: "Set as final", onSelect: () => void run(`${entry.id}-opt-${option.id}`, () => markScheduleFinalAction({ projectId, optionId: option.id })) }]),
                          { label: "Edit", onSelect: () => setInlineEdit(option.id) },
                          { label: option.imageUrl ? "Change photo" : "Add photo", onSelect: () => { setPhotoFor(option); } },
                          ...(option.imageUrl ? [{ label: "Remove photo", onSelect: () => void removePhoto(option) }] : []),
                          option.sampleRequest?.status === "REQUESTED"
                            ? { label: "Mark sample received", separatorBefore: true, onSelect: () => void run(`${entry.id}-opt-${option.id}`, () => receiveScheduleSampleAction({ projectId, requestId: option.sampleRequest!.id })) }
                            : { label: "Request sample", separatorBefore: true, onSelect: () => setSampleFor(option) },
                          { label: "Delete", danger: true, separatorBefore: true, onSelect: () => void removeOption(option) },
                        ]}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {command.error && !editing && !reuse && !photoFor && !inlineEdit && !sampleFor ? <InlineError>{command.error}</InlineError> : null}

      {editing ? (
        <OptionDialog
          projectId={projectId}
          entryId={entry.id}
          option={editing === "new" ? null : editing}
          brands={brands}
          command={command}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {reuse ? <ReuseDialog projectId={projectId} entry={entry} command={command} onClose={() => setReuse(false)} /> : null}
      {photoFor ? (
        <SchedulePhotoDialog projectId={projectId} entryCode={entry.code} option={photoFor} command={command} onClose={() => setPhotoFor(null)} />
      ) : null}
      {sampleFor ? (
        <SampleRequestDialog projectId={projectId} option={sampleFor} command={command} onClose={() => setSampleFor(null)} />
      ) : null}
    </div>
  );
}

// ── Entry drawer (mobile wrapper) ─────────────────────────────────────────────

/**
 * The full item editor — Item details, What shows on the card, and Spec
 * options — as its own dialog rather than a slim sidebar squeezed beside the
 * board. Same dialog on desktop and mobile, matching every other schedule
 * dialog in this file (owner decision 2026-09-23: the old 22rem inline panel
 * left no room for the card-field checkboxes and the option-edit form
 * without heavy scrolling).
 */
function EntryDialog({
  projectId,
  entry,
  brands,
  canEdit,
  command,
  confirm,
  onClose,
}: {
  projectId: string;
  entry: ScheduleEntryView;
  brands: readonly Brand[];
  canEdit: boolean;
  command: Command;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(value) => { if (!value) onClose(); }} title={`${entry.code} · ${entry.category}`} description={SECTION_LABEL[entry.section]} size="lg">
      <EntryPanelContent
        projectId={projectId}
        entry={entry}
        brands={brands}
        canEdit={canEdit}
        command={command}
        confirm={confirm}
        onClose={onClose}
      />
    </Dialog>
  );
}

function OptionDialog({ projectId, entryId, option, brands, command, onClose }: { projectId: string; entryId: string; option: ScheduleOptionView | null; brands: readonly Brand[]; command: Command; onClose: () => void }) {
  const [product, setProduct] = useState<ProductDraft>(option ? productFromOption(option) : EMPTY_PRODUCT);
  const [preparedPhoto, setPreparedPhoto] = useState<File | null>(null);
  const key = `${entryId}-option-form`;
  const photoKey = `${entryId}-option-photo`;
  const pending = command.isPending(key);
  const photoPending = command.isPending(photoKey);
  const save = async () => {
    const snapshot = toSnapshot(product);
    let optionId = option?.id ?? null;
    const ok = await command.run(key, () => option
      ? updateScheduleOptionAction({ projectId, optionId: option.id, snapshot })
      : createScheduleOptionAction({ projectId, entryId, snapshot }), (data) => {
        if (!option && data && typeof data === "object" && "optionId" in data && typeof data.optionId === "string") optionId = data.optionId;
      });
    if (!ok) return;
    if (preparedPhoto && optionId) {
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("optionId", optionId);
      form.set("file", preparedPhoto);
      const photoOk = await command.run(photoKey, () => setScheduleOptionImageAction(form));
      if (!photoOk) return;
    }
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title={option ? `Edit option ${option.label}` : "Add option"}
      description={option ? "Update the product details and replace its catalog photo in one step." : "Add the product details and catalog photo together, matching the legacy schedule flow."}
      size="lg"
      dismissible={!pending && !photoPending}
      footer={<Footer><Button variant="ghost" onClick={onClose} disabled={pending || photoPending}>Cancel</Button><Button variant="primary" pending={pending || photoPending} disabled={!product.productName.trim()} onClick={save}>{option ? "Save option" : "Add option"}</Button></Footer>}
    >
      <div className="grid gap-3">
        <ProductFields value={product} onChange={setProduct} brands={brands} extraBrand={option?.brandId ? { id: option.brandId, name: option.brandName ?? "Brand" } : null} />
        <div className="grid gap-2">
          <Text weight="semibold">Photo</Text>
          {option?.imageUrl && !preparedPhoto ? (
            <div className="flex items-center gap-3 rounded-control border border-line-subtle bg-surface-muted p-2">
              <Thumb url={option.imageUrl} alt={option.productName} className="h-20 w-16" />
              <Text size="sm" tone="secondary">Current photo. Choose an image below to replace it.</Text>
            </div>
          ) : null}
          <ImageWorkspace
            label="Schedule option photo"
            aspect={PHOTO_ASPECT}
            maxDimension={1600}
            outputType="image/jpeg"
            onPrepared={(file) => setPreparedPhoto(file)}
            disabled={pending || photoPending}
          />
          {preparedPhoto ? <Text size="sm" tone="secondary">Photo ready: {preparedPhoto.name}</Text> : null}
        </div>
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Dialog>
  );
}

function ReuseDialog({ projectId, entry, command, onClose }: { projectId: string; entry: ScheduleEntryView; command: Command; onClose: () => void }) {
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
    <Dialog open onOpenChange={(value) => { if (!value) onClose(); }} title="Copy from a past project" description={`Search products used in other projects and copy one into ${entry.code} as a new option.`} size="lg">
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
                <Button size="sm" variant="primary" pending={command.isPending(`${entry.id}-reuse-${hit.optionId}`)} onClick={() => void use(hit)}>Use</Button>
              </li>
            ))}
          </ul>
        )}
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Dialog>
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
      description="The item gets the next code in the target category; codes in the old category close the gap."
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
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const pending = command.isPending("import");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
  };

  const submit = async () => {
    setResult(null);
    await command.run("import", () => importScheduleCsvAction({ projectId, section: target, csv }), (data) => setResult(data as { created: number; updated: number }));
  };

  return (
    <Dialog
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title="Import schedule CSV"
      description="Use the Google Sheets export (File → Download → CSV). Rows whose code already exists update that item; new codes are added."
      size="lg"
      dismissible={!pending}
      footer={<Footer><Button variant="ghost" onClick={onClose} disabled={pending}>{result ? "Close" : "Cancel"}</Button><Button variant="primary" pending={pending} disabled={!csv.trim()} onClick={submit}>Import</Button></Footer>}
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sheet">
            <Select value={target} onChange={(e) => setTarget(e.target.value as Section)}>
              <option value="MATERIAL">Material (needs a Product Category column)</option>
              <option value="FIXTURE">Fixture</option>
            </Select>
          </Field>
          <Field label="CSV file" description={fileName ?? undefined}>
            <Input type="file" accept=".csv,text/csv" onChange={(e) => void pick(e.target.files?.[0])} />
          </Field>
        </div>
        <Field label="Or paste CSV">
          <Textarea rows={6} value={csv} onChange={(e) => { setCsv(e.target.value); setFileName(null); }} placeholder={"Code,Product Category,Ex,Type,Initials Type,Image,Location,Contact,Qty,Unit"} className="font-ui-mono text-xs" />
        </Field>
        {result ? <Text size="sm">Imported: {result.created} new, {result.updated} updated.</Text> : null}
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Dialog>
  );
}
