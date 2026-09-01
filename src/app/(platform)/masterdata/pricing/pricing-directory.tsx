"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Archive, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, CreatableSearch, DataTable, Dialog, EmptyState, Field, FormActions, InlineError, Input, Pagination, SearchField, SectionCard, Select, SimpleTextEditor, Spinner, StatusBadge, type SortDirection, TableCell, TableCellContent, TableHead, TableHeader, TableRow, TableToolbar, Tabs, useOptionOverlay } from "@/platform/ui_engine";
import { compareDecimals, formatDecimal, type DecimalString } from "@platform/utilities/decimal";
import { archivePriceAction, createPricingVendorQuickAction, createPricingWorkCategoryQuickAction, requestPriceDeletionAction, restorePriceAction, savePriceAction } from "./actions";

type Kind = "material" | "material-labor" | "labor";
type MaterialRow = { id: string; sku: { id: string; name: string; code: string | null }; supplier_vendor: { id: string; name: string }; amount: string; currency: string; unit: { id: string; code: string; name: string }; notes: string | null; deleted_at: Date | null };
type WorkRow = { id: string; name: string; category: { id: string; name: string }; vendor: { id: string; name: string }; amount: string; currency: string; unit: { id: string; code: string; name: string }; scope_note?: string | null; notes: string | null; deleted_at: Date | null };
type Target = { kind: Kind; id: string; name: string };
type Editor = { kind: Kind; row?: MaterialRow | WorkRow };
type Ref = { id: string; name: string };
type PriceSortKey = "name" | "vendor" | "amount";
const PRICE_PAGE_SIZE = 25;

