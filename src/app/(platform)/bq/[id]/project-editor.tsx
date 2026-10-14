"use client";

import { Archive, ArchiveRestore, ChevronDown, ChevronRight, ChevronUp, FileText, GripVertical, Lock, LockOpen, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  Badge,
  Button,
  ButtonMenu,
  buttonClasses,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  FormActions,
  Heading,
  IconButton,
  InlineEdit,
  InlineError,
  Input,
  Notice,
  SectionCard,
  SelectionBar,
  Select,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  Tooltip,
} from "@/platform/ui_engine";
import { createMoney, formatMoney } from "@platform/utilities/money";
import { compareDecimals, toDecimalString } from "@platform/utilities/decimal";
import type { ActionResult } from "@platform/core/actions";
import type {
  BqAssemblyTemplateRead,
  BqItemDetail,
  BqLineItemDetail,
  BqProjectDetail,
  BqSectionDetail,
  BqSubObjectDetail,
} from "@/apps/bq/public";
import { BQ_PRICE_MODES, isMarkerPriceMode } from "@/apps/bq/lib/quotation";
import type { UnitRead } from "@/apps/masterdata/public";

import { resolveCalcExpression } from "@/apps/bq/lib/calc-expression";

import {
  addItemAction,
  addItemAndApplyAssemblyAction,
  addLineItemAction,
  addSubObjectAction,
  addSubsectionAction,
  archiveProjectAction,
  applyAssemblyAction,
  deleteItemAction,
  deleteLineItemAction,
  deleteSubObjectAction,
  lockProjectAction,
  requestProjectDeletionAction,
  restoreProjectAction,
  updateItemAction,
  updateLineItemAction,
  updateSubObjectAction,
  updateSectionAction,
  updateSubsectionAction,
  reorderItemsAction,
  previewLineItemMoveAction,
  moveLineItemsAction,
  groupLineItemsAction,
  revertLineItemPriceAction,
  saveItemAsAssemblyAction,
  unlockProjectAction,
  updateQuotationAction,
} from "./actions";
import { AddSectionDialog } from "./add-section-dialog";
import { AssemblyPickerDialog } from "./assembly-picker-dialog";
import { NewWorkItemDialog } from "./new-work-item-dialog";
import { SaveAsAssemblyDialog } from "./save-as-assembly-dialog";
import { ImportDialog } from "./source-picker-dialog";
import { QuotationDialog } from "./quotation-dialog";
import {
  buildLineItemMoveFields,
  lineItemIds,
  lineItemTargetOptions,
  selectAllLineItems,
  selectionAlreadyAtTarget,
  selectionForItem,
  toggleLineItemSelection,
  type ExistingLineItemTarget,
  type LineItemSelection,
} from "@/apps/bq/lib/line-item-move-ui";

const KATEGORI_LABEL: Record<string, string> = {
  MATERIAL: "Material",
  UPAH: "Labor",
  MATERIAL_UPAH: "Material + Labor",
  BIAYA_UMUM: "Biaya Umum",
  TRANSPORTASI_AKOMODASI: "Transportasi",
  ALAT: "Alat",
};

/** Where a new Work Item will land; `where` is the Section/Subsection name shown in its dialog. */
type NewItemTarget = { sectionId?: string; subsectionId?: string; where: string };

type Mutation = (prev: null, formData: FormData) => Promise<ActionResult<BqProjectDetail>>;
type MovePreview = {
  changes: boolean;
  beforeRate: string;
  afterRate: string;
  beforeTotal: string;
  afterTotal: string;
  totalDifference: string;
};
type MoveRequest = {
  itemId: string;
  lineItemIds: readonly string[];
  targetLabel: string;
  target: ExistingLineItemTarget | { newGroup: { qtyPerL1: string; markupL2Pct: string } };
  group?: { name: string; qtyPerL1: string; markupL2Pct: string };
  preview: MovePreview;
};

function projectItem(project: BqProjectDetail, itemId: string): BqItemDetail | undefined {
  for (const section of project.sections) {
    const found = [...section.items, ...section.subsections.flatMap((subsection) => subsection.items)].find((item) => item.id === itemId);
    if (found) return found;
  }
  return undefined;
}

function actionData(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([key, value]) => data.set(key, value));
  return data;
}

/** Amounts arrive as canonical decimal strings; presentation never re-derives them. */
function money(amount: string | null, currency = "IDR") {
  if (!amount) return <span className="text-ink-tertiary">—</span>;
  return <>{formatMoney(createMoney(amount, currency))}</>;
}

/** Counts every terminal cost line (L1-only Work Items and L3 Cost
 *  Components) so the header can show "X dari Y sudah ada harga" instead of
 *  only revealing incompleteness once the Grand Total goes blank. */
type ReadinessKey = "empty" | "zero" | "tbc" | "byOwner";
/** The first row of a kind: the row to scroll to, and the Work Item / Component Group to open so the row is visible. */
type ReadinessJump = { rowId: string; open: string[] };
type Readiness = {
  total: number;
  priced: number;
  counts: Record<ReadinessKey, number>;
  first: Partial<Record<ReadinessKey, ReadinessJump>>;
};

const isZeroPrice = (value: string) => compareDecimals(toDecimalString(value), toDecimalString("0")) === 0;

function summarizeReadiness(sections: BqProjectDetail["sections"]): Readiness {
  const result: Readiness = { total: 0, priced: 0, counts: { empty: 0, zero: 0, tbc: 0, byOwner: 0 }, first: {} };
  const note = (key: ReadinessKey, rowId: string, open: string[]) => {
    result.counts[key] += 1;
    result.first[key] ??= { rowId, open };
  };

  const countLine = (line: BqLineItemDetail, open: string[]) => {
    result.total += 1;
    if (line.hargaSnapshot === null) { note("empty", `bq-row-${line.id}`, open); return; }
    result.priced += 1;
    if (isZeroPrice(line.hargaSnapshot)) note("zero", `bq-row-${line.id}`, open);
  };

  const countItem = (item: BqItemDetail) => {
    // TBC and By Owner rows are unpriced on purpose, so they are not "missing" a price.
    if (item.priceMode === "TBC") { note("tbc", `bq-row-${item.id}`, []); return; }
    if (item.priceMode === "BY_OWNER") { note("byOwner", `bq-row-${item.id}`, []); return; }
    const hasChildren = item.subObjects.length > 0 || item.lineItems.length > 0;
    if (!hasChildren) {
      result.total += 1;
      if (item.hargaSnapshot === null) { note("empty", `bq-row-${item.id}`, []); return; }
      result.priced += 1;
      if (isZeroPrice(item.hargaSnapshot)) note("zero", `bq-row-${item.id}`, []);
      return;
    }
    item.lineItems.forEach((line) => countLine(line, [item.id]));
    item.subObjects.forEach((subObject) => subObject.lineItems.forEach((line) => countLine(line, [item.id, subObject.id])));
  };

  for (const section of sections) {
    section.items.forEach(countItem);
    section.subsections.forEach((subsection) => subsection.items.forEach(countItem));
  }

  return result;
}

/** Editor wording for a marker row; the quotation keeps `BQ_PRICE_MODE_LABEL` ("By Owner") for the client. */
const PRICE_STATUS_LABEL: Record<"PRICED" | "TBC" | "BY_OWNER", string> = {
  PRICED: "Berharga",
  TBC: "TBC",
  BY_OWNER: "By Owner",
};

const READINESS_COPY: Record<ReadinessKey, { label: string; hint: string; blocksLock: boolean }> = {
  empty: { label: "Harga kosong", hint: "Belum diisi — harus diisi atau ditandai TBC / By Owner sebelum dikunci.", blocksLock: true },
  zero: { label: "Harga Rp0", hint: "Dihitung sebagai Rp0 — boleh dikunci dengan konfirmasi.", blocksLock: false },
  tbc: { label: "TBC", hint: "Baris penanda: tidak masuk total.", blocksLock: false },
  byOwner: { label: "By Owner", hint: "Baris penanda: tidak masuk total.", blocksLock: false },
};

