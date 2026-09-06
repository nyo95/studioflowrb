"use client";
import { RequestDeletionDialog } from "../request-deletion-dialog";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { DirectoryShell,DraftDialog,EntityPrimaryCell,Pagination,RowActionMenu,Text,usePagination } from "@/platform/ui_engine";


import { useState,useTransition } from "react";

import { Badge,Button,Combobox,ConfirmDialog,DataTable,EmptyState,Field,FormActions,InlineError,Input,SearchField,SectionCard,Select,TableBody,TableCell,TableCellContent,TableHead,TableHeader,TableRow,TableToolbar,Textarea } from "@/platform/ui_engine";
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
  base_unit: { id: string; code: string; name: string };
  purchase_unit: { id: string; code: string; name: string } | null;
  dimension_length: { toString(): string } | null;
  dimension_width: { toString(): string } | null;
  dimension_thickness: { toString(): string } | null;
  dimension_unit: { id: string; code: string; name: string } | null;
  purchase_to_base_factor: { toString(): string } | null;
  categories: Array<{ category: { id: string; name: string; slug: string } }>;
  material_prices: Array<{
    id: string;
    amount: unknown;
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
}: {
  skus: SkuRow[];
  brands: Option[];
  units: UnitOption[];
  productCategories: Option[];
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const [editTarget, setEditTarget] = useState<SkuRow | null>(null);
  const [editBrandId, setEditBrandId] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [confirmArchive, setConfirmArchive] = useState<SkuRow | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<SkuRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SkuRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, setEditPending] = useState(false);

  const filtered = skus.filter((sku) => {
    if (brandFilter !== "ALL" && sku.brand?.id !== brandFilter) return false;
    if (categoryFilter !== "ALL" && !sku.categories.some((c) => c.category.id === categoryFilter)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (sku.name ?? "").toLowerCase().includes(q) ||
      sku.slug.toLowerCase().includes(q) ||
      (sku.code && sku.code.toLowerCase().includes(q)) ||
      (sku.brand && sku.brand.name.toLowerCase().includes(q))
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
  const paging = usePagination(orderedRows.length, 25, JSON.stringify([query, sortKey, sortDirection]));
  const visibleRows = orderedRows.slice(paging.offset, paging.offset + 25);
  const pageFooter = <div className="grid gap-2"><Text tone="secondary" size="sm">{orderedRows.length ? paging.offset + 1 : 0}–{Math.min(paging.offset + 25, orderedRows.length)} of {orderedRows.length} records</Text>{paging.pageCount > 1 ? <Pagination page={paging.page} pageCount={paging.pageCount} onPageChange={paging.setPage} /> : null}</div>;


  const runRowAction = (id: string, command: () => Promise<unknown>, onSuccess?: () => void) => {
    if (pendingId) return;
    setPendingId(id); setRowError(null);
    startTransition(async () => {
      try {
        const result = await command();
        if (result && typeof result === "object" && "ok" in result && !result.ok) {
          const failure = result as { error?: { safeMessage?: string } };
          setRowError(failure.error?.safeMessage ?? "The action could not be completed."); return;
        }
        onSuccess?.();
      } catch { setRowError("The action could not be completed. Please try again."); }
      finally { setPendingId(null); }
    });
  };

  const openEditDialog = (sku: SkuRow) => {
    setEditBrandId(sku.brand?.id ?? "");
    setEditCategoryId(sku.categories[0]?.category.id ?? "");
    setEditTarget(sku);
  };

  return (
    <DirectoryShell fill header={rowError ? <InlineError>{rowError}</InlineError> : undefined} surface pagination={pageFooter} toolbar={<TableToolbar framed={false}>
        <div className="flex flex-wrap items-center gap-3">
          <SearchField value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} onClear={() => setQuery("")} placeholder="Search SKUs by name, code, brand..." />
          <div className="w-52">
            <Combobox label="Brand filter" options={[{ id: "ALL", label: "All brands" }, ...brands.map((brand) => ({ id: brand.id, label: brand.name }))]} value={brandFilter} onValueChange={setBrandFilter} placeholder="All brands" searchPlaceholder="Search brands…" />
          </div>
          <div className="w-52">
            <Combobox label="Product category filter" options={[{ id: "ALL", label: "All categories" }, ...productCategories.map((category) => ({ id: category.id, label: category.name }))]} value={categoryFilter} onValueChange={setCategoryFilter} placeholder="All categories" searchPlaceholder="Search product categories…" />
          </div>
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
              <TableHead>Units</TableHead>
              <TableHead>Prices</TableHead>
              <TableHead stickyEnd align="end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((sku) => {
              const isPending = pendingId === sku.id;
              const isArchived = sku.deleted_at !== null;
              const primaryPrice = sku.material_prices[0];

              return (
                <TableRow key={sku.id}>
                  <TableCell>
                    <EntityPrimaryCell
                      tone={isArchived ? "danger" : "success"}
                      statusLabel={isArchived ? "Archived" : "Active"}
                      name={sku.name ?? sku.code ?? "Unnamed SKU"}
                      secondary={
                        <div className="text-xs text-ink-secondary">
                          {sku.code ? <span className="font-ui-mono">{sku.code} • </span> : null}
                          <span className="font-ui-mono">{sku.slug}</span>
                        </div>
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="grid gap-1">
                      {sku.brand ? (
                        <span className="text-xs font-semibold text-ink">{sku.brand.name}</span>
                      ) : (
                        <span className="text-xs text-ink-tertiary">Brand unavailable</span>
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
                    <TableCellContent
                      primary={<span>Base: <span className="font-ui-mono font-medium">{sku.base_unit.code}</span></span>}
                      secondary={sku.purchase_unit ? <span>Buy: <span className="font-ui-mono">{sku.purchase_unit.code}</span></span> : undefined}
                    />
                  </TableCell>
                  <TableCell>
                    {primaryPrice ? (
                      <TableCellContent
                        primary={<span><span className="font-semibold">{formatMoney(createMoney(String(primaryPrice.amount), primaryPrice.currency))}</span><span className="text-ink-secondary"> / {primaryPrice.unit.code}</span></span>}
                        secondary={<span className="truncate max-w-[140px]">{primaryPrice.supplier_vendor.name}</span>}
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
                } else if (res && "ok" in res && !res.ok) {
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU code / Article #">
                <Input name="code" defaultValue={editTarget.code ?? ""} maxLength={32} />
              </Field>
              <Field label="SKU name">
                <Input name="name" defaultValue={editTarget.name ?? ""} maxLength={128} autoFocus />
              </Field>
              <Field label="Brand" required>
                <Combobox label="SKU brand" options={brands.map((brand) => ({ id: brand.id, label: brand.name }))} value={editBrandId} onValueChange={setEditBrandId} placeholder="Select brand" searchPlaceholder="Search brands…" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Base measurement unit" required>
                <Select name="baseUnitId" defaultValue={editTarget.base_unit.id} required>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} — {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Purchase unit">
                <Select name="purchaseUnitId" defaultValue={editTarget.purchase_unit?.id ?? ""}>
                  <option value="">Same as base unit</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} — {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <SectionCard>
              <div className="mb-3 grid gap-1"><Text weight="semibold">Dimensions and BQ conversion</Text><Text size="sm" tone="secondary">Optional rectangular dimensions. Conversion is recalculated on the server.</Text></div>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Length">
                  <Input name="dimensionLength" defaultValue={editTarget.dimension_length?.toString() ?? ""} inputMode="decimal" />
                </Field>
                <Field label="Width">
                  <Input name="dimensionWidth" defaultValue={editTarget.dimension_width?.toString() ?? ""} inputMode="decimal" />
                </Field>
                <Field label="Thickness" description="Optional; excluded from area calculation.">
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
              <Text tone="secondary">
                {editTarget.purchase_to_base_factor
                  ? `Current conversion: 1 ${editTarget.purchase_unit?.code ?? editTarget.base_unit.code} = ${editTarget.purchase_to_base_factor.toString()} ${editTarget.base_unit.code}`
                  : "No dimensional conversion is stored."}
              </Text>
            </SectionCard>

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
