"use client";

import { MessageSquareText } from "lucide-react";

import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { Badge, FormattedInstant, SectionCard, Text } from "@/platform/ui_engine";

type Revision = {
  id: string;
  label: string;
  createdAt: Date;
  closedAt: Date | null;
  activities: Array<{ id: string; content: string; mode: "TODO" | "FEEDBACK"; done: boolean }>;
};

export function RevisionHistory({ revisions }: { revisions: Revision[] }) {
  const { locale, timezone } = useDisplaySettings();
  return (
    <SectionCard title="Revision history" count={revisions.length}>
      <div className="grid gap-2">
        {revisions.map((revision) => (
          <details key={revision.id} className="rounded-control border border-line px-3 py-2">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2">
              <Badge>{revision.label}</Badge>
              <Text size="sm" tone="secondary">
                Opened <FormattedInstant value={revision.createdAt} locale={locale} timeZone={timezone} />
                {revision.closedAt ? <> · closed <FormattedInstant value={revision.closedAt} locale={locale} timeZone={timezone} /></> : null}
              </Text>
              <Text size="sm" tone="tertiary">{revision.activities.length} item(s)</Text>
            </summary>
            <ul className="mt-2 grid list-none gap-1 p-0">
              {revision.activities.length === 0 ? <Text size="sm" tone="tertiary">No items.</Text> : revision.activities.map((activity) => (
                <li key={activity.id} className="flex items-start gap-2 text-sm">
                  {activity.mode === "FEEDBACK" ? <MessageSquareText aria-label="Feedback" className="mt-0.5 h-3.5 w-3.5 text-warning" /> : <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 rounded-pill bg-line-strong" />}
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
