"use client";

import { ChevronDown, ChevronRight, Download, Lock, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  IconButton,
  InlineEdit,
  InlineError,
  Input,
  SearchField,
  SectionCard,
  Text,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  Field,
  FormActions,
  Select,
} from "@/platform/ui_engine";
import { createMoney, formatMoney } from "@platform/utilities/money";
import type { ActionResult } from "@platform/core/actions";
import type {
  BqAssemblyTemplateRead,
  BqItemDetail,
  BqLineItemDetail,
  BqProjectDetail,
  BqSubObjectDetail,
} from "@/apps/bq/public";

import {
  addItemAction,
  addLineItemAction,
  addSubObjectAction,
  addSubsectionAction,
  applyAssemblyAction,
  deleteItemAction,
  deleteLineItemAction,
  deleteSubObjectAction,
  listLineItemSourcesAction,
  lockProjectAction,
  updateItemAction,
  updateLineItemAction,
  updateSubObjectAction,
  type LineItemSourceOption,
} from "./actions";

const KATEGORI_LABEL: Record<string, string> = {
  MATERIAL: "Material",
  UPAH: "Upah",
  MATERIAL_UPAH: "Material+Upah",
  BIAYA_UMUM: "Biaya Umum",
  TRANSPORTASI_AKOMODASI: "Transportasi",
  ALAT: "Alat",
};

type Mutation = (prev: null, formData: FormData) => Promise<ActionResult<BqProjectDetail>>;

/** Amounts arrive as canonical decimal strings; presentation never re-derives them. */
function money(amount: string | null, currency = "IDR") {
  if (amount === null) return <span className="text-ink-tertiary">—</span>;
  return <>{formatMoney(createMoney(amount, currency))}</>;
}

export function ProjectEditor({
  project: initialProject,
  canManage,
  assemblies = [],
}: {
  project: BqProjectDetail;
  canManage: boolean;
  assemblies?: BqAssemblyTemplateRead[];
}) {
  const [project, setProject] = useState(initialProject);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [importTarget, setImportTarget] = useState<{ itemId?: string; subObjectId?: string } | null>(null);
  const [assemblyTarget, setAssemblyTarget] = useState<string | null>(null); // itemId
  const [lockOpen, setLockOpen] = useState(false);

  const locked = project.status === "LOCKED";
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
        if (!result.ok) {
          setError(result.error.safeMessage);
          reject(new Error(result.error.safeMessage));
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

  const totalColumns = 7;

  return (
    <div className="grid gap-4">
      {error ? <InlineError>{error}</InlineError> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <div className="grid gap-0.5">
          <Text tone="secondary" size="sm">Grand total</Text>
          <span className="text-[1.5rem] font-semibold tabular-nums text-ink">
            {project.grandTotal === null
              ? <span className="text-[1rem] font-normal text-ink-tertiary">Belum lengkap — ada item tanpa harga</span>
              : formatMoney(createMoney(project.grandTotal, "IDR"))}
          </span>
        </div>
        {canManage && !locked ? (
          <Button variant="secondary" leadingIcon={<Lock aria-hidden="true" />} onClick={() => setLockOpen(true)} disabled={pending}>
            Lock project
          </Button>
        ) : null}
        {locked ? <Badge tone="neutral">Locked — read only</Badge> : null}
      </div>

      {project.sections.length === 0 ? (
        <SectionCard>
          <EmptyState
            title="Belum ada section"
            description={editable ? "Tambahkan section untuk mulai menyusun BQ." : "Project ini belum memiliki section."}
          />
        </SectionCard>
      ) : null}

      {project.sections.map((section) => (
        <SectionCard key={section.id} className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-ink">{section.name}</h2>
            {editable ? (
              <div className="flex flex-wrap gap-1.5">
                <AddRow
                  label="Subsection"
                  placeholder="Nama subsection"
                  disabled={pending}
                  onAdd={(name) => run(addSubsectionAction, { sectionId: section.id, name })}
                />
                <AddRow
                  label="Item"
                  placeholder="Nama item L1"
                  disabled={pending}
                  onAdd={(name) => run(addItemAction, { sectionId: section.id, name })}
                />
              </div>
            ) : null}
          </div>

          <ItemTable
            items={section.items}
            editable={editable}
            pending={pending}
            expanded={expanded}
            toggle={toggle}
            run={run}
            commit={commit}
            onImport={setImportTarget}
            columns={totalColumns}
          />

          {section.subsections.map((subsection) => (
            <div key={subsection.id} className="grid gap-2 rounded-control border border-line-subtle p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-secondary">{subsection.name}</h3>
                {editable ? (
                  <AddRow
                    label="Item"
                    placeholder="Nama item L1"
                    disabled={pending}
                    onAdd={(name) => run(addItemAction, { subsectionId: subsection.id, name })}
                  />
                ) : null}
              </div>
              <ItemTable
                items={subsection.items}
                editable={editable}
                pending={pending}
                expanded={expanded}
                toggle={toggle}
                run={run}
                commit={commit}
                onImport={setImportTarget}
                columns={totalColumns}
              />
            </div>
          ))}
        </SectionCard>
      ))}

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
              sourceRefId: option.id,
              sourceKind: option.sourceKind,
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
          void run(lockProjectAction, {}).finally(() => setLockOpen(false));
        }}
      />

      {assemblyTarget ? (
        <AssemblyPickerDialog
          key={assemblyTarget}
          assemblies={assemblies}
          pending={pending}
          onClose={() => setAssemblyTarget(null)}
          onApply={(assemblyId, qtyPerL1) => {
            void run(applyAssemblyAction, { itemId: assemblyTarget, assemblyId, qtyPerL1 }).finally(() => setAssemblyTarget(null));
          }}
        />
      ) : null}
    </div>
  );
}

