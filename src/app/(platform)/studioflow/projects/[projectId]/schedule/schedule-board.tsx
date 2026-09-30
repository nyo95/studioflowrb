"use client";

import { ArrowDown, ArrowUp, Crown, FileUp, History, ImageIcon, Plus, Printer, Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";

import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";

import {
  SCHEDULE_CARD_FIELD_LABEL as CARD_FIELD_LABEL,
  SCHEDULE_SECTION_LABEL as SECTION_LABEL,
  cardFieldLabel,
  cardFieldValuesOf,
  effectiveCardFields,
  extraChoicesOf,
  finalOf,
  resolveCardFields,
  shownOptionOf,
  specLine,
  templateSourceOf,
  type ScheduleEntryView,
  type ScheduleExtraField,
  type ScheduleOptionView,
  type ScheduleSampleRequestView,
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
  updateScheduleOptionAction,
} from "../../../actions";
import { ExtraFieldsEditor } from "../../../_components/extra-fields-editor";
import { useCommand } from "../../../_components/use-command";

type Section = "MATERIAL" | "FIXTURE";
type Brand = { id: string; name: string };

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

const STATUS_LABEL: Record<string, { label: string; tone: "success" | "neutral" | "warning" }> = {
  APPROVED: { label: "Final", tone: "success" },
  DRAFT: { label: "Option", tone: "neutral" },
  NOT_USED: { label: "Not used", tone: "neutral" },
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
 * picker itself as soon as it mounts, so swapping the row in already gives
 * "click photo → file picker appears" with no extra click of our own.
 */
function InlinePhotoEditor({
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
    <div className="grid gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Text size="sm" weight="semibold">{`Photo — ${entryCode} option ${option.label}`}</Text>
          <Text size="sm" tone="tertiary">Choose a photo and crop it to the 4:5 catalog frame.</Text>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={isPending(pendingKey)}>Cancel</Button>
      </div>
      <ImageWorkspace label="Schedule photo" aspect={PHOTO_ASPECT} maxDimension={1600} outputType="image/jpeg" onPrepared={onPrepared} disabled={isPending(pendingKey)} />
      {photoError ? <InlineError>{photoError}</InlineError> : null}
    </div>
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
      description="Master Data staff are told so they can get a quote. Mark it received here when it arrives."
      size="sm"
      dismissible={!isPending(pendingKey)}
    >
      <form className="grid gap-3" onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(pendingKey, () => requestScheduleSampleAction({ projectId, optionId: option.id, requestedFrom, note: note || undefined }));
        if (ok) onClose();
      }}>
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
    </Dialog>
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
  onOpenPhoto,
  onRequestSample,
  onCancelSample,
  onReceiveSample,
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
  onOpenPhoto: (entry: ScheduleEntryView, option: ScheduleOptionView) => void;
  onRequestSample: (option: ScheduleOptionView) => void;
  onCancelSample: (entryId: string, option: ScheduleOptionView) => void;
  onReceiveSample: (entryId: string, option: ScheduleOptionView) => void;
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
                        onClick={(event) => { event.stopPropagation(); onOpenPhoto(entry, photoTarget); }}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onOpenPhoto(entry, photoTarget); } }}
                        className="absolute inset-0 grid place-items-center opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <span className="rounded-action bg-ink/70 px-2 py-1 text-micro font-semibold uppercase tracking-[0.1em] text-surface">
                          {photoTarget.imageUrl ? "Change photo" : "+ Add photo"}
                        </span>
                      </span>
                    ) : null}
                  </span>
                  {shown ? (
                    <span className="font-ui-sans text-sm font-semibold uppercase leading-tight text-ink">{shown.productName}</span>
                  ) : (
                    <span className="text-sm italic text-ink-tertiary">Reserved — no product yet</span>
                  )}
                  {shown ? (
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      {shown.sampleRequest ? (
                        <Badge tone={shown.sampleRequest.status === "RECEIVED" ? "success" : "warning"}>
                          {shown.sampleRequest.status === "RECEIVED" ? "Sample received" : "Sample requested"}
                        </Badge>
                      ) : null}
                      {canEdit && shown.sampleRequest?.status !== "REQUESTED" ? (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => { event.stopPropagation(); onRequestSample(shown); }}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onRequestSample(shown); } }}
                          className="cursor-pointer text-xs font-medium text-ink-secondary hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus"
                        >
                          {shown.sampleRequest ? "Request sample again" : "Request sample"}
                        </span>
                      ) : null}
                      {canEdit && shown.sampleRequest?.status === "REQUESTED" ? (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => { event.stopPropagation(); onReceiveSample(entry.id, shown); }}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onReceiveSample(entry.id, shown); } }}
                          className="cursor-pointer text-xs font-medium text-ink-secondary hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus"
                        >
                          Mark received
                        </span>
                      ) : null}
                      {canEdit && shown.sampleRequest?.status === "REQUESTED" ? (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => { event.stopPropagation(); onCancelSample(entry.id, shown); }}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onCancelSample(entry.id, shown); } }}
                          className="cursor-pointer text-xs font-medium text-ink-tertiary hover:text-danger hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus"
                        >
                          Cancel
                        </span>
                      ) : null}
                    </span>
                  ) : null}
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
  templatesHref,
}: {
  projectId: string;
  entries: readonly ScheduleEntryView[];
  brands: readonly Brand[];
  canEdit: boolean;
  /** Studio settings permission: template settings link and "Save as template". */
  canManageTemplates: boolean;
  templatesHref: string;
}) {
  const command = useCommand();
  const { run, isPending, error } = command;
  const confirm = useConfirm();
  const [section, setSection] = useState<Section>(() => (entries.some((e) => e.section === "MATERIAL") || !entries.length ? "MATERIAL" : "FIXTURE"));
  const [viewMode, setViewMode] = useState<"list" | "board">("board");
  const [openId, setOpenId] = useState<string | null>(null);
  const [autoPhotoOptionId, setAutoPhotoOptionId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "add" | "import" | { move: ScheduleEntryView }>(null);
  const [sampleFor, setSampleFor] = useState<ScheduleOptionView | null>(null);
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

  const cancelSample = async (entryId: string, option: ScheduleOptionView) => {
    const ok = await confirm.confirm({
      title: "Cancel this sample request?",
      description: `${option.sampleRequest?.requestedFrom || "Master Data"} will not be asked further. This cannot be undone.`,
      confirmLabel: "Cancel request",
      tone: "danger",
    });
    if (ok) await run(`${entryId}-sample-cancel`, () => cancelScheduleSampleAction({ projectId, requestId: option.sampleRequest!.id }));
  };

  const receiveSample = (entryId: string, option: ScheduleOptionView) =>
    run(`${entryId}-sample-receive`, () => receiveScheduleSampleAction({ projectId, requestId: option.sampleRequest!.id }));

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
          <button type="button" onClick={() => setViewMode("list")} className={`inline-flex min-h-(--ui-control-height-sm) items-center gap-1 rounded-control px-2 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-surface-muted text-ink" : "text-ink-secondary hover:bg-surface-muted hover:text-ink"}`} aria-pressed={viewMode === "list"}>List</button>
          <button type="button" onClick={() => setViewMode("board")} className={`inline-flex min-h-(--ui-control-height-sm) items-center gap-1 rounded-control px-2 text-xs font-medium transition-colors ${viewMode === "board" ? "bg-surface-muted text-ink" : "text-ink-secondary hover:bg-surface-muted hover:text-ink"}`} aria-pressed={viewMode === "board"}>Board</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            prefetch={false}
            target="_blank"
            href={STUDIOFLOW_ROUTES.projectSchedulePrint(projectId)}
            className="inline-flex min-h-(--ui-control-height-sm) items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-xs font-medium text-ink hover:border-line-strong"
          >
            <Printer aria-hidden="true" className="h-3.5 w-3.5" /> Print / PDF
          </Link>
          {canManageTemplates ? (
            <Link
              prefetch={false}
              href={templatesHref}
              className="inline-flex min-h-(--ui-control-height-sm) items-center gap-1.5 rounded-control px-2.5 text-xs font-medium text-ink-secondary hover:bg-surface-muted hover:text-ink"
            >
              <Settings2 aria-hidden="true" className="h-3.5 w-3.5" /> Schedule templates
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
      </div>

      <StatBar entries={entries} section={section} />

      {error && !open && !dialog && !sampleFor ? <InlineError className="px-(--ui-section-px) pt-2">{error}</InlineError> : null}

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
                onOpen={(id) => openEntry(id)}
                canEdit={canEdit}
                canManageTemplates={canManageTemplates}
                onMoveCategory={(entry) => setDialog({ move: entry })}
                onDelete={removeEntry}
                onReorder={reorderGroup}
                onOpenPhoto={(entry, option) => openEntry(entry.id, option.id)}
                onRequestSample={(option) => setSampleFor(option)}
                onCancelSample={cancelSample}
                onReceiveSample={receiveSample}
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
                              {entry.options.length > 1 ? <Badge>{entry.options.length} options</Badge> : null}
                              {shown?.sampleRequest ? (
                                <Badge tone={shown.sampleRequest.status === "RECEIVED" ? "success" : "warning"}>
                                  {shown.sampleRequest.status === "RECEIVED" ? "Sample received" : "Sample requested"}
                                </Badge>
                              ) : null}
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
                                  ...(canEdit && shown && shown.sampleRequest?.status !== "REQUESTED"
                                    ? [{ label: shown.sampleRequest ? "Request sample again" : "Request sample", separatorBefore: true, onSelect: () => setSampleFor(shown) }]
                                    : []),
                                  ...(canEdit && shown?.sampleRequest?.status === "REQUESTED"
                                    ? [
                                        { label: "Mark sample received", separatorBefore: true, onSelect: () => void run(`${entry.id}-sample-receive`, () => receiveScheduleSampleAction({ projectId, requestId: shown.sampleRequest!.id })) },
                                        { label: "Cancel sample request", danger: true, onSelect: () => void cancelSample(entry.id, shown) },
                                      ]
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
          initialPhotoOptionId={autoPhotoOptionId}
        />
      ) : null}

      {dialog === "add" ? (
        <AddItemDialog projectId={projectId} section={section} categories={categories} brands={brands} command={command} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "import" ? <ImportDialog projectId={projectId} section={section} command={command} onClose={() => setDialog(null)} /> : null}
      {dialog && typeof dialog === "object" ? (
        <MoveDialog projectId={projectId} entry={dialog.move} categories={categories} command={command} onClose={() => setDialog(null)} />
      ) : null}
      {sampleFor ? (
        <SampleRequestDialog projectId={projectId} option={sampleFor} command={command} onClose={() => setSampleFor(null)} />
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
  // One brand control: pick a Master Data brand, or type any name (kept as plain text, id-less).
  const customBrand = !value.brandId && value.brandName.trim() ? [{ id: `custom:${value.brandName}`, label: value.brandName }] : [];
  const brandValue = value.brandId || (customBrand[0]?.id ?? "");
  const [moreOpen, setMoreOpen] = useState(() => Boolean(value.notes.trim() || value.extra.length > 0));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Type" required className="sm:col-span-2">
        <Input value={value.productName} onChange={set("productName")} maxLength={200} placeholder="Product name, e.g. Nude Pro - ATS 1132 M" autoFocus />
      </Field>
      <Field label="Brand">
        <CreatableSearch
          label="Brand"
          options={[{ id: "", label: "No brand" }, ...customBrand, ...brandOptions.map((brand) => ({ id: brand.id, label: brand.name }))]}
          value={brandValue}
          onValueChange={(next) => {
            if (next.startsWith("custom:")) onChange({ ...value, brandId: "", brandName: next.slice(7) });
            else onChange({ ...value, brandId: next, brandName: "" });
          }}
          onCreate={(name) => `custom:${name.trim()}`}
          createLabel={(name) => `Use “${name}” as the brand`}
          placeholder="Pick or type a brand"
          searchPlaceholder="Search brands…"
          emptyLabel="No brand matches."
          className="w-full"
        />
      </Field>
      <Field label="Size"><Input value={value.dimension} onChange={set("dimension")} maxLength={160} placeholder="e.g. 60 × 60 cm" /></Field>
      <Field label="Color"><Input value={value.color} onChange={set("color")} maxLength={160} /></Field>
      <Field label="Pattern"><Input value={value.pattern} onChange={set("pattern")} maxLength={160} /></Field>
      <Field label="Finishing" className="sm:col-span-2"><Input value={value.finishing} onChange={set("finishing")} maxLength={160} /></Field>
      {moreOpen ? (
        <>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={value.notes} onChange={set("notes")} maxLength={2000} rows={2} className="min-h-[60px]" />
          </Field>
          <div className="sm:col-span-2">
            <ExtraFieldsEditor value={value.extra} onChange={(extra) => onChange({ ...value, extra })} />
          </div>
        </>
      ) : (
        <Button type="button" size="sm" variant="ghost" className="justify-self-start sm:col-span-2" onClick={() => setMoreOpen(true)}>+ Notes or other specs</Button>
      )}
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2">{children}</div>;
}

function AddItemDialog({ projectId, section, categories, brands, command, onClose }: { projectId: string; section: Section; categories: string[]; brands: readonly Brand[]; command: Command; onClose: () => void }) {
  const [targetSection, setTargetSection] = useState<Section>(section);
  const [category, setCategory] = useState(categories[0] ?? "");
  const [withProduct, setWithProduct] = useState(true);
  const [product, setProduct] = useState<ProductDraft>(EMPTY_PRODUCT);
  const [qty, setQty] = useState({ qty: "", unit: "", location: "" });
  const isFixture = targetSection === "FIXTURE";
  const pending = command.isPending("add-item");
  const canSave = category.trim() && (!withProduct || product.productName.trim());

  const save = async () => {
    const ok = await command.run("add-item", () => createScheduleEntryAction({
      projectId,
      section: targetSection,
      category: category.trim(),
      // Qty and unit only exist for Fixture: a Material line is specified, not counted.
      qty: isFixture ? qty.qty.trim() || null : null,
      unit: isFixture ? qty.unit.trim() || null : null,
      location: qty.location.trim() || null,
      snapshot: withProduct ? toSnapshot(product) : null,
    }));
    if (ok) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title="Add item"
      description="It gets a code from the category, like PT-03."
      size="lg"
      dismissible={!pending}
      footer={<Footer><Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button><Button variant="primary" pending={pending} disabled={!canSave} onClick={save}>Add item</Button></Footer>}
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Section">
          <FilterChip selected={targetSection === "MATERIAL"} onClick={() => setTargetSection("MATERIAL")}>Material</FilterChip>
          <FilterChip selected={targetSection === "FIXTURE"} onClick={() => setTargetSection("FIXTURE")}>Fixture</FilterChip>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category" required>
            <CreatableSearch
              label="Category"
              options={categories.map((name) => ({ id: name, label: name }))}
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
          <Field label="Location"><Input value={qty.location} onChange={(e) => setQty({ ...qty, location: e.target.value })} maxLength={160} placeholder="e.g. Living room wall" /></Field>
          {isFixture ? (
            <div className="grid grid-cols-2 gap-3 sm:col-span-2">
              <Field label="Qty"><Input inputMode="decimal" value={qty.qty} onChange={(e) => setQty({ ...qty, qty: e.target.value })} maxLength={20} /></Field>
              <Field label="Unit"><Input value={qty.unit} onChange={(e) => setQty({ ...qty, unit: e.target.value })} maxLength={40} placeholder="pcs, set…" /></Field>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Item content">
          <FilterChip selected={withProduct} onClick={() => setWithProduct(true)}>Add the product now</FilterChip>
          <FilterChip selected={!withProduct} onClick={() => setWithProduct(false)}>Just reserve the code</FilterChip>
        </div>
        {withProduct ? <ProductFields value={product} onChange={setProduct} brands={brands} /> : <Text tone="secondary" size="sm">The code is reserved now. Add the product later from the item.</Text>}
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
// ── Entry panel content (the body of EntryDialog) ──────────────────────────────

/** A slim, borderless field that reads as text until it is hovered or focused: how the card is edited in place. */
const PLATE_INPUT = "h-7 w-full rounded-[6px] border border-transparent bg-transparent px-0 text-sm font-medium text-ink placeholder:font-normal placeholder:text-ink-tertiary hover:border-line-subtle focus:border-line-focus focus:bg-surface focus:px-1.5 focus:outline-none disabled:opacity-70";

function CardPlate({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 overflow-hidden rounded-control border border-line-subtle bg-surface px-2.5 pb-1 pt-1.5 ${className}`}>
      <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">{label}</div>
      {children}
    </div>
  );
}

const HAND_WIDTH = 264;
const HAND_CARD = 96;

/**
 * The Product Schedule item editor, laid out as a card table: the card itself in the middle, edited in place;
 * the slots that appear on it on the left; the spec options as a hand of small cards on the right. Everything
 * here is still one local draft until Save is pressed (owner decision 2026-09-24), now per option, so several
 * options can be edited before saving. Only the picture changed; the rules did not.
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
  const [editing, setEditing] = useState<ScheduleOptionView | "new" | null>(null);
  const [reuse, setReuse] = useState(false);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
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

  const selected = entry.options.find((option) => option.id === selectedId) ?? shownOptionOf(entry);
  const extraChoices = extraChoicesOf(entry);
  const extraKeys = extraChoices.map((extra) => extra.key);

  // Owner decision 2026-09-24: nothing auto-saves per field. `baseline` is what is persisted for the item-level
  // pieces; `optionBaseline` holds what was last saved per option (props catch up after the refresh);
  // `drafts` holds only the options the person has touched.
  const [baseline, setBaseline] = useState(() => ({ fields: { qty: entry.qty ?? "", unit: entry.unit ?? "", location: entry.location ?? "" }, cardFields: entry.cardFields }));
  const [fields, setFields] = useState(baseline.fields);
  const [cardFieldsDraft, setCardFieldsDraft] = useState<string[] | null>(baseline.cardFields);
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>({});
  const [optionBaseline, setOptionBaseline] = useState<Record<string, ProductDraft>>({});

  const baselineOfOption = (option: ScheduleOptionView | null): ProductDraft => (option ? optionBaseline[option.id] ?? productFromOption(option) : EMPTY_PRODUCT);
  const draftKey = selected?.id ?? "new";
  const draft = drafts[draftKey] ?? baselineOfOption(selected);
  const updateDraft = (patch: Partial<ProductDraft>) => setDrafts((current) => ({ ...current, [draftKey]: { ...(current[draftKey] ?? baselineOfOption(selected)), ...patch } }));

  const displayCardFields = resolveCardFields(cardFieldsDraft, extraKeys);
  const dirtyOptionKeys = Object.keys(drafts).filter((key) => {
    const option = entry.options.find((row) => row.id === key) ?? null;
    if (key !== "new" && !option) return false; // the option was deleted meanwhile
    return JSON.stringify(drafts[key]) !== JSON.stringify(baselineOfOption(option));
  });
  const fieldsChanged = fields.qty !== baseline.fields.qty || fields.unit !== baseline.fields.unit || fields.location !== baseline.fields.location;
  const cardFieldsChanged = JSON.stringify(resolveCardFields(cardFieldsDraft, extraKeys)) !== JSON.stringify(resolveCardFields(baseline.cardFields, extraKeys));
  const isDirty = dirtyOptionKeys.length > 0 || fieldsChanged || cardFieldsChanged;
  // Tell the dialog wrapper whether it's safe to close without confirming —
  // a ref write in the parent, not a state update.
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
  // Every option needs a Type before it can be saved (same rule as OptionDialog).
  const optionNeedsType = dirtyOptionKeys.some((key) => !drafts[key].productName.trim());

  const entryFieldsKey = `${entry.id}-fields`;
  const optionFieldsKey = `${entry.id}-option-fields`;
  const cardFieldsKey = `${entry.id}-card-fields`;
  const savePending = isPending(entryFieldsKey) || isPending(optionFieldsKey) || isPending(cardFieldsKey);

  const saveAll = async () => {
    setSaveError(null);
    if (optionNeedsType) return;
    for (const key of dirtyOptionKeys) {
      const snapshot = toSnapshot(drafts[key]);
      const ok = await run(optionFieldsKey, () => key === "new"
        ? createScheduleOptionAction({ projectId, entryId: entry.id, snapshot })
        : updateScheduleOptionAction({ projectId, optionId: key, snapshot }));
      if (!ok) return;
      setOptionBaseline((current) => ({ ...current, [key]: drafts[key] }));
      setDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
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
      description: option.isFinal ? "This is the final option; the next option becomes final." : "The option is removed from this item.",
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
  const slotKeys = ["brand", "color", "pattern", "finishing", "dimension", "location", ...(entry.section === "FIXTURE" ? ["qty"] : []), "notes", ...extraKeys];
  const slotLabel = (key: string) => cardFieldLabel(key, extraChoices);
  const valueOfSlot = (key: string): string => {
    if (key === "brand") return draft.brandId || draft.brandName;
    if (key === "location") return fields.location;
    if (key === "qty") return fields.qty;
    if (key === "notes") return draft.notes;
    if (key === "color" || key === "pattern" || key === "finishing" || key === "dimension") return draft[key];
    return extraValue(extraChoices.find((extra) => extra.key === key)?.label ?? key);
  };
  const shownSlots = slotKeys.filter((key) => displayCardFields.includes(key));
  const filledCount = shownSlots.filter((key) => valueOfSlot(key).trim().length > 0).length;
  const accent = selected?.isFinal ? "var(--ui-warning-fg)" : entry.section === "FIXTURE" ? "var(--ui-action-primary)" : "var(--ph-mood)";
  const status = selected ? STATUS_LABEL[selected.status] ?? STATUS_LABEL.DRAFT : STATUS_LABEL.DRAFT;
  const busyKey = selected ? `${entry.id}-opt-${selected.id}` : "";

  const handStep = entry.options.length > 1 ? Math.min(72, (HAND_WIDTH - HAND_CARD) / (entry.options.length - 1)) : 0;
  const handStart = (HAND_WIDTH - (HAND_CARD + (entry.options.length - 1) * handStep)) / 2;

  return (
    <div className="grid gap-4">
      <div className="grid items-start gap-5 lg:grid-cols-[12.5rem_minmax(0,1fr)_16.5rem]">
        {/* Card slots */}
        <div className="order-2 grid gap-2 lg:order-1">
          <Text weight="semibold">Card slots</Text>
          <Text size="sm" tone="tertiary">
            {entry.cardFields === null ? "Default set." : "Custom for this item."} Tap a slot to put it on the card. Turning one off only hides it.
          </Text>
          <div className="grid gap-1.5">
            {slotKeys.map((key) => {
              const on = displayCardFields.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => toggleCardField(key)}
                  className={`flex min-h-9 items-center justify-between rounded-control border px-3 text-left text-sm transition-colors disabled:opacity-60 ${on ? "border-line-strong bg-surface-raised text-ink" : "border-line-subtle bg-surface text-ink-secondary hover:border-line"}`}
                >
                  <span>{slotLabel(key)}</span>
                  <span className="text-xs text-ink-tertiary">{on ? "On card" : "Hidden"}</span>
                </button>
              );
            })}
          </div>
          {canEdit && cardFieldsDraft !== null ? (
            <button type="button" disabled={savePending} onClick={() => setCardFieldsDraft(null)} className="justify-self-start text-xs font-medium text-ink-secondary hover:text-ink hover:underline">
              Use default
            </button>
          ) : null}
          <div className="mt-1 rounded-control bg-surface-raised p-3">
            <div className="mb-1.5 flex justify-between text-xs text-ink-secondary"><span>Card filled in</span><span>{filledCount} of {shownSlots.length}</span></div>
            <div className="h-1 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-ink-tertiary" style={{ width: `${shownSlots.length ? Math.round((filledCount / shownSlots.length) * 100) : 0}%` }} /></div>
          </div>
        </div>

        {/* The card */}
        <div className="order-1 flex justify-center lg:order-2">
          <div className="relative w-full max-w-[23.5rem] rounded-[18px] border border-line bg-surface shadow-elevated">
            <span aria-hidden="true" className="absolute inset-x-5 top-0 h-0.5 rounded-b-full" style={{ background: accent }} />
            <div className="grid gap-2.5 p-5">
              <div className="flex items-center justify-between">
                <span className="rounded-[6px] bg-surface-raised px-2 py-0.5 font-ui-mono text-xs font-medium text-ink-secondary">{entry.code}</span>
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">{entry.category}</span>
              </div>

              <input
                aria-label="Type"
                value={draft.productName}
                onChange={(event) => updateDraft({ productName: event.target.value })}
                disabled={disabled}
                maxLength={200}
                placeholder="Type, e.g. Nude Pro - ATS 1132 M"
                className="h-11 w-full rounded-[6px] border border-transparent bg-transparent px-0 text-xl font-medium leading-tight tracking-tight text-ink placeholder:text-sm placeholder:font-normal placeholder:text-ink-tertiary hover:border-line-subtle focus:border-line-focus focus:bg-surface focus:px-1.5 focus:outline-none"
              />

              <div className="relative">
                {selected && canEdit ? (
                  <button type="button" onClick={() => setPhotoFor(selected.id)} aria-label={selected.imageUrl ? `Change photo of option ${selected.label}` : `Add photo to option ${selected.label}`} className="block w-full rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
                    <Thumb url={selected.imageUrl} alt={selected.productName} className="h-36 w-full !rounded-control" />
                  </button>
                ) : (
                  <Thumb url={selected?.imageUrl ?? null} alt={selected?.productName ?? "No photo"} className="h-36 w-full !rounded-control" />
                )}
                {selected?.sampleRequest ? (
                  <span className="absolute right-2 top-2"><Badge tone={selected.sampleRequest.status === "RECEIVED" ? "success" : "warning"}>{selected.sampleRequest.status === "RECEIVED" ? "Sample received" : "Sample requested"}</Badge></span>
                ) : null}
                {selected && canEdit ? <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-surface/90 px-2 py-0.5 text-[11px] font-medium text-ink-secondary">{selected.imageUrl ? "Change photo" : "Add photo"}</span> : null}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {displayCardFields.includes("brand") ? (
                  <CardPlate label="Brand">
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
                ) : null}
                {(["color", "pattern", "finishing"] as const).filter((key) => displayCardFields.includes(key)).map((key) => (
                  <CardPlate key={key} label={CARD_FIELD_LABEL[key]}>
                    <input aria-label={CARD_FIELD_LABEL[key]} value={draft[key]} onChange={(event) => updateDraft({ [key]: event.target.value })} disabled={disabled} maxLength={160} placeholder="Tap to add" className={PLATE_INPUT} />
                  </CardPlate>
                ))}
                {displayCardFields.includes("dimension") ? (
                  <CardPlate label="Size">
                    <input aria-label="Size" value={draft.dimension} onChange={(event) => updateDraft({ dimension: event.target.value })} disabled={disabled} maxLength={160} placeholder="e.g. 60 × 60 cm" className={PLATE_INPUT} />
                  </CardPlate>
                ) : null}
                {displayCardFields.includes("location") ? (
                  <CardPlate label="Location">
                    <input aria-label="Location" value={fields.location} onChange={(event) => setFields({ ...fields, location: event.target.value })} disabled={disabled} maxLength={160} placeholder="Tap to add" className={PLATE_INPUT} />
                  </CardPlate>
                ) : null}
                {/* Qty only for Fixture — a Material line is specified, not counted (owner decision 2026-09-23). */}
                {entry.section === "FIXTURE" && displayCardFields.includes("qty") ? (
                  <CardPlate label="Qty">
                    <div className="grid grid-cols-[1fr_4rem] gap-1.5">
                      <input aria-label="Qty" inputMode="decimal" value={fields.qty} onChange={(event) => setFields({ ...fields, qty: event.target.value })} disabled={disabled} maxLength={20} placeholder="0" className={PLATE_INPUT} />
                      <input aria-label="Unit" placeholder="Unit" value={fields.unit} onChange={(event) => setFields({ ...fields, unit: event.target.value })} disabled={disabled} maxLength={40} className={PLATE_INPUT} />
                    </div>
                  </CardPlate>
                ) : null}
                {extraChoices.filter((extra) => displayCardFields.includes(extra.key)).map((extra) => (
                  <CardPlate key={extra.key} label={extra.label}>
                    <input aria-label={extra.label} value={extraValue(extra.label)} onChange={(event) => setExtraValue(extra.label, event.target.value)} disabled={disabled} maxLength={400} placeholder="Tap to add" className={PLATE_INPUT} />
                  </CardPlate>
                ))}
              </div>

              {displayCardFields.includes("notes") ? (
                <div className="pt-1">
                  <SimpleTextEditor value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} disabled={disabled} maxLength={2000} rows={2} />
                </div>
              ) : null}

              <div className="mt-1 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-ink-tertiary">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-raised text-sm font-medium text-ink-secondary">{selected?.label ?? "A"}</span>
                  {selected ? `Option ${selected.label} of ${entry.options.length}` : "No option yet"}
                </span>
                {selected?.isFinal ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--ui-warning-fg)" }}>
                    <Crown aria-hidden="true" className="h-4 w-4" /> Final
                  </span>
                ) : selected ? <Badge tone={status.tone}>{status.label}</Badge> : null}
              </div>
            </div>
          </div>
        </div>

        {/* Your hand */}
        <div className="order-3 grid gap-3">
          {photoFor && entry.options.some((option) => option.id === photoFor) ? (
            <InlinePhotoEditor projectId={projectId} entryCode={entry.code} option={entry.options.find((option) => option.id === photoFor)!} command={command} onClose={() => setPhotoFor(null)} />
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <Text weight="semibold">Your hand</Text>
                <Text size="sm" tone="tertiary">{entry.options.length} {entry.options.length === 1 ? "option" : "options"}</Text>
              </div>

              {entry.options.length === 0 ? (
                <Text tone="tertiary" size="sm">No product yet. Fill in the card and save, or copy an option from a past project.</Text>
              ) : (
                <div className="relative mx-auto h-[13.5rem] w-[16.5rem]" role="group" aria-label="Spec options">
                  {entry.options.map((option, index) => {
                    const isSelected = option.id === selected?.id;
                    const rotate = isSelected ? 0 : Math.round((index - (entry.options.length - 1) / 2) * 5);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={`Option ${option.label}: ${option.productName}`}
                        onClick={() => setSelectedId(option.id)}
                        className={`absolute h-36 rounded-[12px] border bg-surface p-2 text-left shadow-plane transition-[bottom,transform] ${isSelected ? "border-line-focus" : option.isFinal ? "border-warning-border" : "border-line hover:border-line-strong"}`}
                        style={{ width: HAND_CARD, left: Math.round(handStart + index * handStep), bottom: isSelected ? 26 : 6, transform: `rotate(${rotate}deg)`, zIndex: isSelected ? 30 : index + 1 }}
                      >
                        <span className="flex items-center justify-between">
                          <span className="grid h-5 w-5 place-items-center rounded-full bg-surface-raised text-xs font-medium text-ink-secondary">{option.label}</span>
                          {option.isFinal ? <Crown aria-hidden="true" className="h-3.5 w-3.5" style={{ color: "var(--ui-warning-fg)" }} /> : null}
                        </span>
                        <Thumb url={option.imageUrl} alt="" className="mt-1.5 h-14 w-full" />
                        <span className="mt-1 line-clamp-2 text-[0.8rem] font-medium leading-tight text-ink">{option.productName || "Untitled"}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {canEdit ? (
                <div className="grid gap-2">
                  {selected ? (
                    selected.isFinal ? (
                      <div className="inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-warning-border bg-warning-surface text-sm font-medium" style={{ color: "var(--ui-warning-fg)" }}>
                        <Crown aria-hidden="true" className="h-4 w-4" /> This is the final
                      </div>
                    ) : (
                      <Button variant="primary" pending={isPending(busyKey)} onClick={() => void run(busyKey, () => markScheduleFinalAction({ projectId, optionId: selected.id }))}>Set as final</Button>
                    )
                  ) : null}
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    {selected ? (
                      selected.sampleRequest?.status !== "REQUESTED" ? (
                        <Button variant="secondary" onClick={() => setSampleFor(selected)}>{selected.sampleRequest ? "Request sample again" : "Request sample"}</Button>
                      ) : (
                        <Button variant="secondary" pending={isPending(busyKey)} onClick={() => void run(busyKey, () => receiveScheduleSampleAction({ projectId, requestId: selected.sampleRequest!.id }))}>Mark sample received</Button>
                      )
                    ) : <span />}
                    {selected ? (
                      <RowActionMenu
                        label={`Option ${selected.label} actions`}
                        pending={isPending(busyKey)}
                        items={[
                          { label: selected.imageUrl ? "Change photo" : "Add photo", onSelect: () => setPhotoFor(selected.id) },
                          ...(selected.imageUrl ? [{ label: "Remove photo", onSelect: () => void removePhoto(selected) }] : []),
                          ...(selected.sampleRequest?.status === "REQUESTED" ? [{ label: "Cancel sample request", danger: true, separatorBefore: true, onSelect: () => void cancelSample(selected) }] : []),
                          { label: "Delete option", danger: true, separatorBefore: true, onSelect: () => void removeOption(selected) },
                        ]}
                      />
                    ) : null}
                  </div>
                  {selected?.sampleRequest ? <Text tone="tertiary" size="sm">{selected.sampleRequest.requestedFrom ? `Sample from ${selected.sampleRequest.requestedFrom}` : "Supplier to be found"}</Text> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing("new")}>Add option</Button>
                    <Button size="sm" variant="ghost" leadingIcon={<History className="h-3.5 w-3.5" />} onClick={() => setReuse(true)}>From past project</Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {optionNeedsType ? <InlineError>Enter a Type before saving product details.</InlineError> : null}
      {saveError ? <InlineError>{saveError}</InlineError> : null}
      {canEdit ? (
        <FormActions>
          <Button type="button" variant="ghost" disabled={!isDirty || savePending} onClick={discardDraft}>Discard</Button>
          <Button type="button" variant="primary" pending={savePending} disabled={!isDirty || optionNeedsType} onClick={() => void saveAll().catch((error) => setSaveError(error instanceof Error ? error.message : "Could not save."))}>
            Save
          </Button>
        </FormActions>
      ) : null}
      {command.error && !editing && !reuse && !photoFor && !sampleFor ? <InlineError>{command.error}</InlineError> : null}

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
  initialPhotoOptionId,
}: {
  projectId: string;
  entry: ScheduleEntryView;
  brands: readonly Brand[];
  canEdit: boolean;
  command: Command;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  onClose: () => void;
  initialPhotoOptionId?: string | null;
}) {
  // Card content no longer auto-saves per field; closing with an unsaved
  // draft needs a discard confirmation, same as Master Data's edit dialogs.
  // A ref, not state: EntryPanelContent reports dirtiness on every change,
  // but only the moment of closing needs to read it.
  const isDirtyRef = useRef(false);
  const requestClose = async () => {
    if (isDirtyRef.current) {
      const ok = await confirm({
        title: "Discard changes?",
        description: "You have unsaved changes in this item's Card content. Discard them and close?",
        confirmLabel: "Discard changes",
        cancelLabel: "Keep editing",
        tone: "danger",
      });
      if (!ok) return;
    }
    onClose();
  };
  return (
    <Dialog open onOpenChange={(value) => { if (!value) void requestClose(); }} title={`${entry.code} · ${entry.category}`} description={SECTION_LABEL[entry.section]} size="xl">
      <EntryPanelContent
        projectId={projectId}
        entry={entry}
        brands={brands}
        canEdit={canEdit}
        command={command}
        confirm={confirm}
        onClose={onClose}
        onDirtyChange={(dirty) => { isDirtyRef.current = dirty; }}
        initialPhotoOptionId={initialPhotoOptionId}
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
      description="Use an Excel (.xlsx) or CSV file: the Google Sheets export, or the plain template. Rows whose code already exists update that item; new codes are added."
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
