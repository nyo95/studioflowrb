"use client";

import { useState, type ReactNode } from "react";

import { fallbackPrefix, normalizeExtraFields, normalizeScheduleCategory, scheduleCode } from "@/apps/studioflow/domain/schedule";

import { ExtraFieldsEditor } from "../../_components/extra-fields-editor";
import { useCommand } from "../../_components/use-command";
import {
  createScheduleTemplateItemAction,
  deleteSchedulePrefixAction,
  deleteScheduleTemplateItemAction,
  setScheduleTemplateItemActiveAction,
  updateScheduleTemplateItemAction,
  upsertSchedulePrefixAction,
} from "../../actions";

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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  Textarea,
} from "@/platform/ui_engine";

type ScheduleTemplate = {
  id: string;
  section: "MATERIAL" | "FIXTURE";
  category: string;
  is_active: boolean;
  items: Array<{
    id: string;
    product_name: string;
    brand_id: string | null;
    brand_name: string | null;
    color: string | null;
    pattern: string | null;
    finishing: string | null;
    dimension: string | null;
    notes: string | null;
    extra: unknown;
    is_active: boolean;
    sort_order: number;
    qty: { toString(): string } | null;
    unit: string | null;
    location: string | null;
  }>;
};
type SchedulePrefix = { id: string; section: "MATERIAL" | "FIXTURE"; category: string; prefix: string };
type BrandChoice = { id: string; name: string };

