"use client";
import { FilterSummary, StatusFilterSelect } from "../directory-filters";
import { RequestDeletionDialog } from "../request-deletion-dialog";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { isPriceOnRequest, lowestPricesByCurrencyUnit, matchesDirectoryStatus, type DirectoryStatus } from "../directory-findability";
import { TableFilters,Drawer,DirectoryShell,DraftDialog,EntityPrimaryCell,Pagination,RowActionMenu,Text,usePagination } from "@/platform/ui_engine";


import { useState } from "react";
import { useRowAction } from "@/platform/ui_engine";

import { Badge,Button,Combobox,ConfirmDialog,DataTable,EmptyState,Field,FormActions,InlineError,Input,Notice,SearchField,Select,TableBody,TableCell,TableCellContent,TableHead,TableHeader,TableRow,TableToolbar,Textarea } from "@/platform/ui_engine";
import { createMoney,formatMoney } from "@platform/utilities/money";
import {
archiveSkuAction,
requestSkuDeletionAction,
restoreSkuAction,
updateSkuAction,
} from "./actions";

type SkuRow = {
  id: string;
  name: string | null;
  slug: string;
  code: string | null;
  notes: string | null;
  deleted_at: Date | null;
  brand: { id: string; name: string; slug: string } | null;
  dimension_length: { toString(): string } | null;
  dimension_width: { toString(): string } | null;
  dimension_thickness: { toString(): string } | null;
  dimension_unit: { id: string; code: string; name: string } | null;
  categories: Array<{ category: { id: string; name: string; slug: string } }>;
  material_prices: Array<{
    id: string;
    source_link_id: string | null;
    amount: unknown;
    amount_label?: string | null;
    currency: string;
    supplier_vendor: { id: string; name: string };
    unit: { id: string; code: string; name: string };
  }>;
  _count: { material_prices: number };
};

type Option = { id: string; name: string };
type UnitOption = { id: string; code: string; name: string };

