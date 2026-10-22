"use client";

import { ChevronDown, ChevronRight, ChevronUp, FileText, FolderPlus, GripVertical, Library, ListPlus, Plus, RotateCcw, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

import {
  Badge,
  Button,
  ButtonMenu,
  buttonClasses,
  ConfirmDialog,
  ContextActionMenu,
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
  Select,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  type RowActionItem,
} from "@/platform/ui_engine";
import { createMoney, formatMoney } from "@platform/utilities/money";
import { addDecimals, compareDecimals, toDecimalString } from "@platform/utilities/decimal";
import type { ActionResult } from "@platform/core/actions";
import type {
  BqAssemblyTemplateRead,
  BqItemDetail,
  BqLineItemDetail,
  BqProjectDetail,
  BqSectionDetail,
  BqSubObjectDetail,
  PriceKeptReason,
  PriceRefresh,
} from "@/apps/bq/public";
import { BQ_PRICE_MODES, isMarkerPriceMode } from "@/apps/bq/lib/quotation";
import type { UnitRead } from "@/apps/masterdata/public";

import { resolveCalcExpression } from "@/apps/bq/lib/calc-expression";
import { specificationFromComponents } from "@/apps/bq/lib/specification";

import {
  addItemAction,
  addItemAndApplyAssemblyAction,
  addLineItemAction,
  addSubsectionAction,
  applyAssemblyAction,
  deleteSectionAction,
  deleteItemAction,
  deleteLineItemAction,
  deleteSubsectionAction,
  deleteSubObjectAction,
  moveItemsWithinSectionAction,
  updateItemAction,
  updateLineItemAction,
  updateSubObjectAction,
  updateSectionAction,
  updateSubsectionAction,
  reorderItemsAction,
  reorderSectionsAction,
  previewLineItemMoveAction,
  moveLineItemsAction,
  groupLineItemsAction,
  revertLineItemPriceAction,
  saveLineItemToLibraryAction,
  saveItemAsAssemblyAction,
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
  selectionAlreadyAtTarget,
  selectionForItem,
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

/**
 * The row whose values the side panel shows (owner 2026-10-14, option B: the table is for reading and selecting,
 * values change in the panel; names stay editable in the table).
 */
type Inspected = { kind: "item" | "group" | "line"; id: string } | null;
type InspectedFound =
  | { kind: "item"; item: BqItemDetail }
  | { kind: "group"; item: BqItemDetail; group: BqSubObjectDetail }
  | { kind: "line"; item: BqItemDetail; group: BqSubObjectDetail | null; line: BqLineItemDetail };

function findInspected(project: BqProjectDetail, target: Inspected): InspectedFound | null {
  if (!target) return null;
  for (const section of project.sections) {
    for (const item of [...section.items, ...section.subsections.flatMap((subsection) => subsection.items)]) {
      if (target.kind === "item" && item.id === target.id) return { kind: "item", item };
      for (const group of item.subObjects) {
        if (target.kind === "group" && group.id === target.id) return { kind: "group", item, group };
        const line = target.kind === "line" ? group.lineItems.find((row) => row.id === target.id) : undefined;
        if (line) return { kind: "line", item, group, line };
      }
      const line = target.kind === "line" ? item.lineItems.find((row) => row.id === target.id) : undefined;
      if (line) return { kind: "line", item, group: null, line };
    }
  }
  return null;
}

/** Where a new Work Item will land; `where` is the Section/Subsection name shown in its dialog. */
type NewItemTarget = { sectionId?: string; subsectionId?: string; where: string };

type Mutation = (prev: null, formData: FormData) => Promise<ActionResult<BqProjectDetail>>;

const PRICE_KEPT_LABEL: Record<PriceKeptReason, string> = {
  "source-missing": "sumber sudah tidak ada",
  "no-permission": "tanpa akses harga Master Data",
  "unit-changed": "satuan di sumber berubah",
  currency: "harga sumber bukan Rupiah",
};
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

function lineItemsOf(item: BqItemDetail): BqLineItemDetail[] {
  return [...item.subObjects.flatMap((group) => group.lineItems), ...item.lineItems];
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
        <Text tone="tertiary" size="sm" className="ml-auto">{readiness.priced} dari {readiness.total} Cost Component sudah ada harga</Text>
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
 * The Work Items of one Section or Subsection as a list that can be re-ordered by dragging (owner 2026-10-14: the
 * arrow buttons are gone, the grip is enough). Only the order within this parent changes; nothing here moves a Work Item elsewhere or
 * touches a price. The server checks the whole list again (stale lists are refused).
 */
function OutlineItems({
  items,
  parent,
  indent,
  editable,
  pending,
  onReorder,
  onDelete,
}: {
  items: readonly BqItemDetail[];
  parent: ReorderParent;
  indent: string;
  editable: boolean;
  pending: boolean;
  onReorder: (parent: ReorderParent, orderedIds: string[]) => Promise<void>;
  onDelete: (item: BqItemDetail) => void;
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
    <ul className="m-0 grid min-w-0 grid-cols-1 list-none gap-0.5 p-0">
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
          {editable ? <span className="opacity-0 transition-opacity group-hover/outline:opacity-100 group-focus-within/outline:opacity-100"><IconButton size="sm" variant="ghost" label={`Hapus ${item.name}`} icon={<Trash2 aria-hidden="true" />} disabled={pending} onClick={() => onDelete(item)} /></span> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * The document's structure and the one place that changes it: each Section lists its Subsections and offers
 * "+ Subsection" right under them; "+ Section" closes the list. Names change here (double-click) and Sections,
 * Subsections and Work Items are re-ordered here by dragging. Shown from 1024 px; narrower screens get the same
 * actions in the work area (see ProjectEditor), so nothing disappears with the panel.
 */
/** The rename box of the Struktur panel: Enter or leaving it saves, Escape keeps the old name. */
function OutlineRename({ name, className, onSave, onCancel }: { name: string; className: string; onSave: (name: string) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState(name);
  const done = useRef(false);
  const save = () => {
    if (done.current) return;
    done.current = true;
    const next = draft.trim();
    if (!next) { onCancel(); return; }
    void onSave(next);
  };
  return (
    <div className={className}>
      <Input
        aria-label="Nama baru"
        value={draft}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); save(); }
          if (event.key === "Escape") { event.preventDefault(); done.current = true; onCancel(); }
        }}
      />
    </div>
  );
}

function SectionOutline({
  projectId,
  sections,
  editable,
  pending,
  onAddSubsection,
  onRenameSection,
  onRenameSubsection,
  onDeleteSection,
  onDeleteSubsection,
  onDeleteWorkItem,
  onAddWorkItem,
  onReorder,
  onReorderSections,
}: {
  projectId: string;
  sections: readonly BqSectionDetail[];
  editable: boolean;
  pending: boolean;
  onAddSubsection: (sectionId: string, name: string) => Promise<void>;
  onRenameSection: (id: string, name: string) => Promise<void>;
  onRenameSubsection: (id: string, name: string) => Promise<void>;
  onDeleteSection: (section: BqSectionDetail) => void;
  onDeleteSubsection: (subsection: { id: string; name: string; itemCount: number; sectionName: string }) => void;
  onDeleteWorkItem: (item: BqItemDetail) => void;
  onAddWorkItem: (target: NewItemTarget) => void;
  onReorder: (parent: ReorderParent, orderedIds: string[]) => Promise<void>;
  onReorderSections: (sectionId: string | null, orderedIds: string[]) => Promise<void>;
}) {
  // Double-click a Section or Subsection name to rename it here (owner 2026-10-14); a single click still jumps to it.
  const [renaming, setRenaming] = useState<string | null>(null);
  // Drag a Section among Sections, a Subsection among the Subsections of its Section (owner 2026-10-14).
  const [drag, setDrag] = useState<{ parent: string | null; id: string; over: string | null } | null>(null);
  const dragProps = (parent: string | null, id: string, siblings: readonly string[]) => editable && !pending ? {
    draggable: true,
    onDragStart: (event: ReactDragEvent) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); setDrag({ parent, id, over: null }); },
    onDragOver: (event: ReactDragEvent) => {
      if (!drag || drag.parent !== parent || drag.id === id) return;
      event.preventDefault();
      event.stopPropagation();
      if (drag.over !== id) setDrag({ ...drag, over: id });
    },
    onDrop: (event: ReactDragEvent) => {
      if (!drag || drag.parent !== parent) return;
      event.preventDefault();
      event.stopPropagation();
      const next = siblings.filter((candidate) => candidate !== drag.id);
      next.splice(siblings.indexOf(id), 0, drag.id);
      setDrag(null);
      if (next.some((candidate, at) => candidate !== siblings[at])) void onReorderSections(parent, next).catch(() => undefined);
    },
    onDragEnd: () => setDrag(null),
  } : {};
  const dropMark = (id: string) => (drag?.over === id ? "bg-surface-muted ring-1 ring-line-focus" : drag?.id === id ? "opacity-50" : "");
  const sectionIds = sections.map((section) => section.id);
  // Struktur shows Sections and Subsections (owner 2026-10-14): a Section folds away, and a Subsection lists its Work
  // Items (to re-order them) only when opened.
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [itemsOpen, setItemsOpen] = useState<ReadonlySet<string>>(new Set());
  const flip = (set: ReadonlySet<string>, id: string) => { const next = new Set(set); if (!next.delete(id)) next.add(id); return next; };
  if (sections.length === 0 && !editable) return null;
  const chevron = (open: boolean, name: string, onToggle: () => void, hidden = false) => (
    <button
      type="button"
      aria-label={open ? `Tutup ${name}` : `Buka ${name}`}
      aria-expanded={open}
      onClick={onToggle}
      className={`grid size-5 shrink-0 place-items-center rounded-action text-ink-tertiary hover:bg-surface hover:text-ink ${hidden ? "invisible" : ""}`}
    >
      {open ? <ChevronDown aria-hidden="true" className="size-3.5" /> : <ChevronRight aria-hidden="true" className="size-3.5" />}
    </button>
  );
  // The count, or the grip while the row is hovered (the whole row drags).
  const tail = (count: number) => (
    <span className="relative grid shrink-0 place-items-center">
      <span className={`rounded-pill bg-surface-muted px-1.5 text-[11px] tabular-nums text-ink-tertiary ${editable ? "group-hover/outline:invisible" : ""}`} title={`${count} Work Item`}>{count}</span>
      {editable ? <GripVertical aria-hidden="true" className="absolute size-3.5 cursor-grab text-ink-tertiary opacity-0 group-hover/outline:opacity-100" /> : null}
    </span>
  );
  const nameField = (id: string, name: string, onRename: (id: string, name: string) => Promise<void>, className: string) => (
    <OutlineRename
      key={id}
      name={name}
      className={className}
      onCancel={() => setRenaming(null)}
      onSave={async (next) => { if (next !== name) await onRename(id, next).catch(() => undefined); setRenaming(null); }}
    />
  );
  return (
    <nav
      aria-label="Struktur dokumen"
      className="sticky top-0 hidden w-[220px] min-w-0 shrink-0 flex-col gap-0.5 self-start overflow-hidden py-1 lg:flex xl:w-[260px]"
    >
      <Text tone="tertiary" size="sm" meta className="px-2.5 pb-1">Struktur</Text>
      {sections.map((section) => {
        const count = workItemCount(section);
        return (
          <div key={section.id} className="grid min-w-0 grid-cols-1 gap-0.5">
            {renaming === section.id ? nameField(section.id, section.name, onRenameSection, "px-1.5 py-1") : (
            <div
              {...dragProps(null, section.id, sectionIds)}
              className={`group/outline flex items-center gap-1 rounded-control py-1 pl-1 pr-2.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink ${dropMark(section.id)}`}
            >
              {chevron(!closed.has(section.id), section.name, () => setClosed(flip(closed, section.id)))}
              <a
                href={`#bq-section-${section.id}`}
                draggable={false}
                title={editable ? "Klik dua kali untuk mengganti nama" : undefined}
                onDoubleClick={editable && !pending ? (event) => { event.preventDefault(); setRenaming(section.id); } : undefined}
                className="min-w-0 flex-1 truncate py-0.5"
              >
                {section.name}
              </a>
              {editable ? (
                <div className="flex items-center opacity-0 transition-opacity group-hover/outline:opacity-100 group-focus-within/outline:opacity-100">
                  {(section.items.length > 0 || section.subsections.length === 0) ? (
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`Tambah Work Item di ${section.name}`}
                    icon={<ListPlus aria-hidden="true" />}
                    disabled={pending}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onAddWorkItem({ sectionId: section.id, where: section.name });
                    }}
                  />
                  ) : null}
                  <AddRow
                    label="Subsection"
                    placeholder="Nama Subsection"
                    compact
                    iconOnly
                    disabled={pending}
                    onAdd={(name) => onAddSubsection(section.id, name)}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`Hapus Section ${section.name}`}
                    icon={<Trash2 aria-hidden="true" />}
                    disabled={pending}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onDeleteSection(section);
                    }}
                  />
                </div>
              ) : null}
              {tail(count)}
            </div>
            )}
            {closed.has(section.id) ? null : <>
            <OutlineItems items={section.items} parent={{ sectionId: section.id }} indent="pl-7" editable={editable} pending={pending} onReorder={onReorder} onDelete={onDeleteWorkItem} />
            {section.subsections.map((subsection) => (
              <div key={subsection.id} className="grid min-w-0 grid-cols-1 gap-0.5">
                {renaming === subsection.id ? nameField(subsection.id, subsection.name, onRenameSubsection, "py-1 pl-5 pr-1.5") : (
                <div
                  {...dragProps(section.id, subsection.id, section.subsections.map((row) => row.id))}
                  className={`group/outline flex items-center gap-1 rounded-control py-0.5 pl-4 pr-2.5 text-sm font-medium text-ink-tertiary transition-colors hover:bg-surface-muted hover:text-ink ${dropMark(subsection.id)}`}
                >
                  {chevron(itemsOpen.has(subsection.id), subsection.name, () => setItemsOpen(flip(itemsOpen, subsection.id)), subsection.items.length === 0)}
                  <a
                    href={`#bq-subsection-${subsection.id}`}
                    draggable={false}
                    title={editable ? "Klik dua kali untuk mengganti nama" : undefined}
                    onDoubleClick={editable && !pending ? (event) => { event.preventDefault(); setRenaming(subsection.id); } : undefined}
                    className="min-w-0 flex-1 truncate py-0.5"
                  >
                    {subsection.name}
                  </a>
                  {tail(subsection.items.length)}
                  {editable ? (
                    <span className="opacity-0 transition-opacity group-hover/outline:opacity-100 group-focus-within/outline:opacity-100">
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={`Tambah Work Item di ${subsection.name}`}
                      icon={<Plus aria-hidden="true" />}
                      disabled={pending}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onAddWorkItem({ subsectionId: subsection.id, where: `${section.name} › ${subsection.name}` });
                      }}
                    />
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={`Hapus ${subsection.name}`}
                      icon={<Trash2 aria-hidden="true" />}
                      disabled={pending}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onDeleteSubsection({ id: subsection.id, name: subsection.name, itemCount: subsection.items.length, sectionName: section.name });
                      }}
                    />
                    </span>
                  ) : null}
                </div>
                )}
                {itemsOpen.has(subsection.id) ? <OutlineItems items={subsection.items} parent={{ subsectionId: subsection.id }} indent="pl-11" editable={editable} pending={pending} onReorder={onReorder} onDelete={onDeleteWorkItem} /> : null}
              </div>
            ))}
            </>}
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

