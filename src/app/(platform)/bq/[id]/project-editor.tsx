"use client";

import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Lock, LockOpen, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Heading,
  IconButton,
  InlineEdit,
  InlineError,
  Input,
  SectionCard,
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
import type { ActionResult } from "@platform/core/actions";
import type {
  BqAssemblyTemplateRead,
  BqItemDetail,
  BqLineItemDetail,
  BqProjectDetail,
  BqSectionDetail,
  BqSubObjectDetail,
} from "@/apps/bq/public";
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
  revertLineItemPriceAction,
  unlockProjectAction,
} from "./actions";
import { AssemblyPickerDialog } from "./assembly-picker-dialog";
import { ImportDialog, type SourcePickOption } from "./source-picker-dialog";

const KATEGORI_LABEL: Record<string, string> = {
  MATERIAL: "Material",
  UPAH: "Labor",
  MATERIAL_UPAH: "Material + Labor",
  BIAYA_UMUM: "Biaya Umum",
  TRANSPORTASI_AKOMODASI: "Transportasi",
  ALAT: "Alat",
};

type AssemblyTarget =
  | { via: "item"; itemId: string }
  | { via: "section"; sectionId: string }
  | { via: "subsection"; subsectionId: string };

type Mutation = (prev: null, formData: FormData) => Promise<ActionResult<BqProjectDetail>>;

/** Amounts arrive as canonical decimal strings; presentation never re-derives them. */
function money(amount: string | null, currency = "IDR") {
  if (!amount) return <span className="text-ink-tertiary">—</span>;
  return <>{formatMoney(createMoney(amount, currency))}</>;
}

/** Counts every terminal cost line (L1-only Work Items and L3 Cost
 *  Components) so the header can show "X dari Y sudah ada harga" instead of
 *  only revealing incompleteness once the Grand Total goes blank. */
function countPriceCompleteness(sections: BqProjectDetail["sections"]) {
  let total = 0;
  let priced = 0;

  const countLine = (line: BqLineItemDetail) => {
    total += 1;
    if (line.hargaSnapshot !== null) priced += 1;
  };

  const countItem = (item: BqItemDetail) => {
    const hasChildren = item.subObjects.length > 0 || item.lineItems.length > 0;
    if (!hasChildren) {
      total += 1;
      if (item.hargaSnapshot !== null) priced += 1;
      return;
    }
    item.lineItems.forEach(countLine);
    item.subObjects.forEach((subObject) => subObject.lineItems.forEach(countLine));
  };

  for (const section of sections) {
    section.items.forEach(countItem);
    section.subsections.forEach((subsection) => subsection.items.forEach(countItem));
  }

  return { total, priced };
}

/** Structural Work Item count per Section, for the outline rail's quick scan.
 *  Counts array lengths only — bq-contract §2/§6.0 reserve money arithmetic
 *  for the server, so this never touches a price, rate, or total. */
function workItemCount(section: BqSectionDetail) {
  return section.items.length + section.subsections.reduce((sum, subsection) => sum + subsection.items.length, 0);
}

