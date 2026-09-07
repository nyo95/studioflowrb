"use client";
import { RequestDeletionDialog } from "../request-deletion-dialog";
import { UpdatedCell } from "../updated-cell";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { DirectoryShell,DraftDialog,Pagination,RowActionMenu,RowActionsCell,RowActionsHead,Text,usePagination } from "@/platform/ui_engine";
﻿

import { Plus } from "lucide-react";
import { useRef,useState,useTransition } from "react";

import { Button,ConfirmDialog,CreatableMultiSelect,CreatableSearch,DataTable,Dialog,EmptyState,EntityPrimaryCell,Field,FormActions,InlineError,Input,Notice,SearchField,Select,SimpleTextEditor,TableBody,TableCell,TableCellContent,TableHead,TableHeader,TableRow,TableToolbar,useFormDraftGuard,useOptionOverlay } from "@/platform/ui_engine";
import { createCategoryAction } from "../categories/actions";
import {
archiveBrandAction,
createBrandAction,
createOwnerVendorQuickAction,
requestBrandDeletionAction,
restoreBrandAction,
updateBrandAction,
} from "./actions";
import { normalizeBrandLinks,normalizeBrandLinkUrl,type BrandLinkDraft } from "./brand-link-input";

type BrandRow = {
  id: string;
  name: string;
  slug: string;
  notes: string | null;
  updated_at: Date;
  updated_by_label: string | null;
  deleted_at: Date | null;
  owner_vendor: { id: string; name: string } | null;
  categories: Array<{
    category: { id: string; name: string; slug: string };
    origins: Array<{ kind: "MANUAL" | "SKU_ENRICHMENT" }>;
  }>;
  hashtags: Array<{ id: string; label: string; normalized: string }>;
  links: Array<{ id: string; kind: string; url: string; label: string | null }>;
  suppliers: Array<{ id: string; vendor: { id: string; name: string } }>;
  _count: { skus: number; suppliers: number; links: number; categories: number };
};

type Option = { id: string; name: string };

function DiscoverySummary({ values, limit }: { values: string[]; limit: number }) {
 return <span className="block max-w-44 truncate text-xs text-ink-secondary" title={values.join(", ")} aria-label={values.join(", ") || "None"}>{values.slice(0, limit).join(", ") || "—"}{values.length > limit ? ` +${values.length - limit}` : ""}</span>;
}