function AssemblyPickerDialog({
  assemblies,
  pending,
  onClose,
  onApply,
}: {
  assemblies: BqAssemblyTemplateRead[];
  pending: boolean;
  onClose: () => void;
  onApply: (assemblyId: string, qtyPerL1: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(assemblies[0]?.id ?? "");
  const [qtyPerL1, setQtyPerL1] = useState("1");
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Terapkan Assembly" description="Pilih assembly untuk disalin sebagai komponen L2 beserta baris L3-nya.">
      <div className="grid gap-4">
        <Field label="Assembly">
          <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {assemblies.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.lineCount} baris)</option>
            ))}
          </Select>
        </Field>
        <Field label="Qty per L1">
          <Input inputMode="decimal" value={qtyPerL1} onChange={(e) => setQtyPerL1(e.target.value)} />
        </Field>
        <FormActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Batal</Button>
          <Button type="button" variant="primary" disabled={!selectedId || pending} pending={pending} onClick={() => onApply(selectedId, qtyPerL1)}>
            Terapkan
          </Button>
        </FormActions>
      </div>
    </Dialog>
  );
}

function ItemTable({
  items,
  editable,
  pending,
  expanded,
  toggle,
  run,
  commit,
  onImport,
  onApplyAssembly,
  columns,
}: {
  items: readonly BqItemDetail[];
  editable: boolean;
  pending: boolean;
  expanded: ReadonlySet<string>;
  toggle: (id: string) => void;
  run: (action: Mutation, fields: Record<string, string | undefined>) => Promise<void>;
  commit: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
  onImport: (target: { itemId?: string; subObjectId?: string }) => void;
  onApplyAssembly?: (itemId: string) => void;
  columns: number;
}) {
  if (items.length === 0) {
    return <Text tone="tertiary" size="sm">Belum ada item.</Text>;
  }

  return (
    <DataTable minWidth="880px" density="compact">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[36px]" aria-label="Expand" />
          <TableHead>Uraian</TableHead>
          <TableHead align="end" className="w-[90px]">Qty</TableHead>
          <TableHead className="w-[80px]">Unit</TableHead>
          <TableHead align="end" className="w-[110px]">Koef.</TableHead>
          <TableHead align="end" className="w-[130px]">Rate</TableHead>
          <TableHead align="end" className="w-[140px]">Total</TableHead>
          {editable ? <TableHead className="w-[80px]" aria-label="Actions" /> : null}
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
              open={open}
              hasChildren={hasChildren}
              editable={editable}
              pending={pending}
              expanded={expanded}
              toggle={toggle}
              run={run}
              commit={commit}
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
  open,
  hasChildren,
  editable,
  pending,
  expanded,
  toggle,
  run,
  commit,
  onImport,
  onApplyAssembly,
  columns,
}: {
  item: BqItemDetail;
  open: boolean;
  hasChildren: boolean;
  editable: boolean;
  pending: boolean;
  expanded: ReadonlySet<string>;
  toggle: (id: string) => void;
  run: (action: Mutation, fields: Record<string, string | undefined>) => Promise<void>;
  commit: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
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
          <InlineEdit label="Item name" value={item.name} disabled={!editable} onCommit={commit(updateItemAction, item.id, "name")} />
        </TableCell>
        <TableCell align="end">
          <InlineEdit label="Quantity" align="end" inputMode="decimal" value={item.qty} disabled={!editable} onCommit={commit(updateItemAction, item.id, "qty")} />
        </TableCell>
        <TableCell>
          <InlineEdit label="Unit" value={item.unit} disabled={!editable} onCommit={commit(updateItemAction, item.id, "unit")} />
        </TableCell>
        <TableCell align="end">
          {/* An L1 with children takes its cost from them; its own coefficient
              is dormant, so showing it as editable would be a lie. */}
          {hasChildren ? (
            <Tooltip content="Markup L1 (%). Koefisien hanya dipakai saat L1 tidak punya rincian.">
              <span className="inline-block">
                <InlineEdit label="Markup percent" align="end" inputMode="decimal" value={item.markupL1Pct} disabled={!editable} onCommit={commit(updateItemAction, item.id, "markupL1Pct")} />
              </span>
            </Tooltip>
          ) : (
            <InlineEdit label="Coefficient" align="end" inputMode="decimal" value={item.koefisien} disabled={!editable} onCommit={commit(updateItemAction, item.id, "koefisien")} />
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
              disabled={!editable}
              onCommit={commit(updateItemAction, item.id, "hargaSnapshot")}
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
            />
          ))}

          {editable ? (
            <TableRow>
              <TableCell />
              <TableCell colSpan={columns - 1}>
                <div className="flex flex-wrap items-center gap-1.5 pl-4">
                  <AddRow
                    label="Sub-object"
                    placeholder="Nama komponen L2"
                    disabled={pending}
                    onAdd={(name) => run(addSubObjectAction, { itemId: item.id, name })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    leadingIcon={<Plus aria-hidden="true" />}
                    disabled={pending}
                    onClick={() => void run(addLineItemAction, { itemId: item.id, sourceType: "CUSTOM" })}
                  >
                    Baris custom
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    leadingIcon={<Download aria-hidden="true" />}
                    disabled={pending}
                    onClick={() => onImport({ itemId: item.id })}
                  >
                    Impor
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
          <InlineEdit label="Quantity per item" align="end" inputMode="decimal" value={subObject.qtyPerL1} disabled={!editable} onCommit={commit(updateSubObjectAction, subObject.id, "qtyPerL1")} />
        </TableCell>
        <TableCell><Text tone="tertiary" size="sm">per L1</Text></TableCell>
        <TableCell align="end">
          <Tooltip content="Markup L2 (%) — berlaku hanya untuk baris di bawah komponen ini.">
            <span className="inline-block">
              <InlineEdit label="Markup percent" align="end" inputMode="decimal" value={subObject.markupL2Pct} disabled={!editable} onCommit={commit(updateSubObjectAction, subObject.id, "markupL2Pct")} />
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
            <LineItemRow key={line.id} line={line} depth={2} editable={editable} pending={pending} run={run} commit={commit} />
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
                    onClick={() => void run(addLineItemAction, { subObjectId: subObject.id, sourceType: "CUSTOM" })}
                  >
                    Baris custom
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    leadingIcon={<Download aria-hidden="true" />}
                    disabled={pending}
                    onClick={() => onImport({ subObjectId: subObject.id })}
                  >
                    Impor
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
}: {
  line: BqLineItemDetail;
  depth: 1 | 2;
  editable: boolean;
  pending: boolean;
  run: (action: Mutation, fields: Record<string, string | undefined>) => Promise<void>;
  commit: (action: Mutation, id: string, field: string) => (value: string) => Promise<void>;
}) {
  return (
    <TableRow>
      <TableCell />
      <TableCell wrap>
        <div className={depth === 2 ? "pl-10" : "pl-4"}>
          <InlineEdit label="Line name" value={line.titleSnapshot} disabled={!editable} onCommit={commit(updateLineItemAction, line.id, "titleSnapshot")} />
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
          </div>
        </div>
      </TableCell>
      <TableCell align="end">
        <InlineEdit label="Quantity" align="end" inputMode="decimal" value={line.qty} disabled={!editable} onCommit={commit(updateLineItemAction, line.id, "qty")} />
      </TableCell>
      <TableCell>
        <InlineEdit label="Unit" value={line.purchaseUnitSnapshot} disabled={!editable} onCommit={commit(updateLineItemAction, line.id, "purchaseUnitSnapshot")} />
      </TableCell>
      <TableCell align="end">
        <InlineEdit label="Coefficient" align="end" inputMode="decimal" value={line.koefisien} disabled={!editable} onCommit={commit(updateLineItemAction, line.id, "koefisien")} />
      </TableCell>
      <TableCell align="end">
        <InlineEdit
          label="Price"
          align="end"
          inputMode="decimal"
          value={line.hargaSnapshot}
          disabled={!editable}
          display={(value) => <>{formatMoney(createMoney(value, line.currencySnapshot))}</>}
          onCommit={commit(updateLineItemAction, line.id, "hargaSnapshot")}
        />
      </TableCell>
      <TableCell align="end">{money(line.biayaLine, line.currencySnapshot)}</TableCell>
      {editable ? (
        <TableCell align="end">
          <RemoveButton
            label={`Delete ${line.titleSnapshot}`}
            onRemove={() => run(deleteLineItemAction, { id: line.id })}
            disabled={pending}
          />
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
        description="Baris ini beserta rinciannya akan dihapus permanen dari project."
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

function ImportDialog({
  target,
  onClose,
  onPick,
}: {
  target: { itemId?: string; subObjectId?: string };
  onClose: () => void;
  onPick: (option: LineItemSourceOption) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<LineItemSourceOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, startTransition] = useTransition();

  const search = (nextQuery: string) => {
    setQuery(nextQuery);
    startTransition(async () => {
      const result = await listLineItemSourcesAction(nextQuery);
      if (!result.ok) {
        setError(result.error.safeMessage);
        return;
      }
      setError(null);
      setOptions(result.data);
    });
  };

  // A source lookup begins after the dialog has rendered. Starting a transition
  // during render is forbidden by React and crashes when the dialog opens.
  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const result = await listLineItemSourcesAction("");
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error.safeMessage);
        return;
      }
      setOptions(result.data);
    });
    return () => { cancelled = true; };
  }, [startTransition]);

  return (
    <Dialog
      open
      onOpenChange={(next) => { if (!next) onClose(); }}
      title="Impor dari Master Data atau BQ Library"
      description="Harga yang dipilih disalin sebagai snapshot. Perubahan di Master Data tidak akan mengubah baris ini."
      size="lg"
    >
      <div className="grid gap-3">
        <SearchField value={query} label="Cari sumber" onChange={(event) => search(event.target.value)} onClear={() => search("")} />
        {error ? <InlineError>{error}</InlineError> : null}
        {options.length === 0 && !loading ? (
          <EmptyState title="Tidak ada sumber" description="Tidak ada harga Master Data atau item BQ Library yang cocok." />
        ) : (
          <ul className="grid max-h-[380px] gap-1 overflow-auto">
            {options.map((option) => (
              <li key={`${option.sourceType}-${option.id}`}>
                <button
                  type="button"
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-action border border-transparent px-2.5 py-2 text-left hover:border-line hover:bg-surface-muted"
                  disabled={loading}
                  onClick={() => void onPick(option)}
                >
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate font-medium text-ink">{option.title}</span>
                    <span className="truncate text-xs text-ink-tertiary">
                      {option.detail} · {KATEGORI_LABEL[option.kategori] ?? option.kategori}
                    </span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums text-ink">
                    {formatMoney(createMoney(option.amount, option.currency))}
                    <span className="block text-xs text-ink-tertiary">per {option.unit}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
