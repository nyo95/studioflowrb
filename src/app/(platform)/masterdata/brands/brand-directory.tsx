"use client";

import { useState, useTransition } from "react";
import { Archive, CircleHelp, ExternalLink, Plus, RotateCcw, Trash2 } from "lucide-react";

import {
  Badge,
  Button,
  ConfirmDialog,
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
  Tooltip,
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

function FieldHelp({ label, content }: { label: string; content: string }) {
  return <Tooltip content={content}><button type="button" aria-label={`About ${label}`} className="inline-flex h-4 w-4 items-center justify-center rounded-full text-ink-tertiary hover:text-ink"><CircleHelp size={14} /></button></Tooltip>;
}

export function BrandDirectory({
  brands,
  productCategories,
  materialVendors,
  canManage,
  canManageVendors,
}: {
  brands: BrandRow[];
  productCategories: Option[];
  materialVendors: Option[];
  canManage: boolean;
  canManageVendors: boolean;
}) {
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BrandRow | null>(null);
  const [createOwnerVendorId, setCreateOwnerVendorId] = useState("");
  const [editOwnerVendorId, setEditOwnerVendorId] = useState("");
  const [confirmArchive, setConfirmArchive] = useState<BrandRow | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<BrandRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BrandRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Form links state for create/edit
  const [linksList, setLinksList] = useState<Array<{ kind: string; url: string; label: string }>>([]);
  const [newLinkKind, setNewLinkKind] = useState("WEBSITE");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");

  const [createError, setCreateError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, setEditPending] = useState(false);
  const [createNameWarning, setCreateNameWarning] = useState<string | null>(null);
  const [editNameWarning, setEditNameWarning] = useState<string | null>(null);
  const { options: ownerVendors, upsertOverlayOption } = useOptionOverlay(materialVendors);

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
    setCreateOwnerVendorId("");
    setCreateNameWarning(null);
    setCreateOpen(true);
  };

  const openEditDialog = (brand: BrandRow) => {
    setLinksList(brand.links.map((l) => ({ kind: l.kind, url: l.url, label: l.label ?? "" })));
    setNewLinkUrl("");
    setNewLinkLabel("");
    setEditOwnerVendorId(brand.owner_vendor?.id ?? "");
    setEditNameWarning(null);
    setEditTarget(brand);
  };

  const addLink = () => {
    if (!newLinkUrl.trim()) return;
    setLinksList([...linksList, { kind: newLinkKind, url: newLinkUrl.trim(), label: newLinkLabel.trim() }]);
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
        onOpenChange={setCreateOpen}
        title="Create catalog brand"
        description="Register an independent catalog brand and its discovery profile."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setCreatePending(true);
            setCreateError(null);
            const fd = new FormData(e.currentTarget);
            fd.set("linksJson", JSON.stringify(linksList));
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
          <Field label={<span className="inline-flex items-center gap-1">Owner vendor <FieldHelp label="owner vendor" content="Optional registered manufacturer or brand owner vendor." /></span>}>
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
          <Field label={<span className="inline-flex items-center gap-1">Hashtags <FieldHelp label="hashtags" content="Use space- or comma-separated tags for operator discovery, such as #laminate or #finish." /></span>}>
            <Input name="hashtags" placeholder="#hpl #veneer #premium" />
          </Field>
          <Field label={<span className="inline-flex items-center gap-1">Product categories <FieldHelp label="product categories" content="Select the direct discovery categories associated with this brand." /></span>}>
            <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto border border-line rounded p-2 bg-surface-muted/30">
              {productCategories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <input type="checkbox" name="categoryIds" value={c.id} />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
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
                <Input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="https://..." className="min-w-0" />
                <Input value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} placeholder="Label (optional)" className="min-w-0 sm:col-span-2" />
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={addLink}>Add</Button>
            </div>
          </div>

          <Field label="Notes">
            <Textarea name="notes" placeholder="Additional specifications, authorized distributors, etc." rows={2} />
          </Field>

          <FormActions>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={createPending}>
              {createPending ? <Spinner /> : "Create brand"}
            </Button>
          </FormActions>
        </form>
      </Dialog>

      {/* Edit Brand Dialog */}
      {editTarget ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          title={`Edit brand ${editTarget.name}`}
          description="Update brand identity and discovery details. Supplier relations are managed from Vendor."
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setEditPending(true);
              setEditError(null);
              const fd = new FormData(e.currentTarget);
              fd.set("linksJson", JSON.stringify(linksList));
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
            <Field label={<span className="inline-flex items-center gap-1">Hashtags <FieldHelp label="hashtags" content="Use space- or comma-separated tags for operator discovery." /></span>}>
              <Input name="hashtags" defaultValue={editTarget.hashtags.map((h) => `#${h.label}`).join(" ")} />
            </Field>
            <Field label={<span className="inline-flex items-center gap-1">Product categories <FieldHelp label="product categories" content="Checked categories will have MANUAL provenance." /></span>}>
              <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto border border-line rounded p-2 bg-surface-muted/30">
                {productCategories.map((c) => {
                  const isChecked = editTarget.categories.some((bc) => bc.category.id === c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                      <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={isChecked} />
                      <span>{c.name}</span>
                    </label>
                  );
                })}
              </div>
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
                  <Input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="https://..." className="min-w-0" />
                  <Input value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} placeholder="Label (optional)" className="min-w-0 sm:col-span-2" />
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={addLink}>Add</Button>
              </div>
            </div>

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
