"use client";

import { ArrowDown, ArrowUp, FileUp, History, ImageIcon, Plus, Search, Settings2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  Badge,
  Button,
  Dialog,
  Drawer,
  EmptyState,
  Field,
  FilterChip,
  ImageWorkspace,
  InlineError,
  Input,
  RowActionMenu,
  Select,
  Text,
  Textarea,
  useConfirm,
} from "@/platform/ui_engine";

import {
  applyScheduleTemplatesAction,
  copyReusableScheduleOptionAction,
  createScheduleEntryAction,
  createScheduleOptionAction,
  deleteScheduleEntryAction,
  deleteScheduleOptionAction,
  importScheduleCsvAction,
  markScheduleFinalAction,
  moveScheduleEntryAction,
  moveScheduleEntryToCategoryAction,
  removeScheduleOptionImageAction,
  saveScheduleEntryAsTemplateAction,
  searchReusableScheduleOptionsAction,
  setScheduleOptionImageAction,
  updateScheduleEntryAction,
  updateScheduleOptionAction,
} from "../../../actions";
import { useCommand } from "../../../_components/use-command";

type Section = "MATERIAL" | "FIXTURE";
type Brand = { id: string; name: string };

export type ScheduleOptionView = {
  id: string;
  label: string;
  isFinal: boolean;
  status: string;
  brandId: string | null;
  brandName: string | null;
  productName: string;
  skuText: string | null;
  color: string | null;
  finishing: string | null;
  dimension: string | null;
  notes: string | null;
  /** Short-lived signed URL of the option photo. */
  imageUrl: string | null;
};

export type ScheduleEntryView = {
  id: string;
  section: Section;
  category: string;
  code: string;
  qty: string | null;
  unit: string | null;
  location: string | null;
  options: ScheduleOptionView[];
};

type ReuseHit = {
  optionId: string;
  sourceProjectName: string;
  category: string;
  brandName: string | null;
  productName: string;
  skuText: string | null;
  color: string | null;
  finishing: string | null;
  dimension: string | null;
  isFinal: boolean;
};

const SECTION_LABEL: Record<Section, string> = { MATERIAL: "Material", FIXTURE: "Fixture" };
const STATUS_LABEL: Record<string, { label: string; tone: "success" | "neutral" | "warning" }> = {
  APPROVED: { label: "Final", tone: "success" },
  DRAFT: { label: "Option", tone: "neutral" },
  NOT_USED: { label: "Not used", tone: "neutral" },
};

type Command = ReturnType<typeof useCommand>;

function specLine(option: Pick<ScheduleOptionView, "skuText" | "color" | "finishing" | "dimension">) {
  return [option.skuText, option.color, option.finishing, option.dimension].filter(Boolean).join(" · ");
}

function finalOf(entry: ScheduleEntryView) {
  return entry.options.find((option) => option.isFinal) ?? null;
}

/** The option a template would be made from: the final one, or the only one. */
function templateSourceOf(entry: ScheduleEntryView) {
  return finalOf(entry) ?? (entry.options.length === 1 ? entry.options[0] : null);
}

/** Legacy catalog photos are portrait 4:5. */
const PHOTO_ASPECT = 4 / 5;