function SectionOutline({ sections }: { sections: readonly BqSectionDetail[] }) {
  if (sections.length === 0) return null;
  return (
    <nav
      aria-label="Navigasi Section"
      className="sticky top-0 hidden w-[196px] shrink-0 flex-col gap-0.5 self-start py-1 xl:flex"
    >
      <Text tone="tertiary" size="sm" meta className="px-2.5 pb-1">Outline</Text>
      {sections.map((section) => {
        const count = workItemCount(section);
        return (
          <a
            key={section.id}
            href={`#bq-section-${section.id}`}
            className="flex items-center justify-between gap-2 rounded-control px-2.5 py-1.5 text-sm text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <span className="truncate">{section.name}</span>
            {count > 0 ? <span className="shrink-0 text-xs tabular-nums text-ink-tertiary">{count}</span> : null}
          </a>
        );
      })}
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
  const [assemblyTarget, setAssemblyTarget] = useState<AssemblyTarget | null>(null);
  const [lockOpen, setLockOpen] = useState(false);
  /** Set when the server refused to lock because rows still have a price of Rp0: the count to confirm. */
  const [zeroPriceRows, setZeroPriceRows] = useState<number | null>(null);
  const [lifecycleConfirm, setLifecycleConfirm] = useState<"archive" | "restore" | "delete" | null>(null);

  const locked = project.status === "LOCKED" || project.status === "ARCHIVED";
  const editable = canManage && !locked;

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
        resolve();
      });
    });

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
  const { total: pricingTotal, priced: pricingPriced } = countPriceCompleteness(project.sections);

  return (
    <div className="grid gap-4">
      {error ? <InlineError>{error}</InlineError> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <Text tone="secondary" size="sm">
          {project.sections.length} section
          {canManage && project.status === "ACTIVE" ? " · dapat diedit" : null}
        </Text>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && project.status === "ACTIVE" ? <>
            <Button variant="secondary" leadingIcon={<Lock aria-hidden="true" />} onClick={() => setLockOpen(true)} disabled={pending}>Lock project</Button>
            <Button variant="ghost" leadingIcon={<Archive aria-hidden="true" />} onClick={() => setLifecycleConfirm("archive")} disabled={pending}>Archive</Button>
          </> : null}
          {canManage && project.status === "LOCKED" ? (
            <Button variant="secondary" leadingIcon={<LockOpen aria-hidden="true" />} onClick={() => void run(unlockProjectAction, {}).catch(() => undefined)} disabled={pending}>Unlock</Button>
          ) : null}
          {canManage && project.status === "ARCHIVED" ? <>
            <Button variant="secondary" leadingIcon={<ArchiveRestore aria-hidden="true" />} onClick={() => setLifecycleConfirm("restore")} disabled={pending}>Restore</Button>
            <Button variant="ghost" leadingIcon={<Trash2 aria-hidden="true" />} onClick={() => setLifecycleConfirm("delete")} disabled={pending}>Request deletion</Button>
          </> : null}
          {project.status !== "ACTIVE" ? <Badge tone={project.status === "ARCHIVED" ? "warning" : "neutral"}>{project.status === "ARCHIVED" ? "Archived — read only" : "Locked — read only"}</Badge> : null}
        </div>
      </div>

      <div className="flex items-start gap-5">
        <SectionOutline sections={project.sections} />
        <div className="grid min-w-0 flex-1 gap-4">
          {project.sections.length === 0 ? (
            <SectionCard>
              <EmptyState
                title="Belum ada section"
                description={editable ? "Tambahkan section untuk mulai menyusun BQ." : "Project ini belum memiliki section."}
              />
            </SectionCard>
          ) : null}

          {project.sections.map((section) => (
        <SectionCard key={section.id} id={`bq-section-${section.id}`} className="grid gap-3">
          <div className="flex items-center">
            {editable ? (
              <InlineEdit
                value={section.name}
                label="Section name"
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
            onApplyAssembly={(itemId) => setAssemblyTarget({ via: "item", itemId })}
            columns={totalColumns}
          />

          {section.subsections.map((subsection) => (
            <div key={subsection.id} className="grid gap-2 rounded-control border border-line-subtle p-3">
              <div className="flex items-center">
                {editable ? (
                  <InlineEdit
                    value={subsection.name}
                    label="Subsection name"
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
                onApplyAssembly={(itemId) => setAssemblyTarget({ via: "item", itemId })}
                columns={totalColumns}
              />
              {editable ? (
                <div className="flex gap-1.5 pt-1">
                  <AddRow
                    label="+ Work Item"
                    placeholder="Nama Work Item"
                    disabled={pending}
                    onAdd={(name) => run(addItemAction, { subsectionId: subsection.id, name })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setAssemblyTarget({ via: "subsection", subsectionId: subsection.id })}
                  >
                    Terapkan Assembly
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {editable ? (
            <div className="flex flex-wrap gap-1.5 border-t border-line-subtle pt-3">
              <AddRow
                label="+ Subsection"
                placeholder="Nama subsection"
                disabled={pending}
                onAdd={(name) => run(addSubsectionAction, { sectionId: section.id, name })}
              />
              <AddRow
                label="+ Work Item"
                placeholder="Nama Work Item"
                disabled={pending}
                onAdd={(name) => run(addItemAction, { sectionId: section.id, name })}
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setAssemblyTarget({ via: "section", sectionId: section.id })}
              >
                Terapkan Assembly
              </Button>
            </div>
          ) : null}
        </SectionCard>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface/95 px-4 py-3 shadow-plane backdrop-blur-sm">
        {pricingTotal > 0 ? (
          <Text
            tone="tertiary"
            size="sm"
            className={pricingPriced === pricingTotal ? undefined : "text-warning"}
          >
            {pricingPriced} dari {pricingTotal} Cost Component sudah ada harga
          </Text>
        ) : <span />}
        <div className="flex items-baseline gap-2">
          <Text tone="secondary" size="sm">Grand total</Text>
          <span className="text-xl font-semibold tabular-nums text-ink">
            {project.grandTotal === null
              ? <span className="text-sm font-normal text-ink-tertiary">Belum lengkap — ada item tanpa harga</span>
              : formatMoney(createMoney(project.grandTotal, "IDR"))}
          </span>
        </div>
      </div>

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
        title="Lock this project?"
        description="A locked project becomes read-only. Nothing in its structure or numbers can change afterwards."
        confirmLabel="Lock project"
        tone="danger"
        pending={pending}
        requireTypedConfirmation="LOCK"
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
        title="Lock with unpriced rows?"
        description={`${zeroPriceRows ?? 0} row${zeroPriceRows === 1 ? " has" : "s have"} a price of Rp0. If that is intended (for example a price by request), lock anyway. Otherwise cancel and fill the prices in first.`}
        confirmLabel="Lock anyway"
        tone="danger"
        pending={pending}
        onConfirm={() => {
          void run(lockProjectAction, { acknowledgeZeroPrices: "true" }).catch(() => undefined).finally(() => setZeroPriceRows(null));
        }}
      />

      <ConfirmDialog
        open={lifecycleConfirm !== null}
        onOpenChange={(open) => { if (!open) setLifecycleConfirm(null); }}
        title={lifecycleConfirm === "archive" ? "Archive this project?" : lifecycleConfirm === "restore" ? "Restore this project?" : "Request permanent deletion?"}
        description={lifecycleConfirm === "archive" ? "The project stays readable but cannot be edited until restored." : lifecycleConfirm === "restore" ? "The project returns to ACTIVE and can be edited again." : "An authorized approver must review the request before this archived project is permanently removed."}
        confirmLabel={lifecycleConfirm === "archive" ? "Archive project" : lifecycleConfirm === "restore" ? "Restore project" : "Submit request"}
        tone={lifecycleConfirm === "restore" ? "primary" : "danger"}
        pending={pending}
        onConfirm={() => {
          const action = lifecycleConfirm === "archive" ? archiveProjectAction : lifecycleConfirm === "restore" ? restoreProjectAction : requestProjectDeletionAction;
          void run(action, {}).catch(() => undefined).finally(() => setLifecycleConfirm(null));
        }}
      />

      {assemblyTarget ? (
        <AssemblyPickerDialog
          key={assemblyTarget.via === "item" ? assemblyTarget.itemId : assemblyTarget.via === "section" ? assemblyTarget.sectionId : assemblyTarget.subsectionId}
          assemblies={assemblies}
          pending={pending}
          onClose={() => setAssemblyTarget(null)}
          onApply={(assemblyId, qtyPerL1) => {
            const action = assemblyTarget.via === "item" ? applyAssemblyAction : addItemAndApplyAssemblyAction;
            const fields = assemblyTarget.via === "item"
              ? { itemId: assemblyTarget.itemId, assemblyId, qtyPerL1 }
              : assemblyTarget.via === "section"
                ? { sectionId: assemblyTarget.sectionId, assemblyId, qtyPerL1 }
                : { subsectionId: assemblyTarget.subsectionId, assemblyId, qtyPerL1 };
            void run(action, fields).catch(() => undefined).finally(() => setAssemblyTarget(null));
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
  columns: number;
}) {
  if (items.length === 0) {
    return <Text tone="tertiary" size="sm">No Work Items yet.</Text>;
  }

  return (
    <DataTable minWidth="960px" density="compact">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[36px]" aria-label="Expand" />
          <TableHead>Uraian</TableHead>
          <TableHead align="end" className="w-[90px]">Qty</TableHead>
          <TableHead className="w-[80px]">Unit</TableHead>
          <TableHead align="end" className="w-[90px]">Koef.</TableHead>
          <TableHead align="end" className="w-[90px]">Markup</TableHead>
          <TableHead align="end" className="w-[130px]">Rate</TableHead>
          <TableHead align="end" className="w-[140px]">Total</TableHead>
          {editable ? <TableHead align="end" className="w-[80px]" aria-label="Actions" /> : null}
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
  columns: number;
}) {
  return (
    <>
      <TableRow>
        <TableCell>
          <IconButton
            size="sm"
            variant="ghost"
            label={open ? `Collapse ${item.name}` : `Expand ${item.name}`}
            icon={open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
            onClick={() => toggle(item.id)}
          />
        </TableCell>
        <TableCell wrap className="font-medium">
          <InlineEdit label="Work Item name" value={item.name} disabled={!editable} onCommit={commit(updateItemAction, item.id, "name")} />
        </TableCell>
        <TableCell align="end">
          <InlineEdit label="Quantity" align="end" inputMode="decimal" value={item.qty} disabled={!editable} onCommit={commitNum(updateItemAction, item.id, "qty")} />
        </TableCell>
        <TableCell>{editable ? <Select aria-label="Work Item unit" value={item.unit} disabled={pending} onChange={(event) => void commit(updateItemAction, item.id, "unit")(event.target.value).catch(() => undefined)}>{units.some((unit) => unit.code === item.unit) ? null : <option value={item.unit} disabled>{item.unit} (inactive snapshot)</option>}{units.map((unit) => <option key={unit.id} value={unit.code}>{unit.code}</option>)}</Select> : item.unit}</TableCell>
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
          {hasChildren ? (
            money(item.rate)
          ) : (
            <InlineEdit
              label="Unit price"
              align="end"
              inputMode="decimal"
              placeholder="Belum ada harga"
              value={item.hargaSnapshot ?? ""}
              display={(value) => value ? formatMoney(createMoney(value, "IDR")) : <span className="text-ink-tertiary">Belum ada harga</span>}
              disabled={!editable}
              onCommit={commitNum(updateItemAction, item.id, "hargaSnapshot")}
            />
          )}
        </TableCell>
        <TableCell align="end" className="font-semibold">{money(item.total)}</TableCell>
        {editable ? (
          <TableCell align="end">
            <RemoveButton
              label={`Delete ${item.name}`}
              onRemove={() => run(deleteItemAction, { id: item.id })}
              disabled={pending}
            />
          </TableCell>
        ) : null}
      </TableRow>

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
            />
          ))}

          {editable ? (
            <TableRow>
              <TableCell />
              <TableCell colSpan={columns - 1}>
                <div className="flex flex-wrap items-center gap-1.5 pl-4">
                  <AddRow
                    label="+ Component Group"
                    placeholder="Nama Component Group"
                    disabled={pending}
                    onAdd={(name) => run(addSubObjectAction, { itemId: item.id, name })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    leadingIcon={<Plus aria-hidden="true" />}
                    disabled={pending}
                    onClick={() => onImport({ itemId: item.id })}
                  >
                    + Tambah Cost Component
                  </Button>
                  {onApplyAssembly ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => onApplyAssembly(item.id)}
                    >
                      Assembly
                    </Button>
                  ) : null}
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
  columns: number;
}) {
  const open = expanded.has(subObject.id);
  return (
    <>
      <TableRow className="bg-[color-mix(in_srgb,var(--ui-surface-muted)_45%,transparent)]">
        <TableCell />
        <TableCell wrap>
          <div className="flex items-center gap-1 pl-4">
            <IconButton
              size="sm"
              variant="ghost"
              label={open ? `Collapse ${subObject.name}` : `Expand ${subObject.name}`}
              icon={open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
              onClick={() => toggle(subObject.id)}
            />
            <InlineEdit label="Component name" value={subObject.name} disabled={!editable} onCommit={commit(updateSubObjectAction, subObject.id, "name")} />
          </div>
        </TableCell>
        <TableCell align="end">
          <InlineEdit label="Quantity per Work Item" align="end" inputMode="decimal" value={subObject.qtyPerL1} disabled={!editable} onCommit={commitNum(updateSubObjectAction, subObject.id, "qtyPerL1")} />
        </TableCell>
        <TableCell><Text tone="tertiary" size="sm">per Work Item</Text></TableCell>
        <TableCell align="end">
          <Text tone="tertiary" size="sm">—</Text>
        </TableCell>
        <TableCell align="end">
          <Tooltip content="Component Group markup (%) — applies only to Cost Components in this group.">
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
              label={`Delete ${subObject.name}`}
              onRemove={() => run(deleteSubObjectAction, { id: subObject.id })}
              disabled={pending}
            />
          </TableCell>
        ) : null}
      </TableRow>

      {open ? (
        <>
          {subObject.lineItems.map((line) => (
            <LineItemRow key={line.id} line={line} depth={2} editable={editable} pending={pending} run={run} commit={commit} commitNum={commitNum} />
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
                    + Tambah Cost Component
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
}: {
  line: BqLineItemDetail;
  depth: 1 | 2;
  editable: boolean;
  pending: boolean;
  run: (action: Mutation, fields: Record<string, string | undefined>) => Promise<void>;
  commit: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
  commitNum: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
}) {
  return (
    <TableRow>
      <TableCell />
      <TableCell wrap>
        <div className={depth === 2 ? "pl-10" : "pl-4"}>
          <InlineEdit label="Cost Component name" value={line.titleSnapshot} disabled={!editable} onCommit={commit(updateLineItemAction, line.id, "titleSnapshot")} />
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{KATEGORI_LABEL[line.kategori] ?? line.kategori}</Badge>
            {line.sourceType !== "CUSTOM" ? (
              <Text tone="tertiary" size="sm">
                {line.sourceType === "MASTERDATA" ? "Snapshot Master Data" : "Snapshot BQ Library"}
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
              <Tooltip content={`Harga asli: ${formatMoney(createMoney(line.sourcePriceSnapshot, line.currencySnapshot))}`}>
                <Badge tone="warning">Harga diubah</Badge>
              </Tooltip>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell align="end">
        <InlineEdit label="Quantity" align="end" inputMode="decimal" value={line.qty} disabled={!editable} onCommit={commitNum(updateLineItemAction, line.id, "qty")} />
      </TableCell>
      <TableCell>
        <InlineEdit label="Unit" value={line.purchaseUnitSnapshot} disabled={!editable} onCommit={commit(updateLineItemAction, line.id, "purchaseUnitSnapshot")} />
      </TableCell>
      <TableCell align="end">
        <InlineEdit label="Coefficient" align="end" inputMode="decimal" value={line.koefisien} disabled={!editable} onCommit={commitNum(updateLineItemAction, line.id, "koefisien")} />
      </TableCell>
      <TableCell align="end">
        <Text tone="tertiary" size="sm">—</Text>
      </TableCell>
      <TableCell align="end">
        <InlineEdit
          label="Price"
          align="end"
          inputMode="decimal"
          value={line.hargaSnapshot}
          disabled={!editable}
          display={(value) => value ? formatMoney(createMoney(value, line.currencySnapshot)) : <span className="text-ink-tertiary">Belum ada harga</span>}
          onCommit={commitNum(updateLineItemAction, line.id, "hargaSnapshot")}
        />
      </TableCell>
      <TableCell align="end">{money(line.biayaLine, line.currencySnapshot)}</TableCell>
      {editable ? (
        <TableCell align="end">
          <div className="flex items-center justify-end gap-0.5">
            {line.sourcePriceSnapshot !== null && line.hargaSnapshot !== line.sourcePriceSnapshot ? (
              <Tooltip content="Kembalikan ke harga snapshot asal">
                <IconButton
                  size="sm"
                  variant="ghost"
                  label="Revert harga"
                  icon={<RotateCcw aria-hidden="true" />}
                  disabled={pending}
                  onClick={() => run(revertLineItemPriceAction, { id: line.id })}
                />
              </Tooltip>
            ) : null}
            <RemoveButton
              label={`Delete ${line.titleSnapshot}`}
              onRemove={() => run(deleteLineItemAction, { id: line.id })}
              disabled={pending}
            />
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function AddRow({
  label,
  placeholder,
  disabled,
  onAdd,
}: {
  label: string;
  placeholder: string;
  disabled: boolean;
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
        className="h-8 w-[200px]"
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
        description="This Work Item and its breakdown will be permanently removed from the project."
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
