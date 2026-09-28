"use client";

import { MessageSquareText } from "lucide-react";
import { useRef, useState } from "react";

import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { Badge, FormattedInstant, SectionCard, Text } from "@/platform/ui_engine";
import { getRevisionActivitiesAction } from "../../../../actions";

type Revision = {
  id: string;
  label: string;
  createdAt: Date;
  closedAt: Date | null;
  // V2-D1: SfActivity is FEEDBACK-only; todos live in SfChecklistItem
  activityCount: number;
};

type Activities = Array<{ id: string; content: string; mode: "FEEDBACK"; done: boolean }>;
type LoadState = { activities?: Activities; error?: string };

export function RevisionHistory({ revisions }: { revisions: Revision[] }) {
  const { locale, timezone } = useDisplaySettings();
  const [loaded, setLoaded] = useState<Record<string, LoadState>>({});
  const pending = useRef(new Set<string>());

  async function load(revisionId: string) {
    if (pending.current.has(revisionId) || loaded[revisionId]?.activities) return;
    pending.current.add(revisionId);
    setLoaded((current) => ({ ...current, [revisionId]: {} }));
    try {
      const result = await getRevisionActivitiesAction(revisionId);
      setLoaded((current) => ({ ...current, [revisionId]: result.ok ? { activities: result.data } : { error: result.error.safeMessage } }));
    } catch {
      setLoaded((current) => ({ ...current, [revisionId]: { error: "Could not load revision items. Close and reopen to try again." } }));
    } finally {
      pending.current.delete(revisionId);
    }
  }
  return (
    <SectionCard title="Revision history" count={revisions.length}>
      <div className="grid gap-2">
        {revisions.map((revision) => (
          <details key={revision.id} className="rounded-control border border-line px-3 py-2" onToggle={(event) => { if (event.currentTarget.open) void load(revision.id); }}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2">
              <Badge>{revision.label}</Badge>
              <Text size="sm" tone="secondary">
                Opened <FormattedInstant value={revision.createdAt} locale={locale} timeZone={timezone} />
                {revision.closedAt ? <> · closed <FormattedInstant value={revision.closedAt} locale={locale} timeZone={timezone} /></> : null}
              </Text>
              <Text size="sm" tone="tertiary">{revision.activityCount} item(s)</Text>
            </summary>
            <ul className="mt-2 grid list-none gap-1 p-0">
              {!loaded[revision.id]?.activities && !loaded[revision.id]?.error ? <Text size="sm" tone="tertiary">Loading…</Text> : null}
              {loaded[revision.id]?.error ? <Text size="sm" tone="tertiary">{loaded[revision.id].error}</Text> : null}
              {loaded[revision.id]?.activities?.length === 0 ? <Text size="sm" tone="tertiary">No items.</Text> : loaded[revision.id]?.activities?.map((activity) => (
                <li key={activity.id} className="flex items-start gap-2 text-sm">
                  <MessageSquareText aria-label="Feedback" className="mt-0.5 h-3.5 w-3.5 text-warning" />
                  <span className={activity.done ? "text-ink-tertiary line-through" : ""}>{activity.content}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </SectionCard>
  );
}
