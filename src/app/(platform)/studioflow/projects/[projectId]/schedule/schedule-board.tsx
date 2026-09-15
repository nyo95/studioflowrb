"use client";

import { useMemo, useState } from "react";
import { Check, FileUp, Plus, Trash2 } from "lucide-react";

import { Badge, Button, EmptyState, Field, InlineError, Input, Select, Text, Textarea, useConfirm } from "@/platform/ui_engine";

import {
  applyScheduleTemplatesAction,
  createScheduleEntryAction,
  createScheduleOptionAction,
  deleteScheduleEntryAction,
  deleteScheduleOptionAction,
  importScheduleCsvAction,
  markScheduleFinalAction,
  updateScheduleEntryAction,
} from "../../../actions";
import { useCommand } from "../../../_components/use-command";

type ScheduleEntry = {
  id: string;
  section: "MATERIAL" | "FIXTURE";
  category: string;
  code: string;
  qty: string | null;
  unit: string | null;
  location: string | null;
  options: Array<{
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
  }>;
};

type Draft = {
  section: "MATERIAL" | "FIXTURE";
  category: string;
  brandId: string;
  brandName: string;
  productName: string;
  skuText: string;
  color: string;
  finishing: string;
  dimension: string;
  qty: string;
  unit: string;
  location: string;
  notes: string;
};

const emptyDraft: Draft = {
  section: "MATERIAL",
  category: "",
  brandId: "",
  brandName: "",
  productName: "",
  skuText: "",
  color: "",
  finishing: "",
  dimension: "",
  qty: "",
  unit: "",
  location: "",
  notes: "",
};

