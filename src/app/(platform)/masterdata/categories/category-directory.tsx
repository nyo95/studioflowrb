"use client";
import { RequestDeletionDialog } from "../request-deletion-dialog";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { ConfirmDialog,DirectoryShell,DraftDialog,Pagination,RowActionMenu,Text,usePagination } from "@/platform/ui_engine";


import { Plus } from "lucide-react";
import { useState,useTransition } from "react";

import { Badge,Button,Combobox,DataTable,EmptyState,EntityPrimaryCell,Field,FormActions,InlineError,Input,SearchField,Select,TableBody,TableCell,TableCellContent,TableHead,TableHeader,TableRow,TableToolbar } from "@/platform/ui_engine";
import {
createCategoryAction,
deactivateCategoryAction,
mergeCategoryAction,
requestCategoryDeletionAction,
updateCategoryAction,
} from "./actions";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  kind: "PRODUCT" | "WORK";
  status: "ACTIVE" | "DEACTIVATED";
  merged_into_id: string | null;
  merged_into: { id: string; name: string } | null;
  _count: {
    sku_categories: number;
    brand_categories: number;
    material_labor_prices: number;
    labor_prices: number;
  };
};

export function CategoryDirectory({
  categories,
  canManage,
}: {
  categories: CategoryRow[];
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CategoryRow | null>(null);
  const [mergeTarget, setMergeTarget] = useState<CategoryRow | null>(null);
  const [mergeDestinationId, setMergeDestinationId] = useState<string>("");
  const [confirmDeactivate, setConfirmDeactivate] = useState<CategoryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [createError, setCreateError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, setEditPending] = useState(false);

  const filtered = categories.filter((c) => {
    if (kindFilter !== "ALL" && c.kind !== kindFilter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
  });
  const { locale } = useDisplaySettings();
  const [sortKey, setSortKey] = useState<"Name" | "Category" | "Kind" | "Status">("Name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const sortValues: Record<"Name" | "Category" | "Kind" | "Status", (r: CategoryRow) => string | number | null> = {"Name": (r) => r.name, "Category": (r) => r.name, "Kind": (r) => r.kind, "Status": (r) => r.status};
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const orderedRows = [...filtered].sort((a, b) => {
    const left = sortValues[sortKey](a), right = sortValues[sortKey](b);
    if (left === null || right === null) return left === right ? a.id.localeCompare(b.id) : left === null ? 1 : -1;
    const result = typeof left === "number" && typeof right === "number" ? left - right : collator.compare(String(left), String(right));
    return (sortDirection === "asc" ? result : -result) || a.id.localeCompare(b.id);
  });
  const paging = usePagination(orderedRows.length, 25, JSON.stringify([query, kindFilter, sortKey, sortDirection]));
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

  return (
    <DirectoryShell fill header={rowError ? <InlineError>{rowError}</InlineError> : undefined} surface pagination={pageFooter} toolbar={<TableToolbar framed={false} actions={canManage ? (
        <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" />
          <span>New category</span>
        </Button>
      ) : undefined}>
        <SearchField value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} onClear={() => setQuery("")} placeholder="Search categories..." />
        <div className="w-40">
          <Select value={kindFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setKindFilter(e.target.value)}>
            <option value="ALL">All kinds</option>
            <option value="PRODUCT">Product categories</option>
            <option value="WORK">Work categories</option>
          </Select>
        </div>
      </TableToolbar>}>


      {filtered.length === 0 ? (
        <EmptyState
          title="No categories found"
          description={query ? "No categories match your search filters." : "Create the first category."}

        />
      ) : (
        <DataTable framed={false} density="compact" stickyHeader fill minWidth={720}>
          <TableHeader>
            <TableRow>
              <TableHead>Name &amp; Slug</TableHead>
              <TableHead sortable sortDirection={sortKey === "Kind" ? sortDirection : null} onSortChange={(direction) => { setSortKey("Kind"); setSortDirection(direction); }}>Kind</TableHead>
              <TableHead align="end">Usage count</TableHead>
              <TableHead stickyEnd align="end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((category) => {
              const totalUsage =
                category._count.sku_categories +
                category._count.brand_categories +
                category._count.material_labor_prices +
                category._count.labor_prices;
              const isPending = pendingId === category.id;

              return (
                <TableRow key={category.id}>
                  <TableCell>
                    <EntityPrimaryCell
                      tone={category.status === "ACTIVE" ? "success" : "danger"}
                      statusLabel={category.status === "ACTIVE" ? "Active" : "Deactivated"}
                      name={category.name}
                      secondary={
                        <span className="font-ui-mono text-xs text-ink-secondary">
                          {category.slug}
                          {category.merged_into ? ` (Merged into ${category.merged_into.name})` : ""}
                        </span>
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Badge tone={category.kind === "PRODUCT" ? "neutral" : "warning"}>
                      {category.kind === "PRODUCT" ? "Product" : "Work"}
                    </Badge>
                  </TableCell>
                  <TableCell align="end">
                    <TableCellContent align="end" primary={totalUsage.toLocaleString()} />
                  </TableCell>
                  <TableCell stickyEnd align="end">
                    <RowActionMenu label={`Actions for ${category.name}`} pending={pendingId === category.id} items={[...[],...(isPending ? [] : []),...[],...(canManage && category.status === "ACTIVE" ? [...[],...[{ label: "Edit", onSelect: () => setEditTarget(category), disabled: isPending, danger: false, separatorBefore: false }],...[],...[{ label: "Merge into another category", onSelect: () => setMergeTarget(category), disabled: isPending, danger: false, separatorBefore: false }],...[],...[{ label: "Deactivate", onSelect: () => setConfirmDeactivate(category), disabled: isPending, danger: false, separatorBefore: false }],...[]] : []),...[],...(canManage && category.status === "DEACTIVATED" ? [{ label: "Request deletion", onSelect: () => setDeleteTarget(category), disabled: isPending, danger: true, separatorBefore: true }] : []),...[]]} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </DataTable>
      )}

      {/* Create Dialog */}
      <DraftDialog pending={createPending}
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create category"
        description="Add a new PRODUCT category (for SKUs and Brands) or WORK category (for labor & work pricing)."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setCreatePending(true);
            setCreateError(null);
            const fd = new FormData(e.currentTarget);
            try {
              const res = await createCategoryAction(null, fd);
              if (res && "ok" in res && res.ok) {
                setCreateOpen(false);
              } else if (res && "ok" in res && !res.ok) {
                setCreateError(res.error.safeMessage);
              }
            } finally {
              setCreatePending(false);
            }
          }}
          className="grid gap-4"
        >
          {createError ? <InlineError>{createError}</InlineError> : null}
          <Field label="Category kind" required description="Kind cannot be changed after creation.">
            <Select name="kind" defaultValue="PRODUCT" required>
              <option value="PRODUCT">PRODUCT — Catalog items &amp; Brands</option>
              <option value="WORK">WORK — Labor &amp; Material+Labor pricing</option>
            </Select>
          </Field>
          <Field label="Category name" required description="Display label (e.g. Solid Wood, HPL, Flooring).">
            <Input name="name" required maxLength={64} placeholder="Solid Wood" autoFocus />
          </Field>
          <FormActions>
            <Button data-dialog-cancel type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" pending={createPending}>
              {"Create category"}
            </Button>
          </FormActions>
        </form>
      </DraftDialog>

      {/* Edit Dialog */}
      {editTarget ? (
        <DraftDialog pending={editPending}
          open
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          title={`Edit category ${editTarget.name}`}
          description="Update display name."
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setEditPending(true);
              setEditError(null);
              const fd = new FormData(e.currentTarget);
              try {
                const res = await updateCategoryAction(null, fd);
                if (res && "ok" in res && res.ok) {
                  setEditTarget(null);
                } else if (res && "ok" in res && !res.ok) {
                  setEditError(res.error.safeMessage);
                }
              } finally {
                setEditPending(false);
              }
            }}
            className="grid gap-4"
          >
            <input type="hidden" name="categoryId" value={editTarget.id} />
            {editError ? <InlineError>{editError}</InlineError> : null}
            <Field label="Category name" required>
              <Input name="name" defaultValue={editTarget.name} required maxLength={64} autoFocus />
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

      {/* Merge Dialog */}
      {mergeTarget ? (
        <DraftDialog
          open
          onOpenChange={(open) => {
            if (!open) setMergeTarget(null);
          }}
          title={`Merge "${mergeTarget.name}" into another category`}
          description={`All SKUs, Brands, and Prices referencing "${mergeTarget.name}" will be atomically moved to the destination category, and this category will be deactivated.`}
        >
          <div className="grid gap-4">
            <Field label="Destination category" required description={`Must be an active ${mergeTarget.kind} category.`}>
              <Combobox label="Destination category" options={categories.filter((category) => category.id !== mergeTarget.id && category.kind === mergeTarget.kind && category.status === "ACTIVE").map((category) => ({ id: category.id, label: category.name }))} value={mergeDestinationId} onValueChange={setMergeDestinationId} placeholder="Search target category" searchPlaceholder="Search active categories…" />
            </Field>
            <FormActions>
              <Button data-dialog-cancel type="button" variant="ghost" onClick={() => setMergeTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!mergeDestinationId}
                onClick={() => {
                  const sourceId = mergeTarget.id;
                  const targetId = mergeDestinationId;


                  runRowAction(sourceId, () => mergeCategoryAction(sourceId, targetId), () => { setMergeTarget(null); setMergeDestinationId(""); });
                }}
              >
                Execute merge
              </Button>
            </FormActions>
          </div>
        </DraftDialog>
      ) : null}

      {/* Deactivate Confirm */}
      {confirmDeactivate ? (
        <ConfirmDialog open
          onOpenChange={(open) => {
            if (!open) setConfirmDeactivate(null);
          }}
          title={`Deactivate category "${confirmDeactivate.name}"?`}
          description="Deactivated categories cannot be selected for new SKUs or Brands. To consolidate records, consider Merging instead." tone="danger" confirmLabel="Deactivate" error={rowError} pending={pendingId !== null} onConfirm={() => {
                const target = confirmDeactivate;

                runRowAction(target.id, () => deactivateCategoryAction(target.id), () => { setConfirmDeactivate(null); });
              }} />
      ) : null}

      {/* Request Deletion Dialog */}
      {deleteTarget ? (
        <RequestDeletionDialog open onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }} title={`Submit category "${deleteTarget.name}" for deletion`} description="Deactivated categories with zero remaining dependencies can be permanently purged after approval by a user with the deletion approval permission." reason={deleteReason} onReasonChange={setDeleteReason} placeholder="e.g. Empty test category created in error" pending={pendingId !== null} error={rowError} onSubmit={() => {
                  const target = deleteTarget;
                  const reason = deleteReason;


                  runRowAction(target.id, () => requestCategoryDeletionAction(target.id, reason), () => { setDeleteTarget(null); setDeleteReason(""); });
                }} />
      ) : null}
    </DirectoryShell>
  );
}
