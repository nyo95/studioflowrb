"use client";

import { useState } from "react";

import type { PhaseKey } from "@/apps/studioflow/domain/phase";
import { Badge, Button, InlineError, Input, RowActionMenu, SectionCard, Switch, Text } from "@/platform/ui_engine";

import { createTemplateAction, deleteTemplateAction, reorderTemplatesAction, setAutoNamingAction, updateTemplateAction } from "../actions";
import { useCommand } from "../_components/use-command";

type Template = { id: string; phaseKey: PhaseKey | null; label: string; isActive: boolean; sortOrder: number; usedBy: number };

export function StudioSettingsView({ autoNaming, templates, phases, canManage }: { autoNaming: boolean; templates: Template[]; phases: Array<{ key: PhaseKey; label: string }>; canManage: boolean }) {
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
      <Text size="sm" tone="tertiary">Changes apply to new projects. Use “Apply checklist templates” on a project to add new items to it; renamed items are not rewritten in existing projects.</Text>
    </div>
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