export function ScheduleBoard({ projectId, entries, brands, canEdit }: { projectId: string; entries: readonly ScheduleEntry[]; brands: Array<{ id: string; name: string }>; canEdit: boolean }) {
  const { run, pendingKey, error } = useCommand();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [optionDraftFor, setOptionDraftFor] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [csvSection, setCsvSection] = useState<"MATERIAL" | "FIXTURE">("MATERIAL");

  const groups = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>();
    for (const entry of entries) {
      const key = `${entry.section}:${entry.category}`;
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return [...map.entries()].map(([key, rows]) => ({ key, section: rows[0].section, category: rows[0].category, rows }));
  }, [entries]);

  const snapshot = () => ({
    brandId: draft.brandId || null,
    brandName: draft.brandId ? undefined : draft.brandName || null,
    productName: draft.productName,
    skuText: draft.skuText || null,
    color: draft.color || null,
    finishing: draft.finishing || null,
    dimension: draft.dimension || null,
    notes: draft.notes || null,
  });

  const createEntry = async () => {
    if (await run("entry", () => createScheduleEntryAction({
      projectId,
      section: draft.section,
      category: draft.category,
      qty: draft.qty || null,
      unit: draft.unit || null,
      location: draft.location || null,
      snapshot: draft.productName.trim() ? snapshot() : null,
    }))) {
      setDraft(emptyDraft);
    }
  };

  const createOption = async (entry: ScheduleEntry) => {
    if (await run(`option-${entry.id}`, () => createScheduleOptionAction({ projectId, entryId: entry.id, snapshot: snapshot() }))) {
      setOptionDraftFor(null);
      setDraft(emptyDraft);
    }
  };

  const removeEntry = async (entry: ScheduleEntry) => {
    const ok = await confirm.confirm({ title: "Delete schedule item?", description: `${entry.code} and all its options will be removed. The remaining codes in this prefix will close the gap.`, confirmLabel: "Delete item", tone: "danger" });
    if (ok) await run(entry.id, () => deleteScheduleEntryAction({ projectId, entryId: entry.id }));
  };

  const removeOption = async (entry: ScheduleEntry, optionId: string) => {
    await run(optionId, () => deleteScheduleOptionAction({ projectId, optionId }));
  };

  return (
    <div className="grid">
      {canEdit ? (
        <div className="grid gap-3 border-b border-line-subtle px-(--ui-section-px) py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text tone="secondary" size="sm">Add a project-owned schedule row. Product fields become a typed snapshot.</Text>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" leadingIcon={<Check className="h-3.5 w-3.5" />} pending={pendingKey === "templates"} onClick={() => run("templates", () => applyScheduleTemplatesAction({ projectId }))}>
                Apply templates
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
            <Field label="Section"><Select density="compact" value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value as Draft["section"] })}><option value="MATERIAL">Material</option><option value="FIXTURE">Fixture</option></Select></Field>
            <Field label="Category"><Input density="compact" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></Field>
            <Field label="Brand"><Select density="compact" value={draft.brandId} onChange={(e) => setDraft({ ...draft, brandId: e.target.value, brandName: "" })}><option value="">Manual brand</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</Select></Field>
            <Field label="Brand text"><Input density="compact" disabled={!!draft.brandId} value={draft.brandName} onChange={(e) => setDraft({ ...draft, brandName: e.target.value })} /></Field>
            <Field label="Product"><Input density="compact" value={draft.productName} onChange={(e) => setDraft({ ...draft, productName: e.target.value })} /></Field>
            <Field label="SKU"><Input density="compact" value={draft.skuText} onChange={(e) => setDraft({ ...draft, skuText: e.target.value })} /></Field>
            <Field label="Color"><Input density="compact" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></Field>
            <Field label="Finishing"><Input density="compact" value={draft.finishing} onChange={(e) => setDraft({ ...draft, finishing: e.target.value })} /></Field>
            <Field label="Dimension"><Input density="compact" value={draft.dimension} onChange={(e) => setDraft({ ...draft, dimension: e.target.value })} /></Field>
            <Field label="Qty"><Input density="compact" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} /></Field>
            <Field label="Unit"><Input density="compact" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} /></Field>
            <Field label="Location"><Input density="compact" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} pending={pendingKey === "entry"} disabled={!draft.category.trim()} onClick={createEntry}>Add entry</Button>
          </div>
          <details className="rounded-card border border-line-subtle p-3">
            <summary className="cursor-pointer text-sm font-medium">Import legacy CSV</summary>
            <div className="mt-3 grid gap-2">
              <Select density="compact" value={csvSection} onChange={(e) => setCsvSection(e.target.value as "MATERIAL" | "FIXTURE")} className="max-w-48"><option value="MATERIAL">Material</option><option value="FIXTURE">Fixture</option></Select>
              <Textarea rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="category,brand,product,sku,color,qty,unit,location" />
              <Button size="sm" className="justify-self-start" leadingIcon={<FileUp className="h-3.5 w-3.5" />} pending={pendingKey === "csv"} disabled={!csv.trim()} onClick={() => run("csv", () => importScheduleCsvAction({ projectId, section: csvSection, csv }))}>Import CSV</Button>
            </div>
          </details>
        </div>
      ) : null}

      {error ? <InlineError className="px-(--ui-section-px) pt-2">{error}</InlineError> : null}

      {groups.length === 0 ? (
        <EmptyState title="No schedule items yet" description={canEdit ? "Add a manual item, apply templates, or import a legacy CSV." : "This project does not have a product schedule yet."} className="py-10" />
      ) : (
        <div className="grid divide-y divide-line-subtle">
          {groups.map((group) => (
            <section key={group.key} className="grid gap-2 px-(--ui-section-px) py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{group.section === "MATERIAL" ? "Material" : "Fixture"}</Badge>
                <h3 className="m-0 text-base font-semibold">{group.category}</h3>
                <Text size="sm" tone="tertiary">{group.rows.length} item(s)</Text>
              </div>
              <div className="grid gap-2">
                {group.rows.map((entry) => (
                  <article key={entry.id} className="rounded-card border border-line-subtle bg-surface px-3 py-2">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="w-16 shrink-0 font-ui-mono text-sm font-semibold tabular-nums">{entry.code}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-2 text-sm text-ink-secondary">
                          {entry.qty ? <span>{entry.qty} {entry.unit ?? ""}</span> : null}
                          {entry.location ? <span>{entry.location}</span> : null}
                        </div>
                        <div className="mt-2 grid gap-1">
                          {entry.options.map((option) => (
                            <div key={option.id} className="flex flex-wrap items-center gap-2 rounded-control bg-surface-muted px-2 py-1.5">
                              <Badge tone={option.isFinal ? "success" : "neutral"}>{option.label}</Badge>
                              <span className="min-w-0 flex-1 truncate font-medium">{option.brandName ? `${option.brandName} · ` : ""}{option.productName}</span>
                              <Text size="sm" tone="tertiary" className="truncate">{[option.skuText, option.color, option.finishing, option.dimension].filter(Boolean).join(" · ")}</Text>
                              {canEdit && !option.isFinal ? <Button size="sm" variant="ghost" onClick={() => run(option.id, () => markScheduleFinalAction({ projectId, optionId: option.id }))}>Final</Button> : null}
                              {canEdit ? <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => removeOption(entry, option.id)}>Delete</Button> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                      {canEdit ? (
                        <div className="flex shrink-0 flex-wrap gap-1">
                          <Button size="sm" variant="secondary" onClick={() => setOptionDraftFor(optionDraftFor === entry.id ? null : entry.id)}>Add option</Button>
                          <Button size="sm" variant="ghost" onClick={() => run(`save-${entry.id}`, () => updateScheduleEntryAction({ projectId, entryId: entry.id, qty: entry.qty, unit: entry.unit, location: entry.location }))}>Save</Button>
                          <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => void removeEntry(entry)}>Delete</Button>
                        </div>
                      ) : null}
                    </div>
                    {canEdit && optionDraftFor === entry.id ? (
                      <div className="mt-3 flex justify-end">
                        <Button size="sm" variant="primary" disabled={!draft.productName.trim()} pending={pendingKey === `option-${entry.id}`} onClick={() => createOption(entry)}>Save current product fields as option</Button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {confirm.dialog}
    </div>
  );
}
