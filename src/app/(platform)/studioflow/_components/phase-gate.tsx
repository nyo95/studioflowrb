"use client";

import { useState } from "react";

import { Checkbox, Text } from "@/platform/ui_engine";

import { activityAction, checklistAction } from "../actions";

type BlockerItem = { id: string; text: string };

/**
 * Replaces the static "Blockers" Notice with an interactive list.
 * Checklist items can be ticked here; feedback items can be marked done.
 * Optimistically clears each item on action; page revalidates in the background.
 */
export function PhaseGate({
  projectId,
  checklistItems,
  activityItems,
  canWork,
}: {
  projectId: string;
  checklistItems: BlockerItem[];
  activityItems: BlockerItem[];
  canWork: boolean;
}) {
  const [dismissedActivity, setDismissedActivity] = useState(() => new Set<string>());
  const [dismissedChecklist, setDismissedChecklist] = useState(() => new Set<string>());
  const [pending, setPending] = useState<string | null>(null);

  const visibleActivities = activityItems.filter((a) => !dismissedActivity.has(a.id));
  const visibleChecklist = checklistItems.filter((c) => !dismissedChecklist.has(c.id));

  if (visibleActivities.length === 0 && visibleChecklist.length === 0) return null;

  async function resolveActivity(id: string) {
    setPending(id);
    setDismissedActivity((prev: Set<string>) => new Set([...prev, id]));
    await activityAction({ op: "done", projectId, activityId: id, done: true });
    setPending(null);
  }

  async function resolveChecklist(id: string) {
    setPending(id);
    setDismissedChecklist((prev: Set<string>) => new Set([...prev, id]));
    await checklistAction({ op: "check", projectId, itemId: id, checked: true });
    setPending(null);
  }

  return (
    <div className="mt-3 rounded-md border border-danger/40 bg-danger/5 px-3.5 py-3 text-sm">
      <Text size="sm" weight="medium" className="mb-2 text-danger">Blockers</Text>
      <div className="grid gap-1.5">
        {visibleChecklist.map((item) => (
          <div key={item.id}>
            <Checkbox
              label={<span className="line-clamp-2 text-ink">{item.text}</span>}
              checked={false}
              disabled={!canWork || pending === item.id}
              onCheckedChange={(_v) => { void resolveChecklist(item.id); }}
            />
          </div>
        ))}
        {visibleActivities.map((item) => (
          <div key={item.id}>
            <Checkbox
              label={<span className="line-clamp-2 text-ink">{item.text}</span>}
              checked={false}
              disabled={!canWork || pending === item.id}
              onCheckedChange={(_v) => { void resolveActivity(item.id); }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
