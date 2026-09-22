"use client";

import { Link2, Plus } from "lucide-react";
import { useState } from "react";

import { Badge, Button, Checkbox, EmptyState, InlineError, Input, RowActionMenu, type RowActionItem } from "@/platform/ui_engine";

import { addChecklistItemAction, checklistAction } from "../actions";
import { DueLabel } from "./due-label";
import { ItemEditDialog } from "./item-edit-dialog";
import { PersonChip, type Person } from "./people";
import { useCommand } from "./use-command";

export type ChecklistNode = {
  id: string;
  parentId: string | null;
  label: string;
  isChecked: boolean;
  /** False = warning-only (the merged requirement); it never gates approval. */
  isBlocking: boolean;
  priority: number;
  dueDate: string | null;
  assigneeId: string | null;
  templateId: string | null;
  labels: Array<{ id: string; name: string; color: string }>;
  children?: ChecklistNode[];
};

const PRIORITY_TONE: Record<number, "danger" | "warning" | "neutral"> = { 1: "danger", 2: "warning", 3: "neutral" };

/**
 * Template-driven checklist (legacy rule): root items come from Studio
 * settings; people break them down with one level of subtasks.
 */
export function ChecklistTree({
  projectId,
  phaseId,
  nodes,
  people,
  canEdit,
  emptyText,
}: {
  projectId: string;
  /** Null = the project-wide list (General to-dos). */
  phaseId: string | null;
  nodes: readonly ChecklistNode[];
  people: readonly Person[];
  canEdit: boolean;
  emptyText: string;
}) {
  const { run, pendingKey, error } = useCommand();
  const [editing, setEditing] = useState<ChecklistNode | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [labelFor, setLabelFor] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [addingRoot, setAddingRoot] = useState(false);
  const [rootDraft, setRootDraft] = useState("");
  const [rootOptional, setRootOptional] = useState(false);
  const personById = new Map(people.map((p) => [p.id, p]));

  const addRoot = async () => {
    const label = rootDraft.trim();
    if (!label) { setAddingRoot(false); return; }
    const ok = await run("add-root", () => addChecklistItemAction({ projectId, phaseId, label, isBlocking: !rootOptional }));
    if (ok) { setRootDraft(""); setRootOptional(false); }
  };

  const move = (siblings: readonly ChecklistNode[], index: number, delta: number) => {
    const ids = siblings.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(ids[target], () => checklistAction({ op: "reorder", projectId, itemId: ids[0], orderedIds: ids }));
  };

  const renderRow = (node: ChecklistNode, siblings: readonly ChecklistNode[], index: number, depth: number) => {
    const actions: RowActionItem[] = [
      { label: "Edit", onSelect: () => setEditing(node) },
      ...(depth === 0 ? [{ label: "Add subtask", onSelect: () => { setAddingTo(node.id); setDraft(""); } }] : []),
      { label: "Add label", onSelect: () => { setLabelFor(node.id); setLabelDraft(""); } },
      // Only a root item can gate approval; a subtask never blocks, so the choice is meaningless there.
      ...(depth === 0
        ? [{
            label: node.isBlocking ? "Make optional (won’t block approval)" : "Make it block approval",
            onSelect: () => run(node.id, () => checklistAction({ op: "update", projectId, itemId: node.id, isBlocking: !node.isBlocking })),
          }]
        : []),
      ...node.labels.map((label) => ({ label: `Remove label “${label.name}”`, onSelect: () => run(node.id, () => checklistAction({ op: "unlabel", projectId, itemId: node.id, labelId: label.id })) })),
      { label: "Move up", disabled: index === 0, separatorBefore: true, onSelect: () => move(siblings, index, -1) },
      { label: "Move down", disabled: index === siblings.length - 1, onSelect: () => move(siblings, index, 1) },
      node.templateId
        ? { label: "Detach from template", separatorBefore: true, onSelect: () => run(node.id, () => checklistAction({ op: "detach", projectId, itemId: node.id })) }
        : { label: "Delete", danger: true, separatorBefore: true, onSelect: () => run(node.id, () => checklistAction({ op: "delete", projectId, itemId: node.id })) },
    ];
    return (
      <li key={node.id} className="grid gap-1">
        <div className={`flex items-start gap-2.5 rounded-control px-1.5 py-1.5 hover:bg-surface-muted ${depth > 0 ? "ml-7" : ""}`}>
          <Checkbox
            checked={node.isChecked}
            disabled={!canEdit || pendingKey === node.id}
            onCheckedChange={(checked) => run(node.id, () => checklistAction({ op: "check", projectId, itemId: node.id, checked: checked === true }))}
            label={<span className={node.isChecked ? "text-ink-tertiary line-through" : depth === 0 ? "font-medium" : ""}>{node.label}</span>}
            className="min-w-0 flex-1"
          />
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {node.templateId ? <Link2 aria-label="From a Studio template" className="h-3.5 w-3.5 text-ink-tertiary" /> : null}
            {/* Blocking is the default, so only the exception is badged. */}
            {!node.isBlocking && depth === 0 ? <Badge title="Warning only — does not block approval">Optional</Badge> : null}
            {node.priority < 4 ? <Badge tone={PRIORITY_TONE[node.priority] ?? "neutral"}>P{node.priority}</Badge> : null}
            {node.labels.map((label) => <Badge key={label.id} tone={(label.color as "neutral") ?? "neutral"}>#{label.name}</Badge>)}
            <DueLabel date={node.dueDate} done={node.isChecked} />
            <PersonChip person={node.assigneeId ? personById.get(node.assigneeId) ?? { id: node.assigneeId, displayName: "Former member", active: false } : null} />
            {canEdit ? <RowActionMenu items={actions} pending={pendingKey === node.id} /> : null}
          </div>
        </div>
        {labelFor === node.id ? (
          <form className="ml-7 flex gap-2" onSubmit={async (event) => {
            event.preventDefault();
            if (await run(node.id, () => checklistAction({ op: "label", projectId, itemId: node.id, name: labelDraft }))) setLabelFor(null);
          }}>
            <Input aria-label="Label name" density="compact" autoFocus placeholder="Label, e.g. waiting-vendor" value={labelDraft} maxLength={40} onChange={(e) => setLabelDraft(e.target.value)} />
            <Button type="submit" size="sm" disabled={!labelDraft.trim()}>Add label</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setLabelFor(null)}>Cancel</Button>
          </form>
        ) : null}
        {node.children && node.children.length > 0 ? (
          <ul className="m-0 grid list-none gap-px p-0">{node.children.map((child, i) => renderRow(child, node.children!, i, depth + 1))}</ul>
        ) : null}
        {addingTo === node.id ? (
          <form className="ml-7 flex gap-2" onSubmit={async (event) => {
            event.preventDefault();
            if (await run(`sub-${node.id}`, () => checklistAction({ op: "subtask", projectId, itemId: node.id, label: draft }))) { setDraft(""); }
          }}>
            <Input aria-label="New subtask" density="compact" autoFocus placeholder="Add a subtask…" value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} />
            <Button type="submit" size="sm" pending={pendingKey === `sub-${node.id}`} disabled={!draft.trim()}>Add</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAddingTo(null)}>Done</Button>
          </form>
        ) : null}
      </li>
    );
  };

  return (
    <div className="grid gap-2">
      {nodes.length === 0 ? <EmptyState title={emptyText} description="Seeded from Studio Settings templates; you can add your own below." className="py-6" /> : (
        <ul className="m-0 grid list-none gap-px p-0">{nodes.map((node, i) => renderRow(node, nodes, i, 0))}</ul>
      )}
      {canEdit ? (
        addingRoot ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => { event.preventDefault(); void addRoot(); }}
          >
            <Input
              aria-label="New checklist item"
              density="compact"
              autoFocus
              className="min-w-[180px] flex-1"
              placeholder="What has to be done?"
              value={rootDraft}
              maxLength={200}
              onChange={(e) => setRootDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setRootDraft(""); setAddingRoot(false); } }}
            />
            <Checkbox
              checked={rootOptional}
              onCheckedChange={(checked) => setRootOptional(checked === true)}
              label={<span title="Warning only — does not block approval">Optional</span>}
              className="text-sm"
            />
            <Button type="submit" size="sm" pending={pendingKey === "add-root"} disabled={!rootDraft.trim()}>Add</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setRootDraft(""); setAddingRoot(false); }}>Done</Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddingRoot(true)}
            className="flex min-h-7 w-fit items-center gap-1.5 rounded-control px-1.5 text-sm text-ink-tertiary hover:bg-surface-muted hover:text-ink-secondary"
          >
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            Add item…
          </button>
        )
      ) : null}
      {error ? <InlineError>{error}</InlineError> : null}
      {editing ? (
        <ItemEditDialog
          key={editing.id}
          open
          onOpenChange={(open) => { if (!open) setEditing(null); }}
          title={editing.parentId ? "Edit subtask" : "Edit checklist item"}
          initial={{ label: editing.label, priority: editing.priority, dueDate: editing.dueDate, assigneeId: editing.assigneeId }}
          people={people}
          showPriority
          maxLength={200}
          pending={pendingKey === "edit"}
          error={error}
          onSave={async (values) => {
            const ok = await run("edit", () => checklistAction({ op: "update", projectId, itemId: editing.id, label: values.label, priority: values.priority, dueDate: values.dueDate ?? "", assignedToId: values.assigneeId }));
            if (ok) setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
