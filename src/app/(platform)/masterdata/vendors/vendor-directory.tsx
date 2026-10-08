"use client";
import { FilterSummary, StatusFilterSelect } from "../directory-filters";
import { RequestDeletionDialog } from "../request-deletion-dialog";
import { UpdatedCell } from "../updated-cell";
import { PhoneNumbersField, contactPhoneList, phoneSummary } from "../contact-phones";
import { carriedBrandNames, matchesDirectoryStatus, type DirectoryStatus } from "../directory-findability";
import { PhoneLinks } from "../phone-links";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { formatInstant } from "@platform/utilities/date";
import {
  Checkbox,
  DirectoryShell,
  DraftDialog,
  Pagination,
  RowActionMenu,
  RowActionsCell,
  RowActionsHead,
  Text,
  usePagination,
} from "@/platform/ui_engine";


import { Plus,UserPlus,X } from "lucide-react";
import { useRef,useState } from "react";
import { useRowAction } from "@/platform/ui_engine";

import { Badge,Button,Combobox,ConfirmDialog,CreatableMultiSelect,DataTable,Dialog,EmptyState,EntityPrimaryCell,Field,FormActions,HelpHint,IconButton,InlineError,Input,Notice,SearchField,Select,SimpleTextEditor,TableBody,TableCell,TableCellContent,TableHead,TableHeader,TableRow,TableToolbar,Tabs,useFormDraftGuard,useOptionOverlay } from "@/platform/ui_engine";
import {
archiveVendorAction,
createVendorAction,
requestVendorDeletionAction,
restoreVendorAction,
updateVendorAction,
} from "./actions";
import { createPricingProductCategoryQuickAction, createPricingWorkCategoryQuickAction } from "../pricing/actions";

/** Product categories of the brands a supplier carries, alphabetical and de-duplicated (archived categories left out). */
function carriedBrands(vendor: Pick<VendorRow, "brand_suppliers" | "owned_brands">) {
  const seen = new Set<string>();
  return [...vendor.owned_brands, ...vendor.brand_suppliers.map((relation) => relation.brand)].filter((brand) => (seen.has(brand.id) ? false : (seen.add(brand.id), true)));
}