/** One strip that answers "can I lock this, and what is still open?"; each chip jumps to the first such row. */
function ReadinessBar({ readiness, onJump }: { readiness: Readiness; onJump: (jump: ReadinessJump) => void }) {
  const keys = (Object.keys(READINESS_COPY) as ReadinessKey[]).filter((key) => readiness.counts[key] > 0);
  const blocked = readiness.counts.empty > 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-line bg-surface px-4 py-3" role="status" aria-label="Kesiapan untuk dikunci">
      <Text size="sm" weight="medium" className={blocked ? "text-warning" : "text-success"}>
        {blocked ? "Belum siap dikunci" : keys.length > 0 ? "Siap dikunci, dengan catatan" : "Siap dikunci"}
      </Text>
      {keys.map((key) => {
        const jump = readiness.first[key];
        return (
          <button
            key={key}
            type="button"
            title={READINESS_COPY[key].hint}
            onClick={() => jump && onJump(jump)}
            className="inline-flex items-center gap-1.5 rounded-control px-1.5 py-0.5 text-sm text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <Badge tone={key === "empty" ? "warning" : key === "zero" ? "warning" : "neutral"}>{readiness.counts[key]}</Badge>
            {READINESS_COPY[key].label}
          </button>
        );
      })}
      {readiness.total > 0 ? (
        <Text tone="tertiary" size="sm" className="ml-auto">{readiness.priced} dari {readiness.total} rincian sudah ada harga</Text>
      ) : null}
    </div>
  );
}

/** Structural Work Item count per Section, for the outline rail's quick scan.
 *  Counts array lengths only — bq-contract §2/§6.0 reserve money arithmetic
 *  for the server, so this never touches a price, rate, or total. */
function workItemCount(section: BqSectionDetail) {
  return section.items.length + section.subsections.reduce((sum, subsection) => sum + subsection.items.length, 0);
}

type ReorderParent = { sectionId: string } | { subsectionId: string };

/**
 * The Work Items of one Section or Subsection as a list that can be re-ordered by dragging (or with the arrow buttons,
 * for keyboard and touch). Only the order within this parent changes; nothing here moves a Work Item elsewhere or
 * touches a price. The server checks the whole list again (stale lists are refused).
 */
