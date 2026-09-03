"use client";

import { useRef, useState, useTransition } from "react";
import { Archive, ExternalLink, Plus, RotateCcw, Trash2 } from "lucide-react";

import {
  Badge,
  Button,
  ConfirmDialog,
  CreatableMultiSelect,
  CreatableSearch,
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
  useFormDraftGuard,
  useOptionOverlay,
} from "@/platform/ui_engine";
import {
  archiveBrandAction,
  createOwnerVendorQuickAction,
  createBrandAction,
  requestBrandDeletionAction,
  restoreBrandAction,
  updateBrandAction,
} from "./actions";
import { createCategoryAction } from "../categories/actions";
import { normalizeBrandLinks, normalizeBrandLinkUrl, type BrandLinkDraft } from "./brand-link-input";

type BrandRow = {
  id: string;
  name: string;
  slug: string;
  notes: string | null;
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
  const [confirmArchive, setConfirmArchive] = useState<BrandRow | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<BrandRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BrandRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
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
    watchedValue: JSON.stringify([createOwnerVendorId, createCategoryIds, createHashtags, linksList]),
    title: "Discard brand draft?",
    description: "Your changes are only in this browser and have not been saved.",
  });
  const editDraftGuard = useFormDraftGuard({
    formRef: editFormRef,
    resetKey: editTarget?.id ?? "",
    active: Boolean(editTarget),
    watchedValue: JSON.stringify([editOwnerVendorId, editCategoryIds, editHashtags, linksList]),
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
    <SectionCard>
      <TableToolbar actions={canManage ? (
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
      </TableToolbar>

      {filtered.length === 0 ? (
        <EmptyState
          title="No brands found"
          description={query ? "No brands match your search query." : "Add your first catalog brand."}
          action={!query && canManage ? (
            <Button
              type="button"
              variant="primary"
              leadingIcon={<Plus aria-hidden="true" />}
              onClick={openCreateDialog}
            >
              New brand
            </Button>
          ) : undefined}
        />
      ) : (
        <DataTable minWidth={900}>
          <TableHeader>
            <TableRow>
              <TableHead>Brand</TableHead>
              <TableHead>Categories &amp; Hashtags</TableHead>
              <TableHead>Owner / Suppliers</TableHead>
              <TableHead>Status</TableHead>
              <TableHead align="end">SKUs</TableHead>
              <TableHead align="end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <tbody>
            {filtered.map((brand) => {
              const isPending = pendingId === brand.id;
              const isArchived = brand.deleted_at !== null;

              return (
                <TableRow key={brand.id}>
                  <TableCell>
                    <TableCellContent
                      primary={<span className="font-semibold">{brand.name}</span>}
                      secondary={
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="font-mono text-xs text-ink-secondary">{brand.slug}</span>
                          {brand.links.map((l) => (
                            <a
                              key={l.id}
                              href={l.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-action hover:underline"
                            >
                              <span>{l.label || l.kind}</span>
                              <ExternalLink size={11} />
                            </a>
                          ))}
                        </div>
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-sm">
                      {brand.categories.map((c) => (
                        <Badge key={c.category.id} tone="neutral">
                          {c.category.name}
                          {c.origins.some((o) => o.kind === "SKU_ENRICHMENT") ? " •" : ""}
                        </Badge>
                      ))}
                      {brand.hashtags.map((h) => (
                        <span key={h.id} className="inline-block text-xs text-ink-secondary font-mono bg-surface-muted px-1.5 py-0.5 rounded">
                          #{h.label}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-ink-secondary">
                      {brand.owner_vendor ? <div>Owner: <span className="font-medium text-ink">{brand.owner_vendor.name}</span></div> : null}
                      {brand.suppliers.length > 0 ? (
                        <div>Suppliers: {brand.suppliers.map((s) => s.vendor.name).join(", ")}</div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={!isArchived ? "success" : "neutral"}>
                      {!isArchived ? "Active" : "Archived"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell align="end">
                    <TableCellContent primary={brand._count.skus.toLocaleString()} />
                  </TableCell>
                  <TableCell align="end">
                    <div className="flex items-center justify-end gap-1.5">
                      {isPending ? <Spinner /> : null}
                      {canManage && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => openEditDialog(brand)} disabled={isPending}>
                            Edit
                          </Button>
                          {!isArchived ? (
                            <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(brand)} disabled={isPending} title="Archive">
                              <Archive size={15} />
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmRestore(brand)} disabled={isPending} title="Restore">
                                <RotateCcw size={15} />
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => setDeleteTarget(brand)} disabled={isPending} title="Request deletion">
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

      {/* Create Brand Dialog */}
      <Dialog
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
          className="grid gap-4 max-h-[80vh] overflow-y-auto pr-1"
        >
          {createError ? <InlineError>{createError}</InlineError> : null}
          <Field label="Brand name" required>
            <Input name="name" required maxLength={64} placeholder="e.g. TACO, Blum, Hafele" autoFocus onChange={(e) => setCreateNameWarning(checkSimilarBrandName(e.target.value))} />
          </Field>
          {createNameWarning ? (
            <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5">⚠ {createNameWarning}</p>
          ) : null}
          <input type="hidden" name="ownerVendorId" value={createOwnerVendorId} />
          {createCategoryIds.map((id) => <input key={id} type="hidden" name="categoryIds" value={id} />)}
          <input type="hidden" name="hashtags" value={createHashtags.join(" ")} />
          <Field label="Owner vendor" description="Optional registered manufacturer or brand owner vendor.">
            <CreatableSearch
              label="Owner vendor"
              options={ownerVendors.map((vendor) => ({ id: vendor.id, label: vendor.name }))}
              value={createOwnerVendorId}
              onValueChange={setCreateOwnerVendorId}
              allowClear
              clearLabel="No dedicated owner vendor"
              placeholder="Select an owner vendor"
              onCreate={canManageVendors ? (name) => createOwnerVendor(name, setCreateError) : undefined}
              createLabel={(name) => `Create owner vendor “${name}”`}
            />
          </Field>
          <Field label="Hashtags" description="Search existing discovery tags or add a new one, such as #laminate or #finish.">
            <CreatableMultiSelect label="Hashtags" options={hashtagOptions(createHashtags)} value={createHashtags} onValueChange={setCreateHashtags} onCreate={(tag) => tag.trim()} placeholder="Add hashtags" createLabel={(tag) => `Add hashtag “${tag}”`} />
          </Field>
          <Field label="Product categories" description="Search a discovery category or create a missing one.">
            <CreatableMultiSelect label="Product categories" options={categoryOptions.map((category) => ({ id: category.id, label: category.name }))} value={createCategoryIds} onValueChange={setCreateCategoryIds} onCreate={canManageCategories ? (name) => createProductCategory(name, setCreateError) : undefined} createLabel={(name) => `Create product category “${name}”`} />
          </Field>
          {/* Links builder */}
          <div className="grid gap-2 border-t border-line pt-3">
            <Text size="sm" weight="semibold">External links (Catalogs, Website)</Text>
            {linksList.map((link, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs bg-surface-muted p-2 rounded">
                <span className="font-mono">{link.kind}: {link.label || link.url}</span>
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
            <Textarea name="notes" placeholder="Additional specifications, authorized distributors, etc." rows={2} />
          </Field>

          <FormActions>
            <Button type="button" variant="ghost" onClick={() => void createDraftGuard.requestDiscard(() => setCreateOpen(false))}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={createPending}>
              {createPending ? <Spinner /> : "Create brand"}
            </Button>
          </FormActions>
        </form>
      </Dialog>
      {createDraftGuard.confirmDialog}

      {/* Edit Brand Dialog */}
      {editTarget ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !editPending) void editDraftGuard.requestDiscard(() => setEditTarget(null));
          }}
          title={`Edit brand ${editTarget.name}`}
          description="Update brand identity and discovery details. Supplier relations are managed from Vendor."
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
            className="grid gap-4 max-h-[80vh] overflow-y-auto pr-1"
          >
            <input type="hidden" name="brandId" value={editTarget.id} />
            {editCategoryIds.map((id) => <input key={id} type="hidden" name="categoryIds" value={id} />)}
            <input type="hidden" name="hashtags" value={editHashtags.join(" ")} />
            {editError ? <InlineError>{editError}</InlineError> : null}
            <Field label="Brand name" required>
              <Input name="name" defaultValue={editTarget.name} required maxLength={64} autoFocus onChange={(e) => setEditNameWarning(checkSimilarBrandName(e.target.value, editTarget.id))} />
            </Field>
            {editNameWarning ? (
              <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5">⚠ {editNameWarning}</p>
            ) : null}
            <input type="hidden" name="ownerVendorId" value={editOwnerVendorId} />
            <Field label="Owner vendor">
              <CreatableSearch
                label="Owner vendor"
                options={ownerVendors.map((vendor) => ({ id: vendor.id, label: vendor.name }))}
                value={editOwnerVendorId}
                onValueChange={setEditOwnerVendorId}
                allowClear
                clearLabel="No dedicated owner vendor"
                placeholder="Select an owner vendor"
                onCreate={canManageVendors ? (name) => createOwnerVendor(name, setEditError) : undefined}
                createLabel={(name) => `Create owner vendor “${name}”`}
              />
            </Field>
            <Field label="Hashtags" description="Search existing discovery tags or add a new one.">
              <CreatableMultiSelect label="Hashtags" options={hashtagOptions(editHashtags)} value={editHashtags} onValueChange={setEditHashtags} onCreate={(tag) => tag.trim()} placeholder="Add hashtags" createLabel={(tag) => `Add hashtag “${tag}”`} />
            </Field>
            <Field label="Product categories" description="Manual selections keep their own provenance.">
              <CreatableMultiSelect label="Product categories" options={categoryOptions.map((category) => ({ id: category.id, label: category.name }))} value={editCategoryIds} onValueChange={setEditCategoryIds} onCreate={canManageCategories ? (name) => createProductCategory(name, setEditError) : undefined} createLabel={(name) => `Create product category “${name}”`} />
            </Field>
            {/* Links builder */}
            <div className="grid gap-2 border-t border-line pt-3">
              <Text size="sm" weight="semibold">External links</Text>
              {linksList.map((link, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs bg-surface-muted p-2 rounded">
                  <span className="font-mono">{link.kind}: {link.label || link.url}</span>
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
              <Textarea name="notes" defaultValue={editTarget.notes ?? ""} rows={2} />
            </Field>

            <FormActions>
              <Button type="button" variant="ghost" onClick={() => void editDraftGuard.requestDiscard(() => setEditTarget(null))}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={editPending}>
                {editPending ? <Spinner /> : "Save changes"}
              </Button>
            </FormActions>
          </form>
        </Dialog>
      ) : null}
      {editDraftGuard.confirmDialog}

      {/* Archive Confirm */}
      {confirmArchive ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmArchive(null);
          }}
          title={`Archive brand "${confirmArchive.name}"?`}
          description="Archiving a Brand cascades archive causes to all child SKUs and their Material Prices. Restoring the Brand restores children that have no direct archive cause."
          confirmLabel="Archive brand"
          tone="danger"
          onConfirm={() => {
            const target = confirmArchive;
            setConfirmArchive(null);
            runRowAction(target.id, () => archiveBrandAction(target.id));
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
          title={`Restore brand "${confirmRestore.name}"?`}
          description="Restoring this brand will restore all associated SKUs and prices that were archived solely by parent provenance."
          confirmLabel="Restore brand"
          onConfirm={() => {
            const target = confirmRestore;
            setConfirmRestore(null);
            runRowAction(target.id, () => restoreBrandAction(target.id));
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
          title={`Submit brand "${deleteTarget.name}" for deletion`}
          description="Archived brands can be permanently purged only after approval by a user with the deletion approval permission and after their explicit relation guards pass."
        >
          <div className="grid gap-4">
            <Field label="Reason for deletion">
              <Input
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Obsolete brand with discontinued catalog"
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
                  runRowAction(target.id, () => requestBrandDeletionAction(target.id, reason));
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
