"use client";

import { useState } from "react";

import type { PhaseKey } from "@/apps/studioflow/domain/phase";
import { Badge, Button, Field, InlineError, Input, RowActionMenu, SectionCard, Select, Switch, Text } from "@/platform/ui_engine";

import { createScheduleTemplateItemAction, createTemplateAction, deleteTemplateAction, reorderTemplatesAction, setAutoNamingAction, updateTemplateAction, upsertSchedulePrefixAction, upsertScheduleTemplateCategoryAction } from "../actions";
import { useCommand } from "../_components/use-command";

type Template = { id: string; phaseKey: PhaseKey | null; label: string; isActive: boolean; sortOrder: number; usedBy: number };
type ScheduleTemplate = { id: string; section: "MATERIAL" | "FIXTURE"; category: string; is_default_entry: boolean; is_active: boolean; items: Array<{ id: string; product_name: string; brand_name: string | null; sku_text: string | null }> };
type SchedulePrefix = { id: string; section: "MATERIAL" | "FIXTURE"; category: string; prefix: string };
type BrandChoice = { id: string; name: string };

export function StudioSettingsView({
  autoNaming,
  templates,
  scheduleTemplates,
  schedulePrefixes,
  brands,
  phases,
  canManage,
}: {
  autoNaming: boolean;
  templates: Template[];
  scheduleTemplates: ScheduleTemplate[];
  schedulePrefixes: SchedulePrefix[];
  brands: BrandChoice[];
  phases: Array<{ key: PhaseKey; label: string }>;
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
      <ScheduleSettings scheduleTemplates={scheduleTemplates} schedulePrefixes={schedulePrefixes} brands={brands} canManage={canManage} run={run} pendingKey={pendingKey} />
      <Text size="sm" tone="tertiary">Changes apply to new projects. Use “Apply checklist templates” on a project to add new items to it; renamed items are not rewritten in existing projects.</Text>
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
  const [prefix, setPrefix] = useState({ section: "MATERIAL" as "MATERIAL" | "FIXTURE", category: "", prefix: "" });
  const [category, setCategory] = useState({ section: "MATERIAL" as "MATERIAL" | "FIXTURE", category: "", isDefaultEntry: true });
  const [item, setItem] = useState({ section: "MATERIAL" as "MATERIAL" | "FIXTURE", category: "", brandId: "", productName: "", skuText: "", unit: "", qty: "" });

  return (
    <SectionCard title="Product Schedule" description="Prefix dictionary and default schedule rows for new or existing projects." count={scheduleTemplates.length} padded>
      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-2 max-[760px]:grid-cols-1">
          <Field label="Section"><Select density="compact" value={prefix.section} onChange={(e) => setPrefix({ ...prefix, section: e.target.value as "MATERIAL" | "FIXTURE" })}><option value="MATERIAL">Material</option><option value="FIXTURE">Fixture</option></Select></Field>
          <Field label="Category"><Input density="compact" value={prefix.category} onChange={(e) => setPrefix({ ...prefix, category: e.target.value })} /></Field>
          <Field label="Prefix"><Input density="compact" value={prefix.prefix} onChange={(e) => setPrefix({ ...prefix, prefix: e.target.value })} /></Field>
        </div>
        {canManage ? <Button size="sm" className="justify-self-start" pending={pendingKey === "schedule-prefix"} disabled={!prefix.category.trim() || !prefix.prefix.trim()} onClick={() => run("schedule-prefix", () => upsertSchedulePrefixAction(prefix))}>Save prefix</Button> : null}
        <div className="flex flex-wrap gap-1">
          {schedulePrefixes.map((row) => <Badge key={row.id}>{row.section === "MATERIAL" ? "Material" : "Fixture"} · {row.category}: {row.prefix}</Badge>)}
        </div>

        <div className="border-t border-line-subtle pt-4">
          <Text className="mb-2 font-medium">Default categories</Text>
          <div className="grid grid-cols-3 gap-2 max-[760px]:grid-cols-1">
            <Field label="Section"><Select density="compact" value={category.section} onChange={(e) => setCategory({ ...category, section: e.target.value as "MATERIAL" | "FIXTURE" })}><option value="MATERIAL">Material</option><option value="FIXTURE">Fixture</option></Select></Field>
            <Field label="Category"><Input density="compact" value={category.category} onChange={(e) => setCategory({ ...category, category: e.target.value })} /></Field>
            <Field label="Create empty entry"><Select density="compact" value={category.isDefaultEntry ? "yes" : "no"} onChange={(e) => setCategory({ ...category, isDefaultEntry: e.target.value === "yes" })}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
          </div>
          {canManage ? <Button size="sm" className="mt-2" pending={pendingKey === "schedule-category"} disabled={!category.category.trim()} onClick={() => run("schedule-category", () => upsertScheduleTemplateCategoryAction(category))}>Save category</Button> : null}
        </div>

        <div className="border-t border-line-subtle pt-4">
          <Text className="mb-2 font-medium">Template items</Text>
          <div className="grid grid-cols-3 gap-2 max-[900px]:grid-cols-1">
            <Field label="Section"><Select density="compact" value={item.section} onChange={(e) => setItem({ ...item, section: e.target.value as "MATERIAL" | "FIXTURE" })}><option value="MATERIAL">Material</option><option value="FIXTURE">Fixture</option></Select></Field>
            <Field label="Category"><Input density="compact" value={item.category} onChange={(e) => setItem({ ...item, category: e.target.value })} /></Field>
            <Field label="Brand"><Select density="compact" value={item.brandId} onChange={(e) => setItem({ ...item, brandId: e.target.value })}><option value="">Manual</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</Select></Field>
            <Field label="Product"><Input density="compact" value={item.productName} onChange={(e) => setItem({ ...item, productName: e.target.value })} /></Field>
            <Field label="SKU"><Input density="compact" value={item.skuText} onChange={(e) => setItem({ ...item, skuText: e.target.value })} /></Field>
            <Field label="Qty"><Input density="compact" value={item.qty} onChange={(e) => setItem({ ...item, qty: e.target.value })} /></Field>
          </div>
          {canManage ? (
            <Button
              size="sm"
              className="mt-2"
              pending={pendingKey === "schedule-item"}
              disabled={!item.category.trim() || !item.productName.trim()}
              onClick={() => run("schedule-item", () => createScheduleTemplateItemAction({ section: item.section, category: item.category, snapshot: { brandId: item.brandId || null, productName: item.productName, skuText: item.skuText || null }, qty: item.qty || null, unit: item.unit || null }))}
            >
              Add template item
            </Button>
          ) : null}
        </div>

        <div className="grid gap-2">
          {scheduleTemplates.map((template) => (
            <div key={template.id} className="rounded-card border border-line-subtle p-2">
              <div className="flex flex-wrap gap-2">
                <Badge>{template.section === "MATERIAL" ? "Material" : "Fixture"}</Badge>
                <Text className="font-medium">{template.category}</Text>
                {template.is_default_entry ? <Text size="sm" tone="tertiary">default empty entry</Text> : null}
              </div>
              {template.items.length ? <Text size="sm" tone="secondary">{template.items.map((row) => `${row.brand_name ? `${row.brand_name} · ` : ""}${row.product_name}`).join(", ")}</Text> : null}
            </div>
          ))}
        </div>
      </div>
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
