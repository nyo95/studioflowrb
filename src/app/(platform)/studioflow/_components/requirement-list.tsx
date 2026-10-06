"use client";

import { useState } from "react";

import { Button, Checkbox, InlineError, Input, RowActionMenu, type RowActionItem } from "@/platform/ui_engine";

import { phaseCommandAction, requirementAction } from "../actions";
import { useCommand } from "./use-command";

export type RequirementNode = { id: string; label: string; isChecked: boolean; children: Array<{ id: string; label: string; isChecked: boolean }> };

export function RequirementList({ projectId, phaseId, nodes, canTick, canEdit, emptyText }: { projectId: string; phaseId: string | null; nodes: readonly RequirementNode[]; canTick: boolean; canEdit: boolean; emptyText: string }) {
  const { run, isPending, error } = useCommand();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  if (nodes.length === 0) return <p className="m-0 text-sm text-ink-tertiary">{emptyText}</p>;
  const check = (id: string, checked: boolean) => run(id, () => requirementAction({ op: "check", projectId, itemId: id, checked }));
  const row = (item: { id: string; label: string; isChecked: boolean }, depth: number) => {
    const actions: RowActionItem[] = [
      { label: "Rename", onSelect: () => { setRenaming(item.id); setAddingTo(null); setDraft(item.label); } },
      ...(depth === 0 ? [{ label: "Add subtask", onSelect: () => { setAddingTo(item.id); setRenaming(null); setDraft(""); } }] : []),
    ];
    return (
      <div className={`flex items-start gap-2.5 rounded-control px-1.5 py-1.5 hover:bg-surface-muted ${depth > 0 ? "ml-7" : ""}`}>
        {renaming === item.id ? (
          <form className="flex min-w-0 flex-1 gap-2" onSubmit={async (event) => { event.preventDefault(); if (await run(`rename-${item.id}`, () => requirementAction({ op: "rename", projectId, itemId: item.id, label: draft }))) setRenaming(null); }}>
            <Input aria-label="Requirement name" density="compact" autoFocus value={draft} maxLength={200} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setRenaming(null); }} />
            <Button type="submit" size="sm" pending={isPending(`rename-${item.id}`)} disabled={!draft.trim()}>Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
          </form>
        ) : (
          <>
            <Checkbox checked={item.isChecked} disabled={!canTick || isPending(item.id)} onCheckedChange={(checked) => check(item.id, checked === true)} label={<span className={item.isChecked ? "text-ink-tertiary line-through" : depth === 0 ? "font-medium" : ""}>{item.label}</span>} className="min-w-0 flex-1" />
            <div className="flex shrink-0 items-center gap-2">
              {canTick && phaseId && depth === 0 && !item.isChecked ? <Button size="sm" variant="ghost" title="Remove this reminder without ticking it" pending={isPending(`dismiss-${item.id}`)} onClick={() => run(`dismiss-${item.id}`, () => phaseCommandAction({ command: "dismissRequirement", projectId, phaseId, itemId: item.id }))}>Dismiss</Button> : null}
              {canEdit ? <RowActionMenu items={actions} pending={isPending(`rename-${item.id}`)} /> : null}
            </div>
          </>
        )}
      </div>
    );
  };
  return (
    <div className="grid gap-1">
      <ul className="m-0 grid list-none gap-px p-0">
        {nodes.map((node) => <li key={node.id} className="grid gap-1">
          {row(node, 0)}
          {node.children.length > 0 ? <ul className="m-0 grid list-none gap-px p-0">{node.children.map((child) => <li key={child.id}>{row(child, 1)}</li>)}</ul> : null}
          {addingTo === node.id ? <form className="ml-7 flex gap-2" onSubmit={async (event) => { event.preventDefault(); if (await run(`sub-${node.id}`, () => requirementAction({ op: "subtask", projectId, itemId: node.id, label: draft }))) setDraft(""); }}>
            <Input aria-label="New subtask" density="compact" autoFocus placeholder="Add a subtask…" value={draft} maxLength={200} onChange={(event) => setDraft(event.target.value)} />
            <Button type="submit" size="sm" pending={isPending(`sub-${node.id}`)} disabled={!draft.trim()}>Add</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAddingTo(null)}>Done</Button>
          </form> : null}
        </li>)}
      </ul>
      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}
