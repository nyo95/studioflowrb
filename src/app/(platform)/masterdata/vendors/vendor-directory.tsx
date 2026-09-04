"use client";

import { useRef, useState, useTransition } from "react";
import { Archive, Plus, RotateCcw, Trash2, UserPlus, X } from "lucide-react";

import {
  Badge,
  Button,
  Combobox,
  CreatableMultiSelect,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  FormActions,
  IconButton,
  InlineError,
  Input,
  Notice,
  SearchField,
  SectionCard,
  Select,
  SimpleTextEditor,
  Spinner,
  StatusBadge,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Tabs,
  Text,
  useFormDraftGuard,
} from "@/platform/ui_engine";
import {
  archiveVendorAction,
  createVendorAction,
  requestVendorDeletionAction,
  restoreVendorAction,
  updateVendorAction,
} from "./actions";

const VENDOR_LINK_KINDS = [
  { value: "WEBSITE", label: "Website" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "YOUTUBE", label: "YouTube" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "MARKETPLACE", label: "Marketplace" },
  { value: "DRIVE", label: "Google Drive" },
  { value: "PRICE_LIST", label: "Price List" },
  { value: "OTHER", label: "Other" },
] as const;

type VendorRow = {
  id: string;
  name: string;
  slug: string;
  legal_name: string | null;
  address: string | null;
  notes: string | null;
  updated_at: Date;
  updated_by_label: string | null;
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
  const [createVendorTypeIds, setCreateVendorTypeIds] = useState<string[]>([]);
  const [editVendorTypeIds, setEditVendorTypeIds] = useState<string[]>([]);

  // Controlled edit profile fields — prevents data loss when tabs re-render
  const [editName, setEditName] = useState("");
  const [editLegalName, setEditLegalName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [createError, setCreateError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, setEditPending] = useState(false);
  const [createNameWarning, setCreateNameWarning] = useState<string | null>(null);
  const [editNameWarning, setEditNameWarning] = useState<string | null>(null);
  const [createDraftKey, setCreateDraftKey] = useState(0);
  const createFormRef = useRef<HTMLFormElement>(null);
  const editFormRef = useRef<HTMLFormElement>(null);
  const createDraftGuard = useFormDraftGuard({
    formRef: createFormRef,
    resetKey: createDraftKey,
    active: createOpen,
    watchedValue: JSON.stringify([createVendorTypeIds, contactsList]),
    title: "Discard vendor draft?",
    description: "Your changes are only in this browser and have not been saved.",
  });
  const editDraftGuard = useFormDraftGuard({
    formRef: editFormRef,
    resetKey: editTarget?.id ?? "",
    active: Boolean(editTarget),
    watchedValue: JSON.stringify([editVendorTypeIds, contactsList, linksList]),
    title: "Discard changes?",
    description: "Your edits are only in this browser and have not been saved.",
  });

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
    setCreateVendorTypeIds([]);
    setNewLinkUrl("");
    setNewLinkLabel("");
    setNewLinkArchiveUrl("");
    setCreateNameWarning(null);
    setCreateDraftKey((key) => key + 1);
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
    setEditVendorTypeIds(vendor.types.map((type) => type.vendor_type.id));
    setEditName(vendor.name);
    setEditLegalName(vendor.legal_name ?? "");
    setEditAddress(vendor.address ?? "");
    setEditNotes(vendor.notes ?? "");
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

  const removeLinkDraft = (idx: number) => {
    setLinksList(linksList.filter((_, i) => i !== idx));
  };

  return (
    <SectionCard>
      <TableToolbar actions={canManage ? (
        <Button type="button" variant="primary" onClick={openCreateDialog}>
          <Plus aria-hidden="true" />
          <span>New vendor</span>
        </Button>
      ) : undefined}>
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
      </TableToolbar>

      {filtered.length === 0 ? (
        <EmptyState
          title="No vendors found"
          description={query ? "No vendors match your search filters." : "Register your first vendor partner."}
          action={!query && canManage ? (
            <Button type="button" variant="primary" onClick={openCreateDialog}>
              <Plus aria-hidden="true" />
              <span>New vendor</span>
            </Button>
          ) : undefined}
        />
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
          <TableBody>
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
                        <div className="grid gap-0.5 text-xs text-ink-secondary">
                          <div>
                            {vendor.legal_name ? <span>{vendor.legal_name} • </span> : null}
                            <span className="font-mono">{vendor.slug}</span>
                          </div>
                          {vendor.updated_by_label ? (
                            <span className="text-ink-tertiary">
                              Updated by <span className="font-medium text-ink-secondary">{vendor.updated_by_label}</span> · {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(vendor.updated_at)}
                            </span>
                          ) : null}
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
                    <TableCellContent align="end" primary={totalPriceCount.toLocaleString()} />
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
          </TableBody>
        </DataTable>
      )}

      {/* Create Vendor Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (open) setCreateOpen(true);
          else if (!createPending) void createDraftGuard.requestDiscard(() => setCreateOpen(false));
        }}
        title="Create vendor partner"
        description="Register a material supplier, fabricator, subcontractor, or labor contractor."
        dismissible={!createPending}
      >
        <form
          ref={createFormRef}
          onChange={createDraftGuard.onFormChange}
          onSubmit={async (e) => {
            e.preventDefault();
            setCreatePending(true);
            setCreateError(null);
            const fd = new FormData(e.currentTarget);
            fd.set("contactsJson", JSON.stringify(contactsList.filter((c) => c.personName?.trim())));
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
          {createVendorTypeIds.map((id) => <input key={id} type="hidden" name="vendorTypeIds" value={id} />)}
          {createError ? <InlineError>{createError}</InlineError> : null}

          <Field label="Vendor trade name" required>
            <Input name="name" required maxLength={64} placeholder="e.g. Mitra Kayu Nusantara" autoFocus onChange={(e) => setCreateNameWarning(checkSimilarName(e.target.value))} />
          </Field>
          {createNameWarning ? (
            <Notice tone="warning">{createNameWarning}</Notice>
          ) : null}
          <Field label="Legal entity name" description="Registered PT / CV name if applicable.">
            <Input name="legalName" maxLength={128} placeholder="e.g. PT Mitra Kayu Nusantara" />
          </Field>
          <Field label="Vendor types" description="Search the controlled type vocabulary; assign role dimensions to grant pricing capabilities.">
            <CreatableMultiSelect label="Vendor types" options={vendorTypes.map((type) => ({ id: type.id, label: type.name, description: `${type.can_supply_material ? "Material" : ""}${type.can_supply_material && type.can_supply_labor ? " · " : ""}${type.can_supply_labor ? "Labor" : ""}` }))} value={createVendorTypeIds} onValueChange={setCreateVendorTypeIds} placeholder="Search vendor types" searchPlaceholder="Search vendor types…" />
          </Field>
          <Field label="Office / Workshop address">
            <Input name="address" maxLength={256} placeholder="Address, City" />
          </Field>

          <div className="grid gap-3 border-t border-line pt-3">
            <div className="flex justify-between items-center">
              <Text size="sm" weight="semibold">Personnel &amp; Sales Contacts</Text>
              <Button type="button" size="sm" variant="secondary" onClick={addContactDraft}>
                <UserPlus size={14} />
                <span>Add contact</span>
              </Button>
            </div>
            {contactsList.length === 0 ? (
              <div className="text-xs text-ink-tertiary py-3 text-center border border-dashed border-line rounded">
                No contacts yet. Contacts can also be added later from Edit.
              </div>
            ) : null}
            {contactsList.map((contact, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 p-2.5 border border-line rounded bg-surface-muted/40 relative">
                <IconButton
                  label="Remove contact"
                  onClick={() => removeContactDraft(idx)}
                  title="Remove"
                  icon={<X size={14} />}
                  size="sm"
                  className="absolute right-2 top-2 !h-6 !w-6 !min-h-6 !border-0 !bg-transparent !p-0 !text-ink-tertiary hover:!bg-transparent hover:!text-ink-danger"
                />
                <Field label="Contact name" className="col-span-2 sm:col-span-1">
                  <Input
                    value={contact.personName}
                    onChange={(e) => updateContactDraft(idx, { personName: e.target.value })}
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
                  <Combobox label={`Brand scope for ${contact.personName || "contact"}`} options={[{ id: "", label: "All vendor brands" }, ...brands.map((brand) => ({ id: brand.id, label: brand.name }))]} value={contact.brandId} onValueChange={(brandId) => updateContactDraft(idx, { brandId })} placeholder="All vendor brands" searchPlaceholder="Search brands…" />
                </Field>
                <label className="col-span-2 flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={contact.isPrimary} onChange={(e) => updateContactDraft(idx, { isPrimary: e.target.checked })} className="h-4 w-4 rounded border-line accent-brand" />
                  <span className="text-sm text-ink-secondary">Primary contact</span>
                </label>
              </div>
            ))}
          </div>

          <Field label="Notes">
            <SimpleTextEditor name="notes" placeholder="Payment terms, workshop capacity, etc." rows={2} />
          </Field>

          <FormActions>
            <Button type="button" variant="ghost" onClick={() => void createDraftGuard.requestDiscard(() => setCreateOpen(false))}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={createPending}>
              {createPending ? <Spinner /> : "Create vendor"}
            </Button>
          </FormActions>
        </form>
      </Dialog>
      {createDraftGuard.confirmDialog}

      {/* Edit Vendor Dialog */}
      {editTarget ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !editPending) void editDraftGuard.requestDiscard(() => setEditTarget(null));
          }}
          title={`Edit vendor ${editTarget.name}`}
          description="Update the vendor profile, capability types, contacts, and reference links."
          dismissible={!editPending}
        >
          <form
            ref={editFormRef}
            onChange={editDraftGuard.onFormChange}
            onSubmit={async (e) => {
              e.preventDefault();
              setEditPending(true);
              setEditError(null);
              const fd = new FormData(e.currentTarget);
              fd.set("contactsJson", JSON.stringify(contactsList.filter((c) => c.personName?.trim())));
              fd.set("linksJson", JSON.stringify(linksList));
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
            {editVendorTypeIds.map((id) => <input key={id} type="hidden" name="vendorTypeIds" value={id} />)}
            {editError ? <InlineError>{editError}</InlineError> : null}

            <Tabs keepMounted
              items={[
                {
                  value: "profile",
                  label: "Profile & Types",
                  content: (
                    <div className="grid gap-4">
                      <Field label="Vendor trade name" required>
                        <Input name="name" value={editName} required maxLength={64} autoFocus onChange={(e) => { setEditName(e.target.value); setEditNameWarning(checkSimilarName(e.target.value, editTarget.id)); }} />
                      </Field>
                      {editNameWarning ? (
                        <Notice tone="warning">{editNameWarning}</Notice>
                      ) : null}
                      <Field label="Legal entity name">
                        <Input name="legalName" value={editLegalName} maxLength={128} onChange={(e) => setEditLegalName(e.target.value)} />
                      </Field>
                      <Field label="Vendor types" description="Search the controlled type vocabulary. Removing capability types is guarded against active dependent prices.">
                        <CreatableMultiSelect label="Vendor types" options={vendorTypes.map((type) => ({ id: type.id, label: type.name, description: `${type.can_supply_material ? "Material" : ""}${type.can_supply_material && type.can_supply_labor ? " · " : ""}${type.can_supply_labor ? "Labor" : ""}` }))} value={editVendorTypeIds} onValueChange={setEditVendorTypeIds} placeholder="Search vendor types" searchPlaceholder="Search vendor types…" />
                      </Field>
                      <Field label="Office / Workshop address">
                        <Input name="address" value={editAddress} maxLength={256} onChange={(e) => setEditAddress(e.target.value)} />
                      </Field>
                      <Field label="Notes">
                        <SimpleTextEditor name="notes" value={editNotes} rows={2} onChange={(e) => setEditNotes(e.target.value)} />
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
                          <IconButton
                            label="Remove contact"
                            onClick={() => removeContactDraft(idx)}
                            title="Remove"
                            icon={<X size={14} />}
                            size="sm"
                            className="absolute right-2 top-2 !h-6 !w-6 !min-h-6 !border-0 !bg-transparent !p-0 !text-ink-tertiary hover:!bg-transparent hover:!text-ink-danger"
                          />
                          <Field label="Contact name" className="col-span-2 sm:col-span-1">
                            <Input
                              value={contact.personName}
                              onChange={(e) => updateContactDraft(idx, { personName: e.target.value })}
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
                            <Combobox label={`Brand scope for ${contact.personName || "contact"}`} options={[{ id: "", label: "All vendor brands" }, ...brands.map((brand) => ({ id: brand.id, label: brand.name }))]} value={contact.brandId} onValueChange={(brandId) => updateContactDraft(idx, { brandId })} placeholder="All vendor brands" searchPlaceholder="Search brands…" />
                          </Field>
                          <label className="col-span-2 flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={contact.isPrimary} onChange={(e) => updateContactDraft(idx, { isPrimary: e.target.checked })} className="h-4 w-4 rounded border-line accent-brand" />
                            <span className="text-sm text-ink-secondary">Primary contact</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  value: "resources",
                  label: `Links (${linksList.length})`,
                  content: (
                    <div className="grid gap-4">
                      <div className="grid gap-3">
                        <Text size="sm" weight="semibold">Reference Links</Text>
                        {linksList.map((link, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs bg-surface-muted p-2 rounded">
                            <span className="font-mono">{VENDOR_LINK_KINDS.find((k) => k.value === link.kind)?.label ?? link.kind}: {link.label || link.url}</span>
                            <Button type="button" size="sm" variant="ghost" onClick={() => removeLinkDraft(idx)}>Remove</Button>
                          </div>
                        ))}
                        <div className="grid gap-3 rounded border border-line bg-surface-muted/30 p-3">
                          <Field label="Link type">
                            <Select value={newLinkKind} onChange={(e) => setNewLinkKind(e.target.value)}>
                              {VENDOR_LINK_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                            </Select>
                          </Field>
                          <Field label="URL" required><Input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="https://example.com" /></Field>
                          <Field label="Display label"><Input value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} placeholder="Optional label, e.g. Price list 2026" /></Field>
                          <Field label="Archive URL" description="Archived/cached version of this link (optional)."><Input value={newLinkArchiveUrl} onChange={(e) => setNewLinkArchiveUrl(e.target.value)} placeholder="https://web.archive.org/web/..." /></Field>
                          <Button type="button" size="sm" variant="secondary" className="justify-self-start" onClick={addLinkDraft}>Add link</Button>
                        </div>
                      </div>
                    </div>
                  ),
                },
                {
                  value: "brand_suppliers",
                  label: `Brand Suppliers (${editTarget.brand_suppliers.length})`,
                  content: (
                    <div className="grid gap-3">
                      <Text size="sm" weight="semibold">Authorized Brand Relationships</Text>
                      {editTarget.brand_suppliers.length === 0 ? (
                        <div className="text-xs text-ink-tertiary py-3 text-center border border-dashed border-line rounded">
                          No brand supplier relationships registered for this vendor.
                        </div>
                      ) : (
                        editTarget.brand_suppliers.map((bs) => (
                          <div key={bs.id} className="flex items-center justify-between p-2.5 border border-line rounded bg-surface-muted/40">
                            <div className="grid gap-0.5">
                              <Text size="sm" weight="semibold">{bs.brand.name}</Text>
                              {bs.notes ? <Text size="sm" className="text-ink-secondary">{bs.notes}</Text> : null}
                            </div>
                            <Badge tone={bs.is_authorized ? "success" : "neutral"}>
                              {bs.is_authorized ? "Authorized" : "Pending"}
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                  ),
                },
              ]}
            />

            {editTarget.updated_by_label ? (
              <p className="text-xs text-ink-tertiary px-0.5">
                Updated by <span className="font-medium text-ink-secondary">{editTarget.updated_by_label}</span> · {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(editTarget.updated_at)}
              </p>
            ) : null}
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