export function PricingDirectory(props: { materialPrices: MaterialRow[]; materialLaborPrices: WorkRow[]; laborPrices: WorkRow[]; canManageMaterial: boolean; canManageWork: boolean; canReadMaterial: boolean; canReadWork: boolean; canManageVendors: boolean; canManageCategories: boolean; skus: Array<{ id: string; name: string; code: string | null }>; vendors: Ref[]; units: Array<Ref & { code: string }>; workCategories: Ref[]; vendorTypes: Array<Ref & { canSupplyMaterial: boolean; canSupplyLabor: boolean }> }) {
  const [query, setQuery] = useState(""); const [status, setStatus] = useState("ACTIVE"); const [page, setPage] = useState(1); const [sort, setSort] = useState<{ key: PriceSortKey; direction: SortDirection }>({ key: "name", direction: "asc" }); const [editor, setEditor] = useState<Editor | null>(null); const [formError, setFormError] = useState<string | null>(null);
  const [archive, setArchive] = useState<Target | null>(null); const [restore, setRestore] = useState<Target | null>(null); const [deletion, setDeletion] = useState<Target | null>(null); const [reason, setReason] = useState(""); const [pendingId, setPendingId] = useState<string | null>(null); const [, startTransition] = useTransition();
  const matches = (text: string, archived: boolean) => (status === "ALL" || (status === "ARCHIVED") === archived) && text.toLowerCase().includes(query.toLowerCase());
  const run = (id: string, fn: () => Promise<unknown>) => { setPendingId(id); startTransition(async () => { try { await fn(); } finally { setPendingId(null); } }); };
  const closeEditor = () => { setEditor(null); setFormError(null); };
  const sortRows = <T extends MaterialRow | WorkRow>(rows: T[], name: (row: T) => string, vendor: (row: T) => string) => [...rows].sort((left, right) => {
    const leftValue = sort.key === "name" ? name(left) : sort.key === "vendor" ? vendor(left) : left.amount;
    const rightValue = sort.key === "name" ? name(right) : sort.key === "vendor" ? vendor(right) : right.amount;
    const compared = sort.key === "amount" ? compareDecimals(leftValue as DecimalString, rightValue as DecimalString) : leftValue.localeCompare(rightValue, "id");
    return sort.direction === "asc" ? compared : -compared;
  });
  const paginate = <T,>(rows: T[]) => { const pageCount = Math.max(1, Math.ceil(rows.length / PRICE_PAGE_SIZE)); const currentPage = Math.min(page, pageCount); return { rows: rows.slice((currentPage - 1) * PRICE_PAGE_SIZE, currentPage * PRICE_PAGE_SIZE), currentPage, pageCount }; };
  const changeSort = (key: PriceSortKey) => (direction: SortDirection) => { setSort({ key, direction }); setPage(1); };
  const sortableHead = (key: PriceSortKey, label: string, align: "start" | "end" = "start") => <TableHead align={align} sortable sortDirection={sort.key === key ? sort.direction : null} onSortChange={changeSort(key)} sortLabel={(direction) => `${label}, sort ${direction}`}>{label}</TableHead>;
  const pagination = (currentPage: number, pageCount: number) => pageCount > 1 ? <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} label="Pricing pages" /> : null;
  const toolbar = <TableToolbar><div className="flex flex-wrap items-center gap-3"><SearchField value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} onClear={() => { setQuery(""); setPage(1); }} placeholder="Search pricing..." /><Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="w-36"><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option><option value="ALL">All status</option></Select></div></TableToolbar>;
  const actions = (row: { id: string; deleted_at: Date | null }, target: Target, canManage: boolean, edit: () => void) => !canManage ? null : <TableCell align="end"><div className="flex items-center justify-end gap-1">{pendingId === row.id && <Spinner />}{!row.deleted_at ? <><Button size="sm" variant="ghost" title="Edit" onClick={edit}><Pencil size={15} /></Button><Button size="sm" variant="ghost" title="Archive" onClick={() => setArchive(target)}><Archive size={15} /></Button></> : <><Button size="sm" variant="ghost" title="Restore" onClick={() => setRestore(target)}><RotateCcw size={15} /></Button><Button size="sm" variant="danger" title="Request deletion" onClick={() => setDeletion(target)}><Trash2 size={15} /></Button></>}</div></TableCell>;
  const material = props.materialPrices.filter((row) => matches(`${row.sku.name} ${row.sku.code ?? ""} ${row.supplier_vendor.name}`, Boolean(row.deleted_at)));
  const materialPaged = paginate(sortRows(material, (row) => row.sku.name, (row) => row.supplier_vendor.name));
  const workTable = (rows: WorkRow[], kind: Kind, canManage: boolean, title: string) => { const filtered = rows.filter((row) => matches(`${row.name} ${row.category.name} ${row.vendor.name}`, Boolean(row.deleted_at))); const paged = paginate(sortRows(filtered, (row) => row.name, (row) => row.vendor.name)); return <div className="grid gap-4">{toolbar}{filtered.length === 0 ? <EmptyState title={title} description={query ? "No prices match this search." : "No pricing records yet."} /> : <><DataTable minWidth={760}><TableHeader><TableRow>{sortableHead("name", "Name")}<TableHead>Category</TableHead>{sortableHead("vendor", "Vendor")}{sortableHead("amount", "Price", "end")}<TableHead>Unit</TableHead><TableHead>Status</TableHead>{canManage && <TableHead align="end">Actions</TableHead>}</TableRow></TableHeader><tbody>{paged.rows.map((row) => <TableRow key={row.id}><TableCell><TableCellContent primary={<span className="font-semibold">{row.name}</span>} /></TableCell><TableCell>{row.category.name}</TableCell><TableCell>{row.vendor.name}</TableCell><TableCell align="end">{row.currency} {row.amount}</TableCell><TableCell><span className="font-mono text-xs">{row.unit.code}</span></TableCell><TableCell><StatusBadge tone={row.deleted_at ? "neutral" : "success"}>{row.deleted_at ? "Archived" : "Active"}</StatusBadge></TableCell>{actions(row, { kind, id: row.id, name: row.name }, canManage, () => setEditor({ kind, row }))}</TableRow>)}</tbody></DataTable>{pagination(paged.currentPage, paged.pageCount)}</>}</div>; };
  return <SectionCard>
    {editor && <PriceEditor editor={editor} refs={props} error={formError} onCancel={closeEditor} onSubmit={async (event) => { event.preventDefault(); setFormError(null); const result = await savePriceAction(editor.kind, new FormData(event.currentTarget)); if (result.ok) closeEditor(); else setFormError(result.error.safeMessage); }} />}
    <div className="flex flex-wrap justify-end gap-2">{props.canManageMaterial && <Button variant="primary" onClick={() => setEditor({ kind: "material" })}>New material price</Button>}{props.canManageWork && <Button variant="primary" onClick={() => setEditor({ kind: "material-labor" })}>New work price</Button>}{props.canManageWork && <Button variant="primary" onClick={() => setEditor({ kind: "labor" })}>New labor price</Button>}</div>
    <Tabs items={[
      { value: "material", label: `Material Prices (${props.materialPrices.length})`, disabled: !props.canReadMaterial, content: <div className="grid gap-4">{toolbar}{material.length === 0 ? <EmptyState title="No material prices" description={query ? "No prices match this search." : "Create a material price for an active SKU and eligible vendor."} /> : <><DataTable minWidth={720}><TableHeader><TableRow>{sortableHead("name", "SKU")}{sortableHead("vendor", "Supplier")}{sortableHead("amount", "Price", "end")}<TableHead>Unit</TableHead><TableHead>Status</TableHead>{props.canManageMaterial && <TableHead align="end">Actions</TableHead>}</TableRow></TableHeader><tbody>{materialPaged.rows.map((row) => <TableRow key={row.id}><TableCell><TableCellContent primary={<span className="font-semibold">{row.sku.name}</span>} secondary={row.sku.code ? <span className="font-mono text-xs">{row.sku.code}</span> : undefined} /></TableCell><TableCell>{row.supplier_vendor.name}</TableCell><TableCell align="end">{row.currency} {row.amount}</TableCell><TableCell><span className="font-mono text-xs">{row.unit.code}</span></TableCell><TableCell><StatusBadge tone={row.deleted_at ? "neutral" : "success"}>{row.deleted_at ? "Archived" : "Active"}</StatusBadge></TableCell>{actions(row, { kind: "material", id: row.id, name: `${row.sku.name} / ${row.supplier_vendor.name}` }, props.canManageMaterial, () => setEditor({ kind: "material", row }))}</TableRow>)}</tbody></DataTable>{pagination(materialPaged.currentPage, materialPaged.pageCount)}</>}</div> },
      { value: "material-labor", label: `Material + Labor (${props.materialLaborPrices.length})`, disabled: !props.canReadWork, content: workTable(props.materialLaborPrices, "material-labor", props.canManageWork, "No material + labor prices") },
      { value: "labor", label: `Labor Only (${props.laborPrices.length})`, disabled: !props.canReadWork, content: workTable(props.laborPrices, "labor", props.canManageWork, "No labor-only prices") },
    ]} />
    {archive && <ConfirmDialog open onOpenChange={(open) => !open && setArchive(null)} title={`Archive ${archive.name}?`} description="It will be removed from active pricing and pickers." confirmLabel="Archive" tone="danger" onConfirm={() => { const value = archive; setArchive(null); run(value.id, () => archivePriceAction(value.kind, value.id)); }} />}
    {restore && <ConfirmDialog open onOpenChange={(open) => !open && setRestore(null)} title={`Restore ${restore.name}?`} description="Required references will be validated before restoring it." confirmLabel="Restore" onConfirm={() => { const value = restore; setRestore(null); run(value.id, () => restorePriceAction(value.kind, value.id)); }} />}
    {deletion && <Dialog open onOpenChange={(open) => !open && setDeletion(null)} title="Request permanent deletion" description="The archived record remains until a deletion approver accepts this request."><div className="grid gap-4"><Field label="Reason"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional context for the approver" /></Field><FormActions><Button variant="ghost" onClick={() => setDeletion(null)}>Cancel</Button><Button variant="danger" onClick={() => { const value = deletion; const note = reason; setDeletion(null); setReason(""); run(value.id, () => requestPriceDeletionAction(value.kind, value.id, note)); }}>Submit request</Button></FormActions></div></Dialog>}
  </SectionCard>;
}