function Thumb({ url, alt, className = "h-10 w-8" }: { url: string | null; alt: string; className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-[4px] border border-line-subtle bg-surface-muted ${className}`}>
      {url ? (
        // Signed private URLs are short-lived; next/image optimization would cache them.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <ImageIcon aria-hidden="true" className="h-3.5 w-3.5 text-ink-tertiary" />
      )}
    </span>
  );
}

// ── Responsive hook ───────────────────────────────────────────────────────────

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return isDesktop;
}

// ── Board view ─────────────────────────────────────────────────────────────

function BoardView({
  groups,
  command,
  onOpen,
  canEdit,
  canManageTemplates,
  onMoveCategory,
  onDelete,
}: {
  groups: Array<{ category: string; rows: ScheduleEntryView[] }>;
  command: Command;
  onOpen: (id: string) => void;
  canEdit: boolean;
  canManageTemplates: boolean;
  onMoveCategory: (entry: ScheduleEntryView) => void;
  onDelete: (entry: ScheduleEntryView) => void;
}) {
  return (
    <div className="grid gap-6 p-(--ui-section-px)">
      {groups.map((group) => (
        <section key={group.category}>
          <div className="flex items-baseline gap-2 mb-3">
            <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-ink-secondary">{group.category}</h3>
            <Text size="sm" tone="tertiary">{group.rows.length}</Text>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {group.rows.map((entry) => {
              const final = finalOf(entry);
              const busy = command.pendingKeys.some((key) => key.startsWith(entry.id));
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onOpen(entry.id)}
                  className="group relative grid gap-2 rounded-lg border border-line-subtle bg-surface p-2 text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="aspect-[4/5] w-full overflow-hidden rounded-[4px] bg-surface-muted">
                    {final?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={final.imageUrl} alt={final.productName} className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <span className="flex h-full items-center justify-center"><ImageIcon aria-hidden="true" className="h-6 w-6 text-ink-tertiary" /></span>
                    )}
                  </span>
                  <span className="font-ui-mono text-[11px] font-semibold tabular-nums text-ink-secondary">{entry.code}</span>
                  {final ? (
                    <span className="grid gap-0.5">
                      <span className="truncate text-sm font-medium text-ink leading-tight">{final.productName}</span>
                      {final.brandName ? <span className="truncate text-xs text-ink-secondary">ex. {final.brandName}</span> : null}
                      {specLine(final) ? <span className="truncate text-xs text-ink-tertiary">{specLine(final)}</span> : null}
                    </span>
                  ) : (
                    <span className="text-xs italic text-ink-tertiary">No product</span>
                  )}
                  <span className="flex items-center gap-1.5">
                    {final?.status === "APPROVED" ? <Badge tone="success">Final</Badge> : null}
                    {entry.options.length > 1 ? <Badge>{entry.options.length}</Badge> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Stat bar ──────────────────────────────────────────────────────────────────

function StatBar({ entries, section }: { entries: readonly ScheduleEntryView[]; section: Section }) {
  const sectionEntries = useMemo(() => entries.filter((e) => e.section === section), [entries, section]);
  const total = sectionEntries.length;
  const finalized = sectionEntries.filter((e) => e.options.some((o) => o.isFinal)).length;
  const withPhotos = sectionEntries.filter((e) => e.options.some((o) => o.imageUrl !== null)).length;
  if (total === 0) return null;
  return (
    <div className="flex gap-4 border-b border-line-subtle px-(--ui-section-px) py-2 text-sm text-ink-secondary">
      <span><span className="font-semibold text-ink">{finalized}</span> / {total} finalized</span>
      <span><span className="font-semibold text-ink">{withPhotos}</span> photos</span>
    </div>
  );
}

export function ScheduleBoard({
  projectId,
  entries,
  brands,
  canEdit,
  canManageTemplates,
  settingsHref,
}: {
  projectId: string;
  entries: readonly ScheduleEntryView[];
  brands: readonly Brand[];
  canEdit: boolean;
  /** Studio settings permission: template settings link and "Save as template". */
  canManageTemplates: boolean;
  settingsHref: string;
}) {
  const command = useCommand();
  const { run, isPending, error } = command;
  const confirm = useConfirm();
  const isDesktop = useIsDesktop();
  const [section, setSection] = useState<Section>(() => (entries.some((e) => e.section === "MATERIAL") || !entries.length ? "MATERIAL" : "FIXTURE"));
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "add" | "import" | { move: ScheduleEntryView }>(null);

  const counts = useMemo(() => ({
    MATERIAL: entries.filter((e) => e.section === "MATERIAL").length,
    FIXTURE: entries.filter((e) => e.section === "FIXTURE").length,
  }), [entries]);

  const groups = useMemo(() => {
    const map = new Map<string, ScheduleEntryView[]>();
    for (const entry of entries) {
      if (entry.section !== section) continue;
      map.set(entry.category, [...(map.get(entry.category) ?? []), entry]);
    }
    return [...map.entries()].map(([category, rows]) => ({ category, rows }));
  }, [entries, section]);

  const categories = useMemo(() => [...new Set(entries.filter((e) => e.section === section).map((e) => e.category))], [entries, section]);
  const open = entries.find((entry) => entry.id === openId) ?? null;

  const removeEntry = async (entry: ScheduleEntryView) => {
    const ok = await confirm.confirm({
      title: `Delete ${entry.code}?`,
      description: "The item and all its options are removed. Later codes in this group move up to close the gap.",
      confirmLabel: "Delete item",
      tone: "danger",
    });
    if (!ok) return;
    if (await run(`${entry.id}-delete`, () => deleteScheduleEntryAction({ projectId, entryId: entry.id }))) setOpenId(null);
  };

  return (
    <div className="grid">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle px-(--ui-section-px) py-2.5">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Schedule section">
          {(["MATERIAL", "FIXTURE"] as const).map((key) => (
            <FilterChip key={key} selected={section === key} count={counts[key]} onClick={() => setSection(key)}>
              {SECTION_LABEL[key]}
            </FilterChip>
          ))}
          <span className="mx-1 h-5 w-px bg-line-subtle" aria-hidden="true" />
          <button type="button" onClick={() => setViewMode("list")} className={`inline-flex min-h-[--ui-control-height-sm] items-center gap-1 rounded-control px-2 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-surface-muted text-ink" : "text-ink-secondary hover:bg-surface-muted hover:text-ink"}`} aria-pressed={viewMode === "list"}>List</button>
          <button type="button" onClick={() => setViewMode("board")} className={`inline-flex min-h-[--ui-control-height-sm] items-center gap-1 rounded-control px-2 text-xs font-medium transition-colors ${viewMode === "board" ? "bg-surface-muted text-ink" : "text-ink-secondary hover:bg-surface-muted hover:text-ink"}`} aria-pressed={viewMode === "board"}>Board</button>
        </div>
        {canEdit || canManageTemplates ? (
          <div className="flex flex-wrap gap-2">
            {canManageTemplates ? (
              <Link
                prefetch={false}
                href={`${settingsHref}#product-schedule`}
                className="inline-flex min-h-(--ui-control-height-sm) items-center gap-1.5 rounded-control px-2.5 text-xs font-medium text-ink-secondary hover:bg-surface-muted hover:text-ink"
              >
                <Settings2 aria-hidden="true" className="h-3.5 w-3.5" /> Template settings
              </Link>
            ) : null}
            {canEdit ? <>
            <Button size="sm" variant="ghost" pending={isPending("templates")} onClick={() => run("templates", () => applyScheduleTemplatesAction({ projectId }))}>
              Apply templates
            </Button>
            <Button size="sm" variant="secondary" leadingIcon={<FileUp className="h-3.5 w-3.5" />} onClick={() => setDialog("import")}>
              Import CSV
            </Button>
            <Button size="sm" variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDialog("add")}>
              Add item
            </Button>
            </> : null}
          </div>
        ) : null}
      </div>

      <StatBar entries={entries} section={section} />

      {error && !open && !dialog ? <InlineError className="px-(--ui-section-px) pt-2">{error}</InlineError> : null}

      {groups.length === 0 ? (
        <EmptyState
          title={`No ${SECTION_LABEL[section].toLowerCase()} items yet`}
          description={canEdit ? "Add an item, apply the studio templates, or import the Google Sheets schedule." : "This project has no schedule items in this section."}
          className="py-10"
        />
      ) : (
        <div className={`grid ${open && isDesktop ? "md:grid-cols-[1fr_22rem]" : ""}`}>
          <div className="grid">
            {groups.map((group) => (
              <section key={group.category} className="border-b border-line-subtle last:border-b-0">
                <div className="flex items-baseline gap-2 bg-surface-muted px-(--ui-section-px) py-1.5">
                  <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-ink-secondary">{group.category}</h3>
                  <Text size="sm" tone="tertiary">{group.rows.length}</Text>
                </div>
                <ul className="m-0 list-none divide-y divide-line-subtle p-0">
                  {group.rows.map((entry, index) => {
                    const final = finalOf(entry);
                    const busy = command.pendingKeys.some((key) => key.startsWith(entry.id));
                    return (
                      <li key={entry.id} className={`flex items-center gap-3 px-(--ui-section-px) py-2 ${open?.id === entry.id ? "bg-surface-muted" : "hover:bg-surface-muted"}`}>
                        <button type="button" onClick={() => setOpenId(entry.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <Thumb url={final?.imageUrl ?? null} alt={final ? final.productName : `${entry.code} has no photo`} />
                          <span className="w-14 shrink-0 font-ui-mono text-sm font-semibold tabular-nums text-ink">{entry.code}</span>
                          <span className="grid min-w-0 flex-1 gap-0.5">
                            {final ? (
                              <>
                                <span className="truncate text-sm font-medium text-ink">
                                  {final.productName}
                                  {final.brandName ? <span className="font-normal text-ink-secondary"> · ex. {final.brandName}</span> : null}
                                </span>
                                {specLine(final) ? <span className="truncate text-xs text-ink-tertiary">{specLine(final)}</span> : null}
                              </>
      ) : viewMode === "board" ? (
        <BoardView
          groups={groups}
          command={command}
          onOpen={setOpenId}
          canEdit={canEdit}
          canManageTemplates={canManageTemplates}
          onMoveCategory={(entry) => setDialog({ move: entry })}
          onDelete={removeEntry}
        />
      ) : (
                              <span className="text-sm italic text-ink-tertiary">{entry.options.length ? "No final option yet" : "Reserved — no product yet"}</span>
                            )}
                          </span>
                          <span className="hidden w-28 shrink-0 truncate text-sm text-ink-secondary sm:block">{entry.location ?? ""}</span>
                          <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums text-ink-secondary sm:block">{entry.qty ? `${entry.qty} ${entry.unit ?? ""}` : ""}</span>
                          {entry.options.length > 1 ? <Badge>{entry.options.length} options</Badge> : null}
                        </button>
                        {canEdit || canManageTemplates ? (
                          <RowActionMenu
                            label={`Actions for ${entry.code}`}
                            pending={busy}
                            items={[
                              { label: "Open", onSelect: () => setOpenId(entry.id) },
                              ...(canManageTemplates && templateSourceOf(entry)
                                ? [{ label: "Save as template item", onSelect: () => void run(`${entry.id}-template`, () => saveScheduleEntryAsTemplateAction({ projectId, entryId: entry.id })) }]
                                : []),
                              ...(canEdit ? [
                              { label: "Move up", icon: <ArrowUp className="h-3.5 w-3.5" />, disabled: index === 0, separatorBefore: true, onSelect: () => void run(`${entry.id}-move`, () => moveScheduleEntryAction({ projectId, entryId: entry.id, direction: "up" })) },
                              { label: "Move down", icon: <ArrowDown className="h-3.5 w-3.5" />, disabled: index === group.rows.length - 1, onSelect: () => void run(`${entry.id}-move`, () => moveScheduleEntryAction({ projectId, entryId: entry.id, direction: "down" })) },
                              { label: "Move to category…", onSelect: () => setDialog({ move: entry }) },
                              { label: "Delete", danger: true, separatorBefore: true, onSelect: () => void removeEntry(entry) },
                              ] : []),
                            ]}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          {/* Desktop inline panel */}
          {open && isDesktop ? (
            <div className="hidden md:flex md:flex-col border-l border-line-subtle">
              <div className="flex shrink-0 items-start justify-between gap-2 border-b border-line-subtle px-4 py-3">
                <div>
                  <p className="text-sm font-semibold leading-tight text-ink">{open.code} · {open.category}</p>
                  <p className="text-xs text-ink-secondary">{SECTION_LABEL[open.section]}</p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpenId(null)}
                  className="mt-0.5 rounded-control p-1 text-ink-tertiary hover:bg-surface hover:text-ink"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <EntryPanelContent
                  key={open.id}
                  projectId={projectId}
                  entry={open}
                  brands={brands}
                  canEdit={canEdit}
                  command={command}
                  confirm={confirm.confirm}
                  onClose={() => setOpenId(null)}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Mobile drawer */}
      {open && !isDesktop ? (
        <EntryDrawer
          key={open.id}
          projectId={projectId}
          entry={open}
          brands={brands}
          canEdit={canEdit}
          command={command}
          confirm={confirm.confirm}
          onClose={() => setOpenId(null)}
        />
      ) : null}

      {dialog === "add" ? (
        <AddItemDialog projectId={projectId} section={section} categories={categories} brands={brands} command={command} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "import" ? <ImportDialog projectId={projectId} section={section} command={command} onClose={() => setDialog(null)} /> : null}
      {dialog && typeof dialog === "object" ? (
        <MoveDialog projectId={projectId} entry={dialog.move} categories={categories} command={command} onClose={() => setDialog(null)} />
      ) : null}
      {confirm.dialog}
    </div>
  );
}

// ── Product fields (manual snapshot) ─────────────────────────────────────────

type ProductDraft = {
  brandId: string;
  brandName: string;
  productName: string;
  skuText: string;
  color: string;
  finishing: string;
  dimension: string;
  notes: string;
};

const EMPTY_PRODUCT: ProductDraft = { brandId: "", brandName: "", productName: "", skuText: "", color: "", finishing: "", dimension: "", notes: "" };

function productFromOption(option: ScheduleOptionView): ProductDraft {
  return {
    brandId: option.brandId ?? "",
    brandName: option.brandId ? "" : option.brandName ?? "",
    productName: option.productName,
    skuText: option.skuText ?? "",
    color: option.color ?? "",
    finishing: option.finishing ?? "",
    dimension: option.dimension ?? "",
    notes: option.notes ?? "",
  };
}

function toSnapshot(draft: ProductDraft) {
  const text = (value: string) => value.trim() || null;
  return {
    brandId: draft.brandId || null,
    brandName: draft.brandId ? null : text(draft.brandName),
    productName: draft.productName.trim(),
    skuText: text(draft.skuText),
    color: text(draft.color),
    finishing: text(draft.finishing),
    dimension: text(draft.dimension),
    notes: text(draft.notes),
  };
}

function ProductFields({ value, onChange, brands, extraBrand }: { value: ProductDraft; onChange: (next: ProductDraft) => void; brands: readonly Brand[]; extraBrand?: Brand | null }) {
  const set = (key: keyof ProductDraft) => (event: { target: { value: string } }) => onChange({ ...value, [key]: event.target.value });
  const brandOptions = extraBrand && !brands.some((b) => b.id === extraBrand.id) ? [extraBrand, ...brands] : brands;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Product" required className="sm:col-span-2">
        <Input value={value.productName} onChange={set("productName")} maxLength={200} placeholder="e.g. Easy Clean Matt" />
      </Field>
      <Field label="Brand">
        <Select value={value.brandId} onChange={(e) => onChange({ ...value, brandId: e.target.value, brandName: e.target.value ? "" : value.brandName })}>
          <option value="">Other (type the name)</option>
          {brandOptions.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </Select>
      </Field>
      <Field label="Brand name" description={value.brandId ? "Taken from Master Data." : undefined}>
        <Input value={value.brandId ? brandOptions.find((b) => b.id === value.brandId)?.name ?? "" : value.brandName} onChange={set("brandName")} disabled={!!value.brandId} maxLength={160} />
      </Field>
      <Field label="SKU / code"><Input value={value.skuText} onChange={set("skuText")} maxLength={160} /></Field>
      <Field label="Color"><Input value={value.color} onChange={set("color")} maxLength={160} /></Field>
      <Field label="Finishing"><Input value={value.finishing} onChange={set("finishing")} maxLength={160} /></Field>
      <Field label="Dimension"><Input value={value.dimension} onChange={set("dimension")} maxLength={160} placeholder="e.g. 60 × 60 cm" /></Field>
      <Field label="Notes" className="sm:col-span-2">
        <Textarea value={value.notes} onChange={set("notes")} maxLength={2000} rows={2} className="min-h-[60px]" />
      </Field>
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2">{children}</div>;
}

// ── Add item ─────────────────────────────────────────────────────────────────

function AddItemDialog({ projectId, section, categories, brands, command, onClose }: { projectId: string; section: Section; categories: string[]; brands: readonly Brand[]; command: Command; onClose: () => void }) {
  const [targetSection, setTargetSection] = useState<Section>(section);
  const [category, setCategory] = useState(categories[0] ?? "");
  const [withProduct, setWithProduct] = useState(true);
  const [product, setProduct] = useState<ProductDraft>(EMPTY_PRODUCT);
  const [qty, setQty] = useState({ qty: "", unit: "", location: "" });
  const pending = command.isPending("add-item");
  const canSave = category.trim() && (!withProduct || product.productName.trim());

  const save = async () => {
    const ok = await command.run("add-item", () => createScheduleEntryAction({
      projectId,
      section: targetSection,
      category: category.trim(),
      qty: qty.qty.trim() || null,
      unit: qty.unit.trim() || null,
      location: qty.location.trim() || null,
      snapshot: withProduct ? toSnapshot(product) : null,
    }));
    if (ok) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title="Add schedule item"
      description="The code is assigned from the category prefix (for example PT-03)."
      size="lg"
      dismissible={!pending}
      footer={<Footer><Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button><Button variant="primary" pending={pending} disabled={!canSave} onClick={save}>Add item</Button></Footer>}
    >
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Section">
            <Select value={targetSection} onChange={(e) => setTargetSection(e.target.value as Section)}>
              <option value="MATERIAL">Material</option>
              <option value="FIXTURE">Fixture</option>
            </Select>
          </Field>
          <Field label="Category" required description="Pick an existing one or type a new category.">
            <Input list="schedule-categories" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={80} placeholder="e.g. Paint" />
          </Field>
          <datalist id="schedule-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <Field label="Location"><Input value={qty.location} onChange={(e) => setQty({ ...qty, location: e.target.value })} maxLength={160} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qty"><Input inputMode="decimal" value={qty.qty} onChange={(e) => setQty({ ...qty, qty: e.target.value })} maxLength={20} /></Field>
            <Field label="Unit"><Input value={qty.unit} onChange={(e) => setQty({ ...qty, unit: e.target.value })} maxLength={40} /></Field>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Item content">
          <FilterChip selected={withProduct} onClick={() => setWithProduct(true)}>With product</FilterChip>
          <FilterChip selected={!withProduct} onClick={() => setWithProduct(false)}>Reserve code only</FilterChip>
        </div>
        {withProduct ? <ProductFields value={product} onChange={setProduct} brands={brands} /> : <Text tone="secondary" size="sm">The code is reserved now; add options later from the item panel.</Text>}
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Dialog>
  );
}

// ── Entry panel content (shared between desktop panel and mobile drawer) ──────

function EntryPanelContent({
  projectId,
  entry,
  brands,
  canEdit,
  command,
  confirm,
  onClose,
}: {
  projectId: string;
  entry: ScheduleEntryView;
  brands: readonly Brand[];
  canEdit: boolean;
  command: Command;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  onClose: () => void;
}) {
  const { run, isPending } = command;
  const initial = { qty: entry.qty ?? "", unit: entry.unit ?? "", location: entry.location ?? "" };
  const [fields, setFields] = useState(initial);
  const [editing, setEditing] = useState<ScheduleOptionView | "new" | null>(null);
  const [reuse, setReuse] = useState(false);
  const [photoFor, setPhotoFor] = useState<ScheduleOptionView | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const dirty = fields.qty !== initial.qty || fields.unit !== initial.unit || fields.location !== initial.location;

  const saveFields = () => run(`${entry.id}-fields`, () => updateScheduleEntryAction({
    projectId,
    entryId: entry.id,
    qty: fields.qty.trim() || null,
    unit: fields.unit.trim() || null,
    location: fields.location.trim() || null,
  }));

  const onPhotoPrepared = async (file: File) => {
    if (!photoFor) return;
    setPhotoError(null);
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("optionId", photoFor.id);
    form.set("file", file);
    const ok = await run(`${entry.id}-photo`, async () => {
      const result = await setScheduleOptionImageAction(form);
      if (!result.ok) setPhotoError(result.error.safeMessage);
      return result;
    });
    if (ok) setPhotoFor(null);
  };

  const removePhoto = async (option: ScheduleOptionView) => {
    const ok = await confirm({
      title: `Remove the photo of option ${option.label}?`,
      description: "The option keeps its product details.",
      confirmLabel: "Remove photo",
      tone: "danger",
    });
    if (ok) await run(`${entry.id}-opt-${option.id}`, () => removeScheduleOptionImageAction({ projectId, optionId: option.id }));
  };

  const removeOption = async (option: ScheduleOptionView) => {
    const ok = await confirm({
      title: `Delete option ${option.label}?`,
      description: option.isFinal ? "This is the final option; the next option becomes final." : "The option is removed from this item.",
      confirmLabel: "Delete option",
      tone: "danger",
    });
    if (ok) await run(`${entry.id}-opt-${option.id}`, () => deleteScheduleOptionAction({ projectId, optionId: option.id }));
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem_6rem]">
        <Field label="Location"><Input value={fields.location} onChange={(e) => setFields({ ...fields, location: e.target.value })} disabled={!canEdit} maxLength={160} /></Field>
        <Field label="Qty"><Input inputMode="decimal" value={fields.qty} onChange={(e) => setFields({ ...fields, qty: e.target.value })} disabled={!canEdit} maxLength={20} /></Field>
        <Field label="Unit"><Input value={fields.unit} onChange={(e) => setFields({ ...fields, unit: e.target.value })} disabled={!canEdit} maxLength={40} /></Field>
      </div>
      {canEdit ? (
        <div className="-mt-2 flex justify-end">
          <Button size="sm" variant="secondary" disabled={!dirty} pending={isPending(`${entry.id}-fields`)} onClick={() => void saveFields()}>Save details</Button>
        </div>
      ) : null}

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text weight="semibold">Options</Text>
          {canEdit ? (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" leadingIcon={<History className="h-3.5 w-3.5" />} onClick={() => setReuse(true)}>From past project</Button>
              <Button size="sm" variant="secondary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing("new")}>Add option</Button>
            </div>
          ) : null}
        </div>

        {/* Option chip nav */}
        {entry.options.length > 1 ? (
          <div className="flex gap-1.5" role="group" aria-label="Jump to option">
            {entry.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => document.getElementById(`opt-${opt.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
                className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-2 text-xs font-semibold transition-colors ${
                  opt.isFinal
                    ? "border border-success-line bg-success-surface text-success-ink"
                    : "border border-line bg-surface-muted text-ink-secondary hover:border-line-subtle hover:text-ink"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}

        {entry.options.length === 0 ? (
          <Text tone="tertiary" size="sm">No product yet. Add an option or copy one from a past project.</Text>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {entry.options.map((option) => {
              const status = STATUS_LABEL[option.status] ?? STATUS_LABEL.DRAFT;
              return (
                <li id={`opt-${option.id}`} key={option.id} className={`rounded-control border px-3 py-2 ${option.isFinal ? "border-success-line bg-success-surface/40" : "border-line"}`}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 font-ui-mono text-sm font-semibold">{option.label}</span>
                    <div className="grid shrink-0 justify-items-center gap-1">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => { setPhotoError(null); setPhotoFor(option); }}
                          aria-label={option.imageUrl ? `Change photo of option ${option.label}` : `Add photo to option ${option.label}`}
                          title={option.imageUrl ? "Change photo" : "Add photo"}
                          className="rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus"
                        >
                          <Thumb url={option.imageUrl} alt={option.productName} className="h-20 w-16" />
                        </button>
                      ) : (
                        <Thumb url={option.imageUrl} alt={option.productName} className="h-20 w-16" />
                      )}
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => { setPhotoError(null); setPhotoFor(option); }}
                          className="text-xs font-medium text-ink-secondary hover:text-ink hover:underline"
                        >
                          {option.imageUrl ? "Change photo" : "Add photo"}
                        </button>
                      ) : null}
                    </div>
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="text-sm font-medium">{option.productName}{option.brandName ? <span className="font-normal text-ink-secondary"> · ex. {option.brandName}</span> : null}</span>
                      {specLine(option) ? <span className="text-xs text-ink-tertiary">{specLine(option)}</span> : null}
                      {option.notes ? <span className="whitespace-pre-wrap text-xs text-ink-secondary">{option.notes}</span> : null}
                      {/* Set final button on card face */}
                      {!option.isFinal && canEdit ? (
                        <div className="mt-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            pending={isPending(`${entry.id}-opt-${option.id}`)}
                            onClick={() => void run(`${entry.id}-opt-${option.id}`, () => markScheduleFinalAction({ projectId, optionId: option.id }))}
                          >
                            Set final
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {canEdit ? (
                      <RowActionMenu
                        label={`Option ${option.label} actions`}
                        pending={isPending(`${entry.id}-opt-${option.id}`)}
                        items={[
                          ...(option.isFinal ? [] : [{ label: "Set as final", onSelect: () => void run(`${entry.id}-opt-${option.id}`, () => markScheduleFinalAction({ projectId, optionId: option.id })) }]),
                          { label: "Edit", onSelect: () => setEditing(option) },
                          { label: option.imageUrl ? "Change photo" : "Add photo", onSelect: () => { setPhotoError(null); setPhotoFor(option); } },
                          ...(option.imageUrl ? [{ label: "Remove photo", onSelect: () => void removePhoto(option) }] : []),
                          { label: "Delete", danger: true, separatorBefore: true, onSelect: () => void removeOption(option) },
                        ]}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {command.error && !editing && !reuse && !photoFor ? <InlineError>{command.error}</InlineError> : null}

      {editing ? (
        <OptionDialog
          projectId={projectId}
          entryId={entry.id}
          option={editing === "new" ? null : editing}
          brands={brands}
          command={command}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {reuse ? <ReuseDialog projectId={projectId} entry={entry} command={command} onClose={() => setReuse(false)} /> : null}
      <Dialog
        open={photoFor !== null}
        onOpenChange={(value) => { if (!value) setPhotoFor(null); }}
        title={photoFor ? `Photo — ${entry.code} option ${photoFor.label}` : "Photo"}
        description="Choose a photo and crop it to the 4:5 catalog frame."
        size="lg"
        dismissible={!isPending(`${entry.id}-photo`)}
      >
        {photoFor ? (
          <div className="grid gap-2">
            <ImageWorkspace label="Schedule photo" aspect={PHOTO_ASPECT} maxDimension={1600} outputType="image/jpeg" onPrepared={onPhotoPrepared} disabled={isPending(`${entry.id}-photo`)} />
            {photoError ? <InlineError>{photoError}</InlineError> : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

// ── Entry drawer (mobile wrapper) ─────────────────────────────────────────────

function EntryDrawer({
  projectId,
  entry,
  brands,
  canEdit,
  command,
  confirm,
  onClose,
}: {
  projectId: string;
  entry: ScheduleEntryView;
  brands: readonly Brand[];
  canEdit: boolean;
  command: Command;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  onClose: () => void;
}) {
  return (
    <Drawer open onOpenChange={(value) => { if (!value) onClose(); }} title={`${entry.code} · ${entry.category}`} description={SECTION_LABEL[entry.section]} size="lg">
      <EntryPanelContent
        projectId={projectId}
        entry={entry}
        brands={brands}
        canEdit={canEdit}
        command={command}
        confirm={confirm}
        onClose={onClose}
      />
    </Drawer>
  );
}

function OptionDialog({ projectId, entryId, option, brands, command, onClose }: { projectId: string; entryId: string; option: ScheduleOptionView | null; brands: readonly Brand[]; command: Command; onClose: () => void }) {
  const [product, setProduct] = useState<ProductDraft>(option ? productFromOption(option) : EMPTY_PRODUCT);
  const [preparedPhoto, setPreparedPhoto] = useState<File | null>(null);
  const key = `${entryId}-option-form`;
  const photoKey = `${entryId}-option-photo`;
  const pending = command.isPending(key);
  const photoPending = command.isPending(photoKey);
  const save = async () => {
    const snapshot = toSnapshot(product);
    let optionId = option?.id ?? null;
    const ok = await command.run(key, () => option
      ? updateScheduleOptionAction({ projectId, optionId: option.id, snapshot })
      : createScheduleOptionAction({ projectId, entryId, snapshot }), (data) => {
        if (!option && data && typeof data === "object" && "optionId" in data && typeof data.optionId === "string") optionId = data.optionId;
      });
    if (!ok) return;
    if (preparedPhoto && optionId) {
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("optionId", optionId);
      form.set("file", preparedPhoto);
      const photoOk = await command.run(photoKey, () => setScheduleOptionImageAction(form));
      if (!photoOk) return;
    }
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title={option ? `Edit option ${option.label}` : "Add option"}
      description={option ? "Update the product details and replace its catalog photo in one step." : "Add the product details and catalog photo together, matching the legacy schedule flow."}
      size="lg"
      dismissible={!pending && !photoPending}
      footer={<Footer><Button variant="ghost" onClick={onClose} disabled={pending || photoPending}>Cancel</Button><Button variant="primary" pending={pending || photoPending} disabled={!product.productName.trim()} onClick={save}>{option ? "Save option" : "Add option"}</Button></Footer>}
    >
      <div className="grid gap-3">
        <ProductFields value={product} onChange={setProduct} brands={brands} extraBrand={option?.brandId ? { id: option.brandId, name: option.brandName ?? "Brand" } : null} />
        <div className="grid gap-2">
          <Text weight="semibold">Photo</Text>
          {option?.imageUrl && !preparedPhoto ? (
            <div className="flex items-center gap-3 rounded-control border border-line-subtle bg-surface-muted p-2">
              <Thumb url={option.imageUrl} alt={option.productName} className="h-20 w-16" />
              <Text size="sm" tone="secondary">Current photo. Choose an image below to replace it.</Text>
            </div>
          ) : null}
          <ImageWorkspace
            label="Schedule option photo"
            aspect={PHOTO_ASPECT}
            maxDimension={1600}
            outputType="image/jpeg"
            onPrepared={(file) => setPreparedPhoto(file)}
            disabled={pending || photoPending}
          />
          {preparedPhoto ? <Text size="sm" tone="secondary">Photo ready: {preparedPhoto.name}</Text> : null}
        </div>
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Dialog>
  );
}

function ReuseDialog({ projectId, entry, command, onClose }: { projectId: string; entry: ScheduleEntryView; command: Command; onClose: () => void }) {
  const [query, setQuery] = useState(entry.category);
  const [hits, setHits] = useState<ReuseHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const search = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const result = await searchReusableScheduleOptionsAction({ projectId, query: query.trim(), section: entry.section });
      if (result.ok) setHits(result.data as ReuseHit[]);
      else setSearchError(result.error.safeMessage);
    } catch {
      setSearchError("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  const use = async (hit: ReuseHit) => {
    const ok = await command.run(`${entry.id}-reuse-${hit.optionId}`, () => copyReusableScheduleOptionAction({ projectId, entryId: entry.id, sourceOptionId: hit.optionId }));
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(value) => { if (!value) onClose(); }} title="Copy from a past project" description={`Search products used in other projects and copy one into ${entry.code} as a new option.`} size="lg">
      <div className="grid gap-3">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void search(); }}>
          <Input aria-label="Search products" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Brand, product, SKU, color…" maxLength={120} />
          <Button type="submit" variant="secondary" leadingIcon={<Search className="h-3.5 w-3.5" />} pending={searching} disabled={query.trim().length < 2}>Search</Button>
        </form>
        {searchError ? <InlineError>{searchError}</InlineError> : null}
        {hits === null ? null : hits.length === 0 ? (
          <Text tone="tertiary" size="sm">No matching products in other projects.</Text>
        ) : (
          <ul className="m-0 grid max-h-[50vh] list-none gap-1 overflow-y-auto p-0">
            {hits.map((hit) => (
              <li key={hit.optionId} className="flex items-center gap-3 rounded-control border border-line px-3 py-2">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm font-medium">{hit.productName}{hit.brandName ? <span className="font-normal text-ink-secondary"> · ex. {hit.brandName}</span> : null}</span>
                  <span className="truncate text-xs text-ink-tertiary">{[specLine(hit), `${hit.sourceProjectName} · ${hit.category}`].filter(Boolean).join(" — ")}</span>
                </div>
                {hit.isFinal ? <Badge tone="success">Final there</Badge> : null}
                <Button size="sm" variant="primary" pending={command.isPending(`${entry.id}-reuse-${hit.optionId}`)} onClick={() => void use(hit)}>Use</Button>
              </li>
            ))}
          </ul>
        )}
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Dialog>
  );
}

// ── Move / import ────────────────────────────────────────────────────────────

function MoveDialog({ projectId, entry, categories, command, onClose }: { projectId: string; entry: ScheduleEntryView; categories: string[]; command: Command; onClose: () => void }) {
  const [category, setCategory] = useState("");
  const key = `${entry.id}-recategorize`;
  const pending = command.isPending(key);
  const save = async () => {
    const ok = await command.run(key, () => moveScheduleEntryToCategoryAction({ projectId, entryId: entry.id, category: category.trim() }));
    if (ok) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title={`Move ${entry.code} to another category`}
      description="The item gets the next code in the target category; codes in the old category close the gap."
      size="sm"
      dismissible={!pending}
      footer={<Footer><Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button><Button variant="primary" pending={pending} disabled={!category.trim() || category.trim() === entry.category} onClick={save}>Move</Button></Footer>}
    >
      <div className="grid gap-2">
        <Field label="Target category" required>
          <Input list="schedule-move-categories" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={80} autoFocus />
        </Field>
        <datalist id="schedule-move-categories">{categories.filter((c) => c !== entry.category).map((c) => <option key={c} value={c} />)}</datalist>
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Dialog>
  );
}

function ImportDialog({ projectId, section, command, onClose }: { projectId: string; section: Section; command: Command; onClose: () => void }) {
  const [target, setTarget] = useState<Section>(section);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const pending = command.isPending("import");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
  };

  const submit = async () => {
    setResult(null);
    await command.run("import", () => importScheduleCsvAction({ projectId, section: target, csv }), (data) => setResult(data as { created: number; updated: number }));
  };

  return (
    <Dialog
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title="Import schedule CSV"
      description="Use the Google Sheets export (File → Download → CSV). Rows whose code already exists update that item; new codes are added."
      size="lg"
      dismissible={!pending}
      footer={<Footer><Button variant="ghost" onClick={onClose} disabled={pending}>{result ? "Close" : "Cancel"}</Button><Button variant="primary" pending={pending} disabled={!csv.trim()} onClick={submit}>Import</Button></Footer>}
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sheet">
            <Select value={target} onChange={(e) => setTarget(e.target.value as Section)}>
              <option value="MATERIAL">Material (needs a Product Category column)</option>
              <option value="FIXTURE">Fixture</option>
            </Select>
          </Field>
          <Field label="CSV file" description={fileName ?? undefined}>
            <Input type="file" accept=".csv,text/csv" onChange={(e) => void pick(e.target.files?.[0])} />
          </Field>
        </div>
        <Field label="Or paste CSV">
          <Textarea rows={6} value={csv} onChange={(e) => { setCsv(e.target.value); setFileName(null); }} placeholder={"Code,Product Category,Ex,Type,Initials Type,Image,Location,Contact,Qty,Unit"} className="font-ui-mono text-xs" />
        </Field>
        {result ? <Text size="sm">Imported: {result.created} new, {result.updated} updated.</Text> : null}
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Dialog>
  );
}
