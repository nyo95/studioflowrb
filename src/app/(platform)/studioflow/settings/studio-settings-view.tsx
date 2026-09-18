"use client";

import { useState, type ReactNode } from "react";

import type { PhaseKey } from "@/apps/studioflow/domain/phase";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  Field,
  InlineError,
  Input,
  RowActionMenu,
  SectionCard,
  Select,
  Switch,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  Textarea,
} from "@/platform/ui_engine";

import {
  createPhaseDefinitionAction,
  createPhaseTemplateAction,
  createScheduleTemplateItemAction,
  createTemplateAction,
  deletePhaseDefinitionAction,
  deletePhaseTemplateAction,
  deleteSchedulePrefixAction,
  deleteScheduleTemplateCategoryAction,
  deleteScheduleTemplateItemAction,
  deleteTemplateAction,
  reorderPhaseDefinitionsAction,
  reorderTemplatesAction,
  setAutoNamingAction,
  setScheduleTemplateItemActiveAction,
  updatePhaseDefinitionAction,
  updatePhaseTemplateAction,
  updateScheduleTemplateItemAction,
  updateTemplateAction,
  upsertSchedulePrefixAction,
  upsertScheduleTemplateCategoryAction,
} from "../actions";
import { useCommand } from "../_components/use-command";

type Template = { id: string; phaseKey: PhaseKey | null; label: string; isActive: boolean; sortOrder: number; usedBy: number };
type PhaseDefinitionDraft = { id: string; name: string; prefix: string; orderIndex: number; allowParallel: boolean; seat: "designer" | "drafter" };
type PhaseTemplateDraft = { id: string; name: string; isDefault: boolean; isActive: boolean; definitions: PhaseDefinitionDraft[] };
type ScheduleTemplate = {
  id: string;
  section: "MATERIAL" | "FIXTURE";
  category: string;
  is_default_entry: boolean;
  is_active: boolean;
  items: Array<{
    id: string;
    product_name: string;
    brand_id: string | null;
    brand_name: string | null;
    sku_text: string | null;
    color: string | null;
    pattern: string | null;
    finishing: string | null;
    dimension: string | null;
    notes: string | null;
    is_active: boolean;
    sort_order: number;
    qty: { toString(): string } | null;
    unit: string | null;
    location: string | null;
  }>;
};
type SchedulePrefix = { id: string; section: "MATERIAL" | "FIXTURE"; category: string; prefix: string };
type BrandChoice = { id: string; name: string };

export function StudioSettingsView({
  autoNaming,
  templates,
  scheduleTemplates,
  schedulePrefixes,
  brands,
  phases,
  phaseTemplates,
  canManage,
}: {
  autoNaming: boolean;
  templates: Template[];
  scheduleTemplates: ScheduleTemplate[];
  schedulePrefixes: SchedulePrefix[];
  brands: BrandChoice[];
  phases: Array<{ key: PhaseKey; label: string }>;
  phaseTemplates: PhaseTemplateDraft[];
  canManage: boolean;
}) {
  const { run, pendingKey, error } = useCommand();
  const groups: Array<{ key: PhaseKey | null; label: string; description: string }> = [
    { key: null, label: "General", description: "Added to every project's general checklist." },
    ...phases.map((p) => ({ key: p.key, label: p.label, description: `Must be ticked before ${p.label} can be approved.` })),
  ];

  return (
    <div className="grid gap-4">
      <SectionCard title="Project naming" padded>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <Text>Automatic numbering</Text>
            <Text size="sm" tone="secondary">
              {autoNaming ? "New projects get the next number for the year: 2026-012 Heloskin Cimanggu." : "People type the full name, which must follow [Year]-[Number] [Name]."}
            </Text>
          </div>
          <Switch label={autoNaming ? "On" : "Off"} checked={autoNaming} disabled={!canManage || pendingKey === "naming"} onCheckedChange={(checked) => run("naming", () => setAutoNamingAction(checked))} />
        </div>
      </SectionCard>

      {error ? <InlineError>{error}</InlineError> : null}

      <div className="grid grid-cols-2 gap-4 max-[1100px]:grid-cols-1">
        {groups.map((group) => (
          <TemplateGroup key={group.key ?? "general"} group={group} templates={templates.filter((t) => t.phaseKey === group.key)} canManage={canManage} run={run} pendingKey={pendingKey} />
        ))}
      </div>
      <PhaseTemplatesSection phaseTemplates={phaseTemplates} canManage={canManage} run={run} pendingKey={pendingKey} />
      <ScheduleSettings scheduleTemplates={scheduleTemplates} schedulePrefixes={schedulePrefixes} brands={brands} canManage={canManage} run={run} pendingKey={pendingKey} />
      <Text size="sm" tone="tertiary">Changes apply to new projects. Use “Apply checklist templates” on a project to add new items to it; renamed items are not rewritten in existing projects.</Text>
    </div>
  );
}

