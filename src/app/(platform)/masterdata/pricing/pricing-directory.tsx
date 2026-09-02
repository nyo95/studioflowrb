"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Archive, CircleHelp, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, CreatableSearch, DataTable, Dialog, EmptyState, Field, FormActions, InlineError, Input, Pagination, SearchField, SectionCard, Select, SimpleTextEditor, Spinner, StatusBadge, Text, Tooltip, type SortDirection, TableCell, TableCellContent, TableHead, TableHeader, TableRow, TableToolbar, Tabs, useOptionOverlay } from "@/platform/ui_engine";
import { compareDecimals, formatDecimal, type DecimalString } from "@platform/utilities/decimal";
import { createMoney, formatMoney } from "@platform/utilities/money";
import { calculateRectangleAreaSquareMeters } from "@platform/utilities/measurement";
import { archivePriceAction, createMaterialSkuAction, createPricingBrandQuickAction, createPricingProductCategoryQuickAction, createPricingVendorQuickAction, createPricingWorkCategoryQuickAction, requestPriceDeletionAction, restorePriceAction, savePriceAction } from "./actions";

type Kind = "material" | "material-labor" | "labor";
type SkuRef = { id: string; name: string | null; code: string | null; brand: { id: string; name: string } | null; base_unit: { id: string; code: string; name: string } | null; purchase_unit: { id: string; code: string; name: string } | null; dimension_length: string | null; dimension_width: string | null; dimension_thickness: string | null; dimension_unit: { id: string; code: string; name: string } | null; purchase_to_base_factor: string | null };
type MaterialRow = { id: string; sku: { id: string; name: string | null; code: string | null; brand: { id: string; name: string } | null }; supplier_vendor: { id: string; name: string }; amount: string; currency: string; unit: { id: string; code: string; name: string }; notes: string | null; deleted_at: Date | null };
type WorkRow = { id: string; name: string; category: { id: string; name: string }; vendor: { id: string; name: string }; amount: string; currency: string; unit: { id: string; code: string; name: string }; scope_note?: string | null; notes: string | null; deleted_at: Date | null };
type Target = { kind: Kind; id: string; name: string };
type Editor = { kind: Kind; row?: MaterialRow | WorkRow };
type Ref = { id: string; name: string };
type PriceSortKey = "name" | "vendor" | "amount";
const PRICE_PAGE_SIZE = 25;

function displayPrice(amount: string, currency: string): string {
  return formatMoney(createMoney(amount, currency));
}