function brandCategoryNames(vendor: Pick<VendorRow, "brand_suppliers" | "owned_brands">): string[] {
  const names = new Set<string>();
  for (const brand of carriedBrands(vendor)) {
    for (const assignment of brand.categories ?? []) {
      if (assignment.category.status === "ACTIVE") names.add(assignment.category.name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

type VendorRow = {
  id: string;
  name: string;
  slug: string;
  legal_name: string | null;
  address: string | null;
  notes: string | null;
  info_links: unknown;
  link_review_snapshot: unknown;
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
  categories: Array<{
    category: {
      id: string;
      name: string;
      kind: "PRODUCT" | "WORK";
      status: string;
    };
  }>;
  contacts: Array<{
    id: string;
    person_name: string;
    job_title: string | null;
    email: string | null;
    phone: string | null;
    extra_phones: string[];
    is_primary: boolean;
    brand_id: string | null;
    notes: string | null;
  }>;
  brand_suppliers: Array<{
    id: string;
    is_authorized: boolean;
    notes: string | null;
    /** `categories` are the brand's product categories; the Suppliers list derives a supplier's "from brands" categories from them. */
    brand: { id: string; name: string; categories?: Array<{ category: { id: string; name: string; status: string } }> };
  }>;
  owned_brands: Array<{ id: string; name: string; categories?: Array<{ category: { id: string; name: string; status: string } }> }>;
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
type VendorCategoryOption = { id: string; name: string; kind: "PRODUCT" | "WORK" };

const LINK_KINDS = ["WEBSITE", "INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE", "LINKEDIN", "WHATSAPP"] as const;
type LinkEntry = { kind: string; url: string; label: string | null };
function parseLinks(value: unknown): LinkEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as Record<string, unknown>;
    if (typeof e.url !== "string" || !e.url) return [];
    return [{ kind: typeof e.kind === "string" ? e.kind : "WEBSITE", url: e.url, label: typeof e.label === "string" ? e.label : null }];
  });
}

// vendor-contract §5 (R6.24): SupplierLinksEditor is a controlled component —
// all add/remove/resolve operations are staged locally. They are committed
// atomically with the rest of the Vendor profile when the Edit dialog is saved.
function SupplierLinksEditor({ links, snapshot, onLinksChange, onSnapshotChange, canManage }: {
  links: LinkEntry[];
  snapshot: LinkEntry[];
  onLinksChange: (links: LinkEntry[]) => void;
  onSnapshotChange: (snapshot: LinkEntry[]) => void;
  canManage: boolean;
}) {
  const [newKind, setNewKind] = useState<string>(LINK_KINDS[0]);
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [acceptedIdxs, setAcceptedIdxs] = useState<Set<number>>(new Set());
  const [reviewKinds, setReviewKinds] = useState<Record<number, string>>({});
  const [linkError, setLinkError] = useState<string | null>(null);

  const handleAdd = () => {
    const url = newUrl.trim();
    if (!url) return;
    if (links.some(l => l.url === url)) { setLinkError("This URL is already in the list."); return; }
    setLinkError(null);
    onLinksChange([...links, { kind: newKind, url, label: newLabel.trim() || null }]);
    setNewUrl("");
    setNewLabel("");
  };

  const handleRemove = (idx: number) => onLinksChange(links.filter((_, i) => i !== idx));

  const handleResolveReview = () => {
    const accepted = [...acceptedIdxs].filter(i => i >= 0 && i < snapshot.length);
    const missingKind = accepted.some((index) => !LINK_KINDS.includes((snapshot[index]?.kind ?? "") as typeof LINK_KINDS[number]) && !reviewKinds[index]);
    if (missingKind) { setLinkError("Choose a company information kind for every accepted historical link."); return; }
    const acceptedItems = accepted.map((index) => ({ ...snapshot[index], kind: reviewKinds[index] ?? snapshot[index].kind })).filter(Boolean) as LinkEntry[];
    onLinksChange([...links, ...acceptedItems]);
    onSnapshotChange([]);
    setAcceptedIdxs(new Set());
  };

  return (
    <div className="grid gap-3">
      {linkError ? <InlineError>{linkError}</InlineError> : null}
      <Field label="Company information links" description="WEBSITE, INSTAGRAM, FACEBOOK, TIKTOK, YOUTUBE, LINKEDIN, or WHATSAPP. HTTP/HTTPS only.">
        <div className="grid gap-2">
        {links.length ? (
          <div className="grid gap-1">
            {links.map((link, idx) => (
              <div key={link.url} className="flex items-center gap-2 text-sm">
                <span className="text-label text-ink-tertiary shrink-0">{link.kind}</span>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-action underline wrap-anywhere flex-1 min-w-0">{link.label || link.url}</a>
                {canManage ? <IconButton label="Remove link" icon={<X size={12} />} size="sm" className="!h-5 !w-5 !min-h-5 !border-0 !bg-transparent !p-0 !text-ink-tertiary hover:!text-danger shrink-0" onClick={() => handleRemove(idx)} /> : null}
              </div>
            ))}
          </div>
        ) : <span className="text-ink-tertiary text-sm">No company links added.</span>}
        {canManage ? (
          <div className="mt-2 grid gap-2 border-t border-line pt-2">
            <div className="flex gap-2 items-end">
              <Field label="Kind" className="w-36 shrink-0">
                <Select value={newKind} onChange={e => setNewKind(e.target.value)}>
                  {LINK_KINDS.map(k => <option key={k} value={k}>{k.charAt(0) + k.slice(1).toLowerCase()}</option>)}
                </Select>
              </Field>
              <Field label="URL" className="flex-1 min-w-0">
                <Input value={newUrl} onChange={e => { setNewUrl(e.target.value); setLinkError(null); }} placeholder="https://..." maxLength={2048} />
              </Field>
              <Field label="Label (optional)" className="w-36 shrink-0">
                <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Display name" maxLength={200} />
              </Field>
              <Button type="button" size="sm" variant="secondary" disabled={!newUrl.trim()} onClick={handleAdd}>Add</Button>
            </div>
          </div>
        ) : null}
        </div>
      </Field>
      {snapshot.length > 0 ? (
        <Field label="Links pending review" description="These links were preserved from a previous import. Accept the ones that belong to this Supplier; the rest will be discarded.">
          <div className="grid gap-2">
          <div className="grid gap-1 border border-line rounded p-2 bg-surface-muted/40">
            {snapshot.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <Checkbox
                  className="shrink-0"
                  aria-label={`Keep ${item.url}`}
                  checked={acceptedIdxs.has(idx)}
                  onCheckedChange={(checked) => {
                    setAcceptedIdxs(prev => { const next = new Set(prev); if (checked === true) next.add(idx); else next.delete(idx); return next; });
                  }}
                />
                <span className="text-label text-ink-tertiary shrink-0">{item.kind}</span>
                <span className="wrap-anywhere flex-1 min-w-0">{item.label ? `${item.label} — ` : ""}{item.url}</span>
                {!LINK_KINDS.includes(item.kind as typeof LINK_KINDS[number]) ? <Select aria-label={`Information kind for ${item.url}`} value={reviewKinds[idx] ?? ""} onChange={(event) => setReviewKinds((previous) => ({ ...previous, [idx]: event.target.value }))} className="w-36 shrink-0"><option value="">Reclassify…</option>{LINK_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</Select> : null}
              </div>
            ))}
          </div>
          {canManage ? <Button type="button" size="sm" variant="secondary" onClick={handleResolveReview} className="mt-2">
            Resolve review ({acceptedIdxs.size} accepted, {snapshot.length - acceptedIdxs.size} discarded)
          </Button> : null}
          </div>
        </Field>
      ) : null}
    </div>
  );
}

type ContactDraft = {
  id?: string;
  personName: string;
  jobTitle: string;
  email: string;
  phones: string[];
  isPrimary: boolean;
  brandId: string;
  notes: string;
};

export function VendorDirectory({
  vendors,
  vendorTypes,
  categories,
  brands,
  canManage,
  canManageCategories,
}: {
  vendors: VendorRow[];
  vendorTypes: VendorTypeOption[];
  categories: VendorCategoryOption[];
  brands: BrandOption[];
  canManage: boolean;
  canManageCategories: boolean;
}) {
  const { options: categoryOptions, upsertOverlayOption: upsertCategoryOption } = useOptionOverlay(categories);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DirectoryStatus>("ACTIVE");
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [capabilityFilter, setCapabilityFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VendorRow | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<VendorRow | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<VendorRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VendorRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const { pendingId, rowError, runRowAction } = useRowAction();

  // Form sub-collections
  const [contactsList, setContactsList] = useState<ContactDraft[]>([]);
  const [createVendorTypeIds, setCreateVendorTypeIds] = useState<string[]>([]);
  const [editVendorTypeIds, setEditVendorTypeIds] = useState<string[]>([]);
  const [createCategoryIds, setCreateCategoryIds] = useState<string[]>([]);
  const [editCategoryIds, setEditCategoryIds] = useState<string[]>([]);
  // Optional at creation — most suppliers are added before anyone has decided
  // which Brand they carry (owner: "kalau belum tau brandnya, input aja juga
  // gpp"). The relation stays editable later from each Brand's own screen,
  // same as it already is today.
  const [createBrandIds, setCreateBrandIds] = useState<string[]>([]);
  // Staged link state — committed atomically with vendor profile on Save
  const [stagedLinks, setStagedLinks] = useState<LinkEntry[]>([]);
  const [stagedSnapshot, setStagedSnapshot] = useState<LinkEntry[]>([]);

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
    watchedValue: JSON.stringify([createVendorTypeIds, createCategoryIds, createBrandIds, contactsList]),
    title: "Discard supplier draft?",
    description: "Your changes are only in this browser and have not been saved.",
  });
  const editDraftGuard = useFormDraftGuard({
    formRef: editFormRef,
    resetKey: editTarget?.id ?? "",
    active: Boolean(editTarget),
    watchedValue: JSON.stringify([editVendorTypeIds, editCategoryIds, contactsList, stagedLinks, stagedSnapshot]),
    title: "Discard changes?",
    description: "Your edits are only in this browser and have not been saved.",
  });

  const matchesQuery = (v: VendorRow) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      v.slug.toLowerCase().includes(q) ||
      (v.legal_name && v.legal_name.toLowerCase().includes(q)) ||
      v.contacts.some((c) => c.person_name.toLowerCase().includes(q) || (c.email && c.email.toLowerCase().includes(q)) || contactPhoneList(c).some((phone) => phone.replace(/D/g, "").includes(q.replace(/D/g, "")))) ||
      (v.address?.toLowerCase().includes(q) ?? false) || (v.notes?.toLowerCase().includes(q) ?? false) || carriedBrandNames(v.owned_brands, v.brand_suppliers).some((name) => name.toLowerCase().includes(q))
    );
  };
  const filtered = vendors.filter((v) => {
    if (!matchesDirectoryStatus(v.deleted_at, statusFilter)) return false;
    if (typeFilter !== "ALL" && !v.types.some((t) => t.vendor_type.id === typeFilter)) return false;
    if (categoryFilter !== "ALL" && !v.categories.some((c) => c.category.id === categoryFilter)) return false;
    if (productCategoryFilter !== "ALL" && !carriedBrands(v).some((brand) => brand.categories?.some((category) => category.category.id === productCategoryFilter && category.category.status === "ACTIVE"))) return false;
    if (brandFilter !== "ALL" && !v.brand_suppliers.some((item) => item.brand.id === brandFilter) && !v.owned_brands.some((item) => item.id === brandFilter)) return false;
    if (capabilityFilter === "MATERIAL" && !v.types.some((item) => item.vendor_type.can_supply_material)) return false;
    if (capabilityFilter === "LABOR" && !v.types.some((item) => item.vendor_type.can_supply_labor)) return false;
    return matchesQuery(v);
  });
  // A typed name can match a supplier that a filter (often the type) hides: say so instead of looking like the search failed.
  const hiddenMatches = query ? vendors.filter((v) => !filtered.includes(v) && matchesQuery(v)) : [];
  const { locale, timezone } = useDisplaySettings();
  const [sortKey, setSortKey] = useState<"Supplier" | "Brands">("Supplier");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const sortValues: Record<"Supplier" | "Brands", (r: VendorRow) => string | number | null> = {"Supplier": (r) => r.name, "Brands": (r) => carriedBrandNames(r.owned_brands, r.brand_suppliers).length};
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const orderedRows = [...filtered].sort((a, b) => {
    const left = sortValues[sortKey](a), right = sortValues[sortKey](b);
    if (left === null || right === null) return left === right ? a.id.localeCompare(b.id) : left === null ? 1 : -1;
    const result = typeof left === "number" && typeof right === "number" ? left - right : collator.compare(String(left), String(right));
    return (sortDirection === "asc" ? result : -result) || a.id.localeCompare(b.id);
  });
  const productCategoryOptions = [...new Map(vendors.flatMap((vendor) => carriedBrands(vendor).flatMap((brand) => (brand.categories ?? []).filter((category) => category.category.status === "ACTIVE").map((category) => [category.category.id, category.category.name] as const)))).entries()].map(([id, name]) => ({ id, name }));
  const paging = usePagination(orderedRows.length, 25, JSON.stringify([query, statusFilter, typeFilter, categoryFilter, productCategoryFilter, brandFilter, capabilityFilter, sortKey, sortDirection]));
  const visibleRows = orderedRows.slice(paging.offset, paging.offset + 25);
  const pageFooter = <div className="grid gap-2"><Text tone="secondary" size="sm">{orderedRows.length ? paging.offset + 1 : 0}–{Math.min(paging.offset + 25, orderedRows.length)} of {orderedRows.length} records</Text>{paging.pageCount > 1 ? <Pagination page={paging.page} pageCount={paging.pageCount} onPageChange={paging.setPage} /> : null}</div>;


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
    return similar ? `Potential duplicate: a similar supplier "${similar.name}" already exists.` : null;
  };

  const createCategory = async (kind: "PRODUCT" | "WORK", name: string, setError: (error: string | null) => void) => {
    setError(null);
    const formData = new FormData();
    formData.set("name", name);
    const result = await (kind === "WORK" ? createPricingWorkCategoryQuickAction(formData) : createPricingProductCategoryQuickAction(formData));
    if (result.ok === false) {
      setError(result.error.safeMessage);
      return;
    }
    upsertCategoryOption({ id: result.data.categoryId, name: name.trim(), kind });
    return result.data.categoryId;
  };

  // The supplier form shows work (trade) and product categories as two fields over one id list.
  const categoryKindById = new Map(categoryOptions.map((category) => [category.id, category.kind] as const));
  const idsOfKind = (ids: string[], kind: "PRODUCT" | "WORK") => ids.filter((id) => categoryKindById.get(id) === kind);
  const withKind = (ids: string[], kind: "PRODUCT" | "WORK", next: string[]) => [...ids.filter((id) => categoryKindById.get(id) !== kind), ...next];

  // Mirrors brand.service.ts's assertVendorMaterialCapable: a Brand relation
  // can only be recorded once the Vendor is actually material-capable, so the
  // field is disabled (not just server-validated) until that's true.
  const createCanSupplyMaterial = createVendorTypeIds.some((id) => vendorTypes.find((type) => type.id === id)?.can_supply_material);
  // Adjust state during render rather than in an effect: dropping the last
  // material-capable type clears a selection that would otherwise fail on
  // submit with no visible reason why.
  if (!createCanSupplyMaterial && createBrandIds.length > 0) setCreateBrandIds([]);

  const openCreateDialog = () => {
    setContactsList([]);
    setCreateVendorTypeIds([]);
    setCreateCategoryIds([]);
    setCreateBrandIds([]);
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
        phones: contactPhoneList(c),
        isPrimary: c.is_primary ?? false,
        brandId: c.brand_id ?? "",
        notes: c.notes ?? "",
      })),
    );
    setEditVendorTypeIds(vendor.types.map((type) => type.vendor_type.id));
    setEditCategoryIds(vendor.categories.map((entry) => entry.category.id));
    setStagedLinks(parseLinks(vendor.info_links));
    setStagedSnapshot(parseLinks(vendor.link_review_snapshot));
    setEditName(vendor.name);
    setEditLegalName(vendor.legal_name ?? "");
    setEditAddress(vendor.address ?? "");
    setEditNotes(vendor.notes ?? "");
    setEditNameWarning(null);
    setEditTarget(vendor);
  };

  /** A contact scoped to a Brand the supplier does not carry yet also links the supplier to that Brand when saved. */
  const scopeHint = (brandId: string, relatedBrandIds: readonly string[]) => {
    if (!brandId || relatedBrandIds.includes(brandId)) return undefined;
    const brandName = brands.find((brand) => brand.id === brandId)?.name ?? "this Brand";
    return `Saving also adds this supplier to ${brandName}'s suppliers.`;
  };

  const addContactDraft = () => {
    setContactsList([...contactsList, { personName: "", jobTitle: "", email: "", phones: [""], isPrimary: false, brandId: "", notes: "" }]);
  };

  const updateContactDraft = (idx: number, patch: Partial<ContactDraft>) => {
    const next = [...contactsList];
    next[idx] = { ...next[idx], ...patch };
    setContactsList(next);
  };

  const removeContactDraft = (idx: number) => {
    setContactsList(contactsList.filter((_, i) => i !== idx));
  };

  return (
    <DirectoryShell fill header={rowError ? <InlineError>{rowError}</InlineError> : undefined} surface pagination={pageFooter} toolbar={<TableToolbar framed={false} actions={canManage ? (
        <Button type="button" variant="primary" onClick={openCreateDialog}>
          <Plus aria-hidden="true" />
          <span>New supplier</span>
        </Button>
      ) : undefined}>
        <SearchField value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} onClear={() => setQuery("")} placeholder="Search suppliers, brands, address, phone..." />
        <StatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
        <div className="w-48">
          <Select value={typeFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTypeFilter(e.target.value)}>
            <option value="ALL">All supplier types</option>
            {vendorTypes.map((vt) => (
              <option key={vt.id} value={vt.id}>
                {vt.name}
              </option>
            ))}
          </Select>
        </div>
        <Select value={productCategoryFilter} onChange={(e) => setProductCategoryFilter(e.target.value)}><option value="ALL">All product categories</option>{productCategoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select>
        <Select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}><option value="ALL">All brands</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</Select>
        <Select value={capabilityFilter} onChange={(e) => setCapabilityFilter(e.target.value)}><option value="ALL">Any capability</option><option value="MATERIAL">Material</option><option value="LABOR">Labor</option></Select>
        <FilterSummary filtered={Boolean(query) || statusFilter !== "ACTIVE" || typeFilter !== "ALL" || categoryFilter !== "ALL" || productCategoryFilter !== "ALL" || brandFilter !== "ALL" || capabilityFilter !== "ALL"} shown={filtered.length} total={vendors.length} onClear={() => { setQuery(""); setStatusFilter("ACTIVE"); setTypeFilter("ALL"); setCategoryFilter("ALL"); setProductCategoryFilter("ALL"); setBrandFilter("ALL"); setCapabilityFilter("ALL"); }} />
        <div className="w-48">
          <Select value={categoryFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCategoryFilter(e.target.value)}>
            <option value="ALL">All categories</option>
            <optgroup label="Work categories">{categoryOptions.filter((category) => category.kind === "WORK").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</optgroup>
            <optgroup label="Product categories">{categoryOptions.filter((category) => category.kind === "PRODUCT").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</optgroup>
          </Select>
        </div>
      </TableToolbar>}>


      {hiddenMatches.length > 0 ? <Notice tone="neutral" title={`${hiddenMatches.length} more ${hiddenMatches.length === 1 ? "supplier matches" : "suppliers match"} "${query}" but ${hiddenMatches.length === 1 ? "is" : "are"} hidden by the filters`}>
        <div className="flex flex-wrap items-center gap-2"><Text size="sm" tone="secondary">{hiddenMatches.slice(0, 3).map((v) => v.name).join(", ")}{hiddenMatches.length > 3 ? ", …" : ""}</Text><Button size="sm" onClick={() => { setStatusFilter("ALL"); setTypeFilter("ALL"); setCategoryFilter("ALL"); setProductCategoryFilter("ALL"); setBrandFilter("ALL"); setCapabilityFilter("ALL"); }}>Show them (clear the filters)</Button></div>
      </Notice> : null}
      {filtered.length === 0 ? (
        <EmptyState
          title="No suppliers found"
          description={query ? "No suppliers match your search filters." : "Register your first supplier."}

        />
      ) : (
        <DataTable framed={false} density="compact" stickyHeader fill minWidth={820}>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Types &amp; Capabilities</TableHead>
              <TableHead>Categories</TableHead>
              <TableHead sortable sortDirection={sortKey === "Brands" ? sortDirection : null} onSortChange={(direction) => { setSortKey("Brands"); setSortDirection(direction); }}>Brands</TableHead>
              <TableHead>Contacts</TableHead>
              <TableHead align="end">Prices</TableHead>
              <TableHead>Updated</TableHead>
              <RowActionsHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((vendor) => {
              const isPending = pendingId === vendor.id;
              const isArchived = vendor.deleted_at !== null;
              const hasMaterial = vendor.types.some((t) => t.vendor_type.can_supply_material);
              const hasLabor = vendor.types.some((t) => t.vendor_type.can_supply_labor);
              const totalPriceCount =
                vendor._count.material_prices + vendor._count.material_labor_prices + vendor._count.labor_prices;

              return (
                <TableRow key={vendor.id}>
                  <TableCell>
                    <EntityPrimaryCell
                      tone={isArchived ? "danger" : "success"}
                      statusLabel={isArchived ? "Archived" : "Active"}
                      name={vendor.name}
                      secondary={vendor.address ? <span className="text-xs text-ink-secondary">{vendor.address}</span> : undefined}
                    />
                  </TableCell>
                  <TableCell><span className="text-xs text-ink-secondary" title={carriedBrandNames(vendor.owned_brands, vendor.brand_suppliers).join(", ")}>{carriedBrandNames(vendor.owned_brands, vendor.brand_suppliers).slice(0, 3).join(", ") || "—"}{carriedBrandNames(vendor.owned_brands, vendor.brand_suppliers).length > 3 ? ` +${carriedBrandNames(vendor.owned_brands, vendor.brand_suppliers).length - 3}` : ""}</span></TableCell>
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
                    <div className="flex flex-wrap gap-1 items-center max-w-xs">
                      {vendor.categories.length === 0 && brandCategoryNames(vendor).length === 0 ? (
                        <span className="text-ink-tertiary text-xs">No categories</span>
                      ) : (
                        vendor.categories.map((c) => <Badge key={c.category.id} tone="neutral" title={c.category.kind === "WORK" ? "Work category" : "Product category"}>{c.category.name}</Badge>)
                      )}
                      {brandCategoryNames(vendor).length > 0 ? (
                        <span className="text-ink-tertiary text-xs" title="Product categories of the brands this supplier carries. Read-only: change them on the Brands.">
                          {vendor.categories.length > 0 ? "+ " : ""}from brands: {brandCategoryNames(vendor).slice(0, 3).join(", ")}{brandCategoryNames(vendor).length > 3 ? ` +${brandCategoryNames(vendor).length - 3}` : ""}
                        </span>
                      ) : null}
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
                            {contactPhoneList(c).length > 0 ? <span> (<PhoneLinks phones={contactPhoneList(c)} keyPrefix={c.id} />)</span> : c.email ? ` (${c.email})` : ""}
                          </div>
                        ))
                      )}
                      {vendor.contacts.length > 2 ? (
                        <span className="text-ink-tertiary">+{vendor.contacts.length - 2} more</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell align="end">
                    <TableCellContent align="end" primary={totalPriceCount.toLocaleString()} secondary={<span title={`M ${vendor._count.material_prices} · M+L ${vendor._count.material_labor_prices} · L ${vendor._count.labor_prices}`}>M {vendor._count.material_prices} · M+L {vendor._count.material_labor_prices} · L {vendor._count.labor_prices}</span>} />
                  </TableCell>
                  <UpdatedCell at={vendor.updated_at} by={vendor.updated_by_label} />
                  <RowActionsCell>
                    <RowActionMenu label={`Actions for ${vendor.name}`} pending={pendingId === vendor.id} items={[...[],...(isPending ? [] : []),...[],...(canManage ? [...[],...[{ label: "Edit", onSelect: () => openEditDialog(vendor), disabled: isPending, danger: false, separatorBefore: false }],...[],...(!isArchived ? [{ label: "Archive", onSelect: () => setConfirmArchive(vendor), disabled: isPending, danger: false, separatorBefore: false }] : [...[],...[{ label: "Restore", onSelect: () => setConfirmRestore(vendor), disabled: isPending, danger: false, separatorBefore: false }],...[],...[{ label: "Request deletion", onSelect: () => setDeleteTarget(vendor), disabled: isPending, danger: true, separatorBefore: true }],...[]]),...[]] : []),...[]]} />
                  </RowActionsCell>
                </TableRow>
              );
            })}
          </TableBody>
        </DataTable>
      )}

      {/* Create Vendor Dialog */}
      <Dialog size="lg"
        open={createOpen}
        onOpenChange={(open) => {
          if (open) setCreateOpen(true);
          else if (!createPending) void createDraftGuard.requestDiscard(() => setCreateOpen(false));
        }}
        title="Create supplier"
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
              } else if (res && "ok" in res && res.ok === false) {
                setCreateError(res.error.safeMessage);
              }
            } finally {
              setCreatePending(false);
            }
          }}
          className="grid gap-4  pr-1"
        >
          {createVendorTypeIds.map((id) => <input key={id} type="hidden" name="vendorTypeIds" value={id} />)}
          {createCategoryIds.map((id) => <input key={id} type="hidden" name="categoryIds" value={id} />)}
          {createBrandIds.map((id) => <input key={id} type="hidden" name="brandIds" value={id} />)}
          {createError ? <InlineError>{createError}</InlineError> : null}

          <Field label="Supplier name" required>
            <Input name="name" textCase="title" required maxLength={64} placeholder="e.g. Mitra Kayu Nusantara" autoFocus onChange={(e) => setCreateNameWarning(checkSimilarName(e.target.value))} />
          </Field>
          {createNameWarning ? (
            <Notice tone="warning">{createNameWarning}</Notice>
          ) : null}
          <Field label="Legal entity name" description="Registered PT / CV name if applicable.">
            <Input name="legalName" textCase="title" maxLength={128} placeholder="e.g. PT Mitra Kayu Nusantara" />
          </Field>
          <Field label="Supplier types" description="Search the controlled type vocabulary; assign role dimensions to grant pricing capabilities.">
            <CreatableMultiSelect label="Supplier types" options={vendorTypes.map((type) => ({ id: type.id, label: type.name, description: `${type.can_supply_material ? "Material" : ""}${type.can_supply_material && type.can_supply_labor ? " · " : ""}${type.can_supply_labor ? "Labor" : ""}` }))} value={createVendorTypeIds} onValueChange={setCreateVendorTypeIds} placeholder="Search supplier types" searchPlaceholder="Search supplier types…" />
          </Field>
          <Field
            label="Brands supplied"
            description={
              createCanSupplyMaterial
                ? "Optional. Leave it blank if you don't know yet — it can be set or changed later from each Brand."
                : "Optional — needs a material-capable Supplier type above first (e.g. Material or Material & Labor)."
            }
          >
            <CreatableMultiSelect
              label="Brands supplied"
              options={brands.map((brand) => ({ id: brand.id, label: brand.name }))}
              value={createBrandIds}
              onValueChange={setCreateBrandIds}
              placeholder="Search brands"
              searchPlaceholder="Search brands…"
              disabled={!createCanSupplyMaterial}
            />
          </Field>
          <Field label="Work categories" description="The trades this supplier does, such as MEP or Sipil. Pricing a job for this supplier adds its category here automatically.">
            <CreatableMultiSelect label="Work categories" options={categoryOptions.filter((category) => category.kind === "WORK").map((category) => ({ id: category.id, label: category.name }))} value={idsOfKind(createCategoryIds, "WORK")} onValueChange={(next) => setCreateCategoryIds((current) => withKind(current, "WORK", next))} onCreate={canManageCategories ? (name) => createCategory("WORK", name, setCreateError) : undefined} createLabel={(name) => `Create work category "${name}"`} placeholder="Search work categories" searchPlaceholder="Search work categories…" />
          </Field>
          <Field label="Product categories" description="The product lines this supplier sells, such as Flooring or Sanitary.">
            <CreatableMultiSelect label="Product categories" options={categoryOptions.filter((category) => category.kind === "PRODUCT").map((category) => ({ id: category.id, label: category.name }))} value={idsOfKind(createCategoryIds, "PRODUCT")} onValueChange={(next) => setCreateCategoryIds((current) => withKind(current, "PRODUCT", next))} onCreate={canManageCategories ? (name) => createCategory("PRODUCT", name, setCreateError) : undefined} createLabel={(name) => `Create product category "${name}"`} placeholder="Search product categories" searchPlaceholder="Search product categories…" />
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
                  className="absolute right-2 top-2 !h-6 !w-6 !min-h-6 !border-0 !bg-transparent !p-0 !text-ink-tertiary hover:!bg-transparent hover:!text-danger"
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
                <PhoneNumbersField value={contact.phones} onChange={(phones) => updateContactDraft(idx, { phones })} />
                <Field label="Email address" className="self-start">
                  <Input
                    type="email"
                    value={contact.email}
                    onChange={(e) => updateContactDraft(idx, { email: e.target.value })}
                  />
                </Field>
                <Field label="Brand scoping">
                  <div className="grid gap-1">
                  <Combobox label={`Brand scope for ${contact.personName || "contact"}`} options={[{ id: "", label: "All supplier brands" }, ...brands.map((brand) => ({ id: brand.id, label: brand.name }))]} value={contact.brandId} onValueChange={(brandId) => updateContactDraft(idx, { brandId })} placeholder="All supplier brands" searchPlaceholder="Search brands…" />
                  {scopeHint(contact.brandId, createBrandIds) ? <p className="mt-1 text-xs text-ink-secondary">{scopeHint(contact.brandId, createBrandIds)}</p> : null}
                  </div>
                </Field>
                <Checkbox className="col-span-2 text-sm text-ink-secondary" checked={contact.isPrimary} onCheckedChange={(checked) => updateContactDraft(idx, { isPrimary: checked === true })} label="Primary contact" />
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
            <Button type="submit" variant="primary" pending={createPending}>
              {"Create supplier"}
            </Button>
          </FormActions>
        </form>
      </Dialog>
      {createDraftGuard.confirmDialog}

      {/* Edit Vendor Dialog */}
      {editTarget ? (
        <Dialog size="lg"
          open
          onOpenChange={(open) => {
            if (!open && !editPending) void editDraftGuard.requestDiscard(() => setEditTarget(null));
          }}
          title={`Edit supplier ${editTarget.name}`}
          description="Update the supplier profile, capability types, and sales contacts."
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
              fd.set("infoLinksJson", JSON.stringify(stagedLinks));
              fd.set("linkSnapshotJson", JSON.stringify(stagedSnapshot));
              try {
                const res = await updateVendorAction(null, fd);
                if (res && "ok" in res && res.ok) {
                  setEditTarget(null);
                } else if (res && "ok" in res && res.ok === false) {
                  setEditError(res.error.safeMessage);
                }
              } finally {
                setEditPending(false);
              }
            }}
            className="grid gap-4  pr-1"
          >
            <input type="hidden" name="vendorId" value={editTarget.id} />
            {editVendorTypeIds.map((id) => <input key={id} type="hidden" name="vendorTypeIds" value={id} />)}
            {editCategoryIds.map((id) => <input key={id} type="hidden" name="categoryIds" value={id} />)}
            {editError ? <InlineError>{editError}</InlineError> : null}

            <Tabs keepMounted
              items={[
                {
                  value: "profile",
                  label: "Profile & Types",
                  content: (
                    <div className="grid gap-4">
                      <Field label="Supplier name" required>
                        <Input name="name" textCase="title" value={editName} required maxLength={64} autoFocus onChange={(e) => { setEditName(e.target.value); setEditNameWarning(checkSimilarName(e.target.value, editTarget.id)); }} />
                      </Field>
                      {editNameWarning ? (
                        <Notice tone="warning">{editNameWarning}</Notice>
                      ) : null}
                      <Field label="Legal entity name">
                        <Input name="legalName" textCase="title" value={editLegalName} maxLength={128} onChange={(e) => setEditLegalName(e.target.value)} />
                      </Field>
                      <Field label="Supplier types" description="Search the controlled type vocabulary. Removing capability types is guarded against active dependent prices.">
                        <CreatableMultiSelect label="Supplier types" options={vendorTypes.map((type) => ({ id: type.id, label: type.name, description: `${type.can_supply_material ? "Material" : ""}${type.can_supply_material && type.can_supply_labor ? " · " : ""}${type.can_supply_labor ? "Labor" : ""}` }))} value={editVendorTypeIds} onValueChange={setEditVendorTypeIds} placeholder="Search supplier types" searchPlaceholder="Search supplier types…" />
                      </Field>
                      <Field label="Work categories" description="The trades this supplier does, such as MEP or Sipil. Pricing a job for this supplier adds its category here automatically.">
            <CreatableMultiSelect label="Work categories" options={categoryOptions.filter((category) => category.kind === "WORK").map((category) => ({ id: category.id, label: category.name }))} value={idsOfKind(editCategoryIds, "WORK")} onValueChange={(next) => setEditCategoryIds((current) => withKind(current, "WORK", next))} onCreate={canManageCategories ? (name) => createCategory("WORK", name, setEditError) : undefined} createLabel={(name) => `Create work category "${name}"`} placeholder="Search work categories" searchPlaceholder="Search work categories…" />
          </Field>
          <Field label="Product categories" description="The product lines this supplier sells, such as Flooring or Sanitary.">
            <CreatableMultiSelect label="Product categories" options={categoryOptions.filter((category) => category.kind === "PRODUCT").map((category) => ({ id: category.id, label: category.name }))} value={idsOfKind(editCategoryIds, "PRODUCT")} onValueChange={(next) => setEditCategoryIds((current) => withKind(current, "PRODUCT", next))} onCreate={canManageCategories ? (name) => createCategory("PRODUCT", name, setEditError) : undefined} createLabel={(name) => `Create product category "${name}"`} placeholder="Search product categories" searchPlaceholder="Search product categories…" />
          </Field>
                      <Field label="Office / Workshop address">
                        <Input name="address" value={editAddress} maxLength={256} onChange={(e) => setEditAddress(e.target.value)} />
                      </Field>
                      <SupplierLinksEditor links={stagedLinks} snapshot={stagedSnapshot} onLinksChange={setStagedLinks} onSnapshotChange={setStagedSnapshot} canManage={canManage} />
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
                            className="absolute right-2 top-2 !h-6 !w-6 !min-h-6 !border-0 !bg-transparent !p-0 !text-ink-tertiary hover:!bg-transparent hover:!text-danger"
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
                          <PhoneNumbersField value={contact.phones} onChange={(phones) => updateContactDraft(idx, { phones })} />
                          <Field label="Email address" className="self-start">
                            <Input
                              type="email"
                              value={contact.email}
                              onChange={(e) => updateContactDraft(idx, { email: e.target.value })}
                            />
                          </Field>
                          <Field label="Brand scoping">
                            <div className="grid gap-1">
                            <Combobox label={`Brand scope for ${contact.personName || "contact"}`} options={[{ id: "", label: "All supplier brands" }, ...brands.map((brand) => ({ id: brand.id, label: brand.name }))]} value={contact.brandId} onValueChange={(brandId) => updateContactDraft(idx, { brandId })} placeholder="All supplier brands" searchPlaceholder="Search brands…" />
                            {scopeHint(contact.brandId, [...(editTarget?.brand_suppliers.map((relation) => relation.brand.id) ?? []), ...(editTarget?.owned_brands.map((brand) => brand.id) ?? [])]) ? <p className="mt-1 text-xs text-ink-secondary">{scopeHint(contact.brandId, [...(editTarget?.brand_suppliers.map((relation) => relation.brand.id) ?? []), ...(editTarget?.owned_brands.map((brand) => brand.id) ?? [])])}</p> : null}
                            </div>
                          </Field>
                          <Checkbox className="col-span-2 text-sm text-ink-secondary" checked={contact.isPrimary} onCheckedChange={(checked) => updateContactDraft(idx, { isPrimary: checked === true })} label="Primary contact" />
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  value: "brand_suppliers",
                  label: `Supplied brands (${editTarget.brand_suppliers.length})`,
                  content: (
                    <div className="grid gap-3">
                      <div className="flex items-center gap-1.5">
                        <Text size="sm" weight="semibold">Supplied brands</Text>
                        <HelpHint label="How supplied brands work">This relationship is managed from each Brand, not from Supplier.</HelpHint>
                      </div>
                      {editTarget.brand_suppliers.length === 0 ? (
                        <div className="text-xs text-ink-tertiary py-3 text-center border border-dashed border-line rounded">
                          No supplied brands registered for this supplier.
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
                Updated by <span className="font-medium text-ink-secondary">{editTarget.updated_by_label}</span> · {formatInstant(editTarget.updated_at, { locale, timeZone: timezone, style: "datetime" })}
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
          title={`Archive supplier "${confirmArchive.name}"?`}
          description="Archiving this supplier also archives all its prices (Material, Material + labor, Labor) and the Brands it owns, with those Brands' SKUs and material prices. A Brand that only lists it as one of its suppliers stays."
          confirmLabel="Archive supplier"
          tone="danger"
          onConfirm={() => {
            const target = confirmArchive;

            runRowAction(target.id, () => archiveVendorAction(target.id), () => { setConfirmArchive(null); });
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
          title={`Restore supplier "${confirmRestore.name}"?`}
          description="Restoring this supplier brings back what archiving it archived: its prices and the Brands it owns, with their SKUs and prices. Anything archived separately stays archived."
          confirmLabel="Restore supplier"
          onConfirm={() => {
            const target = confirmRestore;

            runRowAction(target.id, () => restoreVendorAction(target.id), () => { setConfirmRestore(null); });
          }}
        />
      ) : null}

      {/* Request Deletion Dialog */}
      {deleteTarget ? (
        <RequestDeletionDialog open onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }} title={`Submit supplier "${deleteTarget.name}" for deletion`} description="Permanent deletion remains blocked while any owned Brand, BrandSupplier relation, or Material, Material+Labor, or Labor price reference exists — including archived records." reason={deleteReason} onReasonChange={setDeleteReason} placeholder="e.g. Inactive duplicate supplier profile" pending={pendingId !== null} error={rowError} onSubmit={() => {
                  const target = deleteTarget;
                  const reason = deleteReason;


                  runRowAction(target.id, () => requestVendorDeletionAction(target.id, reason), () => { setDeleteTarget(null); setDeleteReason(""); });
                }} />
      ) : null}
    </DirectoryShell>
  );
}
