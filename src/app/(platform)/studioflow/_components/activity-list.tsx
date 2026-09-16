"use client";

import { MessageSquareText } from "lucide-react";
import { useState } from "react";

import { Badge, Button, Checkbox, EmptyState, InlineError, Input, RowActionMenu, Text } from "@/platform/ui_engine";

import { activityAction, addActivityAction } from "../actions";
import { DueLabel } from "./due-label";
import { ItemEditDialog } from "./item-edit-dialog";
import { PersonChip, type Person } from "./people";
import { useCommand } from "./use-command";

// V2-D1: SfActivity is FEEDBACK-only. Todos live in SfChecklistItem.
export type ActivityView = {
  id: string;
  content: string;
  mode: "FEEDBACK";
  done: boolean;
  assigneeId: string | null;
  dueDate: string | null;
  deferredFrom: string | null;
};

/**
 * Client / reviewer feedback on a revision. Mode is always FEEDBACK.
 * Pass allowDefer=true for the active-revision list (not for the deferred sub-list itself).
 */
export function ActivityList({
  projectId,
  phaseId,
  items,
  people,
  canEdit,
  allowDefer,
  emptyText,
}: {
  projectId: string;
  phaseId: string;
  items: readonly ActivityView[];
  people: readonly Person[];
  canEdit: boolean;
  allowDefer: boolean;
  emptyText: string;
}) {
  const { run, pendingKey, error } = useCommand();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<ActivityView | null>(null);
  const personById = new Map(people.map((p) => [p.id, p]));

  const add = async () => {
    const content = draft.trim();
    if (!content) return;
    // phaseId is always required for FEEDBACK (V2-D1)
    const ok = await run("add", () => addActivityAction({ projectId, phaseId, content, mode: "FEEDBACK" }));
    if (ok) setDraft("");
  };

  return (
    <div className="grid gap-2">
      {items.length === 0 ? <EmptyState title={emptyText} className="py-6" /> : (
        <ul className="m-0 grid list-none gap-px p-0">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2.5 rounded-control px-1.5 py-1.5 hover:bg-surface-muted">
              <MessageSquareText aria-label="Client or reviewer feedback" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <Checkbox
                checked={item.done}
                disabled={!canEdit || pendingKey === item.id}
                onCheckedChange={(checked) => run(item.id, () => activityAction({ op: "done", projectId, activityId: item.id, done: checked === true }))}
                label={<span className={item.done ? "text-ink-tertiary line-through" : ""}>{item.content}</span>}
                className="min-w-0 flex-1"
              />
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <Badge tone="warning">Feedback</Badge>
                {item.deferredFrom ? <Badge>Deferred from {item.deferredFrom}</Badge> : null}
                <DueLabel date={item.dueDate} done={item.done} />
                <PersonChip person={item.assigneeId ? personById.get(item.assigneeId) ?? { id: item.assigneeId, displayName: "Former member", active: false } : null} />
                {canEdit ? (
                  <RowActionMenu
                    pending={pendingKey === item.id}
                    items={[
                      { label: "Edit", onSelect: () => setEditing(item) },
                      ...(allowDefer && !item.deferredFrom && !item.done
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
          <Input aria-label="New feedback" density="compact" className="min-w-48 flex-1" placeholder="Record a feedback point…" value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} />
          <Button type="submit" size="sm" pending={pendingKey === "add"} disabled={!draft.trim()}>Add feedback</Button>
        </form>
      ) : null}
      {error ? <InlineError>{error}</InlineError> : null}
      {!canEdit && items.length > 0 ? <Text size="sm" tone="tertiary">Read-only</Text> : null}
      {editing ? (
        <ItemEditDialog
          key={editing.id}
          open
          onOpenChange={(open) => { if (!open) setEditing(null); }}
          title="Edit feedback"
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
