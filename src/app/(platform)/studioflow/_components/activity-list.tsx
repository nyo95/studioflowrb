"use client";

import { MessageSquareText } from "lucide-react";
import { useState } from "react";

import { Badge, Button, Checkbox, EmptyState, InlineError, Input, RowActionMenu, Select, Text } from "@/platform/ui_engine";

import { activityAction, addActivityAction } from "../actions";
import { DueLabel } from "./due-label";
import { ItemEditDialog } from "./item-edit-dialog";
import { PersonChip, type Person } from "./people";
import { useCommand } from "./use-command";

export type ActivityView = {
  id: string;
  content: string;
  mode: "TODO" | "FEEDBACK";
  done: boolean;
  assigneeId: string | null;
  dueDate: string | null;
  deferredFrom: string | null;
};

/**
 * Revision work (to-dos and client feedback) or project-level to-dos.
 * `phaseId = null` means general project to-dos (TODO only).
 */
export function ActivityList({
  projectId,
  phaseId,
  items,
  people,
  canEdit,
  allowFeedback,
  allowDefer,
  emptyText,
}: {
  projectId: string;
  phaseId: string | null;
  items: readonly ActivityView[];
  people: readonly Person[];
  canEdit: boolean;
  allowFeedback: boolean;
  allowDefer: boolean;
  emptyText: string;
}) {
  const { run, pendingKey, error } = useCommand();
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"TODO" | "FEEDBACK">("TODO");
  const [editing, setEditing] = useState<ActivityView | null>(null);
  const personById = new Map(people.map((p) => [p.id, p]));

  const add = async () => {
    const content = draft.trim();
    if (!content) return;
    const ok = await run("add", () => addActivityAction({ projectId, phaseId, content, mode }));
    if (ok) setDraft("");
  };

  return (
    <div className="grid gap-2">
      {items.length === 0 ? <EmptyState title={emptyText} className="py-6" /> : (
        <ul className="m-0 grid list-none gap-px p-0">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2.5 rounded-control px-1.5 py-1.5 hover:bg-surface-muted">
              {item.mode === "FEEDBACK" ? (
                <MessageSquareText aria-label="Client or reviewer feedback" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              ) : null}
              <Checkbox
                checked={item.done}
                disabled={!canEdit || pendingKey === item.id}
                onCheckedChange={(checked) => run(item.id, () => activityAction({ op: "done", projectId, activityId: item.id, done: checked === true }))}
                label={<span className={item.done ? "text-ink-tertiary line-through" : ""}>{item.content}</span>}
                className="min-w-0 flex-1"
              />
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {item.mode === "FEEDBACK" ? <Badge tone="warning">Feedback</Badge> : null}
                {item.deferredFrom ? <Badge>Deferred from {item.deferredFrom}</Badge> : null}
                <DueLabel date={item.dueDate} done={item.done} />
                <PersonChip person={item.assigneeId ? personById.get(item.assigneeId) ?? { id: item.assigneeId, displayName: "Former member", active: false } : null} />
                {canEdit ? (
                  <RowActionMenu
                    pending={pendingKey === item.id}
                    items={[
                      { label: "Edit", onSelect: () => setEditing(item) },
                      ...(allowDefer && item.mode === "TODO" && !item.deferredFrom && !item.done
                        ? [{ label: "Defer to later revision", onSelect: () => run(item.id, () => activityAction({ op: "defer", projectId, activityId: item.id })) }]
                        : []),
                      { label: "Delete", danger: true, separatorBefore: true, onSelect: () => run(item.id, () => activityAction({ op: "delete", projectId, activityId: item.id })) },
                    ]}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void add(); }}>
          {allowFeedback ? (
            <div className="w-32 shrink-0">
              <Select aria-label="Item type" density="compact" value={mode} onChange={(e) => setMode(e.target.value as "TODO" | "FEEDBACK")}>
                <option value="TODO">To-do</option>
                <option value="FEEDBACK">Feedback</option>
              </Select>
            </div>
          ) : null}
          <Input aria-label={mode === "FEEDBACK" ? "New feedback" : "New to-do"} density="compact" className="min-w-48 flex-1" placeholder={mode === "FEEDBACK" ? "Record a feedback point…" : "Add a to-do…"} value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} />
          <Button type="submit" size="sm" pending={pendingKey === "add"} disabled={!draft.trim()}>Add</Button>
        </form>
      ) : null}
      {error ? <InlineError>{error}</InlineError> : null}
      {!canEdit && items.length > 0 ? <Text size="sm" tone="tertiary">Read-only</Text> : null}
      {editing ? (
        <ItemEditDialog
          key={editing.id}
          open
          onOpenChange={(open) => { if (!open) setEditing(null); }}
          title={editing.mode === "FEEDBACK" ? "Edit feedback" : "Edit to-do"}
          initial={{ label: editing.content, dueDate: editing.dueDate, assigneeId: editing.assigneeId }}
          people={people}
          showPriority={false}
          pending={pendingKey === "edit"}
          error={error}
          onSave={async (values) => {
            const ok = await run("edit", () => activityAction({ op: "update", projectId, activityId: editing.id, content: values.label, dueDate: values.dueDate ?? "", assignedToId: values.assigneeId }));
            if (ok) setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