function OutlineItems({
  items,
  parent,
  indent,
  editable,
  pending,
  onReorder,
}: {
  items: readonly BqItemDetail[];
  parent: ReorderParent;
  indent: string;
  editable: boolean;
  pending: boolean;
  onReorder: (parent: ReorderParent, orderedIds: string[]) => Promise<void>;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  if (items.length === 0) return null;
  const ids = items.map((item) => item.id);
  const move = (id: string, to: number) => {
    const from = ids.indexOf(id);
    if (from < 0 || to < 0 || to >= ids.length || to === from) return;
    const next = ids.filter((candidate) => candidate !== id);
    next.splice(to, 0, id);
    void onReorder(parent, next).catch(() => undefined);
  };
  return (
    <ul className="m-0 grid list-none gap-0.5 p-0">
      {items.map((item, index) => (
        <li
          key={item.id}
          draggable={editable && !pending}
          onDragStart={(event) => {
            setDragId(item.id);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", item.id);
          }}
          onDragOver={(event) => {
            // Only rows of this same list accept a drop, so nothing can be moved to another parent from here.
            if (dragId && dragId !== item.id && ids.includes(dragId)) {
              event.preventDefault();
              setOverId(item.id);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (dragId && dragId !== item.id) move(dragId, index);
            setDragId(null);
            setOverId(null);
          }}
          onDragEnd={() => { setDragId(null); setOverId(null); }}
          className={[
            "group/outline flex items-center gap-1 rounded-control pr-1 text-sm text-ink-tertiary transition-colors hover:bg-surface-muted hover:text-ink",
            indent,
            dragId === item.id ? "opacity-50" : "",
            overId === item.id ? "bg-surface-muted ring-1 ring-line-focus" : "",
          ].join(" ")}
        >
          {editable ? <GripVertical aria-hidden="true" className="size-3.5 shrink-0 cursor-grab text-ink-tertiary opacity-0 group-hover/outline:opacity-100" /> : null}
          <a href={`#bq-row-${item.id}`} className="min-w-0 flex-1 truncate py-1" draggable={false}>{item.name}</a>
          {editable ? (
            <span className="flex shrink-0 opacity-0 focus-within:opacity-100 group-hover/outline:opacity-100">
              <IconButton size="sm" variant="ghost" label={`Naikkan ${item.name}`} icon={<ChevronUp aria-hidden="true" />} disabled={pending || index === 0} onClick={() => move(item.id, index - 1)} />
              <IconButton size="sm" variant="ghost" label={`Turunkan ${item.name}`} icon={<ChevronDown aria-hidden="true" />} disabled={pending || index === items.length - 1} onClick={() => move(item.id, index + 1)} />
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * The document's structure and the one place that changes it: each Section lists its Subsections and offers
 * "+ Subsection" right under them; "+ Section" closes the list. Shown from 1024 px; narrower screens get the same
 * actions in the work area (see ProjectEditor), so nothing disappears with the panel.
 */
function SectionOutline({
  projectId,
  sections,
  editable,
  pending,
  onAddSubsection,
  onReorder,
}: {
  projectId: string;
  sections: readonly BqSectionDetail[];
  editable: boolean;
  pending: boolean;
  onAddSubsection: (sectionId: string, name: string) => Promise<void>;
  onReorder: (parent: ReorderParent, orderedIds: string[]) => Promise<void>;
}) {
  if (sections.length === 0 && !editable) return null;
  return (
    <nav
      aria-label="Struktur dokumen"
      className="sticky top-0 hidden w-[200px] shrink-0 flex-col gap-0.5 self-start py-1 lg:flex xl:w-[232px]"
    >
      <Text tone="tertiary" size="sm" meta className="px-2.5 pb-1">Struktur</Text>
      {sections.map((section) => {
        const count = workItemCount(section);
        return (
          <div key={section.id} className="grid gap-0.5">
            <a
              href={`#bq-section-${section.id}`}
              className="flex items-center justify-between gap-2 rounded-control px-2.5 py-1.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <span className="truncate">{section.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-ink-tertiary">{count}</span>
            </a>
            <OutlineItems items={section.items} parent={{ sectionId: section.id }} indent="pl-4" editable={editable} pending={pending} onReorder={onReorder} />
            {section.subsections.map((subsection) => (
              <div key={subsection.id} className="grid gap-0.5">
                <a
                  href={`#bq-subsection-${subsection.id}`}
                  className="flex items-center justify-between gap-2 rounded-control py-1 pl-4 pr-2.5 text-sm font-medium text-ink-tertiary transition-colors hover:bg-surface-muted hover:text-ink"
                >
                  <span className="truncate">{subsection.name}</span>
                  <span className="shrink-0 text-xs tabular-nums">{subsection.items.length}</span>
                </a>
                <OutlineItems items={subsection.items} parent={{ subsectionId: subsection.id }} indent="pl-7" editable={editable} pending={pending} onReorder={onReorder} />
              </div>
            ))}
            {editable ? (
              <div className="pl-4">
                <AddRow
                  label="Subsection"
                  placeholder="Nama Subsection"
                  compact
                  disabled={pending}
                  onAdd={(name) => onAddSubsection(section.id, name)}
                />
              </div>
            ) : null}
          </div>
        );
      })}
      {editable ? (
        <div className="mt-2 border-t border-line-subtle pt-2">
          <AddSectionDialog projectId={projectId} compact />
        </div>
      ) : null}
    </nav>
  );
}

export function ProjectEditor({
  project: initialProject,
  canManage,
  assemblies = [],
  units,
}: {
  project: BqProjectDetail;
  canManage: boolean;
  assemblies?: BqAssemblyTemplateRead[];
  units: UnitRead[];
}) {
  const [project, setProject] = useState(initialProject);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [importTarget, setImportTarget] = useState<{ itemId?: string; subObjectId?: string } | null>(null);
  /** A Work Item to apply an Assembly to as a Component Group. */
  const [assemblyItemId, setAssemblyItemId] = useState<string | null>(null);
  const [newItemTarget, setNewItemTarget] = useState<NewItemTarget | null>(null);
  /** The Work Item whose Cost Components are being saved as an Assembly. */
  const [saveAssemblyItem, setSaveAssemblyItem] = useState<BqItemDetail | null>(null);
  const router = useRouter();
  const [lockOpen, setLockOpen] = useState(false);
  /** Set when the server refused to lock because rows still have a price of Rp0: the count to confirm. */
  const [zeroPriceRows, setZeroPriceRows] = useState<number | null>(null);
  const [lifecycleConfirm, setLifecycleConfirm] = useState<"archive" | "restore" | "delete" | null>(null);
  const [quotationOpen, setQuotationOpen] = useState(false);
  const [selection, setSelection] = useState<LineItemSelection>(null);
  const [groupItemId, setGroupItemId] = useState<string | null>(null);
  const [moveConfirmation, setMoveConfirmation] = useState<MoveRequest | null>(null);
  const [moveNotice, setMoveNotice] = useState<{ message: string; tone: "neutral" | "success" } | null>(null);
  const [highlightedLineIds, setHighlightedLineIds] = useState<ReadonlySet<string>>(new Set());
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveBusy = useRef(false);

  const locked = project.status === "LOCKED" || project.status === "ARCHIVED";
  const editable = canManage && !locked;

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);

  const showMoveNotice = (message: string, tone: "neutral" | "success" = "neutral") => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setMoveNotice({ message, tone });
    noticeTimer.current = setTimeout(() => setMoveNotice(null), 3200);
  };

  const highlightMovedLines = (ids: readonly string[]) => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightedLineIds(new Set(ids));
    highlightTimer.current = setTimeout(() => setHighlightedLineIds(new Set()), 1800);
  };

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Every mutation returns the recomputed project, so totals move without a reload. */
  const run = (action: Mutation, fields: Record<string, string | undefined>) =>
    new Promise<void>((resolve, reject) => {
      const data = new FormData();
      data.set("projectId", project.id);
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) data.set(key, value);
      }
      startTransition(async () => {
        const result = await action(null, data);
        if (result.ok === false) {
          setError(result.error.safeMessage);
          const count = (result.error.details as { count?: unknown } | undefined)?.count;
          reject(Object.assign(new Error(result.error.safeMessage), { code: result.error.code, count: typeof count === "number" ? count : undefined }));
          return;
        }
        setError(null);
        setProject(result.data);
        setSelection(null);
        resolve();
      });
    });

  const transition = <T,>(work: () => Promise<T>) => new Promise<T>((resolve, reject) => {
    startTransition(async () => {
      try { resolve(await work()); }
      catch (caught) { reject(caught); }
    });
  });

  const runMoveTransition = (work: () => Promise<unknown>) => {
    if (moveBusy.current) return;
    moveBusy.current = true;
    void transition(work).catch(() => undefined).finally(() => { moveBusy.current = false; });
  };

  const invokeMoveAction = async <T,>(
    action: (prev: null, formData: FormData) => Promise<ActionResult<T>>,
    fields: Record<string, string>,
  ): Promise<T> => {
    const result = await action(null, actionData(fields));
    if (result.ok === false) {
      const stale = result.error.code === "bq.line-item.move-stale";
      const message = stale ? "Daftar berubah. Muat ulang untuk melihat yang terbaru." : result.error.safeMessage;
      setError(message);
      if (stale) router.refresh();
      throw Object.assign(new Error(message), { code: result.error.code });
    }
    setError(null);
    return result.data;
  };

  const applyLineItemMove = async (request: MoveRequest) => {
    const fields = buildLineItemMoveFields({
      projectId: project.id,
      itemId: request.itemId,
      lineItemIds: request.lineItemIds,
      ...(request.group ? { group: request.group } : { target: request.target as ExistingLineItemTarget }),
    });
    const nextProject = request.group
      ? await invokeMoveAction(groupLineItemsAction, fields)
      : await invokeMoveAction(moveLineItemsAction, fields);
    setProject(nextProject);
    setSelection(null);
    setGroupItemId(null);
    setMoveConfirmation(null);
    highlightMovedLines(request.lineItemIds);
    showMoveNotice(
      request.preview.changes ? "Selesai. Cost Component dipindahkan." : "Selesai. Harga Work Item tidak berubah.",
      "success",
    );
  };

  const requestLineItemMove = async (
    item: BqItemDetail,
    targetLabel: string,
    target: ExistingLineItemTarget | { newGroup: { qtyPerL1: string; markupL2Pct: string } },
    group?: { name: string; qtyPerL1: string; markupL2Pct: string },
  ) => {
    const selectedIds = selectionForItem(selection, item.id);
    if (selectedIds.length === 0) return;
    if (!("newGroup" in target) && selectionAlreadyAtTarget(item, selectedIds, target)) {
      showMoveNotice("Sudah di sana.");
      return;
    }
    const preview = await invokeMoveAction(previewLineItemMoveAction, buildLineItemMoveFields({
      projectId: project.id,
      itemId: item.id,
      lineItemIds: selectedIds,
      target,
    }));
    const request: MoveRequest = { itemId: item.id, lineItemIds: [...selectedIds], targetLabel, target, group, preview };
    setGroupItemId(null);
    if (!preview.changes) {
      await applyLineItemMove(request);
      return;
    }
    setMoveConfirmation(request);
  };

  /* InlineEdit restores the previous value when a commit rejects, so field
     validation surfaces in the cell rather than as a silent no-op. */
  const commit = (action: Mutation, id: string, field: string) => (value: string) =>
    run(action, { id, field, value });

  /** Like `commit` but resolves calculator expressions first (e.g. "=15000*3").
   *  If the expression cannot be parsed the raw string is forwarded unchanged
   *  and server-side validation will reject it, restoring the previous value. */
  const commitNum = (action: Mutation, id: string, field: string) => (raw: string) => {
    const resolved = resolveCalcExpression(raw.trim()) ?? raw.trim();
    return run(action, { id, field, value: resolved });
  };

  const totalColumns = 8;
  const readiness = summarizeReadiness(project.sections);
  /** The bar already states "X dari Y rincian sudah ada harga", so the footer drops its copy while the bar shows. */
  const readinessBarShown = project.status === "ACTIVE" && readiness.total + readiness.counts.tbc + readiness.counts.byOwner > 0;

  /** Opens the Work Item / Component Group that holds the row, then scrolls to it once it is on screen. */
  const jumpTo = (jump: { rowId: string; open: string[] }) => {
    if (jump.open.length > 0) {
      setExpanded((current) => new Set([...current, ...jump.open]));
    }
    window.setTimeout(() => document.getElementById(jump.rowId)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  };

  return (
    <div className="grid gap-4">
      {error ? <InlineError>{error}</InlineError> : null}
      {moveNotice ? <Notice tone={moveNotice.tone}>{moveNotice.message}</Notice> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <Text tone="secondary" size="sm">
          {project.sections.length} Section
          {canManage && project.status === "ACTIVE" ? " · dapat diedit" : null}
        </Text>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && project.status !== "ARCHIVED" ? (
            <Button variant="ghost" onClick={() => setQuotationOpen(true)} disabled={pending}>Detail quotation</Button>
          ) : null}
          <Link href={`/bq/print/${project.id}/quotation`} prefetch={false} className={buttonClasses("secondary", "md")}>
            <FileText aria-hidden="true" className="size-4" />
            Quotation
          </Link>
          {canManage && project.status === "ACTIVE" ? <>
            <Button variant="secondary" leadingIcon={<Lock aria-hidden="true" />} onClick={() => setLockOpen(true)} disabled={pending}>Kunci project</Button>
            <Button variant="ghost" leadingIcon={<Archive aria-hidden="true" />} onClick={() => setLifecycleConfirm("archive")} disabled={pending}>Arsipkan</Button>
          </> : null}
          {canManage && project.status === "LOCKED" ? (
            <Button variant="secondary" leadingIcon={<LockOpen aria-hidden="true" />} onClick={() => void run(unlockProjectAction, {}).catch(() => undefined)} disabled={pending}>Buka kunci</Button>
          ) : null}
          {canManage && project.status === "ARCHIVED" ? <>
            <Button variant="secondary" leadingIcon={<ArchiveRestore aria-hidden="true" />} onClick={() => setLifecycleConfirm("restore")} disabled={pending}>Pulihkan</Button>
            <Button variant="ghost" leadingIcon={<Trash2 aria-hidden="true" />} onClick={() => setLifecycleConfirm("delete")} disabled={pending}>Ajukan penghapusan</Button>
          </> : null}
          {project.status !== "ACTIVE" ? <Badge tone={project.status === "ARCHIVED" ? "warning" : "neutral"}>{project.status === "ARCHIVED" ? "Diarsipkan — hanya baca" : "Terkunci — hanya baca"}</Badge> : null}
        </div>
      </div>

      {readinessBarShown ? <ReadinessBar readiness={readiness} onJump={jumpTo} /> : null}

      <div className="flex items-start gap-5">
        <SectionOutline
          projectId={project.id}
          sections={project.sections}
          editable={editable}
          pending={pending}
          onAddSubsection={(sectionId, name) => run(addSubsectionAction, { sectionId, name })}
          onReorder={(parent, orderedIds) => run(reorderItemsAction, { ...parent, orderedIds: JSON.stringify(orderedIds) })}
        />
        <div className="grid min-w-0 flex-1 gap-4">
          {/* Below 1024 px the Struktur panel is hidden, so its "+ Section" is offered here. */}
          {editable ? (
            <div className="flex lg:hidden">
              <AddSectionDialog projectId={project.id} compact />
            </div>
          ) : null}
          {project.sections.length === 0 ? (
            <SectionCard>
              <EmptyState
                title="Belum ada Section"
                description={editable ? "Tambahkan Section untuk mulai menyusun BQ." : "Project ini belum memiliki Section."}
              />
            </SectionCard>
          ) : null}

          {project.sections.map((section) => (
        <SectionCard key={section.id} id={`bq-section-${section.id}`} className="grid gap-3">
          <div className="flex items-center">
            {editable ? (
              <InlineEdit
                value={section.name}
                label="Nama Section"
                className="text-base font-semibold text-ink"
                onCommit={(name) => run(updateSectionAction, { id: section.id, name })}
              />
            ) : (
              <Heading level={4}>{section.name}</Heading>
            )}
          </div>

          <ItemTable
            items={section.items}
            units={units}
            editable={editable}
            pending={pending}
            expanded={expanded}
            toggle={toggle}
            run={run}
            commit={commit}
            commitNum={commitNum}
            onImport={setImportTarget}
            onApplyAssembly={setAssemblyItemId}
            onSaveAssembly={setSaveAssemblyItem}
            selection={selection}
            highlightedLineIds={highlightedLineIds}
            onSelectLine={(itemId, lineItemId, checked) => setSelection((current) => toggleLineItemSelection(current, itemId, lineItemId, checked))}
            onSelectAll={(item, checked) => setSelection(selectAllLineItems(item, checked))}
            onGroup={(itemId) => { setError(null); setGroupItemId(itemId); }}
            onMove={(item, label, target) => {
              runMoveTransition(() => requestLineItemMove(item, label, target));
            }}
            columns={totalColumns}
          />
          {editable ? (
            <div className="flex">
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={<Plus aria-hidden="true" />}
                disabled={pending}
                onClick={() => setNewItemTarget({ sectionId: section.id, where: section.name })}
              >
                <span className="max-w-[28ch] truncate">Work Item di {section.name}</span>
              </Button>
            </div>
          ) : null}

          {section.subsections.map((subsection) => (
            <div key={subsection.id} id={`bq-subsection-${subsection.id}`} className="grid gap-2 rounded-control border border-line-subtle p-3">
              <div className="flex items-center">
                {editable ? (
                  <InlineEdit
                    value={subsection.name}
                    label="Nama Subsection"
                    className="text-sm font-semibold text-ink-secondary"
                    onCommit={(name) => run(updateSubsectionAction, { id: subsection.id, name })}
                  />
                ) : (
                  <Heading level={5} className="text-ink-secondary">{subsection.name}</Heading>
                )}
              </div>
              <ItemTable
                items={subsection.items}
                units={units}
                editable={editable}
                pending={pending}
                expanded={expanded}
                toggle={toggle}
                run={run}
                commit={commit}
                commitNum={commitNum}
                onImport={setImportTarget}
                onApplyAssembly={setAssemblyItemId}
                onSaveAssembly={setSaveAssemblyItem}
                selection={selection}
                highlightedLineIds={highlightedLineIds}
                onSelectLine={(itemId, lineItemId, checked) => setSelection((current) => toggleLineItemSelection(current, itemId, lineItemId, checked))}
                onSelectAll={(item, checked) => setSelection(selectAllLineItems(item, checked))}
                onGroup={(itemId) => { setError(null); setGroupItemId(itemId); }}
                onMove={(item, label, target) => {
                  runMoveTransition(() => requestLineItemMove(item, label, target));
                }}
                columns={totalColumns}
              />
              {editable ? (
                <div className="flex gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    leadingIcon={<Plus aria-hidden="true" />}
                    disabled={pending}
                    onClick={() => setNewItemTarget({ subsectionId: subsection.id, where: `${section.name} › ${subsection.name}` })}
                  >
                    <span className="max-w-[28ch] truncate">Work Item di {subsection.name}</span>
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {editable ? (
            // Only where the Struktur panel is hidden (< 1024 px); from there on "+ Subsection" lives in the panel.
            <div className="flex flex-wrap gap-1.5 border-t border-line-subtle pt-3 lg:hidden">
              <AddRow
                label="Subsection"
                placeholder="Nama Subsection"
                disabled={pending}
                onAdd={(name) => run(addSubsectionAction, { sectionId: section.id, name })}
              />
            </div>
          ) : null}
        </SectionCard>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface/95 px-4 py-3 shadow-plane backdrop-blur-sm">
        {readiness.total > 0 && !readinessBarShown ? (
          <Text
            tone="tertiary"
            size="sm"
            className={readiness.priced === readiness.total ? undefined : "text-warning"}
          >
            {readiness.priced} dari {readiness.total} rincian sudah ada harga
          </Text>
        ) : <span />}
        <div className="flex items-baseline gap-2">
          <Text tone="secondary" size="sm">Total keseluruhan</Text>
          <span className="text-xl font-semibold tabular-nums text-ink">
            {project.grandTotal === null
              ? <span className="text-sm font-normal text-ink-tertiary">Belum lengkap — ada harga yang kosong</span>
              : formatMoney(createMoney(project.grandTotal, "IDR"))}
          </span>
        </div>
      </div>

      {quotationOpen ? (
        <QuotationDialog
          quotation={project.quotation}
          pending={pending}
          onClose={() => setQuotationOpen(false)}
          onSave={(fields) => run(updateQuotationAction, fields).then(() => setQuotationOpen(false))}
        />
      ) : null}

      {importTarget ? (
        <ImportDialog
          key={`${importTarget.itemId ?? ""}:${importTarget.subObjectId ?? ""}`}
          target={importTarget}
          onClose={() => setImportTarget(null)}
          onPick={async (option) => {
            await run(addLineItemAction, {
              itemId: importTarget.itemId,
              subObjectId: importTarget.subObjectId,
              sourceType: option.sourceType,
              ...(option.sourceType === "CUSTOM"
                ? { kategori: option.kategori }
                : { sourceRefId: option.id, sourceKind: option.sourceKind }),
            });
            setImportTarget(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={lockOpen}
        onOpenChange={setLockOpen}
        title="Kunci project ini?"
        description={`Project terkunci tidak bisa diubah (struktur maupun angkanya) sampai kuncinya dibuka kembali.${readiness.counts.empty > 0 ? ` Masih ada ${readiness.counts.empty} harga kosong; isi atau tandai TBC / By Owner dulu.` : ""}`}
        confirmLabel="Kunci project"
        tone="primary"
        pending={pending}
        onConfirm={() => {
          void run(lockProjectAction, {})
            .catch((caught: { code?: string; count?: number }) => {
              // Rows priced Rp0 are not an error to hide: ask once more, then lock with the count recorded.
              if (caught?.code === "bq.project.lock-zero-prices" && typeof caught.count === "number") {
                setError(null);
                setZeroPriceRows(caught.count);
              }
            })
            .finally(() => setLockOpen(false));
        }}
      />

      <ConfirmDialog
        open={zeroPriceRows !== null}
        onOpenChange={(open) => { if (!open) setZeroPriceRows(null); }}
        title="Kunci dengan harga Rp0?"
        description={`${zeroPriceRows ?? 0} baris berharga Rp0. Jika memang disengaja, kunci saja. Jika belum, batalkan dan isi harganya dulu.`}
        confirmLabel="Tetap kunci"
        tone="danger"
        pending={pending}
        onConfirm={() => {
          void run(lockProjectAction, { acknowledgeZeroPrices: "true" }).catch(() => undefined).finally(() => setZeroPriceRows(null));
        }}
      />

      <ConfirmDialog
        open={lifecycleConfirm !== null}
        onOpenChange={(open) => { if (!open) setLifecycleConfirm(null); }}
        title={lifecycleConfirm === "archive" ? "Arsipkan project ini?" : lifecycleConfirm === "restore" ? "Pulihkan project ini?" : "Ajukan penghapusan permanen?"}
        description={lifecycleConfirm === "archive" ? "Project tetap bisa dibaca tetapi tidak bisa diubah sampai dipulihkan." : lifecycleConfirm === "restore" ? "Project kembali aktif dan bisa diubah lagi." : "Permintaan harus ditinjau oleh approver sebelum project terarsip ini dihapus permanen."}
        confirmLabel={lifecycleConfirm === "archive" ? "Arsipkan" : lifecycleConfirm === "restore" ? "Pulihkan" : "Kirim permintaan"}
        tone={lifecycleConfirm === "restore" ? "primary" : "danger"}
        pending={pending}
        onConfirm={() => {
          const action = lifecycleConfirm === "archive" ? archiveProjectAction : lifecycleConfirm === "restore" ? restoreProjectAction : requestProjectDeletionAction;
          void run(action, {}).catch(() => undefined).finally(() => setLifecycleConfirm(null));
        }}
      />

      {assemblyItemId ? (
        <AssemblyPickerDialog
          key={assemblyItemId}
          assemblies={assemblies}
          pending={pending}
          onClose={() => setAssemblyItemId(null)}
          onApply={(assemblyId, qtyPerL1) => {
            void run(applyAssemblyAction, { itemId: assemblyItemId, assemblyId, qtyPerL1 }).catch(() => undefined).finally(() => setAssemblyItemId(null));
          }}
        />
      ) : null}

      {saveAssemblyItem ? (
        <SaveAsAssemblyDialog
          key={saveAssemblyItem.id}
          initialName={saveAssemblyItem.name}
          lineCount={saveAssemblyItem.lineItems.length}
          pending={pending}
          error={error}
          onClose={() => setSaveAssemblyItem(null)}
          onSave={(name) => {
            void run(saveItemAsAssemblyAction, { itemId: saveAssemblyItem.id, name })
              .then(() => {
                setSaveAssemblyItem(null);
                // The Assembly list comes from the page, so fetch it again for the picker.
                router.refresh();
              })
              .catch(() => undefined);
          }}
        />
      ) : null}

      {newItemTarget ? (
        <NewWorkItemDialog
          assemblies={assemblies}
          units={units}
          where={newItemTarget.where}
          pending={pending}
          error={error}
          onClose={() => setNewItemTarget(null)}
          onSubmit={({ name, qty, unit, assemblyId }) => {
            const where = newItemTarget.sectionId ? { sectionId: newItemTarget.sectionId } : { subsectionId: newItemTarget.subsectionId };
            const request = assemblyId
              ? run(addItemAndApplyAssemblyAction, { ...where, assemblyId, name, qty, unit })
              : run(addItemAction, { ...where, name, qty, unit });
            void request.then(() => setNewItemTarget(null)).catch(() => undefined);
          }}
        />
      ) : null}

      {groupItemId && projectItem(project, groupItemId) ? (
        <GroupLineItemsDialog
          key={groupItemId}
          pending={pending}
          error={error}
          onClose={() => setGroupItemId(null)}
          onContinue={(group) => {
            const item = projectItem(project, groupItemId);
            if (!item) return;
            runMoveTransition(() => requestLineItemMove(
              item,
              `Component Group ${group.name}`,
              { newGroup: { qtyPerL1: group.qtyPerL1, markupL2Pct: group.markupL2Pct } },
              group,
            ));
          }}
        />
      ) : null}

      {moveConfirmation ? (
        <MovePriceDialog
          request={moveConfirmation}
          pending={pending}
          error={error}
          onCancel={() => {
            setError(null);
            setMoveConfirmation(null);
            showMoveNotice("Dibatalkan. Tidak ada yang berubah.");
          }}
          onApply={() => {
            runMoveTransition(() => applyLineItemMove(moveConfirmation));
          }}
        />
      ) : null}
    </div>
  );
}

function ItemTable({
  items,
  units,
  editable,
  pending,
  expanded,
  toggle,
  run,
  commit,
  commitNum,
  onImport,
  onApplyAssembly,
  onSaveAssembly,
  selection,
  highlightedLineIds,
  onSelectLine,
  onSelectAll,
  onGroup,
  onMove,
  columns,
}: {
  items: readonly BqItemDetail[];
  units: UnitRead[];
  editable: boolean;
  pending: boolean;
  expanded: ReadonlySet<string>;
  toggle: (id: string) => void;
  run: (action: Mutation, fields: Record<string, string | undefined>) => Promise<void>;
  commit: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
  commitNum: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
  onImport: (target: { itemId?: string; subObjectId?: string }) => void;
  onApplyAssembly?: (itemId: string) => void;
  onSaveAssembly?: (item: BqItemDetail) => void;
  selection: LineItemSelection;
  highlightedLineIds: ReadonlySet<string>;
  onSelectLine: (itemId: string, lineItemId: string, checked: boolean) => void;
  onSelectAll: (item: BqItemDetail, checked: boolean) => void;
  onGroup: (itemId: string) => void;
  onMove: (item: BqItemDetail, label: string, target: ExistingLineItemTarget) => void;
  columns: number;
}) {
  if (items.length === 0) {
    return <Text tone="tertiary" size="sm">Belum ada Work Item.</Text>;
  }

  return (
    <DataTable minWidth="960px" density="compact">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[72px]" aria-label="Pilih, buka, atau tutup" />
          <TableHead>Uraian</TableHead>
          <TableHead align="end" className="w-[90px]">Jumlah</TableHead>
          <TableHead className="w-[80px]">Satuan</TableHead>
          <TableHead align="end" className="w-[90px]">Koef.</TableHead>
          <TableHead align="end" className="w-[90px]">Markup</TableHead>
          <TableHead align="end" className="w-[150px]">Harga satuan</TableHead>
          <TableHead align="end" className="w-[140px]">Total</TableHead>
          {editable ? <TableHead align="end" className="w-[80px]" aria-label="Aksi" /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const open = expanded.has(item.id);
          const hasChildren = item.subObjects.length > 0 || item.lineItems.length > 0;
          return (
            <ItemRows
              key={item.id}
              item={item}
              units={units}
              open={open}
              hasChildren={hasChildren}
              editable={editable}
              pending={pending}
              expanded={expanded}
              toggle={toggle}
              run={run}
              commit={commit}
              commitNum={commitNum}
              onImport={onImport}
              onApplyAssembly={onApplyAssembly}
              onSaveAssembly={onSaveAssembly}
              selectedLineIds={selectionForItem(selection, item.id)}
              highlightedLineIds={highlightedLineIds}
              onSelectLine={onSelectLine}
              onSelectAll={onSelectAll}
              onGroup={onGroup}
              onMove={onMove}
              columns={columns + (editable ? 1 : 0)}
            />
          );
        })}
      </TableBody>
    </DataTable>
  );
}

function ItemRows({
  item,
  units,
  open,
  hasChildren,
  editable,
  pending,
  expanded,
  toggle,
  run,
  commit,
  commitNum,
  onImport,
  onApplyAssembly,
  onSaveAssembly,
  selectedLineIds,
  highlightedLineIds,
  onSelectLine,
  onSelectAll,
  onGroup,
  onMove,
  columns,
}: {
  item: BqItemDetail;
  units: UnitRead[];
  open: boolean;
  hasChildren: boolean;
  editable: boolean;
  pending: boolean;
  expanded: ReadonlySet<string>;
  toggle: (id: string) => void;
  run: (action: Mutation, fields: Record<string, string | undefined>) => Promise<void>;
  commit: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
  commitNum: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
  onImport: (target: { itemId?: string; subObjectId?: string }) => void;
  onApplyAssembly?: (itemId: string) => void;
  onSaveAssembly?: (item: BqItemDetail) => void;
  selectedLineIds: readonly string[];
  highlightedLineIds: ReadonlySet<string>;
  onSelectLine: (itemId: string, lineItemId: string, checked: boolean) => void;
  onSelectAll: (item: BqItemDetail, checked: boolean) => void;
  onGroup: (itemId: string) => void;
  onMove: (item: BqItemDetail, label: string, target: ExistingLineItemTarget) => void;
  columns: number;
}) {
  const allLineIds = lineItemIds(item);
  const selected = new Set(selectedLineIds);
  const allSelected = allLineIds.length > 0 && allLineIds.every((id) => selected.has(id));
  const moveMenuItems: Array<{ label: string; description?: string; disabled?: boolean; onSelect: () => void }> = [];
  lineItemTargetOptions(item).forEach((option) => {
    if (option.key === "new") moveMenuItems.push({ label: "────────────", disabled: true, onSelect: () => undefined });
    moveMenuItems.push({
      label: option.label,
      description: option.description,
      disabled: pending,
      onSelect: () => "newGroup" in option.target
        ? onGroup(item.id)
        : onMove(item, "direct" in option.target ? option.label : `Component Group ${option.label}`, option.target),
    });
  });
  return (
    <>
      <TableRow id={`bq-row-${item.id}`}>
        <TableCell>
          <div className="flex items-center gap-1">
            <IconButton
              size="sm"
              variant="ghost"
              label={open ? `Tutup ${item.name}` : `Buka ${item.name}`}
              icon={open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
              onClick={() => toggle(item.id)}
            />
            {editable && allLineIds.length > 0 ? (
              <Checkbox
                label={<span className="sr-only">Pilih semua Cost Component dari {item.name}</span>}
                checked={allSelected ? true : selectedLineIds.length > 0 ? "indeterminate" : false}
                disabled={pending}
                onCheckedChange={(checked) => onSelectAll(item, checked === true)}
              />
            ) : null}
          </div>
        </TableCell>
        <TableCell wrap className="font-medium">
          <InlineEdit label="Nama Work Item" value={item.name} disabled={!editable} onCommit={commit(updateItemAction, item.id, "name")} />
          <Text tone="tertiary" size="sm" className="mt-0.5 block font-normal">
            {isMarkerPriceMode(item.priceMode)
              ? "Baris penanda — tidak masuk total"
              : hasChildren
                ? `Harga dari rincian (${item.lineItems.length + item.subObjects.reduce((sum, group) => sum + group.lineItems.length, 0)} baris)`
                : "Harga langsung"}
          </Text>
        </TableCell>
        <TableCell align="end">
          <InlineEdit label="Jumlah" align="end" inputMode="decimal" value={item.qty} disabled={!editable} onCommit={commitNum(updateItemAction, item.id, "qty")} />
        </TableCell>
        <TableCell>{editable ? <Select aria-label="Satuan Work Item" value={item.unit} disabled={pending} onChange={(event) => void commit(updateItemAction, item.id, "unit")(event.target.value).catch(() => undefined)}>{units.some((unit) => unit.code === item.unit) ? null : <option value={item.unit} disabled>{item.unit} (inactive snapshot)</option>}{units.map((unit) => <option key={unit.id} value={unit.code}>{unit.code}</option>)}</Select> : item.unit}</TableCell>
        {/* Koef. and Markup are two fixed columns rather than one cell that
            switches meaning: an L1 with children takes its cost from them, so
            its own coefficient is dormant (shown "—"); a childless L1 has no
            markup of its own (zeroed automatically — zeroMarkupIfChildless). */}
        <TableCell align="end">
          {hasChildren ? (
            <Text tone="tertiary" size="sm">—</Text>
          ) : (
            <InlineEdit label="Coefficient" align="end" inputMode="decimal" value={item.koefisien} disabled={!editable} onCommit={commitNum(updateItemAction, item.id, "koefisien")} />
          )}
        </TableCell>
        <TableCell align="end">
          {hasChildren ? (
            <InlineEdit label="Markup percent" align="end" inputMode="decimal" value={item.markupL1Pct} disabled={!editable} onCommit={commitNum(updateItemAction, item.id, "markupL1Pct")} />
          ) : (
            <Tooltip content="Markup tidak berlaku untuk Work Item tanpa breakdown — nilainya otomatis 0.">
              <span className="inline-block"><Text tone="tertiary" size="sm">—</Text></span>
            </Tooltip>
          )}
        </TableCell>
        <TableCell align="end">
          {isMarkerPriceMode(item.priceMode) ? (
            <Tooltip content="Tidak diberi harga dan tidak masuk total. Ubah di baris pengaturan harga Work Item ini.">
              <span className="inline-block"><Badge tone="neutral">{PRICE_STATUS_LABEL[item.priceMode]}</Badge></span>
            </Tooltip>
          ) : hasChildren ? (
            money(item.rate)
          ) : (
            <InlineEdit
              label="Harga satuan"
              align="end"
              inputMode="decimal"
              placeholder="Belum diisi"
              value={item.hargaSnapshot ?? ""}
              display={(value) => !value
                ? <span className="font-medium text-warning">Belum diisi</span>
                : isZeroPrice(value)
                  ? <span className="font-medium text-warning">Rp 0</span>
                  : formatMoney(createMoney(value, "IDR"))}
              disabled={!editable}
              onCommit={commitNum(updateItemAction, item.id, "hargaSnapshot")}
            />
          )}
        </TableCell>
        <TableCell align="end" className="font-semibold">
          {isMarkerPriceMode(item.priceMode) ? <Text tone="tertiary" size="sm">{PRICE_STATUS_LABEL[item.priceMode]}</Text> : money(item.total)}
        </TableCell>
        {editable ? (
          <TableCell align="end">
            <RemoveButton
              label={`Hapus ${item.name}`}
              onRemove={() => run(deleteItemAction, { id: item.id })}
              disabled={pending}
            />
          </TableCell>
        ) : null}
      </TableRow>

      {editable && selectedLineIds.length > 0 ? (
        <TableRow>
          <TableCell colSpan={columns}>
            <SelectionBar count={selectedLineIds.length} label={(count) => `${count} dipilih`}>
              <Button size="sm" variant="secondary" pending={pending} disabled={pending} onClick={() => onGroup(item.id)}>Kelompokkan…</Button>
              <ButtonMenu label={pending ? "Memproses…" : "Pindahkan ke"} variant="secondary" align="start" items={moveMenuItems} />
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => onSelectAll(item, false)}>Batal pilih</Button>
            </SelectionBar>
          </TableCell>
        </TableRow>
      ) : null}

      {open ? (
        <>
          {item.subObjects.map((subObject) => (
            <SubObjectRows
              key={subObject.id}
              subObject={subObject}
              editable={editable}
              pending={pending}
              expanded={expanded}
              toggle={toggle}
              run={run}
              commit={commit}
              commitNum={commitNum}
              onImport={onImport}
              itemId={item.id}
              selectedLineIds={selected}
              highlightedLineIds={highlightedLineIds}
              onSelectLine={onSelectLine}
              columns={columns}
            />
          ))}

          {item.lineItems.map((line) => (
            <LineItemRow
              key={line.id}
              line={line}
              depth={1}
              editable={editable}
              pending={pending}
              run={run}
              commit={commit}
              commitNum={commitNum}
              itemId={item.id}
              selected={selected.has(line.id)}
              highlighted={highlightedLineIds.has(line.id)}
              onSelect={onSelectLine}
            />
          ))}

          {editable || isMarkerPriceMode(item.priceMode) ? (
            <TableRow>
              <TableCell />
              <TableCell colSpan={columns - 1}>
                <div className="flex flex-wrap items-center gap-1.5 pl-4">
                  {editable ? (
                    <label className="mr-2 flex items-center gap-2 text-sm text-ink-secondary">
                      Status harga
                      <Select
                        aria-label={`Status harga ${item.name}`}
                        value={item.priceMode}
                        disabled={pending}
                        onChange={(event) => void commit(updateItemAction, item.id, "priceMode")(event.target.value).catch(() => undefined)}
                      >
                        {BQ_PRICE_MODES.map((mode) => <option key={mode} value={mode}>{mode === "PRICED" ? "Berharga" : `${PRICE_STATUS_LABEL[mode]} — tidak dihitung`}</option>)}
                      </Select>
                    </label>
                  ) : null}
                  {isMarkerPriceMode(item.priceMode) ? (
                    <Text tone="tertiary" size="sm" className="mr-2">
                      Ditandai {PRICE_STATUS_LABEL[item.priceMode]}: quotation tidak menampilkan harga baris ini dan total keseluruhan tidak menghitungnya.
                    </Text>
                  ) : null}
                  {editable ? <>
                  <Button
                    size="sm"
                    variant="ghost"
                    leadingIcon={<Plus aria-hidden="true" />}
                    disabled={pending}
                    onClick={() => onImport({ itemId: item.id })}
                  >
                    Cost Component
                  </Button>
                  <AddRow
                    label="Component Group"
                    placeholder="Nama Component Group"
                    disabled={pending}
                    onAdd={(name) => run(addSubObjectAction, { itemId: item.id, name })}
                  />
                  {onApplyAssembly ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => onApplyAssembly(item.id)}
                    >
                      Terapkan Assembly
                    </Button>
                  ) : null}
                  {onSaveAssembly && item.lineItems.length > 0 && item.subObjects.length === 0 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => onSaveAssembly(item)}
                    >
                      Simpan sebagai Assembly
                    </Button>
                  ) : null}
                  </> : null}
                </div>
              </TableCell>
            </TableRow>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function SubObjectRows({
  subObject,
  editable,
  pending,
  expanded,
  toggle,
  run,
  commit,
  commitNum,
  onImport,
  itemId,
  selectedLineIds,
  highlightedLineIds,
  onSelectLine,
  columns,
}: {
  subObject: BqSubObjectDetail;
  editable: boolean;
  pending: boolean;
  expanded: ReadonlySet<string>;
  toggle: (id: string) => void;
  run: (action: Mutation, fields: Record<string, string | undefined>) => Promise<void>;
  commit: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
  commitNum: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
  onImport: (target: { itemId?: string; subObjectId?: string }) => void;
  itemId: string;
  selectedLineIds: ReadonlySet<string>;
  highlightedLineIds: ReadonlySet<string>;
  onSelectLine: (itemId: string, lineItemId: string, checked: boolean) => void;
  columns: number;
}) {
  const open = expanded.has(subObject.id);
  const highlighted = subObject.lineItems.some((line) => highlightedLineIds.has(line.id));
  return (
    <>
      <TableRow selected={highlighted} className={highlighted ? undefined : "bg-[color-mix(in_srgb,var(--ui-surface-muted)_45%,transparent)]"}>
        <TableCell />
        <TableCell wrap>
          <div className="flex items-center gap-1 pl-4">
            <IconButton
              size="sm"
              variant="ghost"
              label={open ? `Tutup ${subObject.name}` : `Buka ${subObject.name}`}
              icon={open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
              onClick={() => toggle(subObject.id)}
            />
            <div className="min-w-0">
              <InlineEdit label="Nama Component Group" value={subObject.name} disabled={!editable} onCommit={commit(updateSubObjectAction, subObject.id, "name")} />
              {/* A Component Group is not a plain folder: its multiplier and extra % change the Work Item's price, so both
                  stay in view here, never behind a menu. */}
              <Text tone="tertiary" size="sm" className="block">
                {subObject.lineItems.length === 0
                  ? "Component Group kosong"
                  : "Component Group · jumlah per Work Item dan markup ikut menghitung harga"}
              </Text>
            </div>
          </div>
        </TableCell>
        <TableCell align="end">
          <InlineEdit label="Jumlah per Work Item" align="end" inputMode="decimal" value={subObject.qtyPerL1} disabled={!editable} onCommit={commitNum(updateSubObjectAction, subObject.id, "qtyPerL1")} />
        </TableCell>
        <TableCell><Text tone="tertiary" size="sm">per Work Item</Text></TableCell>
        <TableCell align="end">
          <Text tone="tertiary" size="sm">—</Text>
        </TableCell>
        <TableCell align="end">
          <Tooltip content="Markup Component Group ini (%) — hanya berlaku untuk Cost Component di dalamnya.">
            <span className="inline-block">
              <InlineEdit label="Markup percent" align="end" inputMode="decimal" value={subObject.markupL2Pct} disabled={!editable} onCommit={commitNum(updateSubObjectAction, subObject.id, "markupL2Pct")} />
            </span>
          </Tooltip>
        </TableCell>
        <TableCell align="end">{money(subObject.subtotalL2Raw)}</TableCell>
        <TableCell align="end">{money(subObject.subtotalL2)}</TableCell>
        {editable ? (
          <TableCell align="end">
            <RemoveButton
              label={`Hapus ${subObject.name}`}
              onRemove={() => run(deleteSubObjectAction, { id: subObject.id })}
              disabled={pending}
            />
          </TableCell>
        ) : null}
      </TableRow>

      {open ? (
        <>
          {subObject.lineItems.map((line) => (
            <LineItemRow
              key={line.id}
              line={line}
              depth={2}
              editable={editable}
              pending={pending}
              run={run}
              commit={commit}
              commitNum={commitNum}
              itemId={itemId}
              selected={selectedLineIds.has(line.id)}
              highlighted={highlightedLineIds.has(line.id)}
              onSelect={onSelectLine}
            />
          ))}
          {editable ? (
            <TableRow>
              <TableCell />
              <TableCell colSpan={columns - 1}>
                <div className="flex flex-wrap items-center gap-1.5 pl-10">
                  <Button
                    size="sm"
                    variant="ghost"
                    leadingIcon={<Plus aria-hidden="true" />}
                    disabled={pending}
                    onClick={() => onImport({ subObjectId: subObject.id })}
                  >
                    Cost Component
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function LineItemRow({
  line,
  depth,
  editable,
  pending,
  run,
  commit,
  commitNum,
  itemId,
  selected,
  highlighted,
  onSelect,
}: {
  line: BqLineItemDetail;
  depth: 1 | 2;
  editable: boolean;
  pending: boolean;
  run: (action: Mutation, fields: Record<string, string | undefined>) => Promise<void>;
  commit: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
  commitNum: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
  itemId: string;
  selected: boolean;
  highlighted: boolean;
  onSelect: (itemId: string, lineItemId: string, checked: boolean) => void;
}) {
  return (
    <TableRow id={`bq-row-${line.id}`} selected={selected || highlighted}>
      <TableCell>
        {editable ? (
          <Checkbox
            label={<span className="sr-only">Pilih Cost Component {line.titleSnapshot}</span>}
            checked={selected}
            disabled={pending}
            onCheckedChange={(checked) => onSelect(itemId, line.id, checked === true)}
          />
        ) : null}
      </TableCell>
      <TableCell wrap>
        <div className={depth === 2 ? "pl-10" : "pl-4"}>
          <InlineEdit label="Nama Cost Component" value={line.titleSnapshot} disabled={!editable} onCommit={commit(updateLineItemAction, line.id, "titleSnapshot")} />
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{KATEGORI_LABEL[line.kategori] ?? line.kategori}</Badge>
            {line.sourceType !== "CUSTOM" ? (
              <Text tone="tertiary" size="sm">
                {line.sourceType === "MASTERDATA" ? "Salinan harga Master Data" : "Salinan harga BQ Library"}
              </Text>
            ) : null}
            {/* bq-contract K-03: the factor is context for setting a coefficient,
                never a term in the formula. */}
            {line.purchaseToBaseFactorSnapshot && line.baseUnitSnapshot ? (
              <Text tone="tertiary" size="sm">
                1 {line.purchaseUnitSnapshot} = {line.purchaseToBaseFactorSnapshot} {line.baseUnitSnapshot}
              </Text>
            ) : null}
            {line.sourcePriceSnapshot !== null && line.hargaSnapshot !== line.sourcePriceSnapshot ? (
              <>
                <Badge tone="warning">Harga diubah</Badge>
                {/* Master Data is untouched: this only sets this row's price back to the copy taken when it was added. */}
                {editable ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void run(revertLineItemPriceAction, { id: line.id }).catch(() => undefined)}
                    className="inline-flex items-center gap-1 rounded-control text-sm text-action underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    <RotateCcw aria-hidden="true" className="size-3.5" />
                    Kembalikan ke {formatMoney(createMoney(line.sourcePriceSnapshot, line.currencySnapshot))}
                  </button>
                ) : (
                  <Text tone="tertiary" size="sm">Harga awal {formatMoney(createMoney(line.sourcePriceSnapshot, line.currencySnapshot))}</Text>
                )}
              </>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell align="end">
        <InlineEdit label="Jumlah" align="end" inputMode="decimal" value={line.qty} disabled={!editable} onCommit={commitNum(updateLineItemAction, line.id, "qty")} />
      </TableCell>
      <TableCell>
        <InlineEdit label="Satuan" value={line.purchaseUnitSnapshot} disabled={!editable} onCommit={commit(updateLineItemAction, line.id, "purchaseUnitSnapshot")} />
      </TableCell>
      <TableCell align="end">
        <InlineEdit label="Coefficient" align="end" inputMode="decimal" value={line.koefisien} disabled={!editable} onCommit={commitNum(updateLineItemAction, line.id, "koefisien")} />
      </TableCell>
      <TableCell align="end">
        <Text tone="tertiary" size="sm">—</Text>
      </TableCell>
      <TableCell align="end">
        <InlineEdit
          label="Harga satuan"
          align="end"
          inputMode="decimal"
          value={line.hargaSnapshot}
          disabled={!editable}
          display={(value) => !value
            ? <span className="font-medium text-warning">Belum diisi</span>
            : isZeroPrice(value)
              ? <span className="font-medium text-warning">Rp 0</span>
              : formatMoney(createMoney(value, line.currencySnapshot))}
          onCommit={commitNum(updateLineItemAction, line.id, "hargaSnapshot")}
        />
      </TableCell>
      <TableCell align="end">{money(line.biayaLine, line.currencySnapshot)}</TableCell>
      {editable ? (
        <TableCell align="end">
          <div className="flex items-center justify-end gap-0.5">
            <RemoveButton
              label={`Hapus ${line.titleSnapshot}`}
              onRemove={() => run(deleteLineItemAction, { id: line.id })}
              disabled={pending}
            />
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function GroupLineItemsDialog({
  pending,
  error,
  onClose,
  onContinue,
}: {
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onContinue: (group: { name: string; qtyPerL1: string; markupL2Pct: string }) => void;
}) {
  const [name, setName] = useState("Component Group baru");
  const [qtyPerL1, setQtyPerL1] = useState("1");
  const [markupL2Pct, setMarkupL2Pct] = useState("0");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setValidationMessage("Nama Component Group wajib diisi."); return; }
    try {
      const normalizedQty = toDecimalString(qtyPerL1.trim());
      if (compareDecimals(normalizedQty, toDecimalString("0")) <= 0) {
        setValidationMessage("Quantity per Work Item harus lebih dari 0.");
        return;
      }
      const normalizedMarkup = toDecimalString(markupL2Pct.trim());
      if (compareDecimals(normalizedMarkup, toDecimalString("0")) < 0 || compareDecimals(normalizedMarkup, toDecimalString("999.9999")) > 0) {
        setValidationMessage("Markup harus antara 0% dan 999.9999%.");
        return;
      }
      setValidationMessage(null);
      onContinue({ name: trimmedName, qtyPerL1: normalizedQty, markupL2Pct: normalizedMarkup });
    } catch {
      setValidationMessage("Quantity dan markup harus berupa angka desimal yang valid.");
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Kelompokkan Cost Component"
      description="Buat Component Group baru untuk Cost Component yang dipilih."
      size="sm"
      dismissible={!pending}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) submit();
        }}
      >
        {validationMessage ? <InlineError>{validationMessage}</InlineError> : error ? <InlineError>{error}</InlineError> : null}
        <Field label="Nama Component Group" required>
          <Input autoFocus value={name} maxLength={160} required onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Quantity per Work Item" required>
          <Input inputMode="decimal" value={qtyPerL1} required onChange={(event) => setQtyPerL1(event.target.value)} />
        </Field>
        <Field label="Markup %" required>
          <Input inputMode="decimal" value={markupL2Pct} required onChange={(event) => setMarkupL2Pct(event.target.value)} />
        </Field>
        <Notice>Dengan ×1 dan 0%, harga Work Item tidak berubah.</Notice>
        <FormActions>
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Batal</Button>
          <Button type="submit" variant="primary" pending={pending} disabled={pending}>Lanjut</Button>
        </FormActions>
      </form>
    </Dialog>
  );
}

function MovePriceDialog({
  request,
  pending,
  error,
  onCancel,
  onApply,
}: {
  request: MoveRequest;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onCancel(); }}
      title="Harga Work Item akan berubah"
      description={request.targetLabel === "Langsung di Work Item"
        ? `${request.lineItemIds.length} Cost Component akan dipindahkan langsung di Work Item.`
        : `${request.lineItemIds.length} Cost Component akan dipindahkan ke ${request.targetLabel}.`}
      size="md"
      dismissible={!pending}
    >
      <div className="grid gap-4">
        {error ? <InlineError>{error}</InlineError> : null}
        <DataTable density="compact">
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead align="end">Sebelum</TableHead>
              <TableHead align="end">Sesudah</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Harga satuan Work Item</TableCell>
              <TableCell align="end">{money(request.preview.beforeRate)}</TableCell>
              <TableCell align="end">{money(request.preview.afterRate)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Total Work Item</TableCell>
              <TableCell align="end">{money(request.preview.beforeTotal)}</TableCell>
              <TableCell align="end">{money(request.preview.afterTotal)}</TableCell>
            </TableRow>
          </TableBody>
        </DataTable>
        <div className="flex items-baseline justify-between gap-3">
          <Text tone="secondary" size="sm">Selisih total</Text>
          <Text weight="semibold">{money(request.preview.totalDifference)}</Text>
        </div>
        <FormActions>
          <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>Batal</Button>
          <Button type="button" variant="primary" pending={pending} disabled={pending} onClick={onApply}>Pindahkan</Button>
        </FormActions>
      </div>
    </Dialog>
  );
}

function AddRow({
  label,
  placeholder,
  disabled,
  compact = false,
  onAdd,
}: {
  label: string;
  placeholder: string;
  disabled: boolean;
  /** A narrower input, for the Struktur panel. */
  compact?: boolean;
  onAdd: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (!open) {
    return (
      <Button size="sm" variant="ghost" leadingIcon={<Plus aria-hidden="true" />} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        void onAdd(name.trim()).then(() => {
          setName("");
          setOpen(false);
        });
      }}
    >
      <Input
        autoFocus
        value={name}
        placeholder={placeholder}
        aria-label={placeholder}
        className={compact ? "h-8 w-[104px]" : "h-8 w-[200px]"}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => { if (!name.trim()) setOpen(false); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setName("");
            setOpen(false);
          }
        }}
      />
      <Button size="sm" variant="primary" type="submit" disabled={disabled || !name.trim()}>Tambah</Button>
    </form>
  );
}

function RemoveButton({ label, onRemove, disabled }: { label: string; onRemove: () => Promise<void>; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton size="sm" variant="ghost" label={label} icon={<Trash2 aria-hidden="true" />} disabled={disabled} onClick={() => setOpen(true)} />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={label}
        description="Baris ini beserta isinya akan dihapus permanen dari project."
        confirmLabel="Hapus"
        tone="danger"
        pending={disabled}
        onConfirm={() => {
          void onRemove().finally(() => setOpen(false));
        }}
      />
    </>
  );
}
