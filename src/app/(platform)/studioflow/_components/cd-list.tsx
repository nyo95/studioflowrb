"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Badge, Button, DraftDialog, EmptyState, Field, FormActions, InlineError, Input, RowActionMenu, Select, Text } from "@/platform/ui_engine";

import { createCdItemAction, deleteCdItemAction, setCdItemStatusAction, updateCdItemAction } from "../actions";
import { PersonChip, PersonSelect, type Person } from "./people";
import { useCommand } from "./use-command";

export type CdListItem = { id: string; drawingCode: string; drawingName: string; status: "PENDING" | "IN_PROGRESS" | "COMPLETED"; assigneeId: string | null; group: string };

const STATUS_LABEL = { PENDING: "Pending", IN_PROGRESS: "In progress", COMPLETED: "Done" } as const;
const STATUS_TONE = { PENDING: "neutral", IN_PROGRESS: "warning", COMPLETED: "success" } as const;

/** Drawings to produce in the Construction Drawing phase. Informational: it never gates approving the phase. */
export function CdList({ projectId, phaseId, items, people, canEdit }: { projectId: string; phaseId: string; items: CdListItem[]; people: readonly Person[]; canEdit: boolean }) {
  const { run, isPending, error } = useCommand();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<CdListItem | null>(null);
  const personById = new Map(people.map((person) => [person.id, person]));
  const done = items.filter((item) => item.status === "COMPLETED").length;

  // Items arrive sorted by drawing number; consecutive items share a group (hundreds).
  const groups: Array<{ group: string; rows: CdListItem[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.group === item.group) last.rows.push(item);
    else groups.push({ group: item.group, rows: [item] });
  }

  const add = async () => {
    const ok = await run("cd-add", () => createCdItemAction({ projectId, phaseId, drawingCode: code, drawingName: name }));
    if (ok) { setCode(""); setName(""); }
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <Text size="sm" tone="secondary">{items.length === 0 ? "No drawings listed yet" : `${done} of ${items.length} done`}</Text>
      </div>

      {canEdit ? (
        <form className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-2 max-[560px]:grid-cols-1" onSubmit={(event) => { event.preventDefault(); if (name.trim()) void add(); }}>
          <Input aria-label="Drawing number" value={code} onChange={(event) => setCode(event.target.value)} maxLength={40} placeholder="No. e.g. 101" />
          <Input aria-label="Drawing name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} placeholder="Drawing name, e.g. Floor plan" />
          <Button type="submit" variant="secondary" leadingIcon={<Plus aria-hidden="true" />} pending={isPending("cd-add")} disabled={!name.trim()}>Add</Button>
        </form>
      ) : null}

      {error ? <InlineError>{error}</InlineError> : null}

      {items.length === 0 ? (
        <EmptyState title="No drawings yet" description={canEdit ? "Add the drawings this phase needs, then tick them off as they are drawn." : "The drafter has not listed any drawings yet."} />
      ) : (
        <div className="grid gap-3">
          {groups.map(({ group, rows }) => (
            <div key={group} className="grid gap-1">
              <Text size="sm" weight="semibold" tone="secondary">{group === "-" ? "Other" : `${group} series`}</Text>
              <ul className="grid divide-y divide-line rounded-control border border-line">
                {rows.map((item) => {
                  const rowKey = `cd-${item.id}`;
                  return (
                    <li key={item.id} className="grid grid-cols-[5rem_minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-3 py-2 max-[720px]:grid-cols-[4rem_minmax(0,1fr)_auto]">
                      <span className="font-ui-mono text-sm tabular-nums text-ink-secondary">{item.drawingCode.replace(/^ID_/, "") || "-"}</span>
                      <span className={item.status === "COMPLETED" ? "truncate text-sm text-ink-tertiary line-through" : "truncate text-sm text-ink"}>{item.drawingName}</span>
                      <span className="max-[720px]:hidden"><PersonChip person={item.assigneeId ? personById.get(item.assigneeId) : null} /></span>
                      {canEdit ? (
                        <Select
                          aria-label={`Status of ${item.drawingName}`}
                          density="compact"
                          value={item.status}
                          disabled={isPending(rowKey)}
                          onChange={(event) => void run(rowKey, () => setCdItemStatusAction({ projectId, phaseId, itemId: item.id, status: event.target.value as CdListItem["status"] }))}
                        >
                          <option value="PENDING">Pending</option>
                          <option value="IN_PROGRESS">In progress</option>
                          <option value="COMPLETED">Done</option>
                        </Select>
                      ) : (
                        <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                      )}
                      {canEdit ? (
                        <RowActionMenu
                          label={`Actions for ${item.drawingName}`}
                          pending={isPending(rowKey)}
                          items={[
                            { label: "Edit", onSelect: () => setEditing(item) },
                            { label: "Delete", danger: true, separatorBefore: true, onSelect: () => void run(rowKey, () => deleteCdItemAction({ projectId, phaseId, itemId: item.id })) },
                          ]}
                        />
                      ) : <span />}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {editing ? <EditDrawingDialog key={editing.id} projectId={projectId} phaseId={phaseId} item={editing} people={people} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function EditDrawingDialog({ projectId, phaseId, item, people, onClose }: { projectId: string; phaseId: string; item: CdListItem; people: readonly Person[]; onClose: () => void }) {
  const { run, pending, error } = useCommand();
  const [form, setForm] = useState({ code: item.drawingCode.replace(/^ID_/, ""), name: item.drawingName, assignee: item.assigneeId ?? "" });
  return (
    <DraftDialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Edit drawing" size="sm" pending={pending} watchedValue={JSON.stringify(form)}>
      <form
        className="grid gap-3.5"
        onSubmit={async (event) => {
          event.preventDefault();
          const ok = await run("cd-edit", () => updateCdItemAction({ projectId, phaseId, itemId: item.id, drawingCode: form.code, drawingName: form.name, assignedToId: form.assignee || null }));
          if (ok) onClose();
        }}
      >
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
          <Field label="Number"><Input value={form.code} maxLength={40} onChange={(event) => setForm((f) => ({ ...f, code: event.target.value }))} /></Field>
          <Field label="Drawing name" required><Input autoFocus value={form.name} maxLength={200} onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))} /></Field>
        </div>
        <Field label="Assigned to"><PersonSelect people={people} value={form.assignee || null} onChange={(value) => setForm((f) => ({ ...f, assignee: value ?? "" }))} emptyLabel="Nobody yet" /></Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" data-dialog-cancel disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending} disabled={!form.name.trim()}>Save</Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}