/** The standard Product Schedule: prefixes (PT, LF, …) and the template items a standard project starts with. */
export function ScheduleTemplatesView({ scheduleTemplates, schedulePrefixes, brands, canManage }: { scheduleTemplates: ScheduleTemplate[]; schedulePrefixes: SchedulePrefix[]; brands: BrandChoice[]; canManage: boolean }) {
  const { run, pendingKey, error } = useCommand();
  return (
    <div className="grid gap-4">
      {error ? <InlineError>{error}</InlineError> : null}
      <ScheduleSettings scheduleTemplates={scheduleTemplates} schedulePrefixes={schedulePrefixes} brands={brands} canManage={canManage} run={run} pendingKey={pendingKey} />
      <Text size="sm" tone="tertiary">A new standard project receives every active template item. On an existing project, use “Apply templates” on its Product Schedule to add the ones it does not have yet; items already in the project keep their own copy.</Text>
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
  const [itemDialog, setItemDialog] = useState<TemplateItemRow | "new" | null>(null);

  const items: TemplateItemRow[] = scheduleTemplates.flatMap((template) => template.items.map((item) => ({ ...item, section: template.section, category: template.category })));
  // The code a new standard project gives each active item: the category prefix plus its place among that category's active items.
  const prefixOf = (section: Section, category: string) => schedulePrefixes.find((p) => p.section === section && normalizeScheduleCategory(p.category).key === normalizeScheduleCategory(category).key)?.prefix ?? fallbackPrefix(category);
  const codeOf = new Map<string, string>();
  for (const template of scheduleTemplates) {
    [...template.items].filter((item) => item.is_active).sort((a, b) => a.sort_order - b.sort_order).forEach((item, index) => codeOf.set(item.id, scheduleCode(prefixOf(template.section, template.category), index + 1)));
  }
  const categoryNames = [...new Set([...scheduleTemplates.map((t) => t.category), ...schedulePrefixes.map((p) => p.category)])].sort((a, b) => a.localeCompare(b));

  return (
    <SectionCard title="Standard Product Schedule" description="The items every standard project starts with, and the letters their codes begin with (PT-01, PT-02, …). The Code column shows what a new project will get." padded={false}>
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

      <TableTitle title="Template items" count={items.length}>
        {canManage ? <Button size="sm" variant="secondary" onClick={() => setItemDialog("new")}>Add template item</Button> : null}
      </TableTitle>
      <DataTable density="compact" minWidth={980}>
        <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Section</TableHead><TableHead>Category</TableHead><TableHead>Brand</TableHead><TableHead>Type</TableHead><TableHead align="end">Qty</TableHead><TableHead>Unit</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead align="end">Order</TableHead>{canManage ? <TableHead stickyEnd align="end">Actions</TableHead> : null}</TableRow></TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow><TableCell colSpan={canManage ? 11 : 10}><Text size="sm" tone="tertiary">No template items yet. Add one here or use “Save as template item” on a project schedule row.</Text></TableCell></TableRow>
          ) : items.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{codeOf.has(row.id) ? <span className="font-ui-mono font-semibold">{codeOf.get(row.id)}</span> : <Text size="sm" tone="tertiary">—</Text>}</TableCell>
              <TableCell>{SECTION_LABEL[row.section]}</TableCell>
              <TableCell>{row.category}</TableCell>
              <TableCell>{row.brand_name ?? <Text size="sm" tone="tertiary">—</Text>}</TableCell>
              <TableCell>{row.product_name ? <span className={`font-medium ${row.is_active ? "" : "text-ink-tertiary line-through"}`}>{row.product_name}</span> : <Text size="sm" tone="tertiary">Reserved only — no default product</Text>}</TableCell>
              <TableCell align="end"><span className="tabular-nums">{row.qty?.toString() ?? ""}</span></TableCell>
              <TableCell>{row.unit ?? ""}</TableCell>
              <TableCell>{row.location ?? ""}</TableCell>
              <TableCell>{row.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</TableCell>
              <TableCell align="end"><span className="font-ui-mono tabular-nums">{row.sort_order}</span></TableCell>
              {canManage ? (
                <TableCell stickyEnd align="end">
                  <RowActionMenu label={`Actions for template item ${row.product_name || row.category}`} pending={pendingKey === row.id} items={[
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
    color: text(item?.color),
    pattern: text(item?.pattern),
    finishing: text(item?.finishing),
    dimension: text(item?.dimension),
    notes: text(item?.notes),
    qty: item?.qty?.toString() ?? "",
    unit: text(item?.unit),
    location: text(item?.location),
    extra: normalizeExtraFields(item?.extra),
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
      color: nullable(draft.color),
      pattern: nullable(draft.pattern),
      finishing: nullable(draft.finishing),
      dimension: nullable(draft.dimension),
      notes: nullable(draft.notes),
      extra: draft.extra.map((field) => ({ label: field.label.trim(), value: field.value.trim() })).filter((field) => field.label && field.value),
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
          <Button variant="primary" pending={pending} disabled={!draft.category.trim()} onClick={save}>{item ? "Save item" : "Add item"}</Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Section"><SectionSelect value={draft.section} disabled={!!item} onChange={(section) => setDraft({ ...draft, section })} /></Field>
        <Field label="Category" required><Input list="schedule-settings-categories" value={draft.category} disabled={!!item} maxLength={80} onChange={set("category")} /></Field>
        <Field label="Type" className="sm:col-span-2" description="The product designation, e.g. “Nude Pro - ATS 1132 M”. Leave blank to just reserve this category in every project, with no default product yet."><Input value={draft.productName} maxLength={200} onChange={set("productName")} /></Field>
        <Field label="Brand">
          <Select value={draft.brandId} onChange={(e) => setDraft({ ...draft, brandId: e.target.value, brandName: e.target.value ? "" : draft.brandName })}>
            <option value="">Other (type the name)</option>
            {brandOptions.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </Select>
        </Field>
        <Field label="Brand name"><Input value={draft.brandId ? brandOptions.find((b) => b.id === draft.brandId)?.name ?? "" : draft.brandName} disabled={!!draft.brandId} maxLength={160} onChange={set("brandName")} /></Field>
        <Field label="Color"><Input value={draft.color} maxLength={160} onChange={set("color")} /></Field>
        <Field label="Pattern"><Input value={draft.pattern} maxLength={160} onChange={set("pattern")} /></Field>
        <Field label="Finishing"><Input value={draft.finishing} maxLength={160} onChange={set("finishing")} /></Field>
        <Field label="Size"><Input value={draft.dimension} maxLength={160} onChange={set("dimension")} /></Field>
        <Field label="Qty"><Input inputMode="decimal" value={draft.qty} maxLength={20} onChange={set("qty")} /></Field>
        <Field label="Unit"><Input value={draft.unit} maxLength={40} onChange={set("unit")} /></Field>
        <Field label="Location" className="sm:col-span-2"><Input value={draft.location} maxLength={160} onChange={set("location")} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={draft.notes} maxLength={2000} onChange={set("notes")} /></Field>
        <div className="sm:col-span-2">
          <ExtraFieldsEditor value={draft.extra} onChange={(extra) => setDraft({ ...draft, extra })} disabled={pending} />
        </div>
      </div>
    </Dialog>
  );
}