export function PricingDirectory(props: { materialPrices: MaterialRow[]; materialLaborPrices: WorkRow[]; laborPrices: WorkRow[]; canManageMaterial: boolean; canManageWork: boolean; canReadMaterial: boolean; canReadWork: boolean; canManageVendors: boolean; canManageCategories: boolean; canManageSkus: boolean; canManageBrands: boolean; skus: SkuRef[]; brands: Ref[]; productCategories: Ref[]; vendors: Ref[]; units: Array<Ref & { code: string }>; workCategories: Ref[]; vendorTypes: Array<Ref & { canSupplyMaterial: boolean; canSupplyLabor: boolean }> }) {
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
  const material = props.materialPrices.filter((row) => matches(`${row.sku.name ?? ""} ${row.sku.code ?? ""} ${row.supplier_vendor.name}`, Boolean(row.deleted_at)));
  const materialPaged = paginate(sortRows(material, (row) => row.sku.name ?? row.sku.code ?? "", (row) => row.supplier_vendor.name));
  const workTable = (rows: WorkRow[], kind: Kind, canManage: boolean, title: string) => { const filtered = rows.filter((row) => matches(`${row.name} ${row.category.name} ${row.vendor.name}`, Boolean(row.deleted_at))); const paged = paginate(sortRows(filtered, (row) => row.name, (row) => row.vendor.name)); return <div className="grid gap-4">{toolbar}{filtered.length === 0 ? <EmptyState title={title} description={query ? "No prices match this search." : "No pricing records yet."} /> : <><DataTable minWidth={760}><TableHeader><TableRow>{sortableHead("name", "Name")}<TableHead>Category</TableHead>{sortableHead("vendor", "Vendor")}{sortableHead("amount", "Price", "end")}<TableHead>Unit</TableHead><TableHead>Status</TableHead>{canManage && <TableHead align="end">Actions</TableHead>}</TableRow></TableHeader><tbody>{paged.rows.map((row) => <TableRow key={row.id}><TableCell><TableCellContent primary={<span className="font-semibold">{row.name}</span>} /></TableCell><TableCell>{row.category.name}</TableCell><TableCell>{row.vendor.name}</TableCell><TableCell align="end">{displayPrice(row.amount, row.currency)}</TableCell><TableCell><span className="font-mono text-xs">{row.unit.code}</span></TableCell><TableCell><StatusBadge tone={row.deleted_at ? "neutral" : "success"}>{row.deleted_at ? "Archived" : "Active"}</StatusBadge></TableCell>{actions(row, { kind, id: row.id, name: row.name }, canManage, () => setEditor({ kind, row }))}</TableRow>)}</tbody></DataTable>{pagination(paged.currentPage, paged.pageCount)}</>}</div>; };
  return <SectionCard>
    {editor && <PriceEditor editor={editor} refs={props} error={formError} onCancel={closeEditor} onSubmit={async (event) => { event.preventDefault(); setFormError(null); const formData = new FormData(event.currentTarget); const result = editor.kind === "material" && !editor.row && formData.get("materialEntryMode") === "new" ? await createMaterialSkuAction(formData) : await savePriceAction(editor.kind, formData); if (result.ok) closeEditor(); else setFormError(result.error.safeMessage); }} />}
    <div className="flex flex-wrap justify-end gap-2">{props.canManageMaterial && <Button variant="primary" onClick={() => setEditor({ kind: "material" })}>New material price</Button>}{props.canManageWork && <Button variant="primary" onClick={() => setEditor({ kind: "material-labor" })}>New material + labor price</Button>}{props.canManageWork && <Button variant="primary" onClick={() => setEditor({ kind: "labor" })}>New labor price</Button>}</div>
    <Tabs items={[
      { value: "material", label: `Material Prices (${props.materialPrices.length})`, disabled: !props.canReadMaterial, content: <div className="grid gap-4">{toolbar}{material.length === 0 ? <EmptyState title="No material prices" description={query ? "No prices match your search." : "Create a material price for an active SKU and eligible vendor."} /> : <><DataTable minWidth={720}><TableHeader><TableRow>{sortableHead("name", "SKU")}{sortableHead("vendor", "Supplier")}{sortableHead("amount", "Price", "end")}<TableHead>Unit</TableHead><TableHead>Status</TableHead>{props.canManageMaterial && <TableHead align="end">Actions</TableHead>}</TableRow></TableHeader><tbody>{materialPaged.rows.map((row) => <TableRow key={row.id}><TableCell><TableCellContent primary={<span className="font-semibold">{row.sku.name ?? row.sku.code ?? "Unnamed SKU"}</span>} secondary={row.sku.code ? <span className="font-mono text-xs">{row.sku.code}</span> : undefined} /></TableCell><TableCell>{row.supplier_vendor.name}</TableCell><TableCell align="end">{displayPrice(row.amount, row.currency)}</TableCell><TableCell><span className="font-mono text-xs">{row.unit.code}</span></TableCell><TableCell><StatusBadge tone={row.deleted_at ? "neutral" : "success"}>{row.deleted_at ? "Archived" : "Active"}</StatusBadge></TableCell>{actions(row, { kind: "material", id: row.id, name: `${row.sku.name ?? row.sku.code ?? "Unnamed SKU"} / ${row.supplier_vendor.name}` }, props.canManageMaterial, () => setEditor({ kind: "material", row }))}</TableRow>)}</tbody></DataTable>{pagination(materialPaged.currentPage, materialPaged.pageCount)}</>}</div> },
      { value: "material-labor", label: `Material + Labor (${props.materialLaborPrices.length})`, disabled: !props.canReadWork, content: workTable(props.materialLaborPrices, "material-labor", props.canManageWork, "No material + labor prices") },
      { value: "labor", label: `Labor Only (${props.laborPrices.length})`, disabled: !props.canReadWork, content: workTable(props.laborPrices, "labor", props.canManageWork, "No labor-only prices") },
    ]} />
    {archive && <ConfirmDialog open onOpenChange={(open) => !open && setArchive(null)} title={`Archive ${archive.name}?`} description="It will be removed from active pricing and pickers." confirmLabel="Archive" tone="danger" onConfirm={() => { const value = archive; setArchive(null); run(value.id, () => archivePriceAction(value.kind, value.id)); }} />}
    {restore && <ConfirmDialog open onOpenChange={(open) => !open && setRestore(null)} title={`Restore ${restore.name}?`} description="Required references will be validated before restoring it." confirmLabel="Restore" onConfirm={() => { const value = restore; setRestore(null); run(value.id, () => restorePriceAction(value.kind, value.id)); }} />}
    {deletion && <Dialog open onOpenChange={(open) => !open && setDeletion(null)} title="Request permanent deletion" description="The archived record remains until a deletion approver accepts this request."><div className="grid gap-4"><Field label="Reason"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional context for the approver" /></Field><FormActions><Button variant="ghost" onClick={() => setDeletion(null)}>Cancel</Button><Button variant="danger" onClick={() => { const value = deletion; const note = reason; setDeletion(null); setReason(""); run(value.id, () => requestPriceDeletionAction(value.kind, value.id, note)); }}>Submit request</Button></FormActions></div></Dialog>}
  </SectionCard>;
}

type PriceEditorRefs = {
  skus: SkuRef[];
  vendors: Ref[];
  units: Array<Ref & { code: string }>;
  workCategories: Ref[];
  vendorTypes: Array<Ref & { canSupplyMaterial: boolean; canSupplyLabor: boolean }>;
  canManageVendors: boolean;
  canManageCategories: boolean;
  canManageSkus: boolean;
  canManageBrands: boolean;
  brands: Ref[];
  productCategories: Ref[];
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

function FieldHelp({ label, content }: { label: string; content: string }) {
  return <Tooltip content={content}><button type="button" aria-label={`About ${label}`} className="inline-flex h-4 w-4 items-center justify-center rounded-full text-ink-tertiary hover:text-ink"><CircleHelp size={14} /></button></Tooltip>;
}

function SkuMeasurementSummary({ sku }: { sku: SkuRef }) {
  const dimensions = sku.dimension_length && sku.dimension_width && sku.dimension_unit
    ? `${formatDecimal(sku.dimension_length)} x ${formatDecimal(sku.dimension_width)} ${sku.dimension_unit.code}`
    : null;
  return (
    <SectionCard>
      <div className="flex items-center gap-2">
        <Text weight="semibold">Measurement and BQ conversion</Text>
        <Tooltip content="These values belong to the selected SKU. The price is quoted per purchase unit and can be compared in the SKU's BQ base unit.">
          <button type="button" aria-label="About SKU measurement and BQ conversion" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-tertiary hover:text-ink"><CircleHelp size={15} /></button>
        </Tooltip>
      </div>
      {dimensions ? <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-secondary"><span>{dimensions}</span><span>Base: {sku.base_unit ? `${sku.base_unit.code} (${sku.base_unit.name})` : "Not set"}</span><span>Purchase: {sku.purchase_unit ? `${sku.purchase_unit.code} (${sku.purchase_unit.name})` : "Same as base"}</span></div> : <Text size="sm" tone="secondary" className="mt-2">No rectangular dimensions are stored for this SKU.</Text>}
      {sku.purchase_to_base_factor && sku.purchase_unit && sku.base_unit ? <Text size="sm" tone="secondary" className="mt-1">1 {sku.purchase_unit.code} = {formatDecimal(sku.purchase_to_base_factor)} {sku.base_unit.code}</Text> : null}
    </SectionCard>
  );
}

function PriceEditor({ editor, refs, error, onCancel, onSubmit }: { editor: Editor; refs: PriceEditorRefs; error: string | null; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  const edit = Boolean(editor.row);
  const material = editor.kind === "material";
  const row = editor.row;
  const materialRow = material && row ? row as MaterialRow : undefined;
  const workRow = !material && row ? row as WorkRow : undefined;
  const [materialEntryMode, setMaterialEntryMode] = useState<"existing" | "new">("existing");
  const { options: vendorOptions, upsertOverlayOption } = useOptionOverlay(refs.vendors);
  const { options: categoryOptions, upsertOverlayOption: upsertCategoryOption } = useOptionOverlay(refs.workCategories);
  const { options: brandOptions, upsertOverlayOption: upsertBrandOption } = useOptionOverlay(refs.brands);
  const { options: productCategoryOptions, upsertOverlayOption: upsertProductCategoryOption } = useOptionOverlay(refs.productCategories);
  const [vendorId, setVendorId] = useState(materialRow?.supplier_vendor.id ?? workRow?.vendor.id ?? "");
  const [categoryId, setCategoryId] = useState(workRow?.category.id ?? "");
  const [brandId, setBrandId] = useState(materialRow?.sku.brand?.id ?? "");
  const [skuId, setSkuId] = useState(materialRow?.sku.id ?? "");
  const [skuName, setSkuName] = useState("");
  const [skuBrandFilter, setSkuBrandFilter] = useState<string>("ALL");
  const [selectedProductCategoryId, setSelectedProductCategoryId] = useState("");
  const [productCategorySearchId, setProductCategorySearchId] = useState("");
  const currency = row?.currency ?? "IDR";
  const [amount, setAmount] = useState(row?.amount ?? "");
  const [amountDisplay, setAmountDisplay] = useState(row?.amount ? formatDecimal(row.amount) : "");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickVendorTypeId, setQuickVendorTypeId] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickPending, setQuickPending] = useState(false);
  const [brandCreateError, setBrandCreateError] = useState<string | null>(null);
  const [brandCreatePending, setBrandCreatePending] = useState(false);
  const [productCategoryCreateError, setProductCategoryCreateError] = useState<string | null>(null);
  const [productCategoryCreatePending, setProductCategoryCreatePending] = useState(false);
  const [categoryCreateError, setCategoryCreateError] = useState<string | null>(null);
  const [categoryCreatePending, setCategoryCreatePending] = useState(false);
  const defaultBaseUnit = refs.units.find((unit) => unit.code.toUpperCase() === "M2");
  const defaultPurchaseUnit = refs.units.find((unit) => unit.code.toUpperCase() === "SHEET");
  const defaultDimensionUnit = refs.units.find((unit) => unit.code.toUpperCase() === "MM");
  const [baseUnitId, setBaseUnitId] = useState(defaultBaseUnit?.id ?? "");
  const [purchaseUnitId, setPurchaseUnitId] = useState(defaultPurchaseUnit?.id ?? "");
  const [dimensionLength, setDimensionLength] = useState("");
  const [dimensionWidth, setDimensionWidth] = useState("");
  const [dimensionThickness, setDimensionThickness] = useState("");
  const [dimensionUnitId, setDimensionUnitId] = useState(defaultDimensionUnit?.id ?? "");
  const needsMaterial = material;
  const eligibleTypes = refs.vendorTypes.filter((type) => needsMaterial ? type.canSupplyMaterial : type.canSupplyLabor);
  const newMaterialSku = material && !edit && materialEntryMode === "new";
  const selectedBaseUnit = refs.units.find((unit) => unit.id === baseUnitId);
  const selectedPurchaseUnit = refs.units.find((unit) => unit.id === purchaseUnitId);
  const selectedDimensionUnit = refs.units.find((unit) => unit.id === dimensionUnitId);
  const selectedSku = refs.skus.find((sku) => sku.id === skuId);
  const filteredSkus = refs.skus.filter((sku) => {
    if (skuBrandFilter === "ALL") return true;
    if (skuBrandFilter === "UNBRANDED") return !sku.brand;
    return sku.brand?.id === skuBrandFilter;
  });
  const dimensionFactors: Readonly<Record<string, string>> = { MM: "0.001", CM: "0.01", M: "1" };
  let areaPreview: string | null = null;
  const dimensionFactor = selectedDimensionUnit ? dimensionFactors[selectedDimensionUnit.code.toUpperCase()] : null;
  if (dimensionLength && dimensionWidth && dimensionFactor) {
    try {
      areaPreview = calculateRectangleAreaSquareMeters({ length: dimensionLength, width: dimensionWidth, lengthToMeterFactor: dimensionFactor });
    } catch {
      areaPreview = null;
    }
  }

  const createBrand = async (name: string) => {
    setBrandCreateError(null);
    setBrandCreatePending(true);
    try {
      const result = await createPricingBrandQuickAction(name);
      if (result.ok) {
        upsertBrandOption({ id: result.data.brandId, name });
        setBrandId(result.data.brandId);
        return result.data.brandId;
      }
      setBrandCreateError(result.error.safeMessage);
      return "";
    } finally {
      setBrandCreatePending(false);
    }
  };

  const createProductCategory = async (name: string) => {
    setProductCategoryCreateError(null);
    setProductCategoryCreatePending(true);
    try {
      const formData = new FormData();
      formData.set("name", name);
      const result = await createPricingProductCategoryQuickAction(formData);
      if (result.ok) {
        upsertProductCategoryOption({ id: result.data.categoryId, name });
        setSelectedProductCategoryId(result.data.categoryId);
        return result.data.categoryId;
      }
      setProductCategoryCreateError(result.error.safeMessage);
      return "";
    } finally {
      setProductCategoryCreatePending(false);
    }
  };

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
    <>
      <input type="hidden" name={newMaterialSku ? "supplierVendorId" : "vendorId"} value={vendorId} required />
      <Field label={material ? "Supplier vendor" : "Vendor"} required>
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
      </Field>
    </>
  );

  const newMaterialFields = newMaterialSku ? <>
    <div className="grid grid-cols-2 gap-3">
      <Field label="SKU code / Article #"><Input name="code" maxLength={32} placeholder="KPF 2005" autoFocus /></Field>
      <Field label="SKU name"><Input name="name" value={skuName} onChange={(event) => setSkuName(event.target.value)} maxLength={128} placeholder="Optional product name" /></Field>
      <input type="hidden" name="brandId" value={brandId} />
      <Field label="Brand">
        <CreatableSearch
          label="Brand"
          options={brandOptions.map((brand) => ({ id: brand.id, label: brand.name }))}
          value={brandId}
          onValueChange={setBrandId}
          allowClear
          clearLabel="Unbranded / Generic"
          placeholder="Search or select brand"
          searchPlaceholder="Search brands…"
          emptyLabel="No brand matches this search."
          onCreate={refs.canManageBrands ? createBrand : undefined}
          createLabel={(name) => `Add “${name}” as a brand`}
          disabled={brandCreatePending}
          className="w-full"
        />
      </Field>
      {brandCreateError ? <InlineError>{brandCreateError}</InlineError> : null}
    </div>
    <div className="grid grid-cols-2 gap-3">
      <Field label={<span className="inline-flex items-center gap-1">Base / BQ unit <FieldHelp label="base / BQ unit" content="The unit used to compare and calculate material usage." /></span>} required><Select name="baseUnitId" value={baseUnitId} onChange={(event) => setBaseUnitId(event.target.value)} required><option value="">Select base unit...</option>{refs.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code}</option>)}</Select></Field>
      <Field label={<span className="inline-flex items-center gap-1">Purchase unit <FieldHelp label="purchase unit" content="The unit quoted by the supplier." /></span>}><Select name="purchaseUnitId" value={purchaseUnitId} onChange={(event) => setPurchaseUnitId(event.target.value)}><option value="">Same as base unit</option>{refs.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code}</option>)}</Select></Field>
    </div>
    <SectionCard>
      <div className="mb-3 flex items-center gap-2"><Text weight="semibold">Dimensions and BQ conversion</Text><Tooltip content="Optional for sheet materials. Enter length and width to calculate the BQ area contained in one purchase unit."><button type="button" aria-label="About dimensions and BQ conversion" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-tertiary hover:text-ink"><CircleHelp size={15} /></button></Tooltip></div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(145px,1.4fr)]">
        <Field label="Length"><Input name="dimensionLength" value={dimensionLength} onChange={(event) => setDimensionLength(event.target.value)} inputMode="decimal" placeholder="1200" /></Field>
        <Field label="Width"><Input name="dimensionWidth" value={dimensionWidth} onChange={(event) => setDimensionWidth(event.target.value)} inputMode="decimal" placeholder="2400" /></Field>
        <Field label={<span className="inline-flex items-center gap-1">Thickness <FieldHelp label="thickness" content="Optional and excluded from area calculation." /></span>}><Input name="dimensionThickness" value={dimensionThickness} onChange={(event) => setDimensionThickness(event.target.value)} inputMode="decimal" placeholder="0.8" /></Field>
        <Field label={<span className="inline-flex items-center gap-1">Dimension unit <FieldHelp label="dimension unit" content="The unit used for length, width, and thickness." /></span>}><Select name="dimensionUnitId" value={dimensionUnitId} onChange={(event) => setDimensionUnitId(event.target.value)}><option value="">Select unit</option>{refs.units.filter((unit) => ["MM", "CM", "M"].includes(unit.code.toUpperCase())).map((unit) => <option key={unit.id} value={unit.id}>{unit.code}</option>)}</Select></Field>
      </div>
      <div className="mt-3 rounded border border-line-subtle bg-surface-muted/40 px-3 py-2 text-sm">
      {areaPreview && selectedBaseUnit?.code.toUpperCase() === "M2" && selectedPurchaseUnit
          ? <><span className="font-medium">Conversion preview:</span> 1 {selectedPurchaseUnit.code} = {formatDecimal(areaPreview)} M²</>
          : null}
      </div>
    </SectionCard>
    <Field label="Product categories" required description="At least one category is required.">
      <div className="grid gap-3">
        <CreatableSearch
          label="Product categories"
          options={productCategoryOptions.map((category) => ({ id: category.id, label: category.name }))}
          value={productCategorySearchId}
          onValueChange={(value) => {
            setProductCategorySearchId(value);
            if (value) {
            setSelectedProductCategoryId(value);
            }
          }}
          onCreate={refs.canManageCategories ? createProductCategory : undefined}
          createLabel={(name) => `Add “${name}” as a product category`}
          emptyLabel="No product category matches this search."
          searchPlaceholder="Search or create product category…"
          placeholder="Search product categories"
          disabled={productCategoryCreatePending}
          className="w-full"
        />
        {productCategoryCreateError ? <InlineError>{productCategoryCreateError}</InlineError> : null}
        <input type="hidden" name="categoryId" value={selectedProductCategoryId} required />
      </div>
    </Field>
  </> : null;

  const categoryField = !material && (
    <>
      <input type="hidden" name="categoryId" value={categoryId} required />
      <Field label="Pricing category" required>
        <CreatableSearch
          label="Pricing category"
          options={categoryOptions.map((category) => ({ id: category.id, label: category.name }))}
          value={categoryId}
          onValueChange={setCategoryId}
          placeholder="Search or select category"
          searchPlaceholder="Search pricing categories…"
          emptyLabel="No pricing category matches this search."
          onCreate={refs.canManageCategories ? createWorkCategory : undefined}
          createLabel={(name) => `Add “${name}” as a pricing category`}
          disabled={categoryCreatePending}
          className="w-full"
        />
      </Field>
      {categoryCreateError ? <InlineError>{categoryCreateError}</InlineError> : null}
    </>
  );

  const updateAmount = (display: string) => {
    const parsed = parseIndonesianAmount(display);
    if (parsed === null) return;
    setAmount(parsed);
    setAmountDisplay(display.endsWith(",") ? display : parsed ? formatDecimal(parsed) : "");
  };

  const priceLabel = material ? "material price" : editor.kind === "material-labor" ? "material + labor price" : "labor price";

  return <>
    <Dialog open onOpenChange={(open) => !open && onCancel()} title={`${edit ? "Edit" : "Create"} ${newMaterialSku ? "SKU + material price" : priceLabel}`} description={material && edit ? "SKU and supplier identity are read-only." : "Choose only active and eligible catalog references."}><form className="grid gap-4" onSubmit={onSubmit}>
      <input type="hidden" name="materialEntryMode" value={materialEntryMode} />
      {edit && <input type="hidden" name="id" value={row!.id} />}{error && <div role="alert" className="text-sm text-danger">{error}</div>}
      {material ? (edit ? <><Field label="SKU"><Input value={materialRow!.sku.name ?? materialRow!.sku.code ?? "Unnamed SKU"} readOnly /></Field><Field label="Supplier vendor"><Input value={materialRow!.supplier_vendor.name} readOnly /></Field><Field label="Unit"><Input value={`${materialRow!.unit.name} (${materialRow!.unit.code})`} readOnly /></Field></> : newMaterialSku ? <>{newMaterialFields}{vendorField}</> : <><Field label="SKU" required description="Search by brand, code, or SKU name."><div className="grid gap-2"><Select value={skuBrandFilter} onChange={(event) => setSkuBrandFilter(event.target.value)}><option value="ALL">All brands</option><option value="UNBRANDED">Unbranded / Generic</option>{refs.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</Select><input type="hidden" name="skuId" value={skuId} /><CreatableSearch label="SKU" options={filteredSkus.map((sku) => ({ id: sku.id, label: sku.name ?? sku.code ?? "Unnamed SKU", description: sku.code ? <span className="font-mono text-xs">{sku.code}</span> : sku.brand ? sku.brand.name : undefined, keywords: [sku.code ?? "", sku.brand?.name ?? ""] }))} value={skuId} onValueChange={setSkuId} onCreate={refs.canManageSkus ? (name) => { setSkuName(name); setMaterialEntryMode("new"); if (skuBrandFilter !== "ALL" && skuBrandFilter !== "UNBRANDED") setBrandId(skuBrandFilter); return ""; } : undefined} createLabel={(name) => `Create SKU “${name}”`} placeholder="Search or create SKU" searchPlaceholder="Search SKU name, code, or brand…" emptyLabel="No SKU matches this search." className="w-full" /></div></Field>{selectedSku ? <SkuMeasurementSummary sku={selectedSku} /> : null}{vendorField}</>) : <><Field label="Name" required><Input name="name" defaultValue={workRow?.name} required /></Field>{categoryField}{vendorField}<Field label="Unit" required><Select name="unitId" defaultValue={workRow?.unit.id ?? ""} required><option value="">Select unit</option>{refs.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>)}</Select></Field>{editor.kind === "material-labor" && <Field label="Scope note" description="Describe included work or materials. Use bullets for a clear scope."><SimpleTextEditor name="scopeNote" defaultValue={workRow?.scope_note ?? ""} placeholder={"Example:\n- Installation labor\n- Adhesive and grout"} maxLength={1000} rows={5} /></Field>}</>}
      <input type="hidden" name="amount" value={amount} /><input type="hidden" name="currency" value={currency} />
      <Field label="Amount" description={`${currency} default currency`} required><div className="relative"><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-ui-mono text-sm font-semibold text-ink-secondary">{currency}</span><Input aria-label="Amount" value={amountDisplay} onChange={(event) => updateAmount(event.target.value)} onBlur={() => setAmountDisplay(amount ? formatDecimal(amount) : "")} inputMode="decimal" placeholder="15.000" className="pl-14 tabular-nums" required /></div></Field><Field label="Notes"><SimpleTextEditor name="notes" defaultValue={row?.notes ?? ""} placeholder="Additional pricing context..." maxLength={1000} rows={3} /></Field><FormActions><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary">{edit ? "Save changes" : "Create price"}</Button></FormActions>
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