export function BrandDirectory({
  brands,
  productCategories,
  materialVendors,
  canManage,
  canManageVendors,
  canManageCategories,
}: {
  brands: BrandRow[];
  productCategories: Option[];
  materialVendors: Option[];
  canManage: boolean;
  canManageVendors: boolean;
  canManageCategories: boolean;
}) {
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraftKey, setCreateDraftKey] = useState(0);
  const [editTarget, setEditTarget] = useState<BrandRow | null>(null);
  const [createOwnerVendorId, setCreateOwnerVendorId] = useState("");
  const [editOwnerVendorId, setEditOwnerVendorId] = useState("");
  const [createCategoryIds, setCreateCategoryIds] = useState<string[]>([]);
  const [editCategoryIds, setEditCategoryIds] = useState<string[]>([]);
  const [createHashtags, setCreateHashtags] = useState<string[]>([]);
  const [editHashtags, setEditHashtags] = useState<string[]>([]);
  const [createSupplierIds, setCreateSupplierIds] = useState<string[]>([]);
  const [editSupplierIds, setEditSupplierIds] = useState<string[]>([]);
  const [confirmArchive, setConfirmArchive] = useState<BrandRow | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<BrandRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BrandRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Form links state for create/edit
  const [linksList, setLinksList] = useState<BrandLinkDraft[]>([]);
  const [newLinkKind, setNewLinkKind] = useState("WEBSITE");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const [createError, setCreateError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, setEditPending] = useState(false);
  const [createNameWarning, setCreateNameWarning] = useState<string | null>(null);
  const [editNameWarning, setEditNameWarning] = useState<string | null>(null);
  const { options: ownerVendors, upsertOverlayOption } = useOptionOverlay(materialVendors);
  const { options: categoryOptions, upsertOverlayOption: upsertCategoryOption } = useOptionOverlay(productCategories);
  const createFormRef = useRef<HTMLFormElement>(null);
  const editFormRef = useRef<HTMLFormElement>(null);
  const createDraftGuard = useFormDraftGuard({
    formRef: createFormRef,
    resetKey: createDraftKey,
    active: createOpen,
    watchedValue: JSON.stringify([createOwnerVendorId, createCategoryIds, createHashtags, createSupplierIds, linksList, newLinkKind, newLinkUrl, newLinkLabel]),
    title: "Discard brand draft?",
    description: "Your changes are only in this browser and have not been saved.",
  });
  const editDraftGuard = useFormDraftGuard({
    formRef: editFormRef,
    resetKey: editTarget?.id ?? "",
    active: Boolean(editTarget),
    watchedValue: JSON.stringify([editOwnerVendorId, editCategoryIds, editHashtags, editSupplierIds, linksList, newLinkKind, newLinkUrl, newLinkLabel]),
    title: "Discard changes?",
    description: "Your edits are only in this browser and have not been saved.",
  });

  const filtered = brands.filter((b) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      b.slug.toLowerCase().includes(q) ||
      b.hashtags.some((h) => h.label.toLowerCase().includes(q) || h.normalized.includes(q)) ||
      b.categories.some((c) => c.category.name.toLowerCase().includes(q))
    );
  });
  const { locale, timezone } = useDisplaySettings();
  const [sortKey, setSortKey] = useState<"Brand" | "SKUs" | "Suppliers" | "Resources">("Brand");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const sortValues: Record<"Brand" | "SKUs" | "Suppliers" | "Resources", (r: BrandRow) => string | number | null> = {"Brand": (r) => r.name, "SKUs": (r) => r._count.skus, "Suppliers": (r) => r._count.suppliers, "Resources": (r) => r._count.links};
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

  const checkSimilarBrandName = (name: string, excludeId?: string): string | null => {
    if (name.trim().length < 3) return null;
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const input = norm(name);
    const similar = brands
      .filter((b) => b.id !== excludeId)
      .find((b) => {
        const existing = norm(b.name);
        if (existing === input) return true;
        if (existing.length >= 4 && input.length >= 4) {
          if (existing.startsWith(input.slice(0, 4)) || input.startsWith(existing.slice(0, 4))) return true;
          if (existing.includes(input) || input.includes(existing)) return true;
        }
        return false;
      });
    return similar ? `Potential duplicate: a similar brand "${similar.name}" already exists.` : null;
  };

  const openCreateDialog = () => {
    setLinksList([]);
    setNewLinkUrl("");
    setNewLinkLabel("");
    setLinkError(null);
    setCreateOwnerVendorId("");
    setCreateCategoryIds([]);
    setCreateHashtags([]);
    setCreateSupplierIds([]);
    setCreateNameWarning(null);
    setCreateDraftKey((key) => key + 1);
    setCreateOpen(true);
  };

  const openEditDialog = (brand: BrandRow) => {
    setLinksList(brand.links.map((l) => ({ kind: l.kind, url: l.url, label: l.label ?? "" })));
    setNewLinkUrl("");
    setNewLinkLabel("");
    setLinkError(null);
    setEditOwnerVendorId(brand.owner_vendor?.id ?? "");
    setEditCategoryIds(brand.categories.map((item) => item.category.id));
    setEditHashtags(brand.hashtags.map((item) => item.label));
    setEditSupplierIds(brand.suppliers.map((item) => item.vendor.id));
    setEditNameWarning(null);
    setEditTarget(brand);
  };

  const addLink = () => {
    const normalizedUrl = normalizeBrandLinkUrl(newLinkUrl);
    if (!normalizedUrl.ok) {
      setLinkError(normalizedUrl.error);
      return;
    }
    setLinkError(null);
    setLinksList([...linksList, { kind: newLinkKind, url: normalizedUrl.value, label: newLinkLabel.trim() }]);
    setNewLinkUrl("");
    setNewLinkLabel("");
  };

  const removeLink = (index: number) => {
    setLinksList(linksList.filter((_, i) => i !== index));
  };

  const createOwnerVendor = async (name: string, setError: (error: string | null) => void) => {
    setError(null);
    const result = await createOwnerVendorQuickAction(name);
    if (!result.ok) {
      setError(result.error.safeMessage);
      return;
    }
    const option = { id: result.data.vendorId, name: name.trim() };
    upsertOverlayOption(option);
    return option.id;
  };

  const createProductCategory = async (name: string, setError: (error: string | null) => void) => {
    setError(null);
    const formData = new FormData();
    formData.set("name", name);
    formData.set("kind", "PRODUCT");
    const result = await createCategoryAction(null, formData);
    if (!result.ok) {
      setError(result.error.safeMessage);
      return;
    }
    const option = { id: result.data.categoryId, name: name.trim() };
    upsertCategoryOption(option);
    return option.id;
  };

  const hashtagOptions = (hashtags: readonly string[]) => hashtags.map((tag) => ({ id: tag, label: tag.startsWith("#") ? tag : `#${tag}` }));

  return (
    <DirectoryShell fill header={rowError ? <InlineError>{rowError}</InlineError> : undefined} surface pagination={pageFooter} toolbar={<TableToolbar framed={false} actions={canManage ? (
          <Button
            type="button"
            variant="primary"
            leadingIcon={<Plus aria-hidden="true" />}
            onClick={openCreateDialog}
          >
            New brand
          </Button>
      ) : undefined}>
        <SearchField value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} onClear={() => setQuery("")} placeholder="Search brands by name, hashtag, category..." />
      </TableToolbar>}>


      {filtered.length === 0 ? (
        <EmptyState
          title="No brands found"
          description={query ? "No brands match your search query." : "Add your first catalog brand."}

        />
      ) : (
        <DataTable framed={false} density="compact" stickyHeader fill minWidth={1258} className="table-fixed">
          <TableHeader>
            <TableRow><TableHead style={{ width: 240 }}  sortable sortDirection={sortKey === "Brand" ? sortDirection : null} onSortChange={(direction) => { setSortKey("Brand"); setSortDirection(direction); }}>Brand</TableHead>
<TableHead style={{ width: 180 }}  >Categories</TableHead>
<TableHead style={{ width: 160 }}  >Hashtags</TableHead>
<TableHead style={{ width: 180 }}  >Owner</TableHead>
<TableHead style={{ width: 90 }} align="end" sortable sortDirection={sortKey === "Suppliers" ? sortDirection : null} onSortChange={(direction) => { setSortKey("Suppliers"); setSortDirection(direction); }}>Suppliers</TableHead>
<TableHead style={{ width: 90 }} align="end" sortable sortDirection={sortKey === "Resources" ? sortDirection : null} onSortChange={(direction) => { setSortKey("Resources"); setSortDirection(direction); }}>Resources</TableHead>
<TableHead style={{ width: 90 }} align="end" sortable sortDirection={sortKey === "SKUs" ? sortDirection : null} onSortChange={(direction) => { setSortKey("SKUs"); setSortDirection(direction); }}>SKUs</TableHead>
<TableHead style={{ width: 180 }}>Updated</TableHead>
<RowActionsHead /></TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((brand) => {
              const isPending = pendingId === brand.id;
              const isArchived = brand.deleted_at !== null;

              return (
                <TableRow key={brand.id}>
 <TableCell wrap><EntityPrimaryCell tone={isArchived ? "danger" : "success"} statusLabel={isArchived ? "Archived" : "Active"} name={brand.name} /></TableCell>
 <TableCell><DiscoverySummary values={brand.categories.map(c => c.category.name)} limit={3} /></TableCell>
 <TableCell><DiscoverySummary values={brand.hashtags.map(h => `#${h.label.replace(/^#/, "")}`)} limit={2} /></TableCell>
 <TableCell wrap><TableCellContent primary={brand.owner_vendor?.name ?? "—"} primaryLines={2} /></TableCell>
 <TableCell align="end">{brand._count.suppliers.toLocaleString(locale)}</TableCell>
 <TableCell align="end">{brand._count.links.toLocaleString(locale)}</TableCell>
 <TableCell align="end">{brand._count.skus.toLocaleString(locale)}</TableCell>
 <UpdatedCell at={brand.updated_at} by={brand.updated_by_label} />
 <RowActionsCell>
                    <RowActionMenu label={`Actions for ${brand.name}`} pending={pendingId === brand.id} items={[...[],...(isPending ? [] : []),...[],...(canManage ? [...[],...[{ label: "Edit", onSelect: () => openEditDialog(brand), disabled: isPending, danger: false, separatorBefore: false }],...[],...(!isArchived ? [{ label: "Archive", onSelect: () => setConfirmArchive(brand), disabled: isPending, danger: false, separatorBefore: false }] : [...[],...[{ label: "Restore", onSelect: () => setConfirmRestore(brand), disabled: isPending, danger: false, separatorBefore: false }],...[],...[{ label: "Request deletion", onSelect: () => setDeleteTarget(brand), disabled: isPending, danger: true, separatorBefore: true }],...[]]),...[]] : []),...[]]} />
                  </RowActionsCell></TableRow>
              );
            })}
          </TableBody>
        </DataTable>
      )}

      {/* Create Brand Dialog */}
      <Dialog size="lg"
        open={createOpen}
        onOpenChange={(open) => {
          if (open) setCreateOpen(true);
          else if (!createPending) void createDraftGuard.requestDiscard(() => setCreateOpen(false));
        }}
        title="Create catalog brand"
        description="Register an independent catalog brand and its discovery profile."
        dismissible={!createPending}
      >
        <form
          ref={createFormRef}
          onChange={createDraftGuard.onFormChange}
          onSubmit={async (e) => {
            e.preventDefault();
            setCreateError(null);
            const normalizedLinks = normalizeBrandLinks(linksList);
            if (!normalizedLinks.ok) {
              setCreateError(normalizedLinks.error);
              return;
            }
            setCreatePending(true);
            const fd = new FormData(e.currentTarget);
            fd.set("linksJson", JSON.stringify(normalizedLinks.value));
            try {
              const res = await createBrandAction(null, fd);
              if (res && "ok" in res && res.ok) {
                setCreateOpen(false);
              } else if (res && "ok" in res && !res.ok) {
                setCreateError(res.error.safeMessage);
              }
            } finally {
              setCreatePending(false);
            }
          }}
          className="grid gap-4  pr-1"
        >
          {createError ? <InlineError>{createError}</InlineError> : null}
          <Field label="Brand name" required>
            <Input name="name" required maxLength={64} placeholder="e.g. TACO, Blum, Hafele" autoFocus onChange={(e) => setCreateNameWarning(checkSimilarBrandName(e.target.value))} />
          </Field>
          {createNameWarning ? (
            <Notice tone="warning">{createNameWarning}</Notice>
          ) : null}
          <input type="hidden" name="ownerVendorId" value={createOwnerVendorId} />
          {createCategoryIds.map((id) => <input key={id} type="hidden" name="categoryIds" value={id} />)}
          {createSupplierIds.map((id) => <input key={id} type="hidden" name="supplierIds" value={id} />)}
          <input type="hidden" name="hashtags" value={createHashtags.join(" ")} />
          <Field label="Owner supplier" description="Optional registered manufacturer or brand owner supplier.">
            <CreatableSearch
              label="Owner supplier"
              options={ownerVendors.map((vendor) => ({ id: vendor.id, label: vendor.name }))}
              value={createOwnerVendorId}
              onValueChange={setCreateOwnerVendorId}
              placeholder="Select an owner supplier"
              onCreate={canManageVendors ? (name) => createOwnerVendor(name, setCreateError) : undefined}
              createLabel={(name) => `Create owner supplier "${name}"`}
            />
          </Field>
          <Field label="Hashtags" description="Search existing discovery tags or add a new one, such as #laminate or #finish.">
            <CreatableMultiSelect label="Hashtags" options={hashtagOptions(createHashtags)} value={createHashtags} onValueChange={setCreateHashtags} onCreate={(tag) => tag.trim()} placeholder="Add hashtags" createLabel={(tag) => `Add hashtag "${tag}"`} />
          </Field>
          <Field label="Product categories" description="Search a discovery category or create a missing one.">
            <CreatableMultiSelect label="Product categories" options={categoryOptions.map((category) => ({ id: category.id, label: category.name }))} value={createCategoryIds} onValueChange={setCreateCategoryIds} onCreate={canManageCategories ? (name) => createProductCategory(name, setCreateError) : undefined} createLabel={(name) => `Create product category "${name}"`} />
          </Field>
          <Field label="Suppliers" description="Organizations that supply this Brand. Managed here and shown read-only on Supplier.">
            <CreatableMultiSelect label="Suppliers" options={ownerVendors.map((vendor) => ({ id: vendor.id, label: vendor.name }))} value={createSupplierIds} onValueChange={setCreateSupplierIds} placeholder="Select suppliers" />
          </Field>
          {/* Links builder */}
          <div className="grid gap-2 border-t border-line pt-3">
            <Text size="sm" weight="semibold">External links (Catalogs, Website)</Text>
            {linksList.map((link, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs bg-surface-muted p-2 rounded">
                <span className="font-ui-mono">{link.kind}: {link.label || link.url}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => removeLink(idx)}>Remove</Button>
              </div>
            ))}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <div className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
                <Select value={newLinkKind} onChange={(e) => setNewLinkKind(e.target.value)} className="w-full">
                  <option value="WEBSITE">Website</option>
                  <option value="CATALOG">Catalog</option>
                  <option value="INSTAGRAM">Instagram</option>
                  <option value="DOCS">Docs</option>
                </Select>
                <Input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="example.com or https://..." className="min-w-0" />
                <Input value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} placeholder="Label (optional)" className="min-w-0 sm:col-span-2" />
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={addLink}>Add</Button>
            </div>
            {linkError ? <InlineError>{linkError}</InlineError> : null}
          </div>

          <Field label="Notes">
            <SimpleTextEditor name="notes" placeholder="Additional specifications, authorized distributors, etc." rows={2} />
          </Field>

          <FormActions>
            <Button type="button" variant="ghost" onClick={() => void createDraftGuard.requestDiscard(() => setCreateOpen(false))}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" pending={createPending}>
              {"Create brand"}
            </Button>
          </FormActions>
        </form>
      </Dialog>
      {createDraftGuard.confirmDialog}

      {/* Edit Brand Dialog */}
      {editTarget ? (
        <Dialog size="lg"
          open
          onOpenChange={(open) => {
            if (!open && !editPending) void editDraftGuard.requestDiscard(() => setEditTarget(null));
          }}
          title={`Edit brand ${editTarget.name}`}
          description="Update brand identity, catalog discovery, and supplier relationships."
          dismissible={!editPending}
        >
          <form
            ref={editFormRef}
            onChange={editDraftGuard.onFormChange}
            onSubmit={async (e) => {
              e.preventDefault();
              setEditError(null);
              const normalizedLinks = normalizeBrandLinks(linksList);
              if (!normalizedLinks.ok) {
                setEditError(normalizedLinks.error);
                return;
              }
              setEditPending(true);
              const fd = new FormData(e.currentTarget);
              fd.set("linksJson", JSON.stringify(normalizedLinks.value));
              try {
                const res = await updateBrandAction(null, fd);
                if (res && "ok" in res && res.ok) {
                  setEditTarget(null);
                } else if (res && "ok" in res && !res.ok) {
                  setEditError(res.error.safeMessage);
                }
              } finally {
                setEditPending(false);
              }
            }}
            className="grid gap-4  pr-1"
          >
            <input type="hidden" name="brandId" value={editTarget.id} />
            {editCategoryIds.map((id) => <input key={id} type="hidden" name="categoryIds" value={id} />)}
            {editSupplierIds.map((id) => <input key={id} type="hidden" name="supplierIds" value={id} />)}
            <input type="hidden" name="hashtags" value={editHashtags.join(" ")} />
            {editError ? <InlineError>{editError}</InlineError> : null}
            <Field label="Brand name" required>
              <Input name="name" defaultValue={editTarget.name} required maxLength={64} autoFocus onChange={(e) => setEditNameWarning(checkSimilarBrandName(e.target.value, editTarget.id))} />
            </Field>
            {editNameWarning ? (
              <Notice tone="warning">{editNameWarning}</Notice>
            ) : null}
            <input type="hidden" name="ownerVendorId" value={editOwnerVendorId} />
          <Field label="Owner supplier" description="Optional registered manufacturer or brand owner supplier.">
              <CreatableSearch
                label="Owner supplier"
                options={ownerVendors.map((vendor) => ({ id: vendor.id, label: vendor.name }))}
                value={editOwnerVendorId}
                onValueChange={setEditOwnerVendorId}
                placeholder="Select an owner supplier"
                onCreate={canManageVendors ? (name) => createOwnerVendor(name, setEditError) : undefined}
                createLabel={(name) => `Create owner supplier "${name}"`}
              />
            </Field>
            <Field label="Hashtags" description="Search existing discovery tags or add a new one.">
              <CreatableMultiSelect label="Hashtags" options={hashtagOptions(editHashtags)} value={editHashtags} onValueChange={setEditHashtags} onCreate={(tag) => tag.trim()} placeholder="Add hashtags" createLabel={(tag) => `Add hashtag "${tag}"`} />
            </Field>
            <Field label="Product categories" description="Manual selections keep their own provenance.">
              <CreatableMultiSelect label="Product categories" options={categoryOptions.map((category) => ({ id: category.id, label: category.name }))} value={editCategoryIds} onValueChange={setEditCategoryIds} onCreate={canManageCategories ? (name) => createProductCategory(name, setEditError) : undefined} createLabel={(name) => `Create product category "${name}"`} />
            </Field>
            <Field label="Suppliers" description="Organizations that supply this Brand. Changes are reflected read-only on Supplier.">
              <CreatableMultiSelect label="Suppliers" options={ownerVendors.map((vendor) => ({ id: vendor.id, label: vendor.name }))} value={editSupplierIds} onValueChange={setEditSupplierIds} placeholder="Select suppliers" />
            </Field>
            {/* Links builder */}
            <div className="grid gap-2 border-t border-line pt-3">
              <Text size="sm" weight="semibold">External links</Text>
              {linksList.map((link, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs bg-surface-muted p-2 rounded">
                  <span className="font-ui-mono">{link.kind}: {link.label || link.url}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeLink(idx)}>Remove</Button>
                </div>
              ))}
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                <div className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
                  <Select value={newLinkKind} onChange={(e) => setNewLinkKind(e.target.value)} className="w-full">
                    <option value="WEBSITE">Website</option>
                    <option value="CATALOG">Catalog</option>
                    <option value="INSTAGRAM">Instagram</option>
                    <option value="DOCS">Docs</option>
                  </Select>
                  <Input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="example.com or https://..." className="min-w-0" />
                  <Input value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} placeholder="Label (optional)" className="min-w-0 sm:col-span-2" />
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={addLink}>Add</Button>
              </div>
              {linkError ? <InlineError>{linkError}</InlineError> : null}
            </div>

            <Field label="Notes">
              <SimpleTextEditor name="notes" defaultValue={editTarget.notes ?? ""} rows={2} />
            </Field>

            {editTarget.updated_by_label ? (
              <p className="text-xs text-ink-tertiary px-0.5">
                Updated by <span className="font-medium text-ink-secondary">{editTarget.updated_by_label}</span> · {new Intl.DateTimeFormat(locale, { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(editTarget.updated_at)}
              </p>
            ) : null}
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => void editDraftGuard.requestDiscard(() => setEditTarget(null))}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" pending={editPending}>
                {"Save changes"}
              </Button>
            </FormActions>
          </form>
        </Dialog>
      ) : null}
      {editDraftGuard.confirmDialog}

      {/* Archive Confirm */}
      {confirmArchive ? (
        <ConfirmDialog error={rowError} pending={pendingId !== null}
          open
          onOpenChange={(open) => {
            if (!open) setConfirmArchive(null);
          }}
          title={`Archive brand "${confirmArchive.name}"?`}
          description="Archiving this Brand also archives every branded SKU and its Material Prices. Existing direct or other-parent archive causes are preserved."
          confirmLabel="Archive brand"
          tone="danger"
          onConfirm={() => {
            const target = confirmArchive;

            runRowAction(target.id, () => archiveBrandAction(target.id), () => { setConfirmArchive(null); });
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
          title={`Restore brand "${confirmRestore.name}"?`}
          description="Restoring this Brand removes only its archive causes. Eligible branded SKUs and Material Prices return to active use; records with another archive cause remain archived."
          confirmLabel="Restore brand"
          onConfirm={() => {
            const target = confirmRestore;

            runRowAction(target.id, () => restoreBrandAction(target.id), () => { setConfirmRestore(null); });
          }}
        />
      ) : null}

      {/* Request Deletion Dialog */}
      {deleteTarget ? (
        <RequestDeletionDialog open onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }} title={`Submit brand "${deleteTarget.name}" for deletion`} description="Archived brands can be permanently purged only after approval by a user with the deletion approval permission and after their explicit relation guards pass." reason={deleteReason} onReasonChange={setDeleteReason} placeholder="e.g. Obsolete brand with discontinued catalog" pending={pendingId !== null} error={rowError} onSubmit={() => {
                  const target = deleteTarget;
                  const reason = deleteReason;


                  runRowAction(target.id, () => requestBrandDeletionAction(target.id, reason), () => { setDeleteTarget(null); setDeleteReason(""); });
                }} />
      ) : null}
    </DirectoryShell>
  );
}
