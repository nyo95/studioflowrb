"use client";
import { RequestDeletionDialog } from "../request-deletion-dialog";
import { UpdatedCell } from "../updated-cell";
import { FilterSummary, StatusFilterSelect } from "../directory-filters";
import { compareAmounts, groupPriceRows, matchesDirectoryStatus, tabCountLabel, type DirectoryStatus } from "../directory-findability";
import { PhoneLinks } from "../phone-links";
import { getPaginationSlice } from "@platform/utilities/pagination";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { DirectoryShell,RowActionMenu,RowActionsCell,RowActionsHead } from "@/platform/ui_engine";

import { Badge,Button,ButtonMenu,Checkbox,ConfirmDialog,CreatableSearch,DataTable,Dialog,EmptyState,EntityPrimaryCell,Field,FormActions,IconButton,InlineError,Input,Pagination,SearchField,SectionCard,Select,SimpleTextEditor,TableBody,TableCell,TableCellContent,TableHead,TableHeader,TableRow,TableToolbar,Tabs,Text,Tooltip,useFormDraftGuard,useOptionOverlay,type SortDirection } from "@/platform/ui_engine";
import { VendorQuickCreateDialog } from "../vendor-quick-create-dialog";
import { parseIndonesianAmount } from "./amount-format";
import { PriceMatrixDialog } from "./price-matrix-dialog";
import { compareDecimals,formatDecimal,type DecimalString } from "@platform/utilities/decimal";
import { calculateRectangleAreaSquareMeters } from "@platform/utilities/measurement";
import { createMoney,formatMoney } from "@platform/utilities/money";
import { CircleHelp, Plus, Trash2 } from "lucide-react";
import { useEffect,useRef,useState,useTransition,type FormEvent } from "react";
import { archivePriceAction,createMaterialSkuAction,linkBrandToSupplierAction,saveBulkWorkPricesAction,saveMaterialPriceRowsAction,createPricingBrandQuickAction,createPricingProductCategoryQuickAction,createPricingVendorQuickAction,createPricingWorkCategoryQuickAction,requestPriceDeletionAction,restorePriceAction,savePriceAction } from "./actions";

type Kind = "material" | "material-labor" | "labor";
type SkuRef = { id: string; name: string | null; code: string | null; brand: { id: string; name: string } | null; base_unit: { id: string; code: string; name: string } | null; purchase_unit: { id: string; code: string; name: string } | null; dimension_length: string | null; dimension_width: string | null; dimension_thickness: string | null; dimension_unit: { id: string; code: string; name: string } | null; purchase_to_base_factor: string | null };
type MaterialRow = { id: string; sku: { id: string; name: string | null; code: string | null; brand: { id: string; name: string } | null; categories: Array<{ id: string; name: string }>; size: string }; supplier_vendor: { id: string; name: string }; amount: string; currency: string; unit: { id: string; code: string; name: string }; notes: string | null; updated_at: Date; updated_by_label: string; deleted_at: Date | null };
type WorkRow = { id: string; name: string; category: { id: string; name: string }; vendor: { id: string; name: string }; amount: string; currency: string; unit: { id: string; code: string; name: string }; scope_note?: string | null; notes: string | null; updated_at: Date; updated_by_label: string; deleted_at: Date | null };
type Target = { kind: Kind; id: string; name: string };
type Editor = { kind: Kind; row?: MaterialRow | WorkRow };
type Ref = { id: string; name: string };
type PriceSortKey = "name" | "vendor" | "amount" | "updated" | "category" | "brand";
const PRICE_PAGE_SIZE = 25;



