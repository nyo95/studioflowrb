"use client";

import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { FormattedInstant, Text } from "@/platform/ui_engine";

type Event = {
  id: string;
  action: string;
  actorLabel: string;
  occurredAt: Date;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  metadata: Record<string, unknown> | null;
};

const PHRASES: Record<string, string> = {
  "studioflow.project.created": "created the project",
  "studioflow.project.updated": "edited project details",
  "studioflow.project.priority-changed": "changed priority",
  "studioflow.project.status-changed": "changed project status",
  "studioflow.project.archived": "archived the project",
  "studioflow.project.restored": "restored the project",
  "studioflow.phase.activated": "started a phase",
  "studioflow.phase.bypassed": "skipped a phase",
  "studioflow.phase.submitted-internal": "sent a phase for internal review",
  "studioflow.phase.approved-internal": "approved a phase internally",
  "studioflow.phase.rejected-internal": "sent a phase back for changes",
  "studioflow.phase.submitted-client": "sent a phase to the client",
  "studioflow.phase.approved-client": "recorded client approval",
  "studioflow.phase.rejected-client": "recorded client changes",
  "studioflow.phase.reopened": "reopened a phase",
  "studioflow.phase.supervision-completed": "finished supervision",
  "studioflow.phase.revision-overridden": "reset phase revisions",
  "studioflow.activity.created": "added an item",
  "studioflow.activity.updated": "edited an item",
  "studioflow.activity.completed": "completed an item",
  "studioflow.activity.reopened": "reopened an item",
  "studioflow.activity.deleted": "deleted an item",
  "studioflow.activity.deferred": "deferred an item",
  "studioflow.checklist.checked": "ticked a checklist item",
  "studioflow.checklist.unchecked": "unticked a checklist item",
  "studioflow.checklist.subtask-created": "added a subtask",
  "studioflow.checklist.updated": "edited a checklist item",
  "studioflow.checklist.deleted": "deleted a checklist item",
  "studioflow.checklist.detached": "detached an item from its template",
  "studioflow.checklist.reordered": "reordered the checklist",
  "studioflow.checklist.label-attached": "labelled a checklist item",
  "studioflow.checklist.label-detached": "removed a label",
  "studioflow.checklist.synced": "applied checklist templates",
  "studioflow.mom.created": "created a MOM",
  "studioflow.mom.updated": "edited a MOM header",
  "studioflow.mom.deleted": "deleted a MOM",
  "studioflow.mom.section-deleted": "removed a MOM section",
  "studioflow.mom.image-added": "added a MOM photo",
  "studioflow.mom.image-replaced": "replaced a MOM photo",
  "studioflow.mom.image-removed": "removed a MOM photo",
  "studioflow.schedule.entry-created": "added a schedule item",
  "studioflow.schedule.entry-updated": "edited a schedule item",
  "studioflow.schedule.entry-deleted": "deleted a schedule item",
  "studioflow.schedule.entry-moved": "moved a schedule item to another category",
  "studioflow.schedule.entries-reordered": "reordered schedule items",
  "studioflow.schedule.option-created": "added a schedule option",
  "studioflow.schedule.option-updated": "edited a schedule option",
  "studioflow.schedule.option-finalized": "set a final schedule option",
  "studioflow.schedule.option-deleted": "deleted a schedule option",
  "studioflow.schedule.option-reused": "copied a product from a past project",
  "studioflow.schedule.templates-applied": "applied schedule templates",
  "studioflow.schedule.csv-imported": "imported the schedule CSV",
};

const PHASE_NAMES: Record<string, string> = { MOODBOARD: "Moodboard", LAYOUT: "Layout Plan", DESIGN_3D: "3D Design", CD: "Construction Drawing", SUPERVISION: "Supervision" };

function detail(event: Event): string | null {
  const meta = event.metadata ?? {};
  const parts: string[] = [];
  if (typeof meta.phaseKey === "string") parts.push(PHASE_NAMES[meta.phaseKey] ?? meta.phaseKey);
  if (typeof meta.revision === "string") parts.push(meta.revision);
  if (typeof meta.reason === "string" && meta.reason) parts.push(`“${meta.reason}”`);
  if (typeof meta.note === "string" && meta.note) parts.push(`“${meta.note}”`);
  if (typeof meta.label === "string") parts.push(meta.label);
  if (typeof meta.topic === "string") parts.push(meta.topic);
  if (typeof meta.code === "string") parts.push(meta.code);
  if (typeof meta.label === "undefined" && typeof meta.created === "number") parts.push(`${meta.created} added${typeof meta.updated === "number" ? `, ${meta.updated} updated` : ""}`);
  const snapshot = meta.snapshot as { topic?: unknown } | undefined;
  if (snapshot && typeof snapshot.topic === "string") parts.push(snapshot.topic);
  if (typeof meta.content === "string") parts.push(meta.content);
  for (const [key, change] of Object.entries(event.changes ?? {})) {
    if (key === "status" || key === "priority") parts.push(`${String(change.from)} → ${String(change.to)}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function HistoryList({ events }: { events: Event[] }) {
  const { locale, timezone } = useDisplaySettings();
  return (
    <ol className="m-0 grid list-none gap-0 p-0">
      {events.map((event) => (
        <li key={event.id} className="grid grid-cols-[minmax(140px,180px)_minmax(0,1fr)] gap-3 border-b border-line-subtle py-2 last:border-b-0 max-[560px]:grid-cols-1">
          <Text size="sm" tone="tertiary"><FormattedInstant value={event.occurredAt} locale={locale} timeZone={timezone} style="datetime" /></Text>
          <div className="min-w-0">
            <Text size="sm"><strong>{event.actorLabel}</strong> {PHRASES[event.action] ?? event.action}</Text>
            {detail(event) ? <Text as="p" size="sm" tone="secondary" className="truncate">{detail(event)}</Text> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
