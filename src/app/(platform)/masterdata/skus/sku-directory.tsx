"use client";

import { useState, useTransition } from "react";
import { Archive, Plus, RotateCcw, Trash2 } from "lucide-react";

import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  FormActions,
  InlineError,
  Input,
  SearchField,
  SectionCard,
  Select,
  Spinner,
  StatusBadge,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Text,
  Textarea,
} from "@/platform/ui_engine";
import {
  archiveSkuAction,
  createSkuAction,
  requestSkuDeletionAction,
  restoreSkuAction,
  updateSkuAction,
} from "./actions";

type SkuRow = {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  notes: string | null;
  deleted_at: Date | null;
  brand: { id: string; name: string; slug: string } | null;
  base_unit: { id: string; code: string; name: string };
  purchase_unit: { id: string; code: string; name: string } | null;
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
  materialVendors,
  canManage,
}: {
  skus: SkuRow[];
  brands: Option[];
  units: UnitOption[];
  productCategories: Option[];
  materialVendors: Option[];
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SkuRow | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<SkuRow | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<SkuRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SkuRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [createError, setCreateError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, setEditPending] = useState(false);

  const filtered = skus.filter((sku) => {
    if (brandFilter !== "ALL" && sku.brand?.id !== brandFilter) return false;
    if (categoryFilter !== "ALL" && !sku.categories.some((c) => c.category.id === categoryFilter)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      sku.name.toLowerCase().includes(q) ||
      sku.slug.toLowerCase().includes(q) ||
      (sku.code && sku.code.toLowerCase().includes(q)) ||
      (sku.brand && sku.brand.name.toLowerCase().includes(q))
    );
  });

  const runRowAction = (id: string, run: () => Promise<unknown>) => {
    setPendingId(id);
    startTransition(async () => {
      try {
        await run();
      } finally {
        setPendingId(null);
      }
    });
  };

  return (
    <SectionCard>
      <TableToolbar>
        <div className="flex flex-wrap items-center gap-3">
          <SearchField value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} onClear={() => setQuery("")} placeholder="Search SKUs by name, code, brand..." />
          <div className="w-40">
            <Select value={brandFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBrandFilter(e.target.value)}>
              <option value="ALL">All brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Select value={categoryFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCategoryFilter(e.target.value)}>
              <option value="ALL">All categories</option>
              {productCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </TableToolbar>

      {filtered.length === 0 ? (
        <EmptyState
          title="No SKUs found"
          description={query ? "No items match your search filters." : "Create your first catalog SKU."}
          action={undefined}
        />
      ) : (
        <DataTable minWidth={980}>
          <TableHeader>
            <TableRow>
              <TableHead>SKU &amp; Code</TableHead>
              <TableHead>Brand &amp; Categories</TableHead>
              <TableHead>Units</TableHead>
              <TableHead>Prices</TableHead>
              <TableHead>Status</TableHead>
              <TableHead align="end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <tbody>
            {filtered.map((sku) => {
              const isPending = pendingId === sku.id;
              const isArchived = sku.deleted_at !== null;
              const primaryPrice = sku.material_prices[0];

              return (
                <TableRow key={sku.id}>
                  <TableCell>
                    <TableCellContent
                      primary={<span className="font-semibold">{sku.name}</span>}
                      secondary={
                        <div className="text-xs text-ink-secondary">
                          {sku.code ? <span className="font-mono">{sku.code} • </span> : null}
                          <span className="font-mono">{sku.slug}</span>
                        </div>
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="grid gap-1">
                      {sku.brand ? (
                        <span className="text-xs font-semibold text-ink">{sku.brand.name}</span>
                      ) : (
                        <span className="text-xs text-ink-tertiary">Unbranded</span>
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
                    <div className="text-xs">
                      <div>Base: <span className="font-mono font-medium">{sku.base_unit.code}</span></div>
                      {sku.purchase_unit ? (
                        <div className="text-ink-secondary">Buy: <span className="font-mono">{sku.purchase_unit.code}</span></div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {primaryPrice ? (
                      <div className="text-xs">
                        <span className="font-semibold">{primaryPrice.currency} {Number(primaryPrice.amount).toLocaleString()}</span>
                        <span className="text-ink-secondary"> / {primaryPrice.unit.code}</span>
                        <div className="text-ink-tertiary truncate max-w-[140px]">{primaryPrice.supplier_vendor.name}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-tertiary">No price</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={!isArchived ? "success" : "neutral"}>
                      {!isArchived ? "Active" : "Archived"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell align="end">
                    <div className="flex items-center justify-end gap-1.5">
                      {isPending ? <Spinner /> : null}
                      {canManage && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setEditTarget(sku)} disabled={isPending}>
                            Edit
                          </Button>
                          {!isArchived ? (
                            <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(sku)} disabled={isPending} title="Archive">
                              <Archive size={15} />
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmRestore(sku)} disabled={isPending} title="Restore">
                                <RotateCcw size={15} />
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => setDeleteTarget(sku)} disabled={isPending} title="Request deletion">
                                <Trash2 size={15} />
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </DataTable>
      )}

      {/* Create SKU Dialog adhering to locked invariant */}
      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create catalog SKU"
        description="Register a new material SKU with mandatory category categorization and initial supplier pricing."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setCreatePending(true);
            setCreateError(null);
            const fd = new FormData(e.currentTarget);
            try {
              const res = await createSkuAction(null, fd);
              if (res && "ok" in res && res.ok) {
                setCreateOpen(false);
              } else if (res && "ok" in res && !res.ok) {
                setCreateError(res.error.safeMessage);
              }
            } finally {
              setCreatePending(false);
            }
          }}
          className="grid gap-4 max-h-[80vh] overflow-y-auto pr-1"
        >
          {createError ? <InlineError>{createError}</InlineError> : null}
          <Field label="SKU name" required>
            <Input name="name" required maxLength={128} placeholder="e.g. HPL Natural Teak 0.8mm" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU code / Article #">
              <Input name="code" placeholder="TH-001AA" maxLength={32} />
            </Field>
            <Field label="Brand">
              <Select name="brandId">
                <option value="">Unbranded / Generic</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Base measurement unit" required>
              <Select name="baseUnitId" required>
                <option value="">Select base unit...</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} — {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Purchase unit" description="Optional: purchasing unit if different.">
              <Select name="purchaseUnitId">
                <option value="">Same as base unit</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} — {u.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Product categories" required description="At least one category is required.">
            <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto border border-line rounded p-2 bg-surface-muted/30">
              {productCategories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <input type="checkbox" name="categoryIds" value={c.id} />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          </Field>

          {/* Initial Material Price Box */}
          <div className="border border-line rounded-card p-3 bg-surface-muted/40 grid gap-3">
            <Text size="sm" weight="semibold">Initial supplier &amp; material price</Text>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Supplier vendor" required className="col-span-2">
                <Select name="supplierVendorId" required>
                  <option value="">Select supplier vendor...</option>
                  {materialVendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Price amount" required>
                <Input name="amount" required placeholder="185000" />
              </Field>
              <Field label="Currency" required>
                <Input name="currency" defaultValue="IDR" required maxLength={3} />
              </Field>
            </div>
          </div>

          <Field label="Notes">
            <Textarea name="notes" placeholder="Thickness, sheet dimensions, finish texture..." rows={2} />
          </Field>

          <FormActions>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={createPending}>
              {createPending ? <Spinner /> : "Create SKU"}
            </Button>
          </FormActions>
        </form>
      </Dialog>

      {/* Edit SKU Dialog */}
      {editTarget ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          title={`Edit SKU ${editTarget.name}`}
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
            {editError ? <InlineError>{editError}</InlineError> : null}
            <Field label="SKU name" required>
              <Input name="name" defaultValue={editTarget.name} required maxLength={128} autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU code / Article #">
                <Input name="code" defaultValue={editTarget.code ?? ""} maxLength={32} />
              </Field>
              <Field label="Brand">
                <Select name="brandId" defaultValue={editTarget.brand?.id ?? ""}>
                  <option value="">Unbranded / Generic</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
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

            <Field label="Product categories" required description="At least one category is required.">
              <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto border border-line rounded p-2 bg-surface-muted/30">
                {productCategories.map((c) => {
                  const isChecked = editTarget.categories.some((sc) => sc.category.id === c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                      <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={isChecked} />
                      <span>{c.name}</span>
                    </label>
                  );
                })}
              </div>
            </Field>

            <Field label="Notes">
              <Textarea name="notes" defaultValue={editTarget.notes ?? ""} rows={2} />
            </Field>

            <FormActions>
              <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={editPending}>
                {editPending ? <Spinner /> : "Save changes"}
              </Button>
            </FormActions>
          </form>
        </Dialog>
      ) : null}

      {/* Archive Confirm */}
      {confirmArchive ? (
        <ConfirmDialog
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
            setConfirmArchive(null);
            runRowAction(target.id, () => archiveSkuAction(target.id));
          }}
        />
      ) : null}

      {/* Restore Confirm */}
      {confirmRestore ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmRestore(null);
          }}
          title={`Restore SKU "${confirmRestore.name}"?`}
          description="Restoring this SKU restores its material prices that were archived solely by SKU parent provenance."
          confirmLabel="Restore SKU"
          onConfirm={() => {
            const target = confirmRestore;
            setConfirmRestore(null);
            runRowAction(target.id, () => restoreSkuAction(target.id));
          }}
        />
      ) : null}

      {/* Request Deletion Dialog */}
      {deleteTarget ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title={`Submit SKU "${deleteTarget.name}" for deletion`}
          description="Archived SKUs with zero active quotations can be permanently purged after supervisor approval."
        >
          <div className="grid gap-4">
            <Field label="Reason for deletion">
              <Input
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Discontinued item replaced by another SKU"
              />
            </Field>
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  const target = deleteTarget;
                  const reason = deleteReason;
                  setDeleteTarget(null);
                  setDeleteReason("");
                  runRowAction(target.id, () => requestSkuDeletionAction(target.id, reason));
                }}
              >
                Submit deletion request
              </Button>
            </FormActions>
          </div>
        </Dialog>
      ) : null}
    </SectionCard>
  );
}
