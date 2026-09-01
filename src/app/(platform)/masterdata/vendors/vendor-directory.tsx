"use client";

import { useState, useTransition } from "react";
import { Archive, Plus, RotateCcw, Trash2, UserPlus, X } from "lucide-react";

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
  Tabs,
  Text,
  Textarea,
} from "@/platform/ui_engine";
import {
  archiveVendorAction,
  createVendorAction,
  requestVendorDeletionAction,
  restoreVendorAction,
  updateVendorAction,
} from "./actions";

type VendorRow = {
  id: string;
  name: string;
  slug: string;
  legal_name: string | null;
  address: string | null;
  notes: string | null;
  deleted_at: Date | null;
  types: Array<{
    vendor_type: {
      id: string;
      code: string;
      name: string;
      can_supply_material: boolean;
      can_supply_labor: boolean;
    };
  }>;
  contacts: Array<{
    id: string;
    person_name: string;
    job_title: string | null;
    email: string | null;
    phone: string | null;
    is_primary: boolean;
    brand_id: string | null;
  }>;
  links: Array<{ id: string; kind: string; url: string; label: string | null; archive_url: string | null; sort_order: number }>;
  brand_suppliers: Array<{
    id: string;
    is_authorized: boolean;
    notes: string | null;
    brand: { id: string; name: string };
  }>;
  _count: {
    owned_brands: number;
    brand_suppliers: number;
    material_prices: number;
    material_labor_prices: number;
    labor_prices: number;
  };
};

type VendorTypeOption = {
  id: string;
  code: string;
  name: string;
  can_supply_material: boolean;
  can_supply_labor: boolean;
};

type BrandOption = { id: string; name: string };

type ContactDraft = {
  id?: string;
  personName: string;
  jobTitle: string;
  email: string;
  phone: string;
  isPrimary: boolean;
  brandId: string;
  notes: string;
};

type LinkDraft = {
  kind: string;
  url: string;
  label: string;
  archiveUrl: string;
  sortOrder: number;
};

type BrandSupplierDraft = {
  brandId: string;
  brandName: string;
  isAuthorized: boolean;
  notes: string;
};