export function PricingDirectory(props: { materialPrices: MaterialRow[]; materialLaborPrices: WorkRow[]; laborPrices: WorkRow[]; canManageMaterial: boolean; canManageWork: boolean; canReadMaterial: boolean; canReadWork: boolean; contacts: Record<string, { name: string; phones: string[] }>; canManageVendors: boolean; canManageCategories: boolean; canManageSkus: boolean; canManageBrands: boolean; skus: SkuRef[]; brands: Ref[]; productCategories: Ref[]; vendors: Ref[]; materialVendors: Array<Ref & { brandIds: string[] }>; workVendors: Array<Ref & { categoryIds: string[] }>; units: Array<Ref & { code: string }>; workCategories: Ref[]; vendorTypes: Array<Ref & { canSupplyMaterial: boolean; canSupplyLabor: boolean }> }) {
  const { locale } = useDisplaySettings();
  const displayPrice = (amount: string, currency: string) => formatMoney(createMoney(amount, currency), { locale });
  const [query, setQuery] = useState(""); const [status, setStatus] = useState<DirectoryStatus>("ACTIVE"); const [supplierFilter, setSupplierFilter] = useState("ALL"); const [brandFilter, setBrandFilter] = useState("ALL"); const [workCategoryFilter, setWorkCategoryFilter] = useState("ALL"); const [productCategoryFilter, setProductCategoryFilter] = useState("ALL"); const [groupByItem, setGroupByItem] = useState(false); const [page, setPage] = useState(1); const [sort, setSort] = useState<{ key: PriceSortKey; direction: SortDirection }>({ key: "name", direction: "asc" }); const [matrixOpen, setMatrixOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null); const [formError, setFormError] = useState<string | null>(null);
  const [archive, setArchive] = useState<Target | null>(null); const [restore, setRestore] = useState<Target | null>(null); const [deletion, setDeletion] = useState<Target | null>(null); const [reason, setReason] = useState(""); const [rowError, setRowError] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null); const [, startTransition] = useTransition();
  const matches = (text: string, deletedAt: Date | null) => matchesDirectoryStatus(deletedAt, status) && text.toLowerCase().includes(query.toLowerCase());
  const run = (id: string, command: () => Promise<unknown>, onSuccess?: () => void) => {
    if (pendingId) return;
    setPendingId(id); setRowError(null);
    startTransition(async () => {
      try {
        const result = await command();
        if (result && typeof result === "object" && "ok" in result && result.ok === false) {
          const failure = result as { error?: { safeMessage?: string } };
          setRowError(failure.error?.safeMessage ?? "The action could not be completed."); return;
        }
        onSuccess?.();
      } catch { setRowError("The action could not be completed. Please try again."); }
      finally { setPendingId(null); }
    });
  };
  const closeEditor = () => { setEditor(null); setFormError(null); };
  type SortBy<T> = { name: (row: T) => string; vendor: (row: T) => string; category: (row: T) => string; brand: (row: T) => string };
  const sortRows = <T extends MaterialRow | WorkRow>(rows: T[], by: SortBy<T>) => [...rows].sort((left, right) => {
    const compared = sort.key === "amount" ? compareAmounts(left.amount, right.amount)
      : sort.key === "updated" ? left.updated_at.getTime() - right.updated_at.getTime()
      : by[sort.key](left).localeCompare(by[sort.key](right), "id");
    return sort.direction === "asc" ? compared : -compared;
  });
  const paginate = <T,>(rows: T[]) => { const result = getPaginationSlice(rows, page, PRICE_PAGE_SIZE); return { rows: result.rows, currentPage: result.page, pageCount: result.pageCount }; };
  const changeSort = (key: PriceSortKey) => (direction: SortDirection) => { setSort({ key, direction }); setPage(1); };
  const sortableHead = (key: PriceSortKey, label: string, align: "start" | "end" = "start") => <TableHead align={align} sortable sortDirection={sort.key === key ? sort.direction : null} onSortChange={changeSort(key)} sortLabel={(direction) => `${label}, sort ${direction}`}>{label}</TableHead>;
  const pagination = (currentPage: number, pageCount: number) => pageCount > 1 ? <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} label="Pricing pages" /> : null;
  const filtersActive = Boolean(query) || status !== "ACTIVE" || supplierFilter !== "ALL" || brandFilter !== "ALL" || productCategoryFilter !== "ALL" || workCategoryFilter !== "ALL";
  const clearFilters = () => { setQuery(""); setStatus("ACTIVE"); setSupplierFilter("ALL"); setBrandFilter("ALL"); setProductCategoryFilter("ALL"); setWorkCategoryFilter("ALL"); setPage(1); };
  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setPage(1); };
  const toolbarFor = (kind: Kind, shown: number, total: number) => (
    <TableToolbar framed={false}>
      <div className="flex flex-wrap items-center gap-2">
      <SearchField value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} onClear={() => { setQuery(""); setPage(1); }} placeholder={kind === "material" ? "Search SKU, code, brand, category, supplier..." : "Search item, category, supplier..."} />
      <StatusFilterSelect value={status} onChange={resetPage(setStatus)} />
      <div className="w-44"><Select aria-label="Supplier" value={supplierFilter} onChange={(event) => resetPage(setSupplierFilter)(event.target.value)}><option value="ALL">All suppliers</option>{props.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</Select></div>
      {kind === "material" ? (
        <>
          <div className="w-44"><Select aria-label="Brand" value={brandFilter} onChange={(event) => resetPage(setBrandFilter)(event.target.value)}><option value="ALL">All brands</option>{props.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</Select></div>
          <div className="w-44"><Select aria-label="Product category" value={productCategoryFilter} onChange={(event) => resetPage(setProductCategoryFilter)(event.target.value)}><option value="ALL">All product categories</option>{props.productCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></div>
        </>
      ) : (
        <div className="w-44"><Select aria-label="Work category" value={workCategoryFilter} onChange={(event) => resetPage(setWorkCategoryFilter)(event.target.value)}><option value="ALL">All work categories</option>{props.workCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></div>
      )}
      <Checkbox label="Group by item" checked={groupByItem} onCheckedChange={(checked) => { setGroupByItem(Boolean(checked)); setPage(1); }} />
      <FilterSummary filtered={filtersActive} shown={shown} total={total} onClear={clearFilters} />
      </div>
    </TableToolbar>
  );
  const actions = (row: { id: string; deleted_at: Date | null }, target: Target, canManage: boolean, edit: () => void) => !canManage ? null : <RowActionsCell><RowActionMenu label={`Actions for ${target.name}`} pending={pendingId === row.id} items={[...(pendingId === row.id ? [] : []),...(!row.deleted_at ? [...[{ label: "Edit", onSelect: edit, disabled: undefined, danger: false, separatorBefore: false }],...[{ label: "Archive", onSelect: () => setArchive(target), disabled: undefined, danger: false, separatorBefore: false }]] : [...[{ label: "Restore", onSelect: () => setRestore(target), disabled: undefined, danger: false, separatorBefore: false }],...[{ label: "Request deletion", onSelect: () => setDeletion(target), disabled: undefined, danger: true, separatorBefore: true }]])]} /></RowActionsCell>;
  const material = props.materialPrices.filter((row) => matches(`${row.sku.name ?? ""} ${row.sku.code ?? ""} ${row.sku.brand?.name ?? ""} ${row.sku.categories.map((category) => category.name).join(" ")} ${row.supplier_vendor.name}`, row.deleted_at) && (supplierFilter === "ALL" || row.supplier_vendor.id === supplierFilter) && (brandFilter === "ALL" || row.sku.brand?.id === brandFilter) && (productCategoryFilter === "ALL" || row.sku.categories.some((category) => category.id === productCategoryFilter)));
  const workFiltered = (rows: WorkRow[]) => rows.filter((row) => matches(`${row.name} ${row.notes ?? ""} ${row.scope_note ?? ""} ${row.category.name} ${row.vendor.name}`, row.deleted_at) && (supplierFilter === "ALL" || row.vendor.id === supplierFilter) && (workCategoryFilter === "ALL" || row.category.id === workCategoryFilter));
  const materialLaborFiltered = workFiltered(props.materialLaborPrices);
  const laborFiltered = workFiltered(props.laborPrices);

  type Arranged<T> = { row: T; groupKey: string | null; group: string | null; lowest: boolean };
  /** The order the rows are shown in: grouped by item (cheapest first, "Lowest" marked) or sorted by the chosen column. */
  const arrange = <T extends MaterialRow | WorkRow>(rows: T[], by: SortBy<T>, keyOf: (row: T) => string, labelOf: (row: T) => string): Array<Arranged<T>> => groupByItem
    ? groupPriceRows(rows, keyOf, labelOf).flatMap((group) => group.rows.map((row) => ({ row, groupKey: group.key, group: group.label, lowest: group.lowestIds.has(row.id) })))
    : sortRows(rows, by).map((row) => ({ row, groupKey: null, group: null, lowest: false }));
  const groupHeader = <T,>(rows: Array<Arranged<T>>, index: number, columns: number) => rows[index].group !== null && (index === 0 || rows[index - 1].groupKey !== rows[index].groupKey)
    ? <TableRow key={`group-${rows[index].groupKey}-${index}`}><TableCell colSpan={columns}><span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-secondary">{rows[index].group}</span></TableCell></TableRow>
    : null;
  const priceCell = (row: { amount: string; currency: string }, lowest: boolean) => (
    <TableCell align="end"><span>{displayPrice(row.amount, row.currency)}</span>{lowest ? <span className="ml-2 align-middle"><Badge tone="success">Lowest</Badge></span> : null}</TableCell>
  );
  const supplierCell = (vendor: { id: string; name: string }) => {
    const contact = props.contacts[vendor.id];
    return (
      <TableCell>
        <div className="grid gap-0.5">
          <span>{vendor.name}</span>
          {contact ? <span className="text-xs text-ink-secondary">{contact.name}{contact.phones.length > 0 ? <> · <PhoneLinks phones={contact.phones} keyPrefix={vendor.id} /></> : null}</span> : null}
        </div>
      </TableCell>
    );
  };
  const emptyState = (title: string, emptyText: string) => <EmptyState title={filtersActive ? "No prices match these filters" : title} description={filtersActive ? "Change or clear the filters to see more." : emptyText} />;

  const materialBy: SortBy<MaterialRow> = { name: (row) => row.sku.name ?? row.sku.code ?? "", vendor: (row) => row.supplier_vendor.name, category: (row) => row.sku.categories[0]?.name ?? "", brand: (row) => row.sku.brand?.name ?? "" };
  const materialArranged = arrange(material, materialBy, (row) => row.sku.id, (row) => row.sku.name ?? row.sku.code ?? "Unnamed SKU");
  const materialPaged = paginate(materialArranged);
  const materialTab = (
    <DirectoryShell fill surface toolbar={toolbarFor("material", material.length, props.materialPrices.length)} pagination={pagination(materialPaged.currentPage, materialPaged.pageCount)}>
      {material.length === 0 ? emptyState("No material prices", "Create a material price for an active SKU and eligible supplier.") : (
        <DataTable density="compact" stickyHeader fill framed={false} minWidth={1180}>
          <TableHeader>
            <TableRow>
              {sortableHead("name", "SKU")}{sortableHead("brand", "Brand")}{sortableHead("category", "Category")}<TableHead>Size</TableHead>{sortableHead("vendor", "Supplier")}{sortableHead("amount", "Price", "end")}<TableHead>Unit</TableHead>{sortableHead("updated", "Updated")}{props.canManageMaterial && <RowActionsHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {materialPaged.rows.map((shown, index) => {
              const row = shown.row;
              return [
                groupHeader(materialPaged.rows, index, props.canManageMaterial ? 9 : 8),
                <TableRow key={row.id}>
                  <TableCell><EntityPrimaryCell tone={row.deleted_at ? "danger" : "success"} statusLabel={row.deleted_at ? "Archived" : "Active"} name={row.sku.name ?? row.sku.code ?? "Unnamed SKU"} secondary={row.sku.name && row.sku.code && row.sku.code !== row.sku.name ? <span className="font-ui-mono text-xs">{row.sku.code}</span> : undefined} /></TableCell>
                  <TableCell>{row.sku.brand?.name ?? <span className="text-ink-tertiary">—</span>}</TableCell>
                  <TableCell>{row.sku.categories.length > 0 ? row.sku.categories.map((category) => category.name).join(", ") : <span className="text-ink-tertiary">—</span>}</TableCell>
                  <TableCell>{row.sku.size || <span className="text-ink-tertiary">—</span>}</TableCell>
                  {supplierCell(row.supplier_vendor)}
                  {priceCell(row, shown.lowest)}
                  <TableCell><span className="font-ui-mono text-xs">{row.unit.code}</span></TableCell>
                  <UpdatedCell at={row.updated_at} by={row.updated_by_label} />
                  {actions(row, { kind: "material", id: row.id, name: `${row.sku.name ?? row.sku.code ?? "Unnamed SKU"} / ${row.supplier_vendor.name}` }, props.canManageMaterial, () => setEditor({ kind: "material", row }))}
                </TableRow>,
              ];
            })}
          </TableBody>
        </DataTable>
      )}
    </DirectoryShell>
  );

  const workBy: SortBy<WorkRow> = { name: (row) => row.name, vendor: (row) => row.vendor.name, category: (row) => row.category.name, brand: () => "" };
  const workTable = (rows: WorkRow[], totalCount: number, kind: Kind, canManage: boolean, title: string) => {
    const arranged = arrange(rows, workBy, (row) => `${row.name.trim().toLowerCase()}|${row.category.id}`, (row) => `${row.name} · ${row.category.name}`);
    const paged = paginate(arranged);
    return (
      <DirectoryShell fill surface toolbar={toolbarFor(kind, rows.length, totalCount)} pagination={pagination(paged.currentPage, paged.pageCount)}>
        {rows.length === 0 ? emptyState(title, "No pricing records yet.") : (
          <DataTable density="compact" stickyHeader fill framed={false} minWidth={980}>
            <TableHeader>
              <TableRow>
                {sortableHead("name", "Name")}{sortableHead("category", "Category")}{sortableHead("vendor", "Supplier")}{sortableHead("amount", "Price", "end")}<TableHead>Unit</TableHead>{sortableHead("updated", "Updated")}{canManage && <RowActionsHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.rows.map((shown, index) => {
                const row = shown.row;
                return [
                  groupHeader(paged.rows, index, canManage ? 7 : 6),
                  <TableRow key={row.id}>
                    <TableCell><EntityPrimaryCell tone={row.deleted_at ? "danger" : "success"} statusLabel={row.deleted_at ? "Archived" : "Active"} name={row.name} secondary={row.notes ? <span className="block max-w-[28rem] truncate text-xs text-ink-secondary" title={row.notes}>{row.notes}</span> : undefined} /></TableCell>
                    <TableCell>{row.category.name}</TableCell>
                    {supplierCell(row.vendor)}
                    {priceCell(row, shown.lowest)}
                    <TableCell><span className="font-ui-mono text-xs">{row.unit.code}</span></TableCell>
                    <UpdatedCell at={row.updated_at} by={row.updated_by_label} />
                    {actions(row, { kind, id: row.id, name: row.name }, canManage, () => setEditor({ kind, row }))}
                  </TableRow>,
                ];
              })}
            </TableBody>
          </DataTable>
        )}
      </DirectoryShell>
    );
  };
  return <div className="flex min-h-0 flex-1 flex-col gap-4">
    {rowError ? <InlineError>{rowError}</InlineError> : null}
    {matrixOpen && <PriceMatrixDialog vendors={props.workVendors} categories={props.workCategories} units={props.units} onClose={() => setMatrixOpen(false)} />}
    {editor && <PriceEditor pending={savePending} editor={editor} refs={{ ...props, vendors: editor.kind === "material" ? props.materialVendors : props.workVendors }} error={formError} onCancel={closeEditor} onSubmit={async (event) => { event.preventDefault(); if (savePending) return; setSavePending(true); setFormError(null); const formData = new FormData(event.currentTarget); try { const result = editor.kind === "material" && !editor.row && formData.get("materialEntryMode") === "new" ? await createMaterialSkuAction(formData) : await savePriceAction(editor.kind, formData); if (result.ok) closeEditor(); else if (result.ok === false) setFormError(result.error.safeMessage); } catch { setFormError("The price could not be saved. Please try again."); } finally { setSavePending(false); } }} />}
    <Tabs
      fill
      distribution="equal"
      actions={(props.canManageMaterial || props.canManageWork) ? (
        <ButtonMenu
          label="New price"
          items={[
            ...(props.canManageMaterial ? [{ label: "Material price", description: "SKU supplier pricing", onSelect: () => setEditor({ kind: "material" as const }) }] : []),
            ...(props.canManageWork ? [{ label: "Material + labor price", description: "Combined unit price", onSelect: () => setEditor({ kind: "material-labor" as const }) }] : []),
            ...(props.canManageWork ? [{ label: "Labor price", description: "Labor-only unit price", onSelect: () => setEditor({ kind: "labor" as const }) }] : []),
            ...(props.canManageWork ? [{ label: "Compare suppliers", description: "One grid: items by supplier", onSelect: () => setMatrixOpen(true) }] : []),
          ]}
        />
      ) : undefined}
      items={[
      { value: "material", label: tabCountLabel("Material Prices", material.length), disabled: !props.canReadMaterial, content: materialTab },
      { value: "material-labor", label: tabCountLabel("Material + Labor", materialLaborFiltered.length), disabled: !props.canReadWork, content: workTable(materialLaborFiltered, props.materialLaborPrices.length, "material-labor", props.canManageWork, "No material + labor prices") },
      { value: "labor", label: tabCountLabel("Labor Only", laborFiltered.length), disabled: !props.canReadWork, content: workTable(laborFiltered, props.laborPrices.length, "labor", props.canManageWork, "No labor-only prices") },
    ]} />
    {archive && <ConfirmDialog error={rowError} pending={pendingId !== null} open onOpenChange={(open) => !open && setArchive(null)} title={`Archive ${archive.name}?`} description="It will be removed from active pricing and pickers." confirmLabel="Archive" tone="danger" onConfirm={() => { const value = archive;  run(value.id, () => archivePriceAction(value.kind, value.id), () => { setArchive(null); }); }} />}
    {restore && <ConfirmDialog error={rowError} pending={pendingId !== null} open onOpenChange={(open) => !open && setRestore(null)} title={`Restore ${restore.name}?`} description="Required references will be validated before restoring it." confirmLabel="Restore" onConfirm={() => { const value = restore;  run(value.id, () => restorePriceAction(value.kind, value.id), () => { setRestore(null); }); }} />}
    {deletion && <RequestDeletionDialog open onOpenChange={(open) => !open && setDeletion(null)} title="Request permanent deletion" description="The archived record remains until a deletion approver accepts this request." reason={reason} onReasonChange={setReason} placeholder="Optional context for the approver" pending={pendingId !== null} error={rowError} onSubmit={() => { const value = deletion; const note = reason;   run(value.id, () => requestPriceDeletionAction(value.kind, value.id, note), () => { setDeletion(null); setReason(""); }); }} />}
  </div>;
}

type BulkRow = { key: number; name: string; unitId: string; amountDisplay: string; amount: string; notes: string; scopeNote: string };
type BulkRowProblem = { rowIndex: number; message: string };
type MaterialBulkRow = { key: number; skuId: string; vendorId: string; amountDisplay: string; amount: string; notes: string };
function emptyMaterialRow(key: number, vendorId: string): MaterialBulkRow { return { key, skuId: "", vendorId, amountDisplay: "", amount: "", notes: "" }; }
function emptyBulkRow(key: number, unitId: string): BulkRow { return { key, name: "", unitId, amountDisplay: "", amount: "", notes: "", scopeNote: "" }; }

type PriceEditorRefs = {
  skus: SkuRef[];
  vendors: Array<Ref & { categoryIds?: string[]; brandIds?: string[] }>;
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

function FieldHelp({ label, content }: { label: string; content: string }) {
 return <Tooltip content={content}><IconButton label={`About ${label}`} icon={<CircleHelp size={14} />} size="sm" className="!h-4 !w-4 !min-h-4 !border-0 !bg-transparent !p-0 !text-ink-tertiary hover:!bg-transparent hover:!text-ink" /></Tooltip>;
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
          <IconButton label="About SKU measurement and BQ conversion" icon={<CircleHelp size={14} />} size="sm" className="!h-5 !w-5 !min-h-5 !border-0 !bg-transparent !p-0 !text-ink-tertiary hover:!bg-transparent hover:!text-ink" />
        </Tooltip>
      </div>
      {dimensions ? <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-secondary"><span>{dimensions}</span><span>Base: {sku.base_unit ? `${sku.base_unit.code} (${sku.base_unit.name})` : "Not set"}</span><span>Purchase: {sku.purchase_unit ? `${sku.purchase_unit.code} (${sku.purchase_unit.name})` : "Same as base"}</span></div> : <Text size="sm" tone="secondary" className="mt-2">No rectangular dimensions are stored for this SKU.</Text>}
      {sku.purchase_to_base_factor && sku.purchase_unit && sku.base_unit ? <Text size="sm" tone="secondary" className="mt-1">1 {sku.purchase_unit.code} = {formatDecimal(sku.purchase_to_base_factor)} {sku.base_unit.code}</Text> : null}
    </SectionCard>
  );
}

function PriceEditor({ pending, editor, refs, error, onCancel, onSubmit }: { pending: boolean; editor: Editor; refs: PriceEditorRefs; error: string | null; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
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
      if (result.ok === false) setBrandCreateError(result.error.safeMessage);
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
      if (result.ok === false) setProductCategoryCreateError(result.error.safeMessage);
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
    if (result.ok === false) {
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
    if (result.ok === false) {
      setCategoryCreateError(result.error.safeMessage);
      return "";
    }
    const createdName = name.trim();
    upsertCategoryOption({ id: result.data.categoryId, name: createdName });
    setCategoryId(result.data.categoryId);
    return result.data.categoryId;
  };

  // A work price is filed under one of the supplier's own categories. Choosing the supplier narrows the category
  // list to those; the supplier keeps growing as new categories are priced (the server files the link on save).
  const vendorCategoryIds = vendorOptions.find((vendor) => vendor.id === vendorId)?.categoryIds ?? [];
  // The supplier's own categories are listed first and labelled; every other category stays one scroll away.
  const visibleCategoryOptions = [...categoryOptions].sort((left, right) => Number(vendorCategoryIds.includes(right.id)) - Number(vendorCategoryIds.includes(left.id)));
  const categoryNotFiled = !material && Boolean(vendorId) && Boolean(categoryId) && vendorCategoryIds.length > 0 && !vendorCategoryIds.includes(categoryId);
  const chooseVendor = (id: string) => {
    setVendorId(id);
    if (material) return;
    const own = vendorOptions.find((vendor) => vendor.id === id)?.categoryIds ?? [];
    if (!categoryId && own.length === 1) setCategoryId(own[0]!);
  };

  const vendorField = !edit && (
    <>
      <input type="hidden" name={newMaterialSku ? "supplierVendorId" : "vendorId"} value={vendorId} required />
      <Field label={material ? "Supplier" : "Supplier"} required>
        <CreatableSearch
          label={material ? "Supplier" : "Supplier"}
          options={vendorOptions.map((vendor) => ({ id: vendor.id, label: vendor.name }))}
          value={vendorId}
          onValueChange={chooseVendor}
          placeholder="Search or select supplier"
          searchPlaceholder="Search supplier…"
          emptyLabel="No supplier matches this search."
          onCreate={refs.canManageVendors ? (name) => { setQuickName(name); setQuickOpen(true); return ""; } : undefined}
          createLabel={(name) => `Add “${name}” as a new supplier`}
          className="w-full"
        />
      </Field>
    </>
  );

  const newMaterialFields = newMaterialSku ? <>
    <div className="grid grid-cols-2 gap-3">
      <Field label="SKU code / Article #"><Input name="code" maxLength={32} placeholder="KPF 2005" autoFocus /></Field>
      <Field label="SKU name"><Input name="name" textCase="title" value={skuName} onChange={(event) => setSkuName(event.target.value)} maxLength={128} placeholder="Optional product name" /></Field>
      <input type="hidden" name="brandId" value={brandId} />
      <Field label="Brand" description="Optional. Leave empty for an unbranded SKU.">
        <CreatableSearch
          label="Brand"
          options={[{ id: "", label: "No brand" }, ...brandOptions.map((brand) => ({ id: brand.id, label: brand.name }))]}
          value={brandId}
          onValueChange={setBrandId}
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
      <div className="mb-3 flex items-center gap-2"><Text weight="semibold">Dimensions and BQ conversion</Text><Tooltip content="Optional for sheet materials. Enter length and width to calculate the BQ area contained in one purchase unit."><IconButton label="About dimensions and BQ conversion" icon={<CircleHelp size={14} />} size="sm" className="!h-5 !w-5 !min-h-5 !border-0 !bg-transparent !p-0 !text-ink-tertiary hover:!bg-transparent hover:!text-ink" /></Tooltip></div>
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
      <Field
        label="Pricing category"
        required
        description={
          !vendorId ? "Choose the supplier first; its own categories are then listed first."
            : vendorCategoryIds.length === 0 ? "No categories recorded for this supplier yet. The one you pick is saved to the supplier."
              : categoryNotFiled ? "New for this supplier. It is added to the supplier's categories when you save." : "This supplier's categories are listed first."
        }
      >
        <CreatableSearch
          label="Pricing category"
          options={visibleCategoryOptions.map((category) => ({ id: category.id, label: category.name, description: vendorCategoryIds.includes(category.id) ? "This supplier" : undefined }))}
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

  // Creating work prices happens as a table: one supplier and category, many rows, saved all together or not at all.
  const bulk = !edit && !material;
  const bulkKey = useRef(1);
  const [rows, setRows] = useState<BulkRow[]>(() => [emptyBulkRow(0, "")]);
  const [rowProblems, setRowProblems] = useState<Record<number, string>>({});
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const focusKey = useRef<number | null>(null);
  useEffect(() => {
    if (focusKey.current === null) return;
    document.getElementById(`bulk-name-${focusKey.current}`)?.focus();
    focusKey.current = null;
  }, [rows.length]);
  const patchRow = (key: number, patch: Partial<BulkRow>) => setRows((current) => current.map((entry) => entry.key === key ? { ...entry, ...patch } : entry));
  // Keys are taken outside the state updater: React may run an updater twice in development.
  const addRow = () => {
    const key = bulkKey.current++;
    focusKey.current = key;
    setRows((current) => [...current, emptyBulkRow(key, current[current.length - 1]?.unitId ?? "")]);
  };
  const removeRow = (key: number) => {
    const fresh = bulkKey.current++;
    setRows((current) => current.length === 1 ? [emptyBulkRow(fresh, current[0]?.unitId ?? "")] : current.filter((entry) => entry.key !== key));
  };
  const bulkMaterial = material && !edit && materialEntryMode === "existing";
  const anyBulk = bulk || bulkMaterial;
  // Material prices are entered brand first: the Brand narrows the SKU list, and every row names its own supplier.
  const [mRows, setMRows] = useState<MaterialBulkRow[]>(() => [emptyMaterialRow(0, "")]);
  const [materialBrandFilter, setMaterialBrandFilter] = useState("ALL");
  const [linkedPairs, setLinkedPairs] = useState<string[]>([]);
  const [linkingPair, setLinkingPair] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const brandsOfVendor = (id: string) => [...(vendorOptions.find((vendor) => vendor.id === id)?.brandIds ?? []), ...linkedPairs.filter((pair) => pair.startsWith(`${id}|`)).map((pair) => pair.slice(id.length + 1))];
  const skuOptionsForTable = refs.skus.filter((sku) => materialBrandFilter === "ALL" || sku.brand?.id === materialBrandFilter).map((sku) => ({
    id: sku.id,
    label: sku.name ?? sku.code ?? "Unnamed SKU",
    description: <span className="text-xs"><span className="font-ui-mono">{sku.code ?? "no code"}</span> · {sku.brand?.name ?? "No brand"}</span>,
    keywords: [sku.code ?? "", sku.brand?.name ?? ""],
  }));
  const supplierOptionsFor = (sku: SkuRef | undefined) => {
    const brandId = sku?.brand?.id ?? (materialBrandFilter !== "ALL" ? materialBrandFilter : null);
    return vendorOptions
      .map((vendor) => ({ vendor, linked: !brandId || brandsOfVendor(vendor.id).includes(brandId) }))
      .sort((left, right) => Number(right.linked) - Number(left.linked))
      .map(({ vendor, linked }) => ({ id: vendor.id, label: vendor.name, description: linked ? undefined : <span className="text-xs text-ink-secondary">not linked to this brand</span> }));
  };
  const patchMRow = (key: number, patch: Partial<MaterialBulkRow>) => setMRows((current) => current.map((entry) => entry.key === key ? { ...entry, ...patch } : entry));
  const addMRow = () => {
    const key = bulkKey.current++;
    setMRows((current) => [...current, emptyMaterialRow(key, current[current.length - 1]?.vendorId ?? "")]); // the supplier carries down
  };
  const removeMRow = (key: number) => {
    const fresh = bulkKey.current++;
    setMRows((current) => current.length === 1 ? [emptyMaterialRow(fresh, current[0]?.vendorId ?? "")] : current.filter((entry) => entry.key !== key));
  };
  const filledMRows = mRows.filter((entry) => entry.skuId || entry.amount || entry.notes.trim());
  const linkBrand = async (brandId: string, forVendorId: string) => {
    const pair = `${forVendorId}|${brandId}`;
    setLinkError(null);
    setLinkingPair(pair);
    const result = await linkBrandToSupplierAction({ brandId, vendorId: forVendorId });
    setLinkingPair(null);
    if (result.ok) setLinkedPairs((current) => [...current, pair]);
    else if (result.ok === false) setLinkError(result.error.safeMessage);
  };
  const filledRows = rows.filter((entry) => entry.name.trim() || entry.amount || entry.notes.trim() || entry.scopeNote.trim());
  const filledCount = bulkMaterial ? filledMRows.length : filledRows.length;
  const submitBulk = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (bulkPending) return;
    setBulkError(null);
    setRowProblems({});
    if (bulkMaterial) {
      if (filledMRows.length === 0) { setBulkError("Fill in at least one row."); return; }
      const missingM: Record<number, string> = {};
      filledMRows.forEach((entry) => {
        const lacks = [!entry.skuId && "SKU", !entry.vendorId && "supplier", !entry.amount && "amount"].filter(Boolean);
        if (lacks.length > 0) missingM[entry.key] = `Needs ${lacks.join(", ")}.`;
      });
      if (Object.keys(missingM).length > 0) { setRowProblems(missingM); setBulkError("Some rows are incomplete. Nothing was saved."); return; }
      setBulkPending(true);
      try {
        const result = await saveMaterialPriceRowsAction({ currency, rows: filledMRows.map((entry) => ({ skuId: entry.skuId, vendorId: entry.vendorId, amount: entry.amount, notes: entry.notes.trim() || null })) });
        if (result.ok) { onCancel(); return; }
        if (result.ok === false) {
          const details = (result.error.details as { rows?: BulkRowProblem[] } | undefined)?.rows ?? [];
          const problems: Record<number, string> = {};
          for (const problem of details) { const target = filledMRows[problem.rowIndex]; if (target) problems[target.key] = problem.message; }
          setRowProblems(problems);
          setBulkError(result.error.safeMessage);
        }
      } catch {
        setBulkError("The prices could not be saved. Please try again.");
      } finally {
        setBulkPending(false);
      }
      return;
    }
    if (!vendorId) { setBulkError("Choose the supplier first."); return; }
    if (!categoryId) { setBulkError("Choose the pricing category."); return; }
    if (filledRows.length === 0) { setBulkError("Fill in at least one row."); return; }
    const missing: Record<number, string> = {};
    filledRows.forEach((entry) => {
      const lacks = [!entry.name.trim() && "name", !entry.unitId && "unit", !entry.amount && "amount"].filter(Boolean);
      if (lacks.length > 0) missing[entry.key] = `Needs ${lacks.join(", ")}.`;
    });
    if (Object.keys(missing).length > 0) { setRowProblems(missing); setBulkError("Some rows are incomplete. Nothing was saved."); return; }
    setBulkPending(true);
    try {
      const result = await saveBulkWorkPricesAction({
        kind: editor.kind === "material-labor" ? "material-labor" : "labor",
        vendorId, categoryId, currency,
        rows: filledRows.map((entry) => ({ name: entry.name.trim(), unitId: entry.unitId, amount: entry.amount, notes: entry.notes.trim() || null, scopeNote: entry.scopeNote.trim() || null })),
      });
      if (result.ok) { onCancel(); return; }
      if (result.ok === false) {
        const details = (result.error.details as { rows?: BulkRowProblem[] } | undefined)?.rows ?? [];
        const problems: Record<number, string> = {};
        for (const problem of details) { const target = filledRows[problem.rowIndex]; if (target) problems[target.key] = problem.message; }
        setRowProblems(problems);
        setBulkError(result.error.safeMessage);
      }
    } catch {
      setBulkError("The prices could not be saved. Please try again.");
    } finally {
      setBulkPending(false);
    }
  };
  const bulkTable = bulk ? (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Text weight="semibold">Items</Text>
        <Text size="sm" tone="secondary">{filledRows.length} filled · one supplier, one category</Text>
      </div>
      <div className={`hidden gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-tertiary sm:grid ${editor.kind === "material-labor" ? "sm:grid-cols-[minmax(0,2fr)_7rem_8rem_minmax(0,1.5fr)_minmax(0,1.5fr)_2rem]" : "sm:grid-cols-[minmax(0,2fr)_7rem_8rem_minmax(0,2fr)_2rem]"}`}>
        <span>Name</span><span>Unit</span><span>Amount ({currency})</span><span>Notes / specification</span>{editor.kind === "material-labor" ? <span>Scope note</span> : null}<span />
      </div>
      {rows.map((entry, index) => (
        <div key={entry.key} className="grid gap-1">
          <div className={`grid items-start gap-2 ${editor.kind === "material-labor" ? "sm:grid-cols-[minmax(0,2fr)_7rem_8rem_minmax(0,1.5fr)_minmax(0,1.5fr)_2rem]" : "sm:grid-cols-[minmax(0,2fr)_7rem_8rem_minmax(0,2fr)_2rem]"}`}>
            <Input id={`bulk-name-${entry.key}`} aria-label={`Name, row ${index + 1}`} density="compact" textCase="title" maxLength={128} placeholder="e.g. Screeding base" value={entry.name} onChange={(event) => patchRow(entry.key, { name: event.target.value })} invalid={Boolean(rowProblems[entry.key])} />
            <Select aria-label={`Unit, row ${index + 1}`} density="compact" value={entry.unitId} onChange={(event) => patchRow(entry.key, { unitId: event.target.value })}>
              <option value="">Unit</option>
              {refs.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code}</option>)}
            </Select>
            <Input aria-label={`Amount, row ${index + 1}`} density="compact" inputMode="decimal" placeholder="15.000" className="tabular-nums" value={entry.amountDisplay}
              onChange={(event) => { const parsed = parseIndonesianAmount(event.target.value); if (parsed === null) return; patchRow(entry.key, { amount: parsed, amountDisplay: event.target.value.endsWith(",") ? event.target.value : parsed ? formatDecimal(parsed) : "" }); }}
              onBlur={() => patchRow(entry.key, { amountDisplay: entry.amount ? formatDecimal(entry.amount) : "" })}
              onKeyDown={(event) => { if (event.key === "Enter" && index === rows.length - 1) { event.preventDefault(); addRow(); } }}
              invalid={Boolean(rowProblems[entry.key])} />
            <Input aria-label={`Notes, row ${index + 1}`} density="compact" maxLength={1000} placeholder="Specification, brand reference…" value={entry.notes} onChange={(event) => patchRow(entry.key, { notes: event.target.value })} />
            {editor.kind === "material-labor" ? <Input aria-label={`Scope note, row ${index + 1}`} density="compact" maxLength={1000} placeholder="Included work or materials" value={entry.scopeNote} onChange={(event) => patchRow(entry.key, { scopeNote: event.target.value })} /> : null}
            <IconButton label={`Remove row ${index + 1}`} icon={<Trash2 size={14} />} size="sm" onClick={() => removeRow(entry.key)} />
          </div>
          {rowProblems[entry.key] ? <div role="alert" className="px-1 text-xs text-danger">Row {index + 1}: {rowProblems[entry.key]}</div> : null}
        </div>
      ))}
      <div><Button type="button" variant="ghost" size="sm" leadingIcon={<Plus />} onClick={addRow}>Add row</Button></div>
    </div>
  ) : null;

  const materialTable = bulkMaterial ? (
    <div className="grid gap-3">
      <Field label="Brand" description="Narrows the SKU list to one brand, so a code such as TH001AA is clear. Leave on All brands to search everything.">
        <CreatableSearch
          label="Brand"
          options={[{ id: "ALL", label: "All brands" }, ...brandOptions.map((brand) => ({ id: brand.id, label: brand.name }))]}
          value={materialBrandFilter}
          onValueChange={(value) => setMaterialBrandFilter(value || "ALL")}
          placeholder="All brands"
          searchPlaceholder="Search brands…"
          emptyLabel="No brand matches this search."
          className="w-full"
        />
      </Field>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <Text weight="semibold">Items</Text>
          <Text size="sm" tone="secondary">{filledMRows.length} filled</Text>
        </div>
        <div className="hidden gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-tertiary sm:grid sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_4rem_8rem_minmax(0,2fr)_2rem]">
          <span>SKU</span><span>Supplier</span><span>Unit</span><span>Amount ({currency})</span><span>Notes</span><span />
        </div>
        {mRows.map((entry, index) => {
          const sku = refs.skus.find((candidate) => candidate.id === entry.skuId);
          const unlinked = Boolean(sku?.brand && entry.vendorId && !brandsOfVendor(entry.vendorId).includes(sku.brand.id));
          return (
            <div key={entry.key} className="grid gap-1">
              <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_4rem_8rem_minmax(0,2fr)_2rem]">
                <CreatableSearch
                  label={`SKU, row ${index + 1}`}
                  options={skuOptionsForTable}
                  value={entry.skuId}
                  onValueChange={(value) => patchMRow(entry.key, { skuId: value })}
                  onCreate={refs.canManageSkus ? (name) => { setSkuName(name); setMaterialEntryMode("new"); return ""; } : undefined}
                  createLabel={(name) => `Create SKU “${name}”`}
                  placeholder="Search SKU name, code, or brand"
                  searchPlaceholder="Search SKU name, code, or brand…"
                  emptyLabel="No SKU matches this search."
                  className="w-full"
                />
                <CreatableSearch
                  label={`Supplier, row ${index + 1}`}
                  options={supplierOptionsFor(sku)}
                  value={entry.vendorId}
                  onValueChange={(value) => patchMRow(entry.key, { vendorId: value })}
                  onCreate={refs.canManageVendors ? (name) => { setQuickName(name); setQuickOpen(true); return ""; } : undefined}
                  createLabel={(name) => `Add “${name}” as a new supplier`}
                  placeholder="Supplier"
                  searchPlaceholder="Search supplier…"
                  emptyLabel="No supplier matches this search."
                  className="w-full"
                />
                <div className="flex min-h-(--ui-control-height-sm) items-center px-1 font-ui-mono text-sm text-ink-secondary">{sku ? (sku.purchase_unit ?? sku.base_unit)?.code ?? "–" : "–"}</div>
                <Input aria-label={`Amount, row ${index + 1}`} density="compact" inputMode="decimal" placeholder="15.000" className="tabular-nums" value={entry.amountDisplay}
                  onChange={(event) => { const parsed = parseIndonesianAmount(event.target.value); if (parsed === null) return; patchMRow(entry.key, { amount: parsed, amountDisplay: event.target.value.endsWith(",") ? event.target.value : parsed ? formatDecimal(parsed) : "" }); }}
                  onBlur={() => patchMRow(entry.key, { amountDisplay: entry.amount ? formatDecimal(entry.amount) : "" })}
                  onKeyDown={(event) => { if (event.key === "Enter" && index === mRows.length - 1) { event.preventDefault(); addMRow(); } }}
                  invalid={Boolean(rowProblems[entry.key])} />
                <Input aria-label={`Notes, row ${index + 1}`} density="compact" maxLength={1000} placeholder="Quote reference, remarks…" value={entry.notes} onChange={(event) => patchMRow(entry.key, { notes: event.target.value })} />
                <IconButton label={`Remove row ${index + 1}`} icon={<Trash2 size={14} />} size="sm" onClick={() => removeMRow(entry.key)} />
              </div>
              {sku ? <SkuMeasurementSummary sku={sku} /> : null}
              {unlinked && sku?.brand ? (
                <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-ink-secondary">
                  <span>This supplier is not linked to {sku.brand.name}, so it cannot be priced yet.</span>
                  {refs.canManageBrands || refs.canManageVendors
                    ? <Button type="button" variant="ghost" size="sm" disabled={linkingPair === `${entry.vendorId}|${sku.brand.id}`} onClick={() => void linkBrand(sku.brand!.id, entry.vendorId)}>Link brand to supplier</Button>
                    : <span>Ask someone who manages Brands or Suppliers to link it.</span>}
                </div>
              ) : null}
              {rowProblems[entry.key] ? <div role="alert" className="px-1 text-xs text-danger">Row {index + 1}: {rowProblems[entry.key]}</div> : null}
            </div>
          );
        })}
        {linkError ? <InlineError>{linkError}</InlineError> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" leadingIcon={<Plus />} onClick={addMRow}>Add row</Button>
          {refs.canManageSkus ? <Button type="button" variant="ghost" size="sm" onClick={() => setMaterialEntryMode("new")}>Create a new SKU with its first price</Button> : null}
        </div>
      </div>
    </div>
  ) : null;

  const priceLabel = material ? "material price" : editor.kind === "material-labor" ? "material + labor price" : "labor price";
  const formRef = useRef<HTMLFormElement>(null);
  const draftGuard = useFormDraftGuard({
    formRef,
    resetKey: `${editor.kind}-${row?.id ?? "new"}`,
    watchedValue: JSON.stringify([vendorId, categoryId, brandId, skuId, amount, materialEntryMode, skuBrandFilter, anyBulk ? [rows, mRows] : null]),
    title: edit ? "Discard changes?" : "Discard price draft?",
    description: edit ? "Your edits are only in this browser and have not been saved." : "Your changes are only in this browser and have not been saved.",
  });

  return <>
    <Dialog open size={anyBulk ? "xl" : "md"} dismissible={!pending && !bulkPending} onOpenChange={(open) => !open && !pending && void draftGuard.requestDiscard(onCancel)} title={`${edit ? "Edit" : "Create"} ${newMaterialSku ? "SKU + material price" : anyBulk ? `${priceLabel}s` : priceLabel}`} description={material && edit ? "SKU and supplier identity are read-only." : "Choose only active and eligible catalog references."}><form ref={formRef} onChange={draftGuard.onFormChange} className="grid gap-4" onSubmit={anyBulk ? submitBulk : onSubmit}>
      <input type="hidden" name="materialEntryMode" value={materialEntryMode} />
      {edit && <input type="hidden" name="id" value={row!.id} />}{error && <div role="alert" className="text-sm text-danger">{error}</div>}
      {material ? (edit ? <><Field label="SKU"><Input value={materialRow!.sku.name ?? materialRow!.sku.code ?? "Unnamed SKU"} readOnly /></Field><Field label="Supplier"><Input value={materialRow!.supplier_vendor.name} readOnly /></Field><Field label="Unit"><Input value={`${materialRow!.unit.name} (${materialRow!.unit.code})`} readOnly /></Field></> : newMaterialSku ? <><div><Button type="button" variant="ghost" size="sm" onClick={() => setMaterialEntryMode("existing")}>← Back to the price table</Button></div>{newMaterialFields}{vendorField}</> : <>{materialTable}</>) : bulk ? <>{vendorField}{categoryField}{bulkTable}</> : <><Field label="Name" required><Input name="name" textCase="title" defaultValue={workRow?.name} required /></Field>{edit ? <input type="hidden" name="vendorId" value={vendorId} required /> : vendorField}{categoryField}<Field label="Unit" required><Select name="unitId" defaultValue={workRow?.unit.id ?? ""} required><option value="">Select unit</option>{refs.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>)}</Select></Field>{editor.kind === "material-labor" && <Field label="Scope note" description="Describe included work or materials. Use bullets for a clear scope."><SimpleTextEditor name="scopeNote" defaultValue={workRow?.scope_note ?? ""} placeholder={"Example:\n- Installation labor\n- Adhesive and grout"} maxLength={1000} rows={5} /></Field>}</>}
      {!anyBulk && <><input type="hidden" name="amount" value={amount} /><input type="hidden" name="currency" value={currency} />
      <Field label="Amount" description={`${currency} default currency`} required><div className="relative"><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-ui-mono text-sm font-semibold text-ink-secondary">{currency}</span><Input aria-label="Amount" value={amountDisplay} onChange={(event) => updateAmount(event.target.value)} onBlur={() => setAmountDisplay(amount ? formatDecimal(amount) : "")} inputMode="decimal" placeholder="15.000" className="pl-14 tabular-nums" required /></div></Field><Field label="Notes"><SimpleTextEditor name="notes" defaultValue={row?.notes ?? ""} placeholder="Additional pricing context..." maxLength={1000} rows={3} /></Field></>}{anyBulk && bulkError ? <div role="alert" className="text-sm text-danger">{bulkError}</div> : null}<FormActions><Button type="button" variant="ghost" disabled={pending} onClick={() => void draftGuard.requestDiscard(onCancel)}>Cancel</Button><Button type="submit" variant="primary" pending={pending || bulkPending}>{edit ? "Save changes" : anyBulk ? `Create ${filledCount || ""} ${filledCount === 1 ? "price" : "prices"}`.replace("  ", " ") : "Create price"}</Button></FormActions>
    </form></Dialog>
    {draftGuard.confirmDialog}
    <VendorQuickCreateDialog
      open={quickOpen}
      pending={quickPending}
      error={quickError}
      name={quickName}
      onNameChange={setQuickName}
      vendorTypeId={quickVendorTypeId}
      onVendorTypeIdChange={setQuickVendorTypeId}
      vendorTypes={eligibleTypes}
      onSubmit={() => void addVendor()}
      onCancel={() => setQuickOpen(false)}
      description={`Create a supplier for this ${needsMaterial ? "material" : "labor"} price.`}
    />
  </>;
}