export function SkuDirectory({
  skus,
  brands,
  units,
  productCategories,
  canManage,
  initialEditId,
}: {
  skus: SkuRow[];
  brands: Option[];
  units: UnitOption[];
  productCategories: Option[];
  canManage: boolean;
  initialEditId?: string;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = skus.find((sku) => sku.id === detailId) ?? null;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DirectoryStatus>("ACTIVE");
  const [priceFilter, setPriceFilter] = useState("ALL");
  const [supplierFilter, setSupplierFilter] = useState("ALL");
  const [brandFilter, setBrandFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const deepLinkTarget = initialEditId ? skus.find((sku) => sku.id === initialEditId) ?? null : null;
  const [editTarget, setEditTarget] = useState<SkuRow | null>(deepLinkTarget);
  const [editBrandId, setEditBrandId] = useState(deepLinkTarget?.brand?.id ?? "");
  const [editCategoryId, setEditCategoryId] = useState(deepLinkTarget?.categories[0]?.category.id ?? "");
  const [confirmArchive, setConfirmArchive] = useState<SkuRow | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<SkuRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SkuRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const { pendingId, rowError, runRowAction } = useRowAction();

  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, setEditPending] = useState(false);
  const linkedSourceCount = editTarget?.material_prices.filter((price) => price.source_link_id).length ?? 0;

  const filtered = skus.filter((sku) => {
    if (!matchesDirectoryStatus(sku.deleted_at, statusFilter)) return false;
    if (brandFilter !== "ALL" && sku.brand?.id !== brandFilter) return false;
    if (categoryFilter !== "ALL" && !sku.categories.some((c) => c.category.id === categoryFilter)) return false;
    if (priceFilter === "YES" && sku.material_prices.length === 0) return false;
    if (priceFilter === "NO" && sku.material_prices.length > 0) return false;
    if (supplierFilter !== "ALL" && !sku.material_prices.some((price) => price.supplier_vendor.id === supplierFilter)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (sku.name ?? "").toLowerCase().includes(q) ||
      sku.slug.toLowerCase().includes(q) ||
      (sku.code && sku.code.toLowerCase().includes(q)) ||
      (sku.brand && sku.brand.name.toLowerCase().includes(q)) || sku.categories.some((item) => item.category.name.toLowerCase().includes(q)) || Boolean(sku.notes?.toLowerCase().includes(q))
    );
  });
  const { locale } = useDisplaySettings();
  const [sortKey] = useState<"SKU">("SKU");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const sortValues: Record<"SKU", (r: SkuRow) => string | number | null> = {"SKU": (r) => r.name ?? r.code ?? ""};
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const orderedRows = [...filtered].sort((a, b) => {
    const left = sortValues[sortKey](a), right = sortValues[sortKey](b);
    if (left === null || right === null) return left === right ? a.id.localeCompare(b.id) : left === null ? 1 : -1;
    const result = typeof left === "number" && typeof right === "number" ? left - right : collator.compare(String(left), String(right));
    return (sortDirection === "asc" ? result : -result) || a.id.localeCompare(b.id);
  });
  const paging = usePagination(orderedRows.length, 25, JSON.stringify([query, statusFilter, priceFilter, supplierFilter, sortKey, sortDirection, brandFilter, categoryFilter]));
  const visibleRows = orderedRows.slice(paging.offset, paging.offset + 25);
  const pageFooter = <div className="grid gap-2"><Text tone="secondary" size="sm">{orderedRows.length ? paging.offset + 1 : 0}–{Math.min(paging.offset + 25, orderedRows.length)} of {orderedRows.length} records</Text>{paging.pageCount > 1 ? <Pagination page={paging.page} pageCount={paging.pageCount} onPageChange={paging.setPage} /> : null}</div>;


  const openEditDialog = (sku: SkuRow) => {
    setEditBrandId(sku.brand?.id ?? "");
    setEditCategoryId(sku.categories[0]?.category.id ?? "");
    setEditTarget(sku);
  };

  return (
    <DirectoryShell fill header={rowError ? <InlineError>{rowError}</InlineError> : undefined} surface pagination={pageFooter} toolbar={<TableToolbar framed={false}>
        <div className="flex flex-wrap items-center gap-3">
          <SearchField value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} onClear={() => setQuery("")} placeholder="Search SKUs by name, code, brand..." />
          <StatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
          <TableFilters resultLabel={`${filtered.length} of ${skus.length} SKUs`} filters={[
            { id: "brand", label: "Brand", value: brandFilter, defaultValue: "ALL", onValueChange: setBrandFilter, options: [{ id: "ALL", label: "All brands" }, ...brands.map((item) => ({ id: item.id, label: item.name }))] },
            { id: "category", label: "Product category", value: categoryFilter, defaultValue: "ALL", onValueChange: setCategoryFilter, options: [{ id: "ALL", label: "All categories" }, ...productCategories.map((item) => ({ id: item.id, label: item.name }))] },
            { id: "price", label: "Price availability", value: priceFilter, defaultValue: "ALL", onValueChange: setPriceFilter, options: [{ id: "ALL", label: "Any price" }, { id: "YES", label: "Has price" }, { id: "NO", label: "No price" }] },
            { id: "supplier", label: "Priced supplier", value: supplierFilter, defaultValue: "ALL", onValueChange: setSupplierFilter, options: [{ id: "ALL", label: "Any priced supplier" }, ...[...new Map(skus.flatMap((sku) => sku.material_prices.map((price) => [price.supplier_vendor.id, price.supplier_vendor] as const))).values()].map((item) => ({ id: item.id, label: item.name }))] },
          ]} />
          <FilterSummary filtered={Boolean(query) || statusFilter !== "ACTIVE" || brandFilter !== "ALL" || categoryFilter !== "ALL" || priceFilter !== "ALL" || supplierFilter !== "ALL"} shown={filtered.length} total={skus.length} onClear={() => { setQuery(""); setStatusFilter("ACTIVE"); setBrandFilter("ALL"); setCategoryFilter("ALL"); setPriceFilter("ALL"); setSupplierFilter("ALL"); }} />
        </div>
      </TableToolbar>}>


      {filtered.length === 0 ? (
        <EmptyState
          title="No SKUs found"
          description={query ? "No items match your search filters." : "Create your first catalog SKU."}

        />
      ) : (
        <DataTable framed={false} density="compact" stickyHeader fill minWidth={860}>
          <TableHeader>
            <TableRow>
              <TableHead sortable sortDirection={sortDirection} onSortChange={setSortDirection}>SKU &amp; Code</TableHead>
              <TableHead>Brand &amp; Categories</TableHead>
              <TableHead>Dimensions</TableHead>
              <TableHead>Prices</TableHead>
              <TableHead stickyEnd align="end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((sku) => {
              const isPending = pendingId === sku.id;
              const isArchived = sku.deleted_at !== null;
              const lowestPrices = lowestPricesByCurrencyUnit(sku.material_prices);

              return (
                <TableRow key={sku.id}>
                  <TableCell>
                    <EntityPrimaryCell
                      tone={isArchived ? "danger" : "success"}
                      statusLabel={isArchived ? "Archived" : "Active"}
                      name={<Button type="button" variant="ghost" size="sm" className="-ml-2 max-w-full justify-start text-left" onClick={() => setDetailId(sku.id)}>{sku.name ?? sku.code ?? "Unnamed SKU"}</Button>}
                      secondary={sku.code ? <div className="text-xs text-ink-secondary font-ui-mono">{sku.code}</div> : undefined}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="grid gap-1">
                      {sku.brand ? (
                        <span className="text-xs font-semibold text-ink">{sku.brand.name}</span>
                      ) : (
                        <span className="text-xs text-ink-tertiary">No brand</span>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {sku.categories.map((c) => (
                          <Badge key={c.category.id} tone="neutral">
                            {c.category.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-ink-secondary">{sku.dimension_length && sku.dimension_width && sku.dimension_unit ? `${sku.dimension_length.toString()} × ${sku.dimension_width.toString()}${sku.dimension_thickness ? ` × ${sku.dimension_thickness.toString()}` : ""} ${sku.dimension_unit.code}` : "—"}</span>
                  </TableCell>
                  <TableCell>
                    {lowestPrices.length ? (
                      <TableCellContent
                        primary={<span>{lowestPrices.map((price, index) => <span key={`${price.currency}-${price.unit.code}`}>{index ? " · " : ""}<span className="font-semibold">{price.amount_label ? <span className="font-normal italic text-ink-secondary">{price.amount_label}</span> : isPriceOnRequest(price.amount) ? <span className="font-normal italic text-ink-secondary">By request</span> : `from ${formatMoney(createMoney(String(price.amount), price.currency))}`}</span><span className="text-ink-secondary"> / {price.unit.code}</span></span>)}</span>}
                        secondary={<span className="truncate max-w-[140px]">{sku.material_prices.length} price{sku.material_prices.length === 1 ? "" : "s"}</span>}
                      />
                    ) : (
                      <span className="text-xs text-ink-tertiary">No price</span>
                    )}
                  </TableCell>
                  <TableCell stickyEnd align="end">
                    <RowActionMenu label={`Actions for ${sku.id}`} pending={pendingId === sku.id} items={[...[],...(isPending ? [] : []),...[],...(canManage ? [...[],...[{ label: "Edit", onSelect: () => openEditDialog(sku), disabled: isPending, danger: false, separatorBefore: false }],...[],...(!isArchived ? [{ label: "Archive", onSelect: () => setConfirmArchive(sku), disabled: isPending, danger: false, separatorBefore: false }] : [...[],...[{ label: "Restore", onSelect: () => setConfirmRestore(sku), disabled: isPending, danger: false, separatorBefore: false }],...[],...[{ label: "Request deletion", onSelect: () => setDeleteTarget(sku), disabled: isPending, danger: true, separatorBefore: true }],...[]]),...[]] : []),...[]]} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </DataTable>
      )}

      {detail ? <Drawer open onOpenChange={(open) => { if (!open) setDetailId(null); }} title={detail.name ?? detail.code ?? "Unnamed SKU"} description={detail.deleted_at ? "Archived SKU" : "SKU profile & supplier prices"} size="lg" footer={<>
        <Button type="button" variant="ghost" onClick={() => setDetailId(null)}>Close</Button>
        {canManage ? <Button type="button" variant="primary" onClick={() => { setDetailId(null); openEditDialog(detail); }}>Edit SKU</Button> : null}
      </>}>
        <div className="grid gap-5">
          <dl className="grid gap-4">
            <div><dt className="text-sm text-ink-secondary">Code</dt><dd>{detail.code || "Not recorded"}</dd></div>
            <div><dt className="text-sm text-ink-secondary">Brand</dt><dd>{detail.brand?.name ?? "No brand"}</dd></div>
            <div><dt className="text-sm text-ink-secondary">Product category</dt><dd>{detail.categories.map((item) => item.category.name).join(", ") || "Not recorded"}</dd></div>
            <div><dt className="text-sm text-ink-secondary">Dimensions</dt><dd>{detail.dimension_length && detail.dimension_width && detail.dimension_unit ? `${detail.dimension_length} × ${detail.dimension_width}${detail.dimension_thickness ? ` × ${detail.dimension_thickness}` : ""} ${detail.dimension_unit.code}` : "Not recorded"}</dd></div>
          </dl>
          {detail.notes ? <Text as="p" className="whitespace-pre-wrap">{detail.notes}</Text> : null}
          <div className="grid gap-3"><Text weight="semibold">Supplier prices</Text>{detail.material_prices.length ? detail.material_prices.map((price) => <div key={price.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle pb-3">
            <Text>{price.supplier_vendor.name}</Text><Text className="tabular-nums">{price.amount_label || (isPriceOnRequest(String(price.amount)) ? "By request" : formatMoney(createMoney(String(price.amount), price.currency), { locale }))} / {price.unit.code}</Text>
          </div>) : <Text tone="secondary">No prices recorded.</Text>}</div>
        </div>
      </Drawer> : null}

      {/* Edit SKU Dialog */}
      {editTarget ? (
        <DraftDialog pending={editPending}
          open
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          title={`Edit SKU ${editTarget.name ?? editTarget.code ?? "Unnamed SKU"}`}
          description="Update SKU profile, brand association, and product category classifications."
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setEditPending(true);
              setEditError(null);
              const fd = new FormData(e.currentTarget);
              try {
                const res = await updateSkuAction(null, fd);
                if (res && "ok" in res && res.ok) {
                  setEditTarget(null);
                } else if (res && "ok" in res && res.ok === false) {
                  setEditError(res.error.safeMessage);
                }
              } finally {
                setEditPending(false);
              }
            }}
            className="grid gap-4 max-h-[80vh] overflow-y-auto pr-1"
          >
            <input type="hidden" name="skuId" value={editTarget.id} />
            <input type="hidden" name="brandId" value={editBrandId} />
            <input type="hidden" name="categoryId" value={editCategoryId} />
            {editError ? <InlineError>{editError}</InlineError> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="SKU code / Article #">
                <Input name="code" defaultValue={editTarget.code ?? ""} maxLength={32} />
              </Field>
              <Field label="SKU name">
                <Input name="name" textCase="title" defaultValue={editTarget.name ?? ""} maxLength={128} autoFocus />
              </Field>
              <Field label="Brand" description="Optional. A SKU can exist without a Brand.">
                <Combobox label="SKU brand" options={[{ id: "", label: "No brand" }, ...brands.map((brand) => ({ id: brand.id, label: brand.name }))]} value={editBrandId} onValueChange={setEditBrandId} placeholder="No brand" searchPlaceholder="Search brands…" />
              </Field>
            </div>
            {editBrandId !== (editTarget.brand?.id ?? "") ? (
              <Notice tone="warning" title="Correcting this SKU's Brand">
                {linkedSourceCount > 0
                  ? `${linkedSourceCount} price source link${linkedSourceCount === 1 ? "" : "s"} from the old Brand will be removed. Price amounts stay the same. Existing BQ snapshots stay as they were.`
                  : "Existing prices stay the same. Existing BQ snapshots stay as they were."}
              </Notice>
            ) : null}
            <div className="grid gap-3 border-t border-line-subtle pt-4">
              <div className="grid gap-1"><Text weight="semibold">Product dimensions</Text><Text size="sm" tone="secondary">Optional SKU details. Purchase units belong to supplier prices.</Text></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Length">
                  <Input name="dimensionLength" defaultValue={editTarget.dimension_length?.toString() ?? ""} inputMode="decimal" />
                </Field>
                <Field label="Width">
                  <Input name="dimensionWidth" defaultValue={editTarget.dimension_width?.toString() ?? ""} inputMode="decimal" />
                </Field>
                <Field label="Thickness" description="Optional product detail.">
                  <Input name="dimensionThickness" defaultValue={editTarget.dimension_thickness?.toString() ?? ""} inputMode="decimal" />
                </Field>
                <Field label="Dimension unit">
                  <Select name="dimensionUnitId" defaultValue={editTarget.dimension_unit?.id ?? ""}>
                    <option value="">Select unit</option>
                    {units.filter((unit) => ["MM", "CM", "M"].includes(unit.code.toUpperCase())).map((unit) => (
                      <option key={unit.id} value={unit.id}>{unit.code} — {unit.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>

            <Field label="Product category" required>
              <Combobox label="SKU product category" options={productCategories.map((category) => ({ id: category.id, label: category.name }))} value={editCategoryId} onValueChange={setEditCategoryId} placeholder="Search product category" searchPlaceholder="Search product categories…" />
            </Field>

            <Field label="Notes">
              <Textarea name="notes" defaultValue={editTarget.notes ?? ""} rows={2} />
            </Field>

            <FormActions>
              <Button data-dialog-cancel type="button" variant="ghost" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" pending={editPending}>
                {"Save changes"}
              </Button>
            </FormActions>
          </form>
        </DraftDialog>
      ) : null}

      {/* Archive Confirm */}
      {confirmArchive ? (
        <ConfirmDialog error={rowError} pending={pendingId !== null}
          open
          onOpenChange={(open) => {
            if (!open) setConfirmArchive(null);
          }}
          title={`Archive SKU "${confirmArchive.name}"?`}
          description="Archiving this SKU cascades archive causes to all its supplier material prices."
          confirmLabel="Archive SKU"
          tone="danger"
          onConfirm={() => {
            const target = confirmArchive;

            runRowAction(target.id, () => archiveSkuAction(target.id), () => { setConfirmArchive(null); });
          }}
        />
      ) : null}

      {/* Restore Confirm */}
      {confirmRestore ? (
        <ConfirmDialog error={rowError} pending={pendingId !== null}
          open
          onOpenChange={(open) => {
            if (!open) setConfirmRestore(null);
          }}
          title={`Restore SKU "${confirmRestore.name}"?`}
          description="Restoring this SKU restores its material prices that were archived solely by SKU parent provenance."
          confirmLabel="Restore SKU"
          onConfirm={() => {
            const target = confirmRestore;

            runRowAction(target.id, () => restoreSkuAction(target.id), () => { setConfirmRestore(null); });
          }}
        />
      ) : null}

      {/* Request Deletion Dialog */}
      {deleteTarget ? (
        <RequestDeletionDialog open onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }} title={`Submit SKU "${deleteTarget.name}" for deletion`} description="Archived SKUs with zero active quotations can be permanently purged after supervisor approval." reason={deleteReason} onReasonChange={setDeleteReason} placeholder="e.g. Discontinued item replaced by another SKU" pending={pendingId !== null} error={rowError} onSubmit={() => {
                  const target = deleteTarget;
                  const reason = deleteReason;


                  runRowAction(target.id, () => requestSkuDeletionAction(target.id, reason), () => { setDeleteTarget(null); setDeleteReason(""); });
                }} />
      ) : null}
    </DirectoryShell>
  );
}
