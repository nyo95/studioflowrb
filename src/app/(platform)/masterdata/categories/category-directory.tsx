"use client";

import { useState, useTransition } from "react";
import { GitMerge, Plus, PowerOff, Trash2 } from "lucide-react";

import {
  Badge,
  Button,
  Combobox,
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
} from "@/platform/ui_engine";
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
      <TableToolbar actions={canManage ? (
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
      </TableToolbar>

      {filtered.length === 0 ? (
        <EmptyState
          title="No categories found"
          description={query ? "No categories match your search filters." : "Create the first category."}
          action={!query && canManage ? (
            <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" />
              <span>New category</span>
            </Button>
          ) : undefined}
        />
      ) : (
        <DataTable minWidth={800}>
          <TableHeader>
            <TableRow>
              <TableHead>Name &amp; Slug</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Status</TableHead>
              <TableHead align="end">Usage count</TableHead>
              <TableHead align="end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <tbody>
            {filtered.map((category) => {
              const totalUsage =
                category._count.sku_categories +
                category._count.brand_categories +
                category._count.material_labor_prices +
                category._count.labor_prices;
              const isPending = pendingId === category.id;

              return (
                <TableRow key={category.id}>
                  <TableCell>
                    <TableCellContent
                      primary={<span className="font-semibold">{category.name}</span>}
                      secondary={
                        <span className="font-mono text-xs text-ink-secondary">
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
                  <TableCell>
                    <StatusBadge tone={category.status === "ACTIVE" ? "success" : "neutral"}>
                      {category.status === "ACTIVE" ? "Active" : "Deactivated"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell align="end">
                    <TableCellContent primary={totalUsage.toLocaleString()} />
                  </TableCell>
                  <TableCell align="end">
                    <div className="flex items-center justify-end gap-1.5">
                      {isPending ? <Spinner /> : null}
                      {canManage && category.status === "ACTIVE" && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setEditTarget(category)} disabled={isPending}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setMergeTarget(category)} disabled={isPending} title="Merge into another category">
                            <GitMerge size={15} />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDeactivate(category)} disabled={isPending} title="Deactivate">
                            <PowerOff size={15} />
                          </Button>
                        </>
                      )}
                      {canManage && category.status === "DEACTIVATED" && (
                        <Button size="sm" variant="danger" onClick={() => setDeleteTarget(category)} disabled={isPending} title="Request deletion">
                          <Trash2 size={15} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </DataTable>
      )}

      {/* Create Dialog */}
      <Dialog
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
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={createPending}>
              {createPending ? <Spinner /> : "Create category"}
            </Button>
          </FormActions>
        </form>
      </Dialog>

      {/* Edit Dialog */}
      {editTarget ? (
        <Dialog
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

      {/* Merge Dialog */}
      {mergeTarget ? (
        <Dialog
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
              <Button type="button" variant="ghost" onClick={() => setMergeTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!mergeDestinationId}
                onClick={() => {
                  const sourceId = mergeTarget.id;
                  const targetId = mergeDestinationId;
                  setMergeTarget(null);
                  setMergeDestinationId("");
                  runRowAction(sourceId, () => mergeCategoryAction(sourceId, targetId));
                }}
              >
                Execute merge
              </Button>
            </FormActions>
          </div>
        </Dialog>
      ) : null}

      {/* Deactivate Confirm */}
      {confirmDeactivate ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmDeactivate(null);
          }}
          title={`Deactivate category "${confirmDeactivate.name}"?`}
          description="Deactivated categories cannot be selected for new SKUs or Brands. To consolidate records, consider Merging instead."
        >
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => setConfirmDeactivate(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                const target = confirmDeactivate;
                setConfirmDeactivate(null);
                runRowAction(target.id, () => deactivateCategoryAction(target.id));
              }}
            >
              Deactivate category
            </Button>
          </FormActions>
        </Dialog>
      ) : null}

      {/* Request Deletion Dialog */}
      {deleteTarget ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title={`Submit category "${deleteTarget.name}" for deletion`}
          description="Deactivated categories with zero remaining dependencies can be permanently purged after approval by a user with the deletion approval permission."
        >
          <div className="grid gap-4">
            <Field label="Reason for deletion">
              <Input
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Empty test category created in error"
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
                  runRowAction(target.id, () => requestCategoryDeletionAction(target.id, reason));
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