function DeleteSectionDialog({
  section,
  sections,
  pending,
  error,
  onClose,
  onDelete,
}: {
  section: BqSectionDetail;
  sections: readonly BqSectionDetail[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onDelete: (mode: "MOVE" | "DELETE", targetSectionId?: string) => void;
}) {
  const directCount = section.items.length;
  const subsectionCount = section.subsections.length;
  const subsectionItemCount = section.subsections.reduce((count, subsection) => count + subsection.items.length, 0);
  const contentCount = directCount + subsectionCount + subsectionItemCount;
  const targets = sections.filter((candidate) => candidate.id !== section.id);
  const [mode, setMode] = useState<"MOVE" | "DELETE">(contentCount > 0 ? "MOVE" : "DELETE");
  const [targetSectionId, setTargetSectionId] = useState(targets[0]?.id ?? "");
  const cannotMove = targets.length === 0;
  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Hapus Section ${section.name}?`}
      description={contentCount === 0 ? "Section kosong ini akan dihapus." : "Pilih apa yang dilakukan pada isi Section ini."}
      size="sm"
      dismissible={!pending}
    >
      <form className="grid gap-4" onSubmit={(event) => {
        event.preventDefault();
        if (!pending && (mode === "DELETE" || targetSectionId)) onDelete(mode, mode === "MOVE" ? targetSectionId : undefined);
      }}>
        {contentCount > 0 ? <Notice tone="warning">Terdampak: {directCount} Work Item langsung, {subsectionCount} Subsection, dan {subsectionItemCount} Work Item di dalam Subsection.</Notice> : null}
        {contentCount > 0 ? <div className="grid gap-2">
          <label className="flex cursor-pointer items-start gap-2 rounded-control border border-line p-3">
            <input type="radio" name="section-delete-mode" checked={mode === "MOVE"} disabled={pending || cannotMove} onChange={() => setMode("MOVE")} />
            <span><span className="block text-sm font-medium">Pindahkan isi ke Section lain</span><Text size="sm" tone="tertiary">Work Item dan Subsection tetap utuh.</Text></span>
          </label>
          {mode === "MOVE" ? <Field label="Section tujuan" required>
            <Select value={targetSectionId} disabled={pending || cannotMove} onChange={(event) => setTargetSectionId(event.target.value)}>
              {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
            </Select>
          </Field> : null}
          <label className="flex cursor-pointer items-start gap-2 rounded-control border border-danger/40 p-3">
            <input type="radio" name="section-delete-mode" checked={mode === "DELETE"} disabled={pending} onChange={() => setMode("DELETE")} />
            <span><span className="block text-sm font-medium text-danger">Hapus semua isi</span><Text size="sm" tone="tertiary">Semua Work Item dan rincian biayanya akan dihapus permanen.</Text></span>
          </label>
        </div> : null}
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Batal</Button>
          <Button type="submit" variant="danger" pending={pending} disabled={pending || (mode === "MOVE" && (!targetSectionId || cannotMove))}>
            {mode === "MOVE" ? "Pindahkan lalu hapus" : "Hapus permanen"}
          </Button>
        </FormActions>
      </form>
    </Dialog>
  );
}

export function ProjectEditor({
  project: initialProject,
  canManage,
  canManageLibrary = false,
  assemblies = [],
  units,
}: {
  project: BqProjectDetail;
  canManage: boolean;
  /** `bq.library.manage`: a Custom Cost Component may be saved to the BQ Library. */
  canManageLibrary?: boolean;
  assemblies?: BqAssemblyTemplateRead[];
  units: UnitRead[];
}) {
  const [project, setProject] = useState(initialProject);
  // A refresh (for example after a stale move was refused) brings the server's project; show it. A Cost Component move
  // does not change the project's updatedAt, so the page's key alone would keep the old list on screen.
  const [received, setReceived] = useState(initialProject);
  if (received !== initialProject) { setReceived(initialProject); setProject(initialProject); }
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
  const [quotationOpen, setQuotationOpen] = useState(false);
  const [selection, setSelection] = useState<LineItemSelection>(null);
  const [inspected, setInspected] = useState<Inspected>(null);
  /** The last Cost Component clicked without Shift: where a Shift-click range starts. */
  const anchor = useRef<string | null>(null);
  const [dragging, setDragging] = useState<{ itemId: string; lineIds: readonly string[]; overId: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ title: string; description?: string; run: () => Promise<void> } | null>(null);
  const [sectionToDelete, setSectionToDelete] = useState<BqSectionDetail | null>(null);
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

  const showMoveNotice = (message: string, tone: "neutral" | "success" = "neutral", durationMs = 3200) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setMoveNotice({ message, tone });
    noticeTimer.current = setTimeout(() => setMoveNotice(null), durationMs);
  };

  /** After an Assembly is applied: say which lines kept the Assembly's stored price instead of today's source price. */
  const reportPriceRefresh = (detail: { priceRefresh?: PriceRefresh }) => {
    const kept = detail.priceRefresh?.kept ?? [];
    if (kept.length === 0) return;
    const list = kept.map((line) => `${line.title} (${PRICE_KEPT_LABEL[line.reason]})`).join(", ");
    showMoveNotice(`${kept.length} Cost Component memakai harga yang tersimpan di assembly, bukan harga sumber terbaru: ${list}.`, "neutral", 12000);
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
  /** `onData` sees the action's answer, e.g. an applied Assembly's price report. */
  const run = <D extends BqProjectDetail>(action: (prev: null, formData: FormData) => Promise<ActionResult<D>>, fields: Record<string, string | undefined>, onData?: (data: D) => void) =>
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
        onData?.(result.data);
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
      // The selection was made on the old list: drop it with the dialogs, then show the server's list.
      if (stale) { setSelection(null); setGroupItemId(null); setMoveConfirmation(null); router.refresh(); }
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
    ids?: readonly string[],
  ) => {
    const selectedIds = ids ?? selectionForItem(selection, item.id);
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

  const askDeleteLines = (ids: readonly string[]) => setConfirmDelete({
    title: ids.length === 1 ? "Hapus Cost Component ini?" : `Hapus ${ids.length} Cost Component?`,
    run: async () => { for (const id of ids) await run(deleteLineItemAction, { id }); },
  });
  const moveTargets = (item: BqItemDetail) => lineItemTargetOptions(item).filter((option) => !("newGroup" in option.target));
  const moveTo = (item: BqItemDetail, ids: readonly string[], option: ReturnType<typeof lineItemTargetOptions>[number]) =>
    runMoveTransition(() => requestLineItemMove(item, "direct" in option.target ? option.label : `Component Group ${option.label}`, option.target as ExistingLineItemTarget, undefined, ids));

  /** Ctrl/Cmd-click adds or removes one, Shift-click takes the range from the last one clicked, a plain click one. */
  const pressLine = (item: BqItemDetail, line: BqLineItemDetail, event: ReactMouseEvent) => {
    const order = lineItemIds(item);
    const current = selectionForItem(selection, item.id);
    let next: string[];
    if (event.shiftKey && anchor.current && order.includes(anchor.current)) {
      const from = order.indexOf(anchor.current);
      const to = order.indexOf(line.id);
      next = order.slice(Math.min(from, to), Math.max(from, to) + 1);
    } else if (event.ctrlKey || event.metaKey) {
      next = current.includes(line.id) ? current.filter((id) => id !== line.id) : [...current, line.id];
      anchor.current = line.id;
    } else {
      next = [line.id];
      anchor.current = line.id;
    }
    setSelection(next.length > 0 ? { itemId: item.id, lineItemIds: next } : null);
    setInspected(next.length === 1 ? { kind: "line", id: next[0]! } : null);
  };

  const tableCtx: TableCtx = {
    units, editable, pending, expanded, toggle, run, commit,
    onImport: setImportTarget,
    onApplyAssembly: setAssemblyItemId,
    inspected, selection, highlighted: highlightedLineIds,
    pressItem: (item) => { anchor.current = null; setSelection(null); setInspected({ kind: "item", id: item.id }); },
    pressGroup: (group) => { anchor.current = null; setSelection(null); setInspected({ kind: "group", id: group.id }); },
    pressLine,
    menuItem: (item) => {
      const section = project.sections.find((candidate) => candidate.items.some((row) => row.id === item.id) || candidate.subsections.some((subsection) => subsection.items.some((row) => row.id === item.id)));
      const currentSubsection = section?.subsections.find((subsection) => subsection.items.some((row) => row.id === item.id));
      const moveActions: RowActionItem[] = !section ? [] : currentSubsection
        ? [{ label: "Pindahkan ke Section langsung", disabled: pending, onSelect: () => void run(moveItemsWithinSectionAction, { sectionId: section.id, itemIds: JSON.stringify([item.id]) }).catch(() => undefined) }]
        : section.subsections.map((subsection) => ({ label: `Pindahkan ke ${subsection.name}`, disabled: pending, onSelect: () => void run(moveItemsWithinSectionAction, { sectionId: section.id, itemIds: JSON.stringify([item.id]), targetSubsectionId: subsection.id }).catch(() => undefined) }));
      return [
      { label: "Buka di panel", onSelect: () => { setSelection(null); setInspected({ kind: "item", id: item.id }); } },
      ...(editable ? [
        ...BQ_PRICE_MODES.filter((mode) => mode !== item.priceMode).map((mode, index) => ({
          label: mode === "PRICED" ? "Tandai berharga" : `Tandai ${PRICE_STATUS_LABEL[mode]}`,
          separatorBefore: index === 0,
          disabled: pending,
          onSelect: () => void run(updateItemAction, { id: item.id, field: "priceMode", value: mode }).catch(() => undefined),
        })),
        { label: "Tambah Cost Component", separatorBefore: true, disabled: pending, onSelect: () => setImportTarget({ itemId: item.id }) },
        ...moveActions.map((action, index) => ({ ...action, separatorBefore: index === 0 })),
        { label: "Hapus Work Item", danger: true, separatorBefore: true, disabled: pending, onSelect: () => setConfirmDelete({ title: `Hapus ${item.name}?`, run: () => run(deleteItemAction, { id: item.id }) }) },
      ] : []),
    ]; },
    menuGroup: (_item, group) => [
      { label: "Buka di panel", onSelect: () => { setSelection(null); setInspected({ kind: "group", id: group.id }); } },
      ...(editable ? [
        { label: "Tambah Cost Component", disabled: pending, onSelect: () => setImportTarget({ subObjectId: group.id }) },
        { label: "Hapus Component Group", danger: true, separatorBefore: true, disabled: pending, onSelect: () => setConfirmDelete({ title: `Hapus ${group.name}?`, run: () => run(deleteSubObjectAction, { id: group.id }) }) },
      ] : []),
    ],
    // A right-click acts on the selection when the row is part of it, else on that row alone.
    menuLine: (item, line) => {
      const current = selectionForItem(selection, item.id);
      const ids = current.includes(line.id) ? current : [line.id];
      const many = ids.length > 1;
      return [
        ...(many ? [] : [{ label: "Buka di panel", onSelect: () => { setSelection({ itemId: item.id, lineItemIds: [line.id] }); setInspected({ kind: "line" as const, id: line.id }); } }]),
        ...(editable ? [
          { label: many ? `Kelompokkan ${ids.length} Cost Component…` : "Kelompokkan…", disabled: pending, onSelect: () => { setSelection({ itemId: item.id, lineItemIds: ids }); setError(null); setGroupItemId(item.id); } },
          ...(item.subObjects.length === 0 && ids.length === item.lineItems.length
            ? [{ label: "Simpan sebagai Assembly", disabled: pending, onSelect: () => setSaveAssemblyItem(item) }]
            : []),
          ...moveTargets(item).map((option, index) => ({ label: `Pindahkan ke: ${option.label}`, separatorBefore: index === 0, disabled: pending, onSelect: () => moveTo(item, ids, option) })),
          { label: many ? `Hapus ${ids.length} Cost Component` : "Hapus", danger: true, separatorBefore: true, disabled: pending, onSelect: () => askDeleteLines(ids) },
        ] : []),
      ];
    },
    dragging: dragging ? { itemId: dragging.itemId, overId: dragging.overId } : null,
    dragStart: (item, line) => {
      const current = selectionForItem(selection, item.id);
      setDragging({ itemId: item.id, lineIds: current.includes(line.id) ? current : [line.id], overId: null });
    },
    // Rows only accept Cost Components of their own Work Item (no move to another Work Item in this slice).
    dragOver: (item, overId) => {
      if (!dragging || dragging.itemId !== item.id) return false;
      if (dragging.overId !== overId) setDragging({ ...dragging, overId });
      return true;
    },
    dragEnd: () => setDragging(null),
    drop: (item, target, label) => {
      const current = dragging;
      setDragging(null);
      if (!current || current.itemId !== item.id) return;
      runMoveTransition(() => requestLineItemMove(item, label, target, undefined, current.lineIds));
    },
  };

  /** Work Items in screen order, for ↑ ↓ in the side panel. */
  const orderedItems = project.sections.flatMap((section) => [...section.items, ...section.subsections.flatMap((subsection) => subsection.items)]);
  const stepItem = (delta: number) => {
    if (inspected?.kind !== "item") return;
    const at = orderedItems.findIndex((item) => item.id === inspected.id);
    const next = orderedItems[at + delta];
    if (!next) return;
    setInspected({ kind: "item", id: next.id });
    window.setTimeout(() => document.getElementById(`bq-row-${next.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 30);
  };

  // Escape clears the selection, Delete removes the selected Cost Components (after a confirmation); never while typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]")) return;
      if (event.key === "Escape") { setSelection(null); return; }
      if ((event.key === "Delete" || event.key === "Backspace") && editable && selection && selection.lineItemIds.length > 0) {
        event.preventDefault();
        setConfirmDelete({
          title: selection.lineItemIds.length === 1 ? "Hapus Cost Component ini?" : `Hapus ${selection.lineItemIds.length} Cost Component?`,
          run: async () => { for (const id of selection.lineItemIds) await run(deleteLineItemAction, { id }); },
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const totalColumns = 8;
  const readiness = summarizeReadiness(project.sections);
  /** The bar already states "X dari Y Cost Component sudah ada harga", so the footer drops its copy while the bar shows. */
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
          {project.status !== "ACTIVE" ? <Badge tone={project.status === "ARCHIVED" ? "warning" : "neutral"}>{project.status === "ARCHIVED" ? "Diarsipkan — hanya baca" : "Terkunci — hanya baca"}</Badge> : null}
        </div>
      </div>

      {readinessBarShown ? <ReadinessBar readiness={readiness} onJump={jumpTo} /> : null}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <SectionOutline
          projectId={project.id}
          sections={project.sections}
          editable={editable}
          pending={pending}
          onAddSubsection={(sectionId, name) => run(addSubsectionAction, { sectionId, name })}
          onRenameSection={(id, name) => run(updateSectionAction, { id, name })}
          onRenameSubsection={(id, name) => run(updateSubsectionAction, { id, name })}
          onDeleteSection={setSectionToDelete}
          onDeleteSubsection={(subsection) => setConfirmDelete({
            title: `Hapus Subsection ${subsection.name}?`,
            description: subsection.itemCount === 0
              ? "Subsection kosong ini akan dihapus."
              : `${subsection.itemCount} Work Item akan tetap ada dan pindah ke Section ${subsection.sectionName}.`,
            run: () => run(deleteSubsectionAction, { id: subsection.id }),
          })}
          onDeleteWorkItem={(item) => setConfirmDelete({ title: `Hapus ${item.name}?`, run: () => run(deleteItemAction, { id: item.id }) })}
          onAddWorkItem={(target) => { setError(null); setNewItemTarget(target); }}
          onReorder={(parent, orderedIds) => run(reorderItemsAction, { ...parent, orderedIds: JSON.stringify(orderedIds) })}
          onReorderSections={(sectionId, orderedIds) => run(reorderSectionsAction, { sectionId: sectionId ?? undefined, orderedIds: JSON.stringify(orderedIds) })}
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
                description={editable
                  ? "1. Buat Section, mis. \"Pekerjaan Sipil\". 2. Ketik Work Item di baris isi cepat (Enter untuk simpan), atau tempel langsung dari Excel. 3. Klik baris untuk mengubah nilainya di panel samping; klik kanan untuk pilihan lain."
                  : "Project ini belum memiliki Section."}
                action={editable ? <AddSectionDialog projectId={project.id} /> : undefined}
              />
            </SectionCard>
          ) : null}

          {project.sections.map((section, sectionIndex) => (
            <SectionCard key={section.id} id={`bq-section-${section.id}`} className="grid gap-3">
              <SectionTable
                section={section}
                letter={SECTION_LETTERS[sectionIndex] ?? String(sectionIndex + 1)}
                ctx={tableCtx}
                columns={totalColumns}
              />
              {editable ? (
                // Struktur is hidden below 1024 px, so its creation actions remain reachable here.
                <div className="flex flex-wrap gap-1.5 lg:hidden">
                  {(section.items.length > 0 || section.subsections.length === 0) ? (
                    <Button size="sm" variant="ghost" leadingIcon={<Plus aria-hidden="true" />} disabled={pending} onClick={() => { setError(null); setNewItemTarget({ sectionId: section.id, where: section.name }); }}>
                      Tambah Work Item
                    </Button>
                  ) : null}
                  {section.subsections.map((subsection) => (
                    <Button key={subsection.id} size="sm" variant="ghost" leadingIcon={<Plus aria-hidden="true" />} disabled={pending} onClick={() => { setError(null); setNewItemTarget({ subsectionId: subsection.id, where: `${section.name} › ${subsection.name}` }); }}>
                      Tambah Work Item di {subsection.name}
                    </Button>
                  ))}
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
        {(() => {
          const multiItem = selection && selection.lineItemIds.length > 1 ? projectItem(project, selection.itemId) : undefined;
          if (selection && multiItem) {
            const ids = selection.lineItemIds;
            const names = lineItemsOf(multiItem).filter((line) => ids.includes(line.id)).map((line) => line.titleSnapshot);
            return (
              <aside aria-label={`${ids.length} Cost Component dipilih`} className="order-first grid w-full shrink-0 content-start gap-3 self-start rounded-card border border-line bg-surface p-4 shadow-plane lg:sticky lg:top-0 lg:order-none lg:w-[320px] xl:w-[340px]">
                <div className="flex items-start justify-between gap-2">
                  <div className="grid gap-0.5">
                    <Text size="sm" tone="tertiary" meta>Dipilih</Text>
                    <Text weight="semibold">{ids.length} Cost Component</Text>
                    <Text size="sm" tone="tertiary">di {multiItem.name}</Text>
                  </div>
                  <IconButton size="sm" variant="ghost" label="Batal pilih" icon={<X aria-hidden="true" />} onClick={() => setSelection(null)} />
                </div>
                <ul className="m-0 grid list-none gap-1 p-0 text-sm">
                  {names.slice(0, 6).map((name, index) => <li key={`${name}-${index}`} className="truncate">· {name}</li>)}
                  {names.length > 6 ? <li className="text-ink-tertiary">dan {names.length - 6} lagi</li> : null}
                </ul>
                {editable ? (
                  <div className="grid gap-2">
                    <Button variant="secondary" disabled={pending} onClick={() => { setError(null); setGroupItemId(multiItem.id); }}>Kelompokkan…</Button>
                    {multiItem.subObjects.length === 0 && ids.length === multiItem.lineItems.length ? (
                      <Button variant="secondary" disabled={pending} onClick={() => setSaveAssemblyItem(multiItem)}>Simpan sebagai Assembly</Button>
                    ) : null}
                    <ButtonMenu label={pending ? "Memproses…" : "Pindahkan ke"} variant="secondary" align="start" items={moveTargets(multiItem).map((option) => ({ label: option.label, description: option.description, disabled: pending, onSelect: () => moveTo(multiItem, ids, option) }))} />
                    <Button variant="ghost" disabled={pending} onClick={() => askDeleteLines(ids)}>Hapus {ids.length} Cost Component</Button>
                  </div>
                ) : null}
                <Text size="sm" tone="tertiary">Ctrl + klik menambah atau mengurangi, Shift + klik memilih satu rentang, Esc membatalkan, Delete menghapus. Atau seret ke Component Group.</Text>
              </aside>
            );
          }
          const found = findInspected(project, inspected);
          return found ? (
            <RowInspector
              found={found}
              units={units}
              editable={editable}
              canSaveToLibrary={editable && canManageLibrary}
              pending={pending}
              run={run}
              commit={commit}
              commitNum={commitNum}
              onStep={found.kind === "item" ? stepItem : undefined}
              onClose={() => { setInspected(null); setSelection(null); }}
            />
          ) : null;
        })()}
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface/95 px-4 py-3 shadow-plane backdrop-blur-sm">
        {readiness.total > 0 && !readinessBarShown ? (
          <Text
            tone="tertiary"
            size="sm"
            className={readiness.priced === readiness.total ? undefined : "text-warning"}
          >
            {readiness.priced} dari {readiness.total} Cost Component sudah ada harga
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

      {assemblyItemId ? (
        <AssemblyPickerDialog
          key={assemblyItemId}
          assemblies={assemblies}
          pending={pending}
          onClose={() => setAssemblyItemId(null)}
          onApply={(assemblyId, qtyPerL1) => {
            void run(applyAssemblyAction, { itemId: assemblyItemId, assemblyId, qtyPerL1 }, reportPriceRefresh).catch(() => undefined).finally(() => setAssemblyItemId(null));
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
              ? run(addItemAndApplyAssemblyAction, { ...where, assemblyId, name, qty, unit }, reportPriceRefresh)
              : run(addItemAction, { ...where, name, qty, unit });
            void request.then(() => setNewItemTarget(null)).catch(() => undefined);
          }}
        />
      ) : null}

      {sectionToDelete ? (
        <DeleteSectionDialog
          key={sectionToDelete.id}
          section={sectionToDelete}
          sections={project.sections}
          pending={pending}
          error={error}
          onClose={() => setSectionToDelete(null)}
          onDelete={(mode, targetSectionId) => {
            void run(deleteSectionAction, { id: sectionToDelete.id, mode, targetSectionId })
              .then(() => setSectionToDelete(null))
              .catch(() => undefined);
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

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title={confirmDelete?.title ?? ""}
        description={confirmDelete?.description ?? "Tidak bisa dibatalkan."}
        confirmLabel="Hapus"
        tone="danger"
        pending={pending}
        onConfirm={() => {
          const current = confirmDelete;
          if (!current) return;
          void current.run().catch(() => undefined).finally(() => { setConfirmDelete(null); setSelection(null); });
        }}
      />

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

/**
 * What the tables need from the editor (owner 2026-10-14: no checkboxes; click, Ctrl/Shift-click, right-click and
 * drag work like on the Workspace board). One object instead of a prop per callback.
 */
type TableCtx = {
  units: UnitRead[];
  editable: boolean;
  pending: boolean;
  expanded: ReadonlySet<string>;
  toggle: (id: string) => void;
  run: (action: Mutation, fields: Record<string, string | undefined>) => Promise<void>;
  commit: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
  onImport: (target: { itemId?: string; subObjectId?: string }) => void;
  onApplyAssembly?: (itemId: string) => void;
  inspected: Inspected;
  selection: LineItemSelection;
  highlighted: ReadonlySet<string>;
  pressItem: (item: BqItemDetail) => void;
  pressGroup: (group: BqSubObjectDetail) => void;
  pressLine: (item: BqItemDetail, line: BqLineItemDetail, event: ReactMouseEvent) => void;
  menuItem: (item: BqItemDetail) => RowActionItem[];
  menuGroup: (item: BqItemDetail, group: BqSubObjectDetail) => RowActionItem[];
  menuLine: (item: BqItemDetail, line: BqLineItemDetail) => RowActionItem[];
  /** The Work Item whose Cost Component is being dragged, and the row it hovers. */
  dragging: { itemId: string; overId: string | null } | null;
  dragStart: (item: BqItemDetail, line: BqLineItemDetail) => void;
  dragOver: (item: BqItemDetail, overId: string) => boolean;
  dragEnd: () => void;
  drop: (item: BqItemDetail, target: ExistingLineItemTarget, label: string) => void;
};

/** A click that lands on a control inside a row (expand, delete, a name being edited) is that control's. */
function onControl(event: { target: EventTarget }) {
  return Boolean((event.target as HTMLElement).closest("button, input, select, textarea, a, label, [contenteditable=true]"));
}

/** Section letters as on the printed quotation (A, B, …); Work Items are numbered A.1, A.2 … across the Section. */
const SECTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The Section's own total, as the quotation prints it under "Subtotal A"; null while a priced row has no total. */
function sectionSubtotal(section: BqSectionDetail): string | null {
  const items = [...section.items, ...section.subsections.flatMap((subsection) => subsection.items)].filter((item) => !isMarkerPriceMode(item.priceMode));
  if (items.some((item) => item.total === null)) return null;
  return items.reduce((sum, item) => addDecimals(sum, toDecimalString(item.total!)), toDecimalString("0"));
}

/**
 * One Section as one sheet (owner 2026-10-14, "sesuai struktur Excel"): the workbook's columns (No, Uraian,
 * Spesifikasi, Vol, Sat, Harga satuan, Total), Subsections as group heading rows inside the same table, and the
 * Section subtotal at the bottom. Names of Sections and
 * Subsections change in Struktur only.
 */
function SectionTable({ section, letter, ctx, columns }: {
  section: BqSectionDetail;
  letter: string;
  ctx: TableCtx;
  columns: number;
}) {
  const span = columns;
  let counter = 0;
  const direct = section.items.map(() => `${letter}.${++counter}`);
  const grouped = section.subsections.map((subsection) => subsection.items.map(() => `${letter}.${++counter}`));
  const subtotal = sectionSubtotal(section);
  // Folding a Section keeps its heading and subtotal on screen (owner 2026-10-14).
  const [folded, setFolded] = useState(false);
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <IconButton size="sm" variant="ghost" label={folded ? `Buka ${section.name}` : `Lipat ${section.name}`} aria-expanded={!folded} icon={folded ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />} onClick={() => setFolded(!folded)} />
        <span className="font-ui-mono text-sm font-semibold text-ink-tertiary">{letter}</span>
        <Heading level={4}>{section.name}</Heading>
        {folded ? (
          <span className="ml-auto flex items-baseline gap-3 pr-2 text-sm">
            <Text size="sm" tone="tertiary">{counter} Work Item</Text>
            <span className="font-semibold tabular-nums">{subtotal === null ? "—" : money(subtotal)}</span>
          </span>
        ) : null}
      </div>
      {folded ? null : <DataTable minWidth="900px" density="compact">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[36px]" aria-label="Buka atau tutup" />
            <TableHead className="w-[56px]">No</TableHead>
            <TableHead>Uraian</TableHead>
            <TableHead className="w-[26%]">Spesifikasi</TableHead>
            <TableHead align="end" className="w-[84px]">Vol</TableHead>
            <TableHead className="w-[72px]">Sat</TableHead>
            <TableHead align="end" className="w-[130px]">Harga satuan</TableHead>
            <TableHead align="end" className="w-[140px]">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {section.items.map((item, index) => <ItemRows key={item.id} item={item} number={direct[index]!} ctx={ctx} columns={span} />)}
          {!ctx.editable && section.items.length === 0 && section.subsections.length === 0 ? (
            <TableRow><TableCell colSpan={span}><Text tone="tertiary" size="sm">Belum ada Work Item.</Text></TableCell></TableRow>
          ) : null}
        </TableBody>
        {section.subsections.map((subsection, subsectionIndex) => (
          <TableBody key={subsection.id} id={`bq-subsection-${subsection.id}`} aria-label={`Subsection ${subsection.name}`}>
            <TableRow className="hover:!bg-transparent">
              <TableCell />
              <TableCell colSpan={span - 1} className="!pt-4">
                <span className="text-sm font-semibold text-ink">{subsection.name}</span>
                <span className="ml-2 text-xs text-ink-tertiary">{subsection.items.length} Work Item</span>
              </TableCell>
            </TableRow>
            {subsection.items.map((item, index) => <ItemRows key={item.id} item={item} number={grouped[subsectionIndex]![index]!} ctx={ctx} columns={span} />)}
          </TableBody>
        ))}
        {counter > 0 ? (
          <TableBody>
            <TableRow className="hover:!bg-transparent">
              <TableCell colSpan={7} align="end" className="border-t border-line font-semibold">Subtotal {letter}</TableCell>
              <TableCell align="end" className="border-t border-line font-semibold tabular-nums">{subtotal === null ? "—" : money(subtotal)}</TableCell>
            </TableRow>
          </TableBody>
        ) : null}
      </DataTable>}
    </div>
  );
}

function ItemRows({ item, number, ctx, columns }: { item: BqItemDetail; number: string; ctx: TableCtx; columns: number }) {
  const open = ctx.expanded.has(item.id);
  const hasChildren = item.subObjects.length > 0 || item.lineItems.length > 0;
  const selectedIds = new Set(selectionForItem(ctx.selection, item.id));
  const dropHere = ctx.dragging?.itemId === item.id && ctx.dragging.overId === item.id;
  return (
    <>
      <ContextActionMenu items={ctx.menuItem(item)}>
        <TableRow
          id={`bq-row-${item.id}`}
          selected={(ctx.inspected?.kind === "item" && ctx.inspected.id === item.id) || dropHere}
          className={`cursor-pointer ${dropHere ? "outline-2 -outline-offset-2 outline-dashed outline-line-focus" : ""}`}
          onClick={(event) => { if (!onControl(event)) ctx.pressItem(item); }}
          // Dropping a Cost Component on its Work Item takes it out of its group.
          onDragOver={(event) => { if (ctx.dragOver(item, item.id)) event.preventDefault(); }}
          onDrop={(event) => { event.preventDefault(); ctx.drop(item, { direct: true }, "Langsung di Work Item"); }}
        >
          <TableCell>
            <IconButton
              size="sm"
              variant="ghost"
              label={open ? `Tutup ${item.name}` : `Buka ${item.name}`}
              icon={open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
              onClick={() => ctx.toggle(item.id)}
            />
          </TableCell>
          <TableCell className="tabular-nums text-ink-tertiary">{number}</TableCell>
          <TableCell wrap className="font-medium">
            <InlineEdit label="Nama Work Item" value={item.name} disabled={!ctx.editable} onCommit={ctx.commit(updateItemAction, item.id, "name")} />
          </TableCell>
          <TableCell wrap>
            {item.specification ? <Text tone="secondary" size="sm" className="line-clamp-3 whitespace-pre-line">{item.specification}</Text> : null}
          </TableCell>
          <TableCell align="end" className="tabular-nums">{item.qty}</TableCell>
          <TableCell>{item.unit}</TableCell>
          <TableCell align="end">
            {isMarkerPriceMode(item.priceMode) ? (
              <Badge tone="neutral">{PRICE_STATUS_LABEL[item.priceMode]}</Badge>
            ) : hasChildren ? money(item.rate) : priceText(item.hargaSnapshot, "IDR")}
          </TableCell>
          <TableCell align="end" className="font-semibold">
            {isMarkerPriceMode(item.priceMode) ? <Text tone="tertiary" size="sm">{PRICE_STATUS_LABEL[item.priceMode]}</Text> : money(item.total)}
          </TableCell>
        </TableRow>
      </ContextActionMenu>

      {open ? (
        <>
          {item.subObjects.map((group) => <SubObjectRows key={group.id} item={item} group={group} ctx={ctx} columns={columns} selectedIds={selectedIds} />)}
          {item.lineItems.map((line) => <LineItemRow key={line.id} item={item} line={line} depth={1} ctx={ctx} selected={selectedIds.has(line.id)} />)}
          {ctx.editable || isMarkerPriceMode(item.priceMode) ? (
            <TableRow>
              <TableCell />
              <TableCell colSpan={columns - 1}>
                <div className="flex flex-wrap items-center gap-1.5 pl-4">
                  {isMarkerPriceMode(item.priceMode) ? (
                    <Text tone="tertiary" size="sm" className="mr-2">
                      Ditandai {PRICE_STATUS_LABEL[item.priceMode]}: quotation tidak menampilkan harga baris ini dan total keseluruhan tidak menghitungnya.
                    </Text>
                  ) : null}
                  {ctx.editable ? <>
                    <Button size="sm" variant="secondary" leadingIcon={<Plus aria-hidden="true" />} disabled={ctx.pending} onClick={() => ctx.onImport({ itemId: item.id })}>Tambah Cost Component</Button>
                    {ctx.onApplyAssembly ? <ButtonMenu label="Tambahkan…" variant="ghost" align="start" items={[
                      { label: "Dari Assembly", description: "Tambahkan kumpulan Cost Component siap pakai.", disabled: ctx.pending, onSelect: () => ctx.onApplyAssembly?.(item.id) },
                    ]} /> : null}
                    {lineItemIds(item).length > 1 ? <Text tone="tertiary" size="sm" className="ml-auto">Ctrl/Shift + klik untuk memilih beberapa · seret ke grup · klik kanan untuk menu</Text> : null}
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

function SubObjectRows({ item, group, ctx, columns, selectedIds }: {
  item: BqItemDetail;
  group: BqSubObjectDetail;
  ctx: TableCtx;
  columns: number;
  selectedIds: ReadonlySet<string>;
}) {
  const open = ctx.expanded.has(group.id);
  const highlighted = group.lineItems.some((line) => ctx.highlighted.has(line.id));
  const dropHere = ctx.dragging?.itemId === item.id && ctx.dragging.overId === group.id;
  return (
    <>
      <ContextActionMenu items={ctx.menuGroup(item, group)}>
        <TableRow
          selected={highlighted || dropHere || (ctx.inspected?.kind === "group" && ctx.inspected.id === group.id)}
          className={`cursor-pointer ${highlighted ? "" : "bg-[color-mix(in_srgb,var(--ui-surface-muted)_45%,transparent)]"} ${dropHere ? "outline-2 -outline-offset-2 outline-dashed outline-line-focus" : ""}`}
          onClick={(event) => { if (!onControl(event)) ctx.pressGroup(group); }}
          onDragOver={(event) => { if (ctx.dragOver(item, group.id)) event.preventDefault(); }}
          onDrop={(event) => { event.preventDefault(); ctx.drop(item, { subObjectId: group.id }, `Component Group ${group.name}`); }}
        >
          <TableCell />
          <TableCell />
          <TableCell wrap>
            <div className="flex items-center gap-1 pl-4">
              <IconButton size="sm" variant="ghost" label={open ? `Tutup ${group.name}` : `Buka ${group.name}`} icon={open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />} onClick={() => ctx.toggle(group.id)} />
              <div className="min-w-0">
                <InlineEdit label="Nama Component Group" value={group.name} disabled={!ctx.editable} onCommit={ctx.commit(updateSubObjectAction, group.id, "name")} />
                {/* A Component Group is not a plain folder: its multiplier and extra % change the Work Item's price. */}
                <Text tone="tertiary" size="sm" className="block px-1.5">
                  {group.lineItems.length === 0 ? "Component Group kosong — seret Cost Component ke sini" : `Component Group${isZeroPrice(group.markupL2Pct) ? "" : ` · markup ${group.markupL2Pct}%`}`}
                </Text>
              </div>
            </div>
          </TableCell>
          <TableCell />
          <TableCell align="end" className="tabular-nums">×{group.qtyPerL1}</TableCell>
          <TableCell><Text tone="tertiary" size="sm">per item</Text></TableCell>
          <TableCell align="end">{money(group.subtotalL2Raw)}</TableCell>
          <TableCell align="end">{money(group.subtotalL2)}</TableCell>
          {ctx.editable ? (
            <TableCell align="end">
              <RemoveButton label={`Hapus ${group.name}`} onRemove={() => ctx.run(deleteSubObjectAction, { id: group.id })} disabled={ctx.pending} />
            </TableCell>
          ) : null}
        </TableRow>
      </ContextActionMenu>

      {open ? (
        <>
          {group.lineItems.map((line) => <LineItemRow key={line.id} item={item} line={line} depth={2} ctx={ctx} selected={selectedIds.has(line.id)} />)}
          {ctx.editable ? (
            <TableRow>
              <TableCell />
              <TableCell colSpan={columns - 1}>
                <div className="flex flex-wrap items-center gap-1.5 pl-10">
                  <Button size="sm" variant="ghost" leadingIcon={<Plus aria-hidden="true" />} disabled={ctx.pending} onClick={() => ctx.onImport({ subObjectId: group.id })}>Cost Component</Button>
                </div>
              </TableCell>
            </TableRow>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function LineItemRow({ item, line, depth, ctx, selected }: {
  item: BqItemDetail;
  line: BqLineItemDetail;
  depth: 1 | 2;
  ctx: TableCtx;
  selected: boolean;
}) {
  const inspected = ctx.inspected?.kind === "line" && ctx.inspected.id === line.id;
  return (
    <ContextActionMenu items={ctx.menuLine(item, line)}>
      <TableRow
        id={`bq-row-${line.id}`}
        selected={selected || inspected || ctx.highlighted.has(line.id)}
        className={`cursor-pointer ${ctx.dragging ? "" : "select-none"}`}
        draggable={ctx.editable && !ctx.pending}
        onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", line.id); ctx.dragStart(item, line); }}
        onDragEnd={ctx.dragEnd}
        onClick={(event) => { if (!onControl(event)) ctx.pressLine(item, line, event); }}
      >
        <TableCell>
          {ctx.editable ? <GripVertical aria-hidden="true" className="ml-2 size-3.5 text-ink-tertiary" /> : null}
        </TableCell>
        <TableCell />
        <TableCell wrap>
          <div className={depth === 2 ? "pl-10" : "pl-4"}>
            <InlineEdit label="Nama Cost Component" value={line.titleSnapshot} disabled={!ctx.editable} onCommit={ctx.commit(updateLineItemAction, line.id, "titleSnapshot")} />
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 px-1.5">
              <Badge tone="neutral">{KATEGORI_LABEL[line.kategori] ?? line.kategori}</Badge>
              {isOne(line.koefisien) ? null : <Text tone="tertiary" size="sm">koef {line.koefisien}</Text>}
              {line.sourcePriceSnapshot !== null && line.hargaSnapshot !== line.sourcePriceSnapshot ? (
                <>
                  <Badge tone="warning">Harga diubah</Badge>
                  <Text tone="tertiary" size="sm">Harga awal {formatMoney(createMoney(line.sourcePriceSnapshot, line.currencySnapshot))}</Text>
                </>
              ) : null}
            </div>
          </div>
        </TableCell>
        <TableCell />
        <TableCell align="end" className="tabular-nums">{line.qty}</TableCell>
        <TableCell>{line.purchaseUnitSnapshot}</TableCell>
        <TableCell align="end">{priceText(line.hargaSnapshot, line.currencySnapshot)}</TableCell>
        <TableCell align="end">{money(line.biayaLine, line.currencySnapshot)}</TableCell>
        {ctx.editable ? (
          <TableCell align="end">
            <RemoveButton label={`Hapus ${line.titleSnapshot}`} onRemove={() => ctx.run(deleteLineItemAction, { id: line.id })} disabled={ctx.pending} />
          </TableCell>
        ) : null}
      </TableRow>
    </ContextActionMenu>
  );
}

function isOne(value: string): boolean {
  try { return compareDecimals(toDecimalString(value), toDecimalString("1")) === 0; } catch { return false; }
}

/** A price as the table shows it: missing and Rp0 stand out, everything else is plain money. */
function priceText(value: string | null, currency: string): ReactNode {
  if (!value) return <span className="font-medium text-warning">Belum diisi</span>;
  if (isZeroPrice(value)) return <span className="font-medium text-warning">Rp 0</span>;
  return formatMoney(createMoney(value, currency));
}

/** One labelled value in the side panel; editable fields show as a boxed value that becomes an input on click. */
function PanelField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <Text size="sm" tone="secondary">{label}</Text>
      <div className="min-h-9 rounded-control border border-line bg-surface px-1.5 py-1 text-sm [&_button]:w-full">{children}</div>
      {hint ? <Text size="sm" tone="tertiary">{hint}</Text> : null}
    </div>
  );
}

function PanelValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <Text size="sm" tone="secondary">{label}</Text>
      <span className="font-medium tabular-nums text-ink">{children}</span>
    </div>
  );
}

/**
 * The side panel of the row chosen in the table (owner 2026-10-14, option B): every value of that Work Item,
 * Component Group or Cost Component changes here; Enter or leaving a field saves it, a refused value springs back.
 * A locked or archived project shows the same values read-only.
 */
function RowInspector({ found, units, editable, canSaveToLibrary = false, pending, run, commit, commitNum, onStep, onClose }: {
  found: InspectedFound;
  units: UnitRead[];
  editable: boolean;
  canSaveToLibrary?: boolean;
  pending: boolean;
  run: (action: Mutation, fields: Record<string, string | undefined>) => Promise<void>;
  commit: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
  commitNum: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
  /** ↑ ↓ to the previous or next Work Item (only for Work Items). */
  onStep?: (delta: number) => void;
  onClose: () => void;
}) {
  // Leave the field first so a changed value is saved before the panel shows the next row.
  const step = (delta: number) => { (document.activeElement as HTMLElement | null)?.blur(); window.setTimeout(() => onStep?.(delta), 0); };
  const kindLabel = found.kind === "item" ? "Work Item" : found.kind === "group" ? "Component Group" : "Cost Component";
  const title = found.kind === "item" ? found.item.name : found.kind === "group" ? found.group.name : found.line.titleSnapshot;
  const number = (label: string, value: string, action: Mutation, id: string, field: string, hint?: string) => (
    <PanelField label={label} hint={hint}>
      <InlineEdit label={label} inputMode="decimal" value={value} disabled={!editable} commitOnBlur onCommit={commitNum(action, id, field)} />
    </PanelField>
  );

  let body: ReactNode;
  if (found.kind === "item") {
    const item = found.item;
    const hasChildren = item.subObjects.length > 0 || item.lineItems.length > 0;
    const marker = isMarkerPriceMode(item.priceMode);
    body = <>
      <PanelField label="Spesifikasi" hint="Tampil di kolom Spesifikasi dan di penawaran untuk klien.">
        <InlineEdit label="Spesifikasi" placeholder="Belum diisi" value={item.specification ?? ""} disabled={!editable} commitOnBlur onCommit={commit(updateItemAction, item.id, "specification")} />
      </PanelField>
      {(() => {
        // A copy of the Cost Component names, edited freely afterwards; it does not follow later changes.
        const suggestion = specificationFromComponents(item);
        if (!editable || !suggestion || suggestion === (item.specification ?? "")) return null;
        return (
          <div className="-mt-1 grid gap-0.5">
            <button
              type="button"
              disabled={pending}
              onClick={() => void commit(updateItemAction, item.id, "specification")(suggestion).catch(() => undefined)}
              className="justify-self-start rounded-control text-sm text-action underline-offset-2 hover:underline disabled:opacity-50"
            >
              {item.specification ? "Ganti dengan isi dari Cost Component" : "Isi dari Cost Component"}
            </button>
            <Text size="sm" tone="tertiary" className="line-clamp-2">{suggestion}</Text>
          </div>
        );
      })()}
      {number("Jumlah", item.qty, updateItemAction, item.id, "qty")}
      <div className="grid gap-1">
        <Text size="sm" tone="secondary">Satuan</Text>
        {editable ? (
          <Select aria-label="Satuan Work Item" value={item.unit} disabled={pending} onChange={(event) => void commit(updateItemAction, item.id, "unit")(event.target.value).catch(() => undefined)}>
            {units.some((unit) => unit.code === item.unit) ? null : <option value={item.unit} disabled>{item.unit} (inactive snapshot)</option>}
            {units.map((unit) => <option key={unit.id} value={unit.code}>{unit.code}</option>)}
          </Select>
        ) : <Text size="sm">{item.unit}</Text>}
      </div>
      <div className="grid gap-1">
        <Text size="sm" tone="secondary">Status harga</Text>
        {editable ? (
          <Select aria-label={`Status harga ${item.name}`} value={item.priceMode} disabled={pending} onChange={(event) => void commit(updateItemAction, item.id, "priceMode")(event.target.value).catch(() => undefined)}>
            {BQ_PRICE_MODES.map((mode) => <option key={mode} value={mode}>{mode === "PRICED" ? "Berharga" : `${PRICE_STATUS_LABEL[mode]} — tidak dihitung`}</option>)}
          </Select>
        ) : <Text size="sm">{item.priceMode === "PRICED" ? "Berharga" : PRICE_STATUS_LABEL[item.priceMode]}</Text>}
      </div>
      {hasChildren ? (
        number("Markup (%)", item.markupL1Pct, updateItemAction, item.id, "markupL1Pct", "Berlaku untuk semua Cost Component di bawah Work Item ini; klien tidak melihatnya.")
      ) : marker ? null : <>
        <PanelField label="Harga satuan">
          <InlineEdit label="Harga satuan" inputMode="decimal" placeholder="Belum diisi" value={item.hargaSnapshot ?? ""} display={(value) => priceText(value, "IDR")} disabled={!editable} commitOnBlur onCommit={commitNum(updateItemAction, item.id, "hargaSnapshot")} />
        </PanelField>
        {number("Koefisien", item.koefisien, updateItemAction, item.id, "koefisien")}
      </>}
      <div className="grid gap-1.5 border-t border-line-subtle pt-3">
        <PanelValue label={hasChildren ? "Harga satuan (dari Cost Component)" : "Harga satuan"}>{marker ? PRICE_STATUS_LABEL[item.priceMode] : money(item.rate)}</PanelValue>
        <PanelValue label="Total">{marker ? PRICE_STATUS_LABEL[item.priceMode] : money(item.total)}</PanelValue>
      </div>
      {hasChildren ? null : <Text size="sm" tone="tertiary">Work Item dengan harga langsung tidak memakai markup.</Text>}
    </>;
  } else if (found.kind === "group") {
    const group = found.group;
    body = <>
      {number("Jumlah per Work Item", group.qtyPerL1, updateSubObjectAction, group.id, "qtyPerL1", "Cost Component di dalam grup ini dikalikan angka ini.")}
      {number("Markup (%)", group.markupL2Pct, updateSubObjectAction, group.id, "markupL2Pct", "Hanya untuk Cost Component di grup ini; klien tidak melihatnya.")}
      <div className="grid gap-1.5 border-t border-line-subtle pt-3">
        <PanelValue label="Subtotal sebelum markup">{money(group.subtotalL2Raw)}</PanelValue>
        <PanelValue label="Subtotal">{money(group.subtotalL2)}</PanelValue>
      </div>
    </>;
  } else {
    const line = found.line;
    const changed = line.sourcePriceSnapshot !== null && line.hargaSnapshot !== line.sourcePriceSnapshot;
    body = <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{KATEGORI_LABEL[line.kategori] ?? line.kategori}</Badge>
        {line.sourceType !== "CUSTOM" ? <Text tone="tertiary" size="sm">{line.sourceType === "MASTERDATA" ? "Salinan harga Master Data" : "Salinan harga BQ Library"}</Text> : null}
      </div>
      {line.sourceType === "CUSTOM" && canSaveToLibrary ? (
        // Owner 2026-10-22: saving a Custom row to the Library is an explicit choice, never automatic.
        <Button type="button" variant="secondary" size="sm" leadingIcon={<Library aria-hidden="true" />} disabled={pending} onClick={() => void run(saveLineItemToLibraryAction, { id: line.id }).catch(() => undefined)}>
          Simpan ke BQ Library
        </Button>
      ) : null}
      {number("Jumlah", line.qty, updateLineItemAction, line.id, "qty")}
      <PanelField label="Satuan">
        <InlineEdit label="Satuan" value={line.purchaseUnitSnapshot} disabled={!editable} commitOnBlur onCommit={commit(updateLineItemAction, line.id, "purchaseUnitSnapshot")} />
      </PanelField>
      {number("Koefisien", line.koefisien, updateLineItemAction, line.id, "koefisien")}
      <PanelField label="Harga satuan">
        <InlineEdit label="Harga satuan" inputMode="decimal" value={line.hargaSnapshot} display={(value) => priceText(value, line.currencySnapshot)} disabled={!editable} commitOnBlur onCommit={commitNum(updateLineItemAction, line.id, "hargaSnapshot")} />
      </PanelField>
      {changed ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning">Harga diubah</Badge>
          {/* Master Data is untouched: this only sets this row's price back to the copy taken when it was added. */}
          {editable ? (
            <button type="button" disabled={pending} onClick={() => void run(revertLineItemPriceAction, { id: line.id }).catch(() => undefined)} className="inline-flex items-center gap-1 rounded-control text-sm text-action underline-offset-2 hover:underline disabled:opacity-50">
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Kembalikan ke {formatMoney(createMoney(line.sourcePriceSnapshot!, line.currencySnapshot))}
            </button>
          ) : <Text tone="tertiary" size="sm">Harga awal {formatMoney(createMoney(line.sourcePriceSnapshot!, line.currencySnapshot))}</Text>}
        </div>
      ) : null}
      <div className="grid gap-1.5 border-t border-line-subtle pt-3">
        <PanelValue label="Biaya">{money(line.biayaLine, line.currencySnapshot)}</PanelValue>
      </div>
    </>;
  }

  return (
    <aside aria-label={`${kindLabel} ${title}`} className="order-first grid w-full shrink-0 content-start gap-3 self-start rounded-card border border-line bg-surface p-4 shadow-plane lg:sticky lg:top-0 lg:order-none lg:w-[320px] xl:w-[340px]">
      <div className="flex items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <Text size="sm" tone="tertiary" meta>{kindLabel}</Text>
          <Text weight="semibold" className="break-words">{title}</Text>
          {found.kind !== "item" ? <Text size="sm" tone="tertiary" className="truncate">di {found.item.name}{found.kind === "line" && found.group ? ` › ${found.group.name}` : ""}</Text> : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {onStep ? <>
            <IconButton size="sm" variant="ghost" label="Work Item sebelumnya" icon={<ChevronUp aria-hidden="true" />} onClick={() => step(-1)} />
            <IconButton size="sm" variant="ghost" label="Work Item berikutnya" icon={<ChevronDown aria-hidden="true" />} onClick={() => step(1)} />
          </> : null}
          <IconButton size="sm" variant="ghost" label="Tutup panel" icon={<X aria-hidden="true" />} onClick={onClose} />
        </div>
      </div>
      {body}
      {!editable ? <Text size="sm" tone="tertiary">Project ini hanya baca.</Text> : null}
    </aside>
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
  iconOnly = false,
  onAdd,
}: {
  label: string;
  placeholder: string;
  disabled: boolean;
  /** A narrower input, for the Struktur panel. */
  compact?: boolean;
  /** For optional child layers: reveal the compact action only with its parent. */
  iconOnly?: boolean;
  onAdd: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (!open) {
    if (iconOnly) {
      return <IconButton size="sm" variant="ghost" label={`Tambah ${label}`} icon={<FolderPlus aria-hidden="true" />} disabled={disabled} onClick={() => setOpen(true)} />;
    }
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