type Section = "MATERIAL" | "FIXTURE";
type TemplateItemRow = ScheduleTemplate["items"][number] & { section: Section; category: string };

const SECTION_LABEL: Record<Section, string> = { MATERIAL: "Material", FIXTURE: "Fixture" };

function SectionSelect({ value, onChange, disabled }: { value: Section; onChange: (value: Section) => void; disabled?: boolean }) {
  return (
    <Select density="compact" aria-label="Section" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Section)}>
      <option value="MATERIAL">Material</option>
      <option value="FIXTURE">Fixture</option>
    </Select>
  );
}

function TableTitle({ title, count, children }: { title: string; count: number; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-(--ui-section-px) pb-2 pt-4">
      <Text weight="semibold">{title} <span className="font-ui-mono text-xs font-normal text-ink-tertiary">{count}</span></Text>
      {children}
    </div>
  );
}

function ScheduleSettings({
  scheduleTemplates,
  schedulePrefixes,
  brands,
  canManage,
  run,
  pendingKey,
}: {
  scheduleTemplates: ScheduleTemplate[];
  schedulePrefixes: SchedulePrefix[];
  brands: BrandChoice[];
  canManage: boolean;
  run: ReturnType<typeof useCommand>["run"];
  pendingKey: string | null;
}) {
  const [prefix, setPrefix] = useState({ section: "MATERIAL" as Section, category: "", prefix: "" });
  const [category, setCategory] = useState({ section: "MATERIAL" as Section, category: "", isDefaultEntry: true });
  const [itemDialog, setItemDialog] = useState<TemplateItemRow | "new" | null>(null);

  const items: TemplateItemRow[] = scheduleTemplates.flatMap((template) => template.items.map((item) => ({ ...item, section: template.section, category: template.category })));
  const categoryNames = [...new Set([...scheduleTemplates.map((t) => t.category), ...schedulePrefixes.map((p) => p.category)])].sort((a, b) => a.localeCompare(b));
  const orderOf = (template: ScheduleTemplate) => scheduleTemplates.filter((t) => t.section === template.section).indexOf(template) + 1;

  return (
    <SectionCard id="product-schedule" title="Product Schedule" description="Prefix dictionary, default categories, and template items for new or existing projects." padded={false}>
      <datalist id="schedule-settings-categories">{categoryNames.map((name) => <option key={name} value={name} />)}</datalist>

      <TableTitle title="Prefix dictionary" count={schedulePrefixes.length} />
      <DataTable density="compact" minWidth={520}>
        <TableHeader><TableRow><TableHead>Section</TableHead><TableHead>Category</TableHead><TableHead>Prefix</TableHead>{canManage ? <TableHead stickyEnd align="end">Actions</TableHead> : null}</TableRow></TableHeader>
        <TableBody>
          {schedulePrefixes.length === 0 ? (
            <TableRow><TableCell colSpan={canManage ? 4 : 3}><Text size="sm" tone="tertiary">No prefixes yet. Codes fall back to the first letters of the category.</Text></TableCell></TableRow>
          ) : schedulePrefixes.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{SECTION_LABEL[row.section]}</TableCell>
              <TableCell>{row.category}</TableCell>
              <TableCell><span className="font-ui-mono font-semibold">{row.prefix}</span></TableCell>
              {canManage ? (
                <TableCell stickyEnd align="end">
                  <RowActionMenu label={`Actions for prefix ${row.prefix}`} pending={pendingKey === row.id} items={[
                    { label: "Edit", onSelect: () => setPrefix({ section: row.section, category: row.category, prefix: row.prefix }) },
                    { label: "Delete", danger: true, separatorBefore: true, onSelect: () => run(row.id, () => deleteSchedulePrefixAction(row.id)) },
                  ]} />
                </TableCell>
              ) : null}
            </TableRow>
          ))}
          {canManage ? (
            <TableRow>
              <TableCell><SectionSelect value={prefix.section} onChange={(section) => setPrefix({ ...prefix, section })} /></TableCell>
              <TableCell><Input density="compact" aria-label="Prefix category" list="schedule-settings-categories" placeholder="Category" value={prefix.category} maxLength={80} onChange={(e) => setPrefix({ ...prefix, category: e.target.value })} /></TableCell>
              <TableCell><Input density="compact" aria-label="Prefix" placeholder="PT" className="font-ui-mono uppercase" value={prefix.prefix} maxLength={8} onChange={(e) => setPrefix({ ...prefix, prefix: e.target.value })} /></TableCell>
              <TableCell stickyEnd align="end">
                <Button
                  size="sm"
                  pending={pendingKey === "schedule-prefix"}
                  disabled={!prefix.category.trim() || !prefix.prefix.trim()}
                  onClick={async () => { if (await run("schedule-prefix", () => upsertSchedulePrefixAction(prefix))) setPrefix({ ...prefix, category: "", prefix: "" }); }}
                >
                  Save
                </Button>
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </DataTable>

      <TableTitle title="Default categories" count={scheduleTemplates.length} />
      <DataTable density="compact" minWidth={560}>
        <TableHeader><TableRow><TableHead>Section</TableHead><TableHead>Category</TableHead><TableHead>Create empty entry</TableHead><TableHead align="end">Order</TableHead>{canManage ? <TableHead stickyEnd align="end">Actions</TableHead> : null}</TableRow></TableHeader>
        <TableBody>
          {scheduleTemplates.length === 0 ? (
            <TableRow><TableCell colSpan={canManage ? 5 : 4}><Text size="sm" tone="tertiary">No default categories yet.</Text></TableCell></TableRow>
          ) : scheduleTemplates.map((template) => (
            <TableRow key={template.id}>
              <TableCell>{SECTION_LABEL[template.section]}</TableCell>
              <TableCell><span className={template.is_active ? "" : "text-ink-tertiary line-through"}>{template.category}</span></TableCell>
              <TableCell>{template.is_default_entry ? <Badge tone="success">Yes</Badge> : <Text size="sm" tone="tertiary">No</Text>}</TableCell>
              <TableCell align="end"><span className="font-ui-mono tabular-nums">{orderOf(template)}</span></TableCell>
              {canManage ? (
                <TableCell stickyEnd align="end">
                  <RowActionMenu label={`Actions for category ${template.category}`} pending={pendingKey === template.id} items={[
                    { label: template.is_default_entry ? "Stop creating an empty entry" : "Create an empty entry", onSelect: () => run(template.id, () => upsertScheduleTemplateCategoryAction({ section: template.section, category: template.category, isDefaultEntry: !template.is_default_entry, isActive: template.is_active })) },
                    { label: "Delete category", danger: true, separatorBefore: true, onSelect: () => run(template.id, () => deleteScheduleTemplateCategoryAction(template.id)) },
                  ]} />
                </TableCell>
              ) : null}
            </TableRow>
          ))}
          {canManage ? (
            <TableRow>
              <TableCell><SectionSelect value={category.section} onChange={(section) => setCategory({ ...category, section })} /></TableCell>
              <TableCell><Input density="compact" aria-label="Default category" list="schedule-settings-categories" placeholder="Category" value={category.category} maxLength={80} onChange={(e) => setCategory({ ...category, category: e.target.value })} /></TableCell>
              <TableCell>
                <Select density="compact" aria-label="Create empty entry" value={category.isDefaultEntry ? "yes" : "no"} onChange={(e) => setCategory({ ...category, isDefaultEntry: e.target.value === "yes" })}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </TableCell>
              <TableCell />
              <TableCell stickyEnd align="end">
                <Button
                  size="sm"
                  pending={pendingKey === "schedule-category"}
                  disabled={!category.category.trim()}
                  onClick={async () => { if (await run("schedule-category", () => upsertScheduleTemplateCategoryAction(category))) setCategory({ ...category, category: "" }); }}
                >
                  Add
                </Button>
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </DataTable>

      <TableTitle title="Template items" count={items.length}>
        {canManage ? <Button size="sm" variant="secondary" onClick={() => setItemDialog("new")}>Add template item</Button> : null}
      </TableTitle>
      <DataTable density="compact" minWidth={980}>
        <TableHeader><TableRow><TableHead>Section</TableHead><TableHead>Category</TableHead><TableHead>Brand</TableHead><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead align="end">Qty</TableHead><TableHead>Unit</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead align="end">Order</TableHead>{canManage ? <TableHead stickyEnd align="end">Actions</TableHead> : null}</TableRow></TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow><TableCell colSpan={canManage ? 11 : 10}><Text size="sm" tone="tertiary">No template items yet. Add one here or use “Save as template item” on a project schedule row.</Text></TableCell></TableRow>
          ) : items.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{SECTION_LABEL[row.section]}</TableCell>
              <TableCell>{row.category}</TableCell>
              <TableCell>{row.brand_name ?? <Text size="sm" tone="tertiary">—</Text>}</TableCell>
              <TableCell><span className={`font-medium ${row.is_active ? "" : "text-ink-tertiary line-through"}`}>{row.product_name}</span></TableCell>
              <TableCell>{row.sku_text ?? ""}</TableCell>
              <TableCell align="end"><span className="tabular-nums">{row.qty?.toString() ?? ""}</span></TableCell>
              <TableCell>{row.unit ?? ""}</TableCell>
              <TableCell>{row.location ?? ""}</TableCell>
              <TableCell>{row.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</TableCell>
              <TableCell align="end"><span className="font-ui-mono tabular-nums">{row.sort_order}</span></TableCell>
              {canManage ? (
                <TableCell stickyEnd align="end">
                  <RowActionMenu label={`Actions for template item ${row.product_name}`} pending={pendingKey === row.id} items={[
                    { label: "Edit", onSelect: () => setItemDialog(row) },
                    { label: row.is_active ? "Deactivate" : "Activate", onSelect: () => run(row.id, () => setScheduleTemplateItemActiveAction({ templateItemId: row.id, isActive: !row.is_active })) },
                    { label: "Delete", danger: true, separatorBefore: true, onSelect: () => run(row.id, () => deleteScheduleTemplateItemAction(row.id)) },
                  ]} />
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </DataTable>
      <div className="h-2" />

      {itemDialog ? (
        <TemplateItemDialog
          item={itemDialog === "new" ? null : itemDialog}
          brands={brands}
          run={run}
          pendingKey={pendingKey}
          onClose={() => setItemDialog(null)}
        />
      ) : null}
    </SectionCard>
  );
}

function TemplateItemDialog({
  item,
  brands,
  run,
  pendingKey,
  onClose,
}: {
  item: TemplateItemRow | null;
  brands: BrandChoice[];
  run: ReturnType<typeof useCommand>["run"];
  pendingKey: string | null;
  onClose: () => void;
}) {
  const text = (value: string | null | undefined) => value ?? "";
  const [draft, setDraft] = useState({
    section: (item?.section ?? "MATERIAL") as Section,
    category: text(item?.category),
    brandId: text(item?.brand_id),
    brandName: item?.brand_id ? "" : text(item?.brand_name),
    productName: text(item?.product_name),
    skuText: text(item?.sku_text),
    color: text(item?.color),
    pattern: text(item?.pattern),
    finishing: text(item?.finishing),
    dimension: text(item?.dimension),
    notes: text(item?.notes),
    qty: item?.qty?.toString() ?? "",
    unit: text(item?.unit),
    location: text(item?.location),
  });
  const set = (key: keyof typeof draft) => (event: { target: { value: string } }) => setDraft({ ...draft, [key]: event.target.value });
  const key = item ? `template-item-${item.id}` : "schedule-item";
  const pending = pendingKey === key;
  const brandOptions = item?.brand_id && !brands.some((b) => b.id === item.brand_id) ? [{ id: item.brand_id, name: item.brand_name ?? "Brand" }, ...brands] : brands;
  const nullable = (value: string) => value.trim() || null;

  const save = async () => {
    const snapshot = {
      brandId: draft.brandId || null,
      brandName: draft.brandId ? null : nullable(draft.brandName),
      productName: draft.productName.trim(),
      skuText: nullable(draft.skuText),
      color: nullable(draft.color),
      pattern: nullable(draft.pattern),
      finishing: nullable(draft.finishing),
      dimension: nullable(draft.dimension),
      notes: nullable(draft.notes),
    };
    const quantities = { qty: nullable(draft.qty), unit: nullable(draft.unit), location: nullable(draft.location) };
    const ok = await run(key, () => item
      ? updateScheduleTemplateItemAction({ templateItemId: item.id, snapshot, ...quantities })
      : createScheduleTemplateItemAction({ section: draft.section, category: draft.category.trim(), snapshot, ...quantities }));
    if (ok) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title={item ? `Edit template item` : "Add template item"}
      description={item ? "Projects that already received this item keep their own copy." : "New projects receive this row; “Apply templates” adds it to existing ones."}
      size="lg"
      dismissible={!pending}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" pending={pending} disabled={!draft.productName.trim() || !draft.category.trim()} onClick={save}>{item ? "Save item" : "Add item"}</Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Section"><SectionSelect value={draft.section} disabled={!!item} onChange={(section) => setDraft({ ...draft, section })} /></Field>
        <Field label="Category" required><Input list="schedule-settings-categories" value={draft.category} disabled={!!item} maxLength={80} onChange={set("category")} /></Field>
        <Field label="Product" required className="sm:col-span-2"><Input value={draft.productName} maxLength={200} onChange={set("productName")} /></Field>
        <Field label="Brand">
          <Select value={draft.brandId} onChange={(e) => setDraft({ ...draft, brandId: e.target.value, brandName: e.target.value ? "" : draft.brandName })}>
            <option value="">Other (type the name)</option>
            {brandOptions.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </Select>
        </Field>
        <Field label="Brand name"><Input value={draft.brandId ? brandOptions.find((b) => b.id === draft.brandId)?.name ?? "" : draft.brandName} disabled={!!draft.brandId} maxLength={160} onChange={set("brandName")} /></Field>
        <Field label="SKU / code"><Input value={draft.skuText} maxLength={160} onChange={set("skuText")} /></Field>
        <Field label="Color"><Input value={draft.color} maxLength={160} onChange={set("color")} /></Field>
        <Field label="Pattern / motif"><Input value={draft.pattern} maxLength={160} onChange={set("pattern")} /></Field>
        <Field label="Finishing"><Input value={draft.finishing} maxLength={160} onChange={set("finishing")} /></Field>
        <Field label="Dimension"><Input value={draft.dimension} maxLength={160} onChange={set("dimension")} /></Field>
        <Field label="Qty"><Input inputMode="decimal" value={draft.qty} maxLength={20} onChange={set("qty")} /></Field>
        <Field label="Unit"><Input value={draft.unit} maxLength={40} onChange={set("unit")} /></Field>
        <Field label="Location" className="sm:col-span-2"><Input value={draft.location} maxLength={160} onChange={set("location")} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={draft.notes} maxLength={2000} onChange={set("notes")} /></Field>
      </div>
    </Dialog>
  );
}


// ── Phase templates (V2) ─────────────────────────────────────────────────────

type PhaseDefDialogProps = { def: PhaseDefinitionDraft | null; templateId: string; run: ReturnType<typeof useCommand>["run"]; pendingKey: string | null; onClose: () => void };

function PhaseDefDialog({ def, templateId, run, pendingKey, onClose }: PhaseDefDialogProps) {
  const [draft, setDraft] = useState({ name: def?.name ?? "", prefix: def?.prefix ?? "", seat: (def?.seat ?? "designer") as "designer" | "drafter", allowParallel: def?.allowParallel ?? false });
  const key = def ? `def-${def.id}` : `def-new-${templateId}`;
  const pending = pendingKey === key;
  const save = async () => {
    const ok = def
      ? await run(key, () => updatePhaseDefinitionAction({ definitionId: def.id, name: draft.name, prefix: draft.prefix, seat: draft.seat, allowParallel: draft.allowParallel }))
      : await run(key, () => createPhaseDefinitionAction({ templateId, name: draft.name, prefix: draft.prefix, seat: draft.seat, allowParallel: draft.allowParallel }));
    if (ok) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={def ? "Edit phase" : "Add phase"}
      description={def ? "Update this phase definition. Existing project phases are not renamed." : "Add a phase to this template."}
      size="sm"
      dismissible={!pending}
      footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button><Button variant="primary" pending={pending} disabled={!draft.name.trim() || !draft.prefix.trim()} onClick={save}>{def ? "Save" : "Add"}</Button></div>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phase name" required className="sm:col-span-2"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={200} placeholder="e.g. Moodboard" /></Field>
        <Field label="Prefix" description="Up to 4 chars, used for revision labels."><Input value={draft.prefix} onChange={(e) => setDraft({ ...draft, prefix: e.target.value.toUpperCase() })} maxLength={4} className="font-ui-mono uppercase" placeholder="MB" /></Field>
        <Field label="Seat">
          <Select value={draft.seat} onChange={(e) => setDraft({ ...draft, seat: e.target.value as "designer" | "drafter" })}>
            <option value="designer">Designer</option>
            <option value="drafter">Drafter</option>
          </Select>
        </Field>
        <Field label="Can run parallel" className="sm:col-span-2">
          <Switch label={draft.allowParallel ? "Yes" : "No"} checked={draft.allowParallel} onCheckedChange={(v) => setDraft({ ...draft, allowParallel: v })} />
        </Field>
      </div>
    </Dialog>
  );
}

function PhaseTemplatesSection({
  phaseTemplates,
  canManage,
  run,
  pendingKey,
}: {
  phaseTemplates: PhaseTemplateDraft[];
  canManage: boolean;
  run: ReturnType<typeof useCommand>["run"];
  pendingKey: string | null;
}) {
  const [newName, setNewName] = useState("");
  const [defDialog, setDefDialog] = useState<{ def: PhaseDefinitionDraft | null; templateId: string } | null>(null);

  const moveDefinition = async (template: PhaseTemplateDraft, index: number, delta: number) => {
    const ids = template.definitions.map((d) => d.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(`def-reorder-${template.id}`, () => reorderPhaseDefinitionsAction({ templateId: template.id, orderedIds: ids }));
  };

  return (
    <SectionCard id="phase-templates" title="Phase Templates (V2)" description="Templates define the phases a project gets on creation. The default template is applied automatically." padded={false}>
      {phaseTemplates.length === 0 ? (
        <div className="px-(--ui-section-px) py-4"><Text tone="tertiary" size="sm">No phase templates yet. {canManage ? "Add one below." : ""}</Text></div>
      ) : phaseTemplates.map((template) => (
        <section key={template.id} className="border-b border-line-subtle last:border-b-0">
          <div className="flex flex-wrap items-center gap-2 px-(--ui-section-px) py-2.5">
            <div className="flex flex-1 items-center gap-2 min-w-0">
              <span className={`text-sm font-semibold ${template.isActive ? "" : "text-ink-tertiary line-through"}`}>{template.name}</span>
              {template.isDefault ? <Badge tone="success">Default</Badge> : null}
              {!template.isActive ? <Badge>Inactive</Badge> : null}
            </div>
            {canManage ? (
              <RowActionMenu
                label={`Template ${template.name} actions`}
                pending={pendingKey === template.id}
                items={[
                  ...(!template.isDefault ? [{ label: "Set as default", onSelect: () => void run(template.id, () => updatePhaseTemplateAction({ templateId: template.id, isDefault: true })) }] : []),
                  { label: template.isActive ? "Deactivate" : "Activate", onSelect: () => void run(template.id, () => updatePhaseTemplateAction({ templateId: template.id, isActive: !template.isActive })) },
                  { label: "Add phase", separatorBefore: true, onSelect: () => setDefDialog({ def: null, templateId: template.id }) },
                  { label: "Delete template", danger: true, separatorBefore: true, onSelect: () => void run(template.id, () => deletePhaseTemplateAction(template.id)) },
                ]}
              />
            ) : null}
          </div>
          {template.definitions.length === 0 ? (
            <div className="px-(--ui-section-px) pb-3"><Text tone="tertiary" size="sm">No phases defined.</Text></div>
          ) : (
            <ol className="m-0 grid list-none gap-px px-(--ui-section-px) pb-3 p-0">
              {template.definitions.map((def, index) => (
                <li key={def.id} className="flex items-center gap-2 rounded-control px-1.5 py-1.5 hover:bg-surface-muted">
                  <span className="w-5 shrink-0 text-right font-ui-mono text-[0.6875rem] text-ink-tertiary">{index + 1}</span>
                  <span className="flex-1 text-sm">{def.name}</span>
                  <span className="font-ui-mono text-xs text-ink-tertiary">{def.prefix}</span>
                  <Badge>{def.seat}</Badge>
                  {def.allowParallel ? <Badge>parallel</Badge> : null}
                  {canManage ? (
                    <RowActionMenu
                      label={`Phase ${def.name} actions`}
                      pending={pendingKey === `def-${def.id}`}
                      items={[
                        { label: "Edit", onSelect: () => setDefDialog({ def, templateId: template.id }) },
                        { label: "Move up", disabled: index === 0, separatorBefore: true, onSelect: () => void moveDefinition(template, index, -1) },
                        { label: "Move down", disabled: index === template.definitions.length - 1, onSelect: () => void moveDefinition(template, index, 1) },
                        { label: "Delete", danger: true, separatorBefore: true, onSelect: () => void run(`def-${def.id}`, () => deletePhaseDefinitionAction(def.id)) },
                      ]}
                    />
                  ) : null}
                </li>
              ))}
            </ol>
          )}
          {canManage ? (
            <div className="px-(--ui-section-px) pb-3">
              <Button size="sm" variant="ghost" onClick={() => setDefDialog({ def: null, templateId: template.id })}>+ Add phase</Button>
            </div>
          ) : null}
        </section>
      ))}
      {canManage ? (
        <div className="px-(--ui-section-px) py-3 border-t border-line-subtle">
          <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run("phase-template-new", () => createPhaseTemplateAction({ name: newName }))) setNewName(""); }}>
            <Input aria-label="New template name" density="compact" className="flex-1" placeholder="New template name…" value={newName} maxLength={200} onChange={(e) => setNewName(e.target.value)} />
            <Button type="submit" size="sm" pending={pendingKey === "phase-template-new"} disabled={!newName.trim()}>Add template</Button>
          </form>
        </div>
      ) : null}
      {defDialog ? (
        <PhaseDefDialog
          def={defDialog.def}
          templateId={defDialog.templateId}
          run={run}
          pendingKey={pendingKey}
          onClose={() => setDefDialog(null)}
        />
      ) : null}
    </SectionCard>
  );
}

function TemplateGroup({
  group,
  templates,
  canManage,
  run,
  pendingKey,
}: {
  group: { key: PhaseKey | null; label: string; description: string };
  templates: Template[];
  canManage: boolean;
  run: ReturnType<typeof useCommand>["run"];
  pendingKey: string | null;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const addKey = `add-${group.key ?? "general"}`;

  const move = (index: number, delta: number) => {
    const ids = templates.map((t) => t.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(ids[target], () => reorderTemplatesAction({ phaseKey: group.key, orderedIds: ids }));
  };

  return (
    <SectionCard title={group.label} description={group.description} count={templates.filter((t) => t.isActive).length} padded>
      {templates.length === 0 ? <Text size="sm" tone="tertiary">No items.</Text> : (
        <ol className="m-0 grid list-none gap-px p-0">
          {templates.map((template, index) => (
            <li key={template.id} className="flex items-center gap-2 rounded-control px-1.5 py-1.5 hover:bg-surface-muted">
              <span className="w-5 shrink-0 text-right font-ui-mono text-[0.6875rem] text-ink-tertiary">{index + 1}</span>
              {editing === template.id ? (
                <form className="flex flex-1 gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run(template.id, () => updateTemplateAction({ templateId: template.id, label: editText }))) setEditing(null); }}>
                  <Input aria-label="Checklist item" density="compact" autoFocus value={editText} maxLength={200} onChange={(e) => setEditText(e.target.value)} />
                  <Button type="submit" size="sm" disabled={!editText.trim()}>Save</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </form>
              ) : (
                <span className={`min-w-0 flex-1 ${template.isActive ? "" : "text-ink-tertiary line-through"}`}>{template.label}</span>
              )}
              {!template.isActive ? <Badge>Inactive</Badge> : null}
              {template.usedBy > 0 ? <Text size="sm" tone="tertiary" title="Project rows generated from this item">{template.usedBy} project row(s)</Text> : null}
              {canManage && editing !== template.id ? (
                <RowActionMenu pending={pendingKey === template.id} items={[
                  { label: "Rename", onSelect: () => { setEditing(template.id); setEditText(template.label); } },
                  { label: template.isActive ? "Deactivate" : "Activate", onSelect: () => run(template.id, () => updateTemplateAction({ templateId: template.id, isActive: !template.isActive })) },
                  { label: "Move up", disabled: index === 0, separatorBefore: true, onSelect: () => move(index, -1) },
                  { label: "Move down", disabled: index === templates.length - 1, onSelect: () => move(index, 1) },
                  { label: "Delete", danger: true, separatorBefore: true, onSelect: () => run(template.id, () => deleteTemplateAction(template.id)) },
                ]} />
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {canManage ? (
        <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run(addKey, () => createTemplateAction({ phaseKey: group.key, label: draft }))) setDraft(""); }}>
          <Input aria-label={`New ${group.label} checklist item`} density="compact" className="flex-1" placeholder="Add checklist item…" value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} />
          <Button type="submit" size="sm" pending={pendingKey === addKey} disabled={!draft.trim()}>Add</Button>
        </form>
      ) : null}
    </SectionCard>
  );
}