type PriceEditorRefs = {
  skus: Array<{ id: string; name: string; code: string | null }>;
  vendors: Ref[];
  units: Array<Ref & { code: string }>;
  workCategories: Ref[];
  vendorTypes: Array<Ref & { canSupplyMaterial: boolean; canSupplyLabor: boolean }>;
  canManageVendors: boolean;
  canManageCategories: boolean;
};

function parseIndonesianAmount(value: string): string | null {
  const compact = value.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!compact) return "";
  const commaIndex = compact.lastIndexOf(",");
  if (commaIndex === -1) return compact.replace(/\D/g, "") || "";
  const integer = compact.slice(0, commaIndex).replace(/\D/g, "") || "0";
  const fraction = compact.slice(commaIndex + 1).replace(/\D/g, "");
  if (!fraction) return integer;
  return `${integer}.${fraction}`;
}

function PriceEditor({ editor, refs, error, onCancel, onSubmit }: { editor: Editor; refs: PriceEditorRefs; error: string | null; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  const edit = Boolean(editor.row);
  const material = editor.kind === "material";
  const row = editor.row;
  const materialRow = material && row ? row as MaterialRow : undefined;
  const workRow = !material && row ? row as WorkRow : undefined;
  const { options: vendorOptions, upsertOverlayOption } = useOptionOverlay(refs.vendors);
  const { options: categoryOptions, upsertOverlayOption: upsertCategoryOption } = useOptionOverlay(refs.workCategories);
  const [vendorId, setVendorId] = useState(materialRow?.supplier_vendor.id ?? workRow?.vendor.id ?? "");
  const [categoryId, setCategoryId] = useState(workRow?.category.id ?? "");
  const currency = row?.currency ?? "IDR";
  const [amount, setAmount] = useState(row?.amount ?? "");
  const [amountDisplay, setAmountDisplay] = useState(row?.amount ? formatDecimal(row.amount) : "");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickVendorTypeId, setQuickVendorTypeId] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickPending, setQuickPending] = useState(false);
  const [categoryCreateError, setCategoryCreateError] = useState<string | null>(null);
  const [categoryCreatePending, setCategoryCreatePending] = useState(false);
  const needsMaterial = material;
  const eligibleTypes = refs.vendorTypes.filter((type) => needsMaterial ? type.canSupplyMaterial : type.canSupplyLabor);

  const addVendor = async () => {
    setQuickError(null);
    setQuickPending(true);
    const data = new FormData();
    data.set("name", quickName);
    data.set("vendorTypeId", quickVendorTypeId);
    const result = await createPricingVendorQuickAction(editor.kind, data);
    setQuickPending(false);
    if (!result.ok) {
      setQuickError(result.error.safeMessage);
      return;
    }
    const name = quickName.trim();
    upsertOverlayOption({ id: result.data.vendorId, name });
    setVendorId(result.data.vendorId);
    setQuickName("");
    setQuickVendorTypeId("");
    setQuickOpen(false);
  };

  const createWorkCategory = async (name: string) => {
    setCategoryCreateError(null);
    setCategoryCreatePending(true);
    const data = new FormData();
    data.set("name", name);
    const result = await createPricingWorkCategoryQuickAction(data);
    setCategoryCreatePending(false);
    if (!result.ok) {
      setCategoryCreateError(result.error.safeMessage);
      return "";
    }
    const createdName = name.trim();
    upsertCategoryOption({ id: result.data.categoryId, name: createdName });
    setCategoryId(result.data.categoryId);
    return result.data.categoryId;
  };

  const vendorField = !edit && (
      <Field label={material ? "Supplier vendor" : "Vendor"} required>
      <>
        <input type="hidden" name="vendorId" value={vendorId} />
        <CreatableSearch
          label={material ? "Supplier vendor" : "Vendor"}
          options={vendorOptions.map((vendor) => ({ id: vendor.id, label: vendor.name }))}
          value={vendorId}
          onValueChange={setVendorId}
          placeholder="Search or select vendor"
          searchPlaceholder="Search vendor…"
          emptyLabel="No vendor matches this search."
          onCreate={refs.canManageVendors ? (name) => { setQuickName(name); setQuickOpen(true); return ""; } : undefined}
          createLabel={(name) => `Add “${name}” as a new vendor`}
          className="w-full"
        />
      </>
    </Field>
  );

  const categoryField = !material && (
    <Field label="WORK category" required>
      <>
        <input type="hidden" name="categoryId" value={categoryId} required />
        <CreatableSearch
          label="WORK category"
          options={categoryOptions.map((category) => ({ id: category.id, label: category.name }))}
          value={categoryId}
          onValueChange={setCategoryId}
          placeholder="Search or select category"
          searchPlaceholder="Search WORK categories…"
          emptyLabel="No WORK category matches this search."
          onCreate={refs.canManageCategories ? createWorkCategory : undefined}
          createLabel={(name) => `Add “${name}” as a WORK category`}
          disabled={categoryCreatePending}
          className="w-full"
        />
        {categoryCreateError ? <InlineError>{categoryCreateError}</InlineError> : null}
      </>
    </Field>
  );

  const updateAmount = (display: string) => {
    const parsed = parseIndonesianAmount(display);
    if (parsed === null) return;
    setAmount(parsed);
    setAmountDisplay(display.endsWith(",") ? display : parsed ? formatDecimal(parsed) : "");
  };

  return <>
    <Dialog open onOpenChange={(open) => !open && onCancel()} title={`${edit ? "Edit" : "Create"} ${material ? "material price" : "price"}`} description={material && edit ? "SKU and supplier identity are read-only." : "Choose only active and eligible catalog references."}><form className="grid gap-4" onSubmit={onSubmit}>
      {edit && <input type="hidden" name="id" value={row!.id} />}{error && <div role="alert" className="text-sm text-danger">{error}</div>}
      {material ? (edit ? <><Field label="SKU"><Input value={materialRow!.sku.name} readOnly /></Field><Field label="Supplier vendor"><Input value={materialRow!.supplier_vendor.name} readOnly /></Field><Field label="Unit"><Input value={`${materialRow!.unit.name} (${materialRow!.unit.code})`} readOnly /></Field></> : <><Field label="SKU" required><Select name="skuId" required><option value="">Select SKU</option>{refs.skus.map((sku) => <option key={sku.id} value={sku.id}>{sku.name}{sku.code ? ` (${sku.code})` : ""}</option>)}</Select></Field>{vendorField}</>) : <><Field label="Name" required><Input name="name" defaultValue={workRow?.name} required /></Field>{categoryField}{vendorField}<Field label="Unit" required><Select name="unitId" defaultValue={workRow?.unit.id ?? ""} required><option value="">Select unit</option>{refs.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>)}</Select></Field>{editor.kind === "material-labor" && <Field label="Scope note" description="Describe included work or materials. Use bullets for a clear scope."><SimpleTextEditor name="scopeNote" defaultValue={workRow?.scope_note ?? ""} placeholder={"Example:\n- Installation labor\n- Adhesive and grout"} maxLength={1000} rows={5} /></Field>}</>}
      <input type="hidden" name="amount" value={amount} /><input type="hidden" name="currency" value={currency} />
      <Field label="Amount" description={`${currency} default currency`} required><div className="relative"><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-ui-mono text-sm font-semibold text-ink-secondary">{currency}</span><Input aria-label="Amount" value={amountDisplay} onChange={(event) => updateAmount(event.target.value)} onBlur={() => setAmountDisplay(amount ? formatDecimal(amount) : "")} inputMode="decimal" placeholder="15.000" className="pl-14 tabular-nums" required /></div></Field><Field label="Notes"><Input name="notes" defaultValue={row?.notes ?? ""} /></Field><FormActions><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary">{edit ? "Save changes" : "Create price"}</Button></FormActions>
    </form></Dialog>
    {quickOpen && <Dialog open onOpenChange={(open) => !open && setQuickOpen(false)} title="Add vendor" description={`Create a vendor for this ${needsMaterial ? "material" : "labor"} price using one eligible VendorType.`}>
      <div className="grid gap-4">
        {quickError && <div role="alert" className="text-sm text-danger">{quickError}</div>}
        <Field label="Vendor name" required><Input value={quickName} onChange={(event) => setQuickName(event.target.value)} required autoFocus /></Field>
        <Field label="VendorType" required><Select value={quickVendorTypeId} onChange={(event) => setQuickVendorTypeId(event.target.value)} required><option value="">Select eligible VendorType</option>{eligibleTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</Select></Field>
        {eligibleTypes.length === 0 && <div role="alert" className="text-sm text-danger">No active VendorType has the required capability. Configure it in Master Data settings first.</div>}
        <FormActions><Button type="button" variant="ghost" onClick={() => setQuickOpen(false)}>Cancel</Button><Button type="button" variant="primary" disabled={quickPending || !quickName.trim() || !quickVendorTypeId || eligibleTypes.length === 0} onClick={() => void addVendor()}>{quickPending ? "Adding..." : "Add vendor"}</Button></FormActions>
      </div>
    </Dialog>}
  </>;
}
