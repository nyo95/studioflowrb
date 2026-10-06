"use client";

import { useState } from "react";



import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  Field,
  InlineError,
  Input,
  RowActionMenu,
  SectionCard,
  Select,
  Switch,
  Text,
} from "@/platform/ui_engine";

import {
  createPhaseDefinitionAction,
  createPhaseTemplateAction,
  createTemplateAction,
  deletePhaseDefinitionAction,
  deletePhaseTemplateAction,
  deleteTemplateAction,
  reorderPhaseDefinitionsAction,
  reorderTemplatesAction,
  updatePhaseDefinitionAction,
  updatePhaseTemplateAction,
  updateTemplateAction,
} from "../actions";
import { useCommand } from "../_components/use-command";

type Template = { id: string; definitionId: string | null; label: string; isBlocking: boolean; isActive: boolean; sortOrder: number; usedBy: number };
type PhaseDefinitionDraft = { id: string; name: string; prefix: string; orderIndex: number; allowParallel: boolean; seat: "designer" | "drafter" };
type PhaseTemplateDraft = { id: string; name: string; isDefault: boolean; isActive: boolean; definitions: PhaseDefinitionDraft[] };
/** Checklist templates: the items every new project's general and per-phase checklists start with. */
export function ChecklistTemplatesView({
  templates,
  phases,
  canManage,
}: {
  templates: Template[];
  phases: Array<{ id: string; label: string }>;
  canManage: boolean;
}) {
  const { run, pendingKey, error } = useCommand();
  const groups: Array<{ key: string | null; label: string; description: string }> = [
    { key: null, label: "General", description: "Added to every project's general checklist." },
    ...phases.map((p) => ({ key: p.id, label: p.label, description: `Must be ticked before ${p.label} can be approved.` })),
  ];

  return (
    <div className="grid gap-4">
      {error ? <InlineError>{error}</InlineError> : null}
      <div className="grid grid-cols-2 gap-4 max-[1100px]:grid-cols-1">
        {groups.map((group) => (
          <TemplateGroup key={group.key ?? "general"} group={group} templates={templates.filter((t) => t.definitionId === group.key)} canManage={canManage} run={run} pendingKey={pendingKey} />
        ))}
      </div>
      <Text size="sm" tone="tertiary">Changes apply to new projects. Use “Apply checklist templates” on a project to add new items to it; renamed items are not rewritten in existing projects.</Text>
    </div>
  );
}

/** Phase templates: which phases a new project gets. */
export function PhaseTemplatesView({ phaseTemplates, canManage }: { phaseTemplates: PhaseTemplateDraft[]; canManage: boolean }) {
  const { run, pendingKey, error } = useCommand();
  return (
    <div className="grid gap-4">
      {error ? <InlineError>{error}</InlineError> : null}
      <PhaseTemplatesSection phaseTemplates={phaseTemplates} canManage={canManage} run={run} pendingKey={pendingKey} />
      <Text size="sm" tone="tertiary">Changes apply to new projects; existing project phases keep their names.</Text>
    </div>
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
    <SectionCard title="Templates" count={phaseTemplates.length} padded={false}>
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
                  <span className="w-5 shrink-0 text-right font-ui-mono text-micro text-ink-tertiary">{index + 1}</span>
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
  group: { key: string | null; label: string; description: string };
  templates: Template[];
  canManage: boolean;
  run: ReturnType<typeof useCommand>["run"];
  pendingKey: string | null;
}) {
  const [draft, setDraft] = useState("");
  const [draftOptional, setDraftOptional] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const addKey = `add-${group.key ?? "general"}`;

  const move = (index: number, delta: number) => {
    const ids = templates.map((t) => t.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(ids[target], () => reorderTemplatesAction({ definitionId: group.key, orderedIds: ids }));
  };

  return (
    <SectionCard title={group.label} hint={group.description} count={templates.filter((t) => t.isActive).length} padded>
      {templates.length === 0 ? <Text size="sm" tone="tertiary">No items.</Text> : (
        <ol className="m-0 grid list-none gap-px p-0">
          {templates.map((template, index) => (
            <li key={template.id} className="flex items-center gap-2 rounded-control px-1.5 py-1.5 hover:bg-surface-muted">
              <span className="w-5 shrink-0 text-right font-ui-mono text-micro text-ink-tertiary">{index + 1}</span>
              {editing === template.id ? (
                <form className="flex flex-1 gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run(template.id, () => updateTemplateAction({ templateId: template.id, label: editText }))) setEditing(null); }}>
                  <Input aria-label="Checklist item" density="compact" autoFocus value={editText} maxLength={200} onChange={(e) => setEditText(e.target.value)} />
                  <Button type="submit" size="sm" disabled={!editText.trim()}>Save</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </form>
              ) : (
                <span className={`min-w-0 flex-1 ${template.isActive ? "" : "text-ink-tertiary line-through"}`}>{template.label}</span>
              )}
              {!template.isBlocking ? <Badge title="Warning only — does not block approval">Optional</Badge> : null}
              {!template.isActive ? <Badge>Inactive</Badge> : null}
              {template.usedBy > 0 ? <Text size="sm" tone="tertiary" title="Project rows generated from this item">{template.usedBy} project row(s)</Text> : null}
              {canManage && editing !== template.id ? (
                <RowActionMenu pending={pendingKey === template.id} items={[
                  { label: "Rename", onSelect: () => { setEditing(template.id); setEditText(template.label); } },
                  { label: template.isBlocking ? "Make optional (won't block approval)" : "Make it block approval", onSelect: () => run(template.id, () => updateTemplateAction({ templateId: template.id, isBlocking: !template.isBlocking })) },
                  { label: template.isActive ? "Deactivate" : "Activate", separatorBefore: true, onSelect: () => run(template.id, () => updateTemplateAction({ templateId: template.id, isActive: !template.isActive })) },
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
        <form
          className="mt-2 flex flex-col gap-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(addKey, () => createTemplateAction({ definitionId: group.key, label: draft, isBlocking: !draftOptional }))) {
              setDraft("");
              setDraftOptional(false);
            }
          }}
        >
          <div className="flex gap-2">
            <Input aria-label={`New ${group.label} checklist item`} density="compact" className="flex-1" placeholder="Add checklist item…" value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} />
            <Button type="submit" size="sm" pending={pendingKey === addKey} disabled={!draft.trim()}>Add</Button>
          </div>
          <Checkbox
            className="text-xs text-ink-secondary"
            checked={draftOptional}
            onCheckedChange={(value) => setDraftOptional(value === true)}
            label="Optional (warning only, won't block approval)"
          />
        </form>
      ) : null}
    </SectionCard>
  );
}