export function VendorDirectory({
  vendors,
  vendorTypes,
  brands,
  canManage,
}: {
  vendors: VendorRow[];
  vendorTypes: VendorTypeOption[];
  brands: BrandOption[];
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VendorRow | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<VendorRow | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<VendorRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VendorRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Form sub-collections
  const [contactsList, setContactsList] = useState<ContactDraft[]>([]);
  const [linksList, setLinksList] = useState<LinkDraft[]>([]);
  const [newLinkKind, setNewLinkKind] = useState("WEBSITE");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkArchiveUrl, setNewLinkArchiveUrl] = useState("");
  const [brandSuppliersList, setBrandSuppliersList] = useState<BrandSupplierDraft[]>([]);

  const [createError, setCreateError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, setEditPending] = useState(false);
  const [createNameWarning, setCreateNameWarning] = useState<string | null>(null);
  const [editNameWarning, setEditNameWarning] = useState<string | null>(null);

  const filtered = vendors.filter((v) => {
    if (typeFilter !== "ALL" && !v.types.some((t) => t.vendor_type.id === typeFilter)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      v.slug.toLowerCase().includes(q) ||
      (v.legal_name && v.legal_name.toLowerCase().includes(q)) ||
      v.contacts.some((c) => c.person_name.toLowerCase().includes(q) || (c.email && c.email.toLowerCase().includes(q)))
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

  const checkSimilarName = (name: string, excludeId?: string): string | null => {
    if (name.trim().length < 3) return null;
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const input = norm(name);
    const similar = vendors
      .filter((v) => v.id !== excludeId)
      .find((v) => {
        const existing = norm(v.name);
        if (existing === input) return true;
        if (existing.length >= 4 && input.length >= 4) {
          if (existing.startsWith(input.slice(0, 4)) || input.startsWith(existing.slice(0, 4))) return true;
          if (existing.includes(input) || input.includes(existing)) return true;
        }
        return false;
      });
    return similar ? `Potential duplicate: a similar vendor "${similar.name}" already exists.` : null;
  };

  const openCreateDialog = () => {
    setContactsList([]);
    setLinksList([]);
    setBrandSuppliersList([]);
    setNewLinkUrl("");
    setNewLinkLabel("");
    setNewLinkArchiveUrl("");
    setCreateNameWarning(null);
    setCreateOpen(true);
  };

  const openEditDialog = (vendor: VendorRow) => {
    setContactsList(
      vendor.contacts.map((c) => ({
        id: c.id,
        personName: c.person_name,
        jobTitle: c.job_title ?? "",
        email: c.email ?? "",
        phone: c.phone ?? "",
        isPrimary: c.is_primary ?? false,
        brandId: c.brand_id ?? "",
        notes: "",
      })),
    );
    setLinksList(vendor.links.map((l) => ({ kind: l.kind, url: l.url, label: l.label ?? "", archiveUrl: l.archive_url ?? "", sortOrder: l.sort_order })));
    setBrandSuppliersList(vendor.brand_suppliers.map((bs) => ({ brandId: bs.brand.id, brandName: bs.brand.name, isAuthorized: bs.is_authorized, notes: bs.notes ?? "" })));
    setNewLinkUrl("");
    setNewLinkLabel("");
    setNewLinkArchiveUrl("");
    setEditNameWarning(null);
    setEditTarget(vendor);
  };

  const addContactDraft = () => {
    setContactsList([...contactsList, { personName: "", jobTitle: "", email: "", phone: "", isPrimary: false, brandId: "", notes: "" }]);
  };

  const updateContactDraft = (idx: number, patch: Partial<ContactDraft>) => {
    const next = [...contactsList];
    next[idx] = { ...next[idx], ...patch };
    setContactsList(next);
  };

  const removeContactDraft = (idx: number) => {
    setContactsList(contactsList.filter((_, i) => i !== idx));
  };

  const addLinkDraft = () => {
    if (!newLinkUrl.trim()) return;
    setLinksList([...linksList, { kind: newLinkKind, url: newLinkUrl.trim(), label: newLinkLabel.trim(), archiveUrl: newLinkArchiveUrl.trim(), sortOrder: linksList.length }]);
    setNewLinkUrl("");
    setNewLinkLabel("");
    setNewLinkArchiveUrl("");
  };

  const addBrandSupplier = (brandId: string, brandName: string) => {
    if (brandSuppliersList.some((bs) => bs.brandId === brandId)) return;
    setBrandSuppliersList([...brandSuppliersList, { brandId, brandName, isAuthorized: false, notes: "" }]);
  };

  const removeBrandSupplier = (idx: number) => {
    setBrandSuppliersList(brandSuppliersList.filter((_, i) => i !== idx));
  };

  const updateBrandSupplier = (idx: number, patch: Partial<BrandSupplierDraft>) => {
    const next = [...brandSuppliersList];
    next[idx] = { ...next[idx], ...patch };
    setBrandSuppliersList(next);
  };

  const removeLinkDraft = (idx: number) => {
    setLinksList(linksList.filter((_, i) => i !== idx));
  };

  return (
    <SectionCard>
      <TableToolbar>
        <div className="flex flex-wrap items-center gap-3">
          <SearchField value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} onClear={() => setQuery("")} placeholder="Search vendors by name, legal name, contact..." />
          <div className="w-48">
            <Select value={typeFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTypeFilter(e.target.value)}>
              <option value="ALL">All vendor types</option>
              {vendorTypes.map((vt) => (
                <option key={vt.id} value={vt.id}>
                  {vt.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="ml-auto">
          {canManage ? (
            <Button type="button" variant="primary" onClick={openCreateDialog}>
              <Plus aria-hidden="true" />
              <span>New vendor</span>
            </Button>
          ) : null}
        </div>
      </TableToolbar>

      {filtered.length === 0 ? (
        <EmptyState title="No vendors found" description={query ? "No vendors match your search filters." : "Register your first vendor partner."} />
      ) : (
        <DataTable minWidth={960}>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor partner</TableHead>
              <TableHead>Types &amp; Capabilities</TableHead>
              <TableHead>Contacts</TableHead>
              <TableHead>Status</TableHead>
              <TableHead align="end">Prices</TableHead>
              <TableHead align="end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <tbody>
            {filtered.map((vendor) => {
              const isPending = pendingId === vendor.id;
              const isArchived = vendor.deleted_at !== null;
              const hasMaterial = vendor.types.some((t) => t.vendor_type.can_supply_material);
              const hasLabor = vendor.types.some((t) => t.vendor_type.can_supply_labor);
              const totalPriceCount =
                vendor._count.material_prices + vendor._count.material_labor_prices + vendor._count.labor_prices;

              return (
                <TableRow key={vendor.id}>
                  <TableCell>
                    <TableCellContent
                      primary={<span className="font-semibold">{vendor.name}</span>}
                      secondary={
                        <div className="text-xs text-ink-secondary">
                          {vendor.legal_name ? <span>{vendor.legal_name} • </span> : null}
                          <span className="font-mono">{vendor.slug}</span>
                        </div>
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 items-center max-w-xs">
                      {vendor.types.map((t) => (
                        <Badge key={t.vendor_type.id} tone="neutral">
                          {t.vendor_type.name}
                        </Badge>
                      ))}
                      {hasMaterial && (
                        <Badge tone="success" title="Eligible for SKU material pricing and Brand supply">
                          Material
                        </Badge>
                      )}
                      {hasLabor && (
                        <Badge tone="warning" title="Eligible for Material+Labor and Labor-only pricing">
                          Labor
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-ink-secondary max-w-xs">
                      {vendor.contacts.length === 0 ? (
                        <span className="text-ink-tertiary">No contacts</span>
                      ) : (
                        vendor.contacts.slice(0, 2).map((c) => (
                          <div key={c.id} className="truncate">
                            <span className="font-medium text-ink">{c.person_name}</span>
                            {c.phone ? ` (${c.phone})` : c.email ? ` (${c.email})` : ""}
                          </div>
                        ))
                      )}
                      {vendor.contacts.length > 2 ? (
                        <span className="text-ink-tertiary">+{vendor.contacts.length - 2} more</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={!isArchived ? "success" : "neutral"}>
                      {!isArchived ? "Active" : "Archived"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell align="end">
                    <TableCellContent primary={totalPriceCount.toLocaleString()} />
                  </TableCell>
                  <TableCell align="end">
                    <div className="flex items-center justify-end gap-1.5">
                      {isPending ? <Spinner /> : null}
                      {canManage && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => openEditDialog(vendor)} disabled={isPending}>
                            Edit
                          </Button>
                          {!isArchived ? (
                            <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(vendor)} disabled={isPending} title="Archive">
                              <Archive size={15} />
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmRestore(vendor)} disabled={isPending} title="Restore">
                                <RotateCcw size={15} />
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => setDeleteTarget(vendor)} disabled={isPending} title="Request deletion">
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

      {/* Create Vendor Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create vendor partner"
        description="Register a material supplier, fabricator, subcontractor, or labor contractor."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setCreatePending(true);
            setCreateError(null);
            const fd = new FormData(e.currentTarget);
            fd.set("contactsJson", JSON.stringify(contactsList.filter((c) => c.personName?.trim())));
            fd.set("linksJson", JSON.stringify(linksList));
            fd.set("brandSuppliersJson", JSON.stringify(brandSuppliersList.map((bs) => ({ brandId: bs.brandId, isAuthorized: bs.isAuthorized, notes: bs.notes || undefined }))));
            try {
              const res = await createVendorAction(null, fd);
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

          <Tabs
            items={[
              {
                value: "profile",
                label: "Profile & Types",
                content: (
                  <div className="grid gap-4">
                    <Field label="Vendor trade name" required>
                      <Input name="name" required maxLength={64} placeholder="e.g. Mitra Kayu Nusantara" autoFocus onChange={(e) => setCreateNameWarning(checkSimilarName(e.target.value))} />
                    </Field>
                    {createNameWarning ? (
                      <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5">⚠ {createNameWarning}</p>
                    ) : null}
                    <Field label="Legal entity name" description="Registered PT / CV name if applicable.">
                      <Input name="legalName" maxLength={128} placeholder="e.g. PT Mitra Kayu Nusantara" />
                    </Field>
                    <Field label="Vendor types" description="Assign role dimensions to grant pricing capabilities.">
                      <div className="grid grid-cols-2 gap-2 border border-line rounded p-2 bg-surface-muted/30">
                        {vendorTypes.map((vt) => (
                          <label key={vt.id} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                            <input type="checkbox" name="vendorTypeIds" value={vt.id} />
                            <div>
                              <span className="font-medium">{vt.name}</span>
                              <span className="block text-[10px] text-ink-tertiary">
                                {vt.can_supply_material ? "Material " : ""}{vt.can_supply_labor ? "Labor" : ""}
                              </span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </Field>
                    <Field label="Office / Workshop address">
                      <Input name="address" maxLength={256} placeholder="Address, City" />
                    </Field>
                    <Field label="Notes">
                      <Textarea name="notes" placeholder="Payment terms, workshop capacity, etc." rows={2} />
                    </Field>
                  </div>
                ),
              },
              {
                value: "contacts",
                label: `Contacts (${contactsList.length})`,
                content: (
                  <div className="grid gap-3">
                    <div className="flex justify-between items-center">
                      <Text size="sm" weight="semibold">Personnel &amp; Sales Contacts</Text>
                        <Button type="button" size="sm" variant="secondary" onClick={addContactDraft}>
                          <UserPlus size={14} />
                          <span>Add contact</span>
                        </Button>
                    </div>
                    {contactsList.length === 0 ? (
                      <div className="text-xs text-ink-tertiary py-3 text-center border border-dashed border-line rounded">
                        No contacts added yet. Click &quot;Add contact&quot; to add sales reps or project managers.
                      </div>
                    ) : null}
                    {contactsList.map((contact, idx) => (
                      <div key={idx} className="grid grid-cols-2 gap-2 p-2.5 border border-line rounded bg-surface-muted/40 relative">
                        <button
                          type="button"
                          onClick={() => removeContactDraft(idx)}
                          className="absolute top-2 right-2 text-ink-tertiary hover:text-ink-danger"
                          title="Remove"
                        >
                          <X size={14} />
                        </button>
                        <Field label="Contact name" required className="col-span-2 sm:col-span-1">
                          <Input
                            value={contact.personName}
                            onChange={(e) => updateContactDraft(idx, { personName: e.target.value })}
                            placeholder="Full name"
                            required
                          />
                        </Field>
                        <Field label="Job title" className="col-span-2 sm:col-span-1">
                          <Input
                            value={contact.jobTitle}
                            onChange={(e) => updateContactDraft(idx, { jobTitle: e.target.value })}
                            placeholder="Sales Executive, Estimator..."
                          />
                        </Field>
                        <Field label="Phone number">
                          <Input
                            value={contact.phone}
                            onChange={(e) => updateContactDraft(idx, { phone: e.target.value })}
                            placeholder="+62 812..."
                          />
                        </Field>
                        <Field label="Email address">
                          <Input
                            type="email"
                            value={contact.email}
                            onChange={(e) => updateContactDraft(idx, { email: e.target.value })}
                            placeholder="rep@vendor.com"
                          />
                        </Field>
                        <Field label="Brand scoping" description="Optional: specific brand this contact manages.">
                          <Select
                            value={contact.brandId}
                            onChange={(e) => updateContactDraft(idx, { brandId: e.target.value })}
                          >
                            <option value="">All vendor brands</option>
                            {brands.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                value: "resources",
                label: "Links",
                content: (
                  <div className="grid gap-4">
                    <div className="grid gap-3">
                      <Text size="sm" weight="semibold">Website &amp; Catalogs</Text>
                      {linksList.map((link, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs bg-surface-muted p-2 rounded">
                          <span className="font-mono">{link.kind}: {link.label || link.url}</span>
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeLinkDraft(idx)}>Remove</Button>
                        </div>
                      ))}
                      <div className="grid gap-3 rounded border border-line bg-surface-muted/30 p-3">
                        <Field label="Link type">
                          <Select value={newLinkKind} onChange={(e) => setNewLinkKind(e.target.value)}>
                          <option value="WEBSITE">Website</option>
                          <option value="CATALOG">Catalog</option>
                          <option value="PORTFOLIO">Portfolio</option>
                          <option value="WHATSAPP">WhatsApp</option>
                          </Select>
                        </Field>
                        <Field label="URL" required><Input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="https://example.com/catalog" /></Field>
                        <Field label="Display label"><Input value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} placeholder="Optional label, e.g. Product catalog 2026" /></Field>
                        <Field label="Archive URL" description="Archived/cached version of this link (optional)."><Input value={newLinkArchiveUrl} onChange={(e) => setNewLinkArchiveUrl(e.target.value)} placeholder="https://web.archive.org/web/..." /></Field>
                        <Button type="button" size="sm" variant="secondary" className="justify-self-start" onClick={addLinkDraft}>Add link</Button>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                value: "suppliers",
                label: `Brand Suppliers (${brandSuppliersList.length})`,
                content: (
                  <div className="grid gap-3">
                    <Text size="sm" weight="semibold">Brands this vendor supplies materials for</Text>
                    <Field label="Add brand">
                      <Select onChange={(e) => { if (e.target.value) { const b = brands.find((x) => x.id === e.target.value); if (b) addBrandSupplier(b.id, b.name); e.target.value = ""; } }}>
                        <option value="">— select brand to add —</option>
                        {brands.filter((b) => !brandSuppliersList.some((bs) => bs.brandId === b.id)).map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </Select>
                    </Field>
                    {brandSuppliersList.map((bs, idx) => (
                      <div key={bs.brandId} className="grid gap-2 p-2.5 border border-line rounded bg-surface-muted/40">
                        <div className="flex items-center justify-between">
                          <Text size="sm" weight="medium">{bs.brandName}</Text>
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeBrandSupplier(idx)}>Remove</Button>
                        </div>
                        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                          <input type="checkbox" checked={bs.isAuthorized} onChange={(e) => updateBrandSupplier(idx, { isAuthorized: e.target.checked })} />
                          <span>Authorized supplier (official / certified)</span>
                        </label>
                        <Field label="Supplier notes">
                          <Input value={bs.notes} onChange={(e) => updateBrandSupplier(idx, { notes: e.target.value })} placeholder="Territory, pricing tier, etc." />
                        </Field>
                      </div>
                    ))}
                  </div>
                ),
              },
            ]}
          />

          <FormActions>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={createPending}>
              {createPending ? <Spinner /> : "Create vendor"}
            </Button>
          </FormActions>
        </form>
      </Dialog>

      {/* Edit Vendor Dialog */}
      {editTarget ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          title={`Edit vendor ${editTarget.name}`}
          description="Update the vendor profile, capability types, contacts, and reference links."
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setEditPending(true);
              setEditError(null);
              const fd = new FormData(e.currentTarget);
              fd.set("contactsJson", JSON.stringify(contactsList.filter((c) => c.personName?.trim())));
              fd.set("linksJson", JSON.stringify(linksList));
              fd.set("brandSuppliersJson", JSON.stringify(brandSuppliersList.map((bs) => ({ brandId: bs.brandId, isAuthorized: bs.isAuthorized, notes: bs.notes || undefined }))));
              try {
                const res = await updateVendorAction(null, fd);
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
            <input type="hidden" name="vendorId" value={editTarget.id} />
            {editError ? <InlineError>{editError}</InlineError> : null}

            <Tabs
              items={[
                {
                  value: "profile",
                  label: "Profile & Types",
                  content: (
                    <div className="grid gap-4">
                      <Field label="Vendor trade name" required>
                        <Input name="name" defaultValue={editTarget.name} required maxLength={64} autoFocus onChange={(e) => setEditNameWarning(checkSimilarName(e.target.value, editTarget.id))} />
                      </Field>
                      {editNameWarning ? (
                        <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5">⚠ {editNameWarning}</p>
                      ) : null}
                      <Field label="Legal entity name">
                        <Input name="legalName" defaultValue={editTarget.legal_name ?? ""} maxLength={128} />
                      </Field>
                      <Field label="Vendor types" description="Removing capability types is guarded against active dependent prices.">
                        <div className="grid grid-cols-2 gap-2 border border-line rounded p-2 bg-surface-muted/30">
                          {vendorTypes.map((vt) => {
                            const isChecked = editTarget.types.some((t) => t.vendor_type.id === vt.id);
                            return (
                              <label key={vt.id} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                                <input type="checkbox" name="vendorTypeIds" value={vt.id} defaultChecked={isChecked} />
                                <div>
                                  <span className="font-medium">{vt.name}</span>
                                  <span className="block text-[10px] text-ink-tertiary">
                                    {vt.can_supply_material ? "Material " : ""}{vt.can_supply_labor ? "Labor" : ""}
                                  </span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </Field>
                      <Field label="Office / Workshop address">
                        <Input name="address" defaultValue={editTarget.address ?? ""} maxLength={256} />
                      </Field>
                      <Field label="Notes">
                        <Textarea name="notes" defaultValue={editTarget.notes ?? ""} rows={2} />
                      </Field>
                    </div>
                  ),
                },
                {
                  value: "contacts",
                  label: `Contacts (${contactsList.length})`,
                  content: (
                    <div className="grid gap-3">
                      <div className="flex justify-between items-center">
                        <Text size="sm" weight="semibold">Personnel &amp; Sales Contacts</Text>
                      <Button type="button" size="sm" variant="secondary" onClick={addContactDraft}>
                          <UserPlus size={14} />
                          <span>Add contact</span>
                        </Button>
                      </div>
                      {contactsList.length === 0 ? (
                        <div className="text-xs text-ink-tertiary py-3 text-center border border-dashed border-line rounded">
                          No contacts registered.
                        </div>
                      ) : null}
                      {contactsList.map((contact, idx) => (
                        <div key={idx} className="grid grid-cols-2 gap-2 p-2.5 border border-line rounded bg-surface-muted/40 relative">
                          <button
                            type="button"
                            onClick={() => removeContactDraft(idx)}
                            className="absolute top-2 right-2 text-ink-tertiary hover:text-ink-danger"
                            title="Remove"
                          >
                            <X size={14} />
                          </button>
                          <Field label="Contact name" required className="col-span-2 sm:col-span-1">
                            <Input
                              value={contact.personName}
                              onChange={(e) => updateContactDraft(idx, { personName: e.target.value })}
                              required
                            />
                          </Field>
                          <Field label="Job title" className="col-span-2 sm:col-span-1">
                            <Input
                              value={contact.jobTitle}
                              onChange={(e) => updateContactDraft(idx, { jobTitle: e.target.value })}
                            />
                          </Field>
                          <Field label="Phone number">
                            <Input
                              value={contact.phone}
                              onChange={(e) => updateContactDraft(idx, { phone: e.target.value })}
                            />
                          </Field>
                          <Field label="Email address">
                            <Input
                              type="email"
                              value={contact.email}
                              onChange={(e) => updateContactDraft(idx, { email: e.target.value })}
                            />
                          </Field>
                          <Field label="Brand scoping">
                            <Select
                              value={contact.brandId}
                              onChange={(e) => updateContactDraft(idx, { brandId: e.target.value })}
                            >
                              <option value="">All vendor brands</option>
                              {brands.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  value: "resources",
                  label: "Links",
                  content: (
                    <div className="grid gap-4">
                      <div className="grid gap-3">
                        <Text size="sm" weight="semibold">Website &amp; Catalogs</Text>
                        {linksList.map((link, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs bg-surface-muted p-2 rounded">
                            <span className="font-mono">{link.kind}: {link.label || link.url}</span>
                            <Button type="button" size="sm" variant="ghost" onClick={() => removeLinkDraft(idx)}>Remove</Button>
                          </div>
                        ))}
                        <div className="grid gap-3 rounded border border-line bg-surface-muted/30 p-3">
                          <Field label="Link type">
                            <Select value={newLinkKind} onChange={(e) => setNewLinkKind(e.target.value)}>
                            <option value="WEBSITE">Website</option>
                            <option value="CATALOG">Catalog</option>
                            <option value="PORTFOLIO">Portfolio</option>
                            <option value="WHATSAPP">WhatsApp</option>
                            </Select>
                          </Field>
                          <Field label="URL" required><Input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="https://example.com/catalog" /></Field>
                          <Field label="Display label"><Input value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} placeholder="Optional label, e.g. Product catalog 2026" /></Field>
                          <Field label="Archive URL" description="Archived/cached version of this link (optional)."><Input value={newLinkArchiveUrl} onChange={(e) => setNewLinkArchiveUrl(e.target.value)} placeholder="https://web.archive.org/web/..." /></Field>
                          <Button type="button" size="sm" variant="secondary" className="justify-self-start" onClick={addLinkDraft}>Add link</Button>
                        </div>
                      </div>
                    </div>
                  ),
                },
                {
                  value: "suppliers",
                  label: `Brand Suppliers (${brandSuppliersList.length})`,
                  content: (
                    <div className="grid gap-3">
                      <Text size="sm" weight="semibold">Brands this vendor supplies materials for</Text>
                      <Field label="Add brand">
                        <Select onChange={(e) => { if (e.target.value) { const b = brands.find((x) => x.id === e.target.value); if (b) addBrandSupplier(b.id, b.name); e.target.value = ""; } }}>
                          <option value="">— select brand to add —</option>
                          {brands.filter((b) => !brandSuppliersList.some((bs) => bs.brandId === b.id)).map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </Select>
                      </Field>
                      {brandSuppliersList.map((bs, idx) => (
                        <div key={bs.brandId} className="grid gap-2 p-2.5 border border-line rounded bg-surface-muted/40">
                          <div className="flex items-center justify-between">
                            <Text size="sm" weight="medium">{bs.brandName}</Text>
                            <Button type="button" size="sm" variant="ghost" onClick={() => removeBrandSupplier(idx)}>Remove</Button>
                          </div>
                          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                            <input type="checkbox" checked={bs.isAuthorized} onChange={(e) => updateBrandSupplier(idx, { isAuthorized: e.target.checked })} />
                            <span>Authorized supplier (official / certified)</span>
                          </label>
                          <Field label="Supplier notes">
                            <Input value={bs.notes} onChange={(e) => updateBrandSupplier(idx, { notes: e.target.value })} placeholder="Territory, pricing tier, etc." />
                          </Field>
                        </div>
                      ))}
                    </div>
                  ),
                },
              ]}
            />

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
          title={`Archive vendor "${confirmArchive.name}"?`}
          description="Archiving this vendor cascades archive causes to all its Material, Material+Labor, and Labor unit prices."
          confirmLabel="Archive vendor"
          tone="danger"
          onConfirm={() => {
            const target = confirmArchive;
            setConfirmArchive(null);
            runRowAction(target.id, () => archiveVendorAction(target.id));
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
          title={`Restore vendor "${confirmRestore.name}"?`}
          description="Restoring this vendor will restore its unit prices that were archived solely by parent provenance."
          confirmLabel="Restore vendor"
          onConfirm={() => {
            const target = confirmRestore;
            setConfirmRestore(null);
            runRowAction(target.id, () => restoreVendorAction(target.id));
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
          title={`Submit vendor "${deleteTarget.name}" for deletion`}
          description="Archived vendors with zero owned brands and zero active prices can be permanently purged after supervisor approval."
        >
          <div className="grid gap-4">
            <Field label="Reason for deletion">
              <Input
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Inactive duplicate vendor profile"
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
                  runRowAction(target.id, () => requestVendorDeletionAction(target.id, reason));
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
