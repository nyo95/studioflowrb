"use client";

import { useState } from "react";

import { Badge, Button, FormattedInstant, FormattedText, PillTabs, RichTextEditor, RowActionMenu, SectionCard, Text } from "@/platform/ui_engine";

import { IterationImageArea, IterationImageList, type IterationImage } from "../../_components/iteration-images";
import type { IterationView, usePhaseCommands } from "../../_components/phase-commands";

export type IterationRow = { id: string; name: string; shortName: string; state: IterationView["state"]; createdAt: Date; sentAt: Date | null; answeredAt: Date | null; doneAt: Date | null; visitDate: string | null; note: string | null; images: readonly IterationImage[] };

export const ITERATION_STATE_LABEL: Record<IterationView["state"], string> = { NOT_SENT: "In progress", SENT: "With client", ANSWERED: "Client answered", REVISED: "Revision asked", DONE: "Approved" };
export const ITERATION_STATE_TONE: Record<IterationView["state"], "neutral" | "warning" | "success"> = { NOT_SENT: "neutral", SENT: "warning", ANSWERED: "success", REVISED: "neutral", DONE: "success" };

const NOTE_MAX = 4000;

/**
 * The phase's working area for notes (owner, 2026-10-08): the pinned note on top (one per phase), then one tab per
 * iteration. The running iteration opens first and is edited in place; earlier iterations keep their dates, outcome,
 * client notes and photos, and stay editable. Nothing here is a second window.
 */
export function NotesWorkspace({ projectId, phaseId, commands, iterations, currentId, closedBySkipId, pinned, canPin, canEdit, locale, timezone, onRename }: {
  projectId: string;
  phaseId: string;
  commands: ReturnType<typeof usePhaseCommands>;
  iterations: IterationRow[];
  currentId: string | null;
  closedBySkipId: string | null;
  pinned: string | null;
  canPin: boolean;
  canEdit: boolean;
  locale: string;
  timezone: string;
  onRename: (iteration: IterationRow) => void;
}) {
  const ordered = [...iterations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const [pickedId, setPickedId] = useState<string | null>(null);
  const selected = ordered.find((item) => item.id === (pickedId ?? currentId)) ?? ordered[0] ?? null;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pinEditing, setPinEditing] = useState(false);
  const [pinDraft, setPinDraft] = useState(pinned ?? "");

  const draftOf = (row: IterationRow) => drafts[row.id] ?? row.note ?? "";
  const dirty = (row: IterationRow) => row.id in drafts && drafts[row.id] !== (row.note ?? "");
  const previous = selected && selected.id === currentId && selected.state === "NOT_SENT" ? ordered.find((item) => item.id !== selected.id && new Date(item.createdAt) < new Date(selected.createdAt)) ?? null : null;

  const save = async (row: IterationRow) => {
    const ok = await commands.exec("iteration-notes", { command: "setIterationNote", phaseId, iterationId: row.id, note: draftOf(row).trim() || null }, `${row.shortName}: notes saved`);
    if (ok) setDrafts(({ [row.id]: _saved, ...rest }) => rest);
  };
  const outcomeOf = (row: IterationRow) => row.visitDate ? `Visit ${row.visitDate}` : row.id === closedBySkipId ? "Closed by skip" : row.id === currentId ? ITERATION_STATE_LABEL[row.state] : row.state === "DONE" ? "Approved" : row.state === "REVISED" ? "Revision asked" : "Closed";

  // Notes of a sent iteration wait for the client's reply (as the old dialog did); every other state is editable.
  const editable = (row: IterationRow) => canEdit && row.state !== "SENT";

  return (
    <SectionCard title="Notes">
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2"><Text size="sm" weight="semibold">Pinned for this phase</Text>{canPin && !pinEditing ? <Button size="sm" variant="ghost" onClick={() => { setPinDraft(pinned ?? ""); setPinEditing(true); }}>Edit</Button> : null}</div>
          {pinEditing ? (
            <div className="grid gap-2">
              <RichTextEditor aria-label="Pinned note" maxLength={NOTE_MAX} value={pinDraft} onChange={setPinDraft} />
              <div className="flex gap-2">
                <Button size="sm" variant="primary" pending={commands.isPending("note")} onClick={async () => { if (await commands.exec("note", { command: "setPhaseNote", phaseId, note: pinDraft.trim() || null }, "Pinned note saved")) setPinEditing(false); }}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => { setPinDraft(pinned ?? ""); setPinEditing(false); }}>Discard</Button>
              </div>
            </div>
          ) : pinned ? <FormattedText text={pinned} className="text-sm text-ink-secondary" /> : <Text as="p" size="sm" tone="tertiary">Nothing pinned.</Text>}
        </div>

        {selected ? (
          <div className="grid gap-3 border-t border-line-subtle pt-3">
            <PillTabs
              label="Iterations"
              items={ordered.map((row) => ({ key: row.id, label: row.shortName, count: row.id === currentId ? "now" : dirty(row) ? "•" : undefined, active: row.id === selected.id, onSelect: () => setPickedId(row.id) }))}
            />
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2"><Text weight="semibold"><span title={selected.name}>{selected.shortName}</span></Text><Badge tone={ITERATION_STATE_TONE[selected.state]}>{outcomeOf(selected)}</Badge></div>
                <Text size="sm" tone="tertiary">{selected.sentAt ? <>sent <FormattedInstant value={selected.sentAt} locale={locale} timeZone={timezone} /></> : <>created <FormattedInstant value={selected.createdAt} locale={locale} timeZone={timezone} /></>}{selected.answeredAt ? <> · answered <FormattedInstant value={selected.answeredAt} locale={locale} timeZone={timezone} /></> : null}</Text>
              </div>
              {canEdit ? <RowActionMenu items={[{ label: "Rename iteration", onSelect: () => onRename(selected) }]} label={`${selected.shortName} actions`} /> : null}
            </div>

            {previous && (previous.note || previous.images.length > 0) ? (
              <div className="grid gap-1.5 rounded-control border border-line-subtle bg-surface-muted/40 p-3">
                <Text size="sm" weight="semibold">Brief: client notes from {previous.shortName}</Text>
                {previous.note ? <FormattedText text={previous.note} className="text-sm" /> : null}
                <IterationImageList images={previous.images} />
              </div>
            ) : null}

            {editable(selected) ? (
              <div className="grid gap-2">
                <IterationImageArea projectId={projectId} phaseId={phaseId} iterationId={selected.id} images={selected.images}>
                  <RichTextEditor aria-label={`Client notes for ${selected.shortName}`} maxLength={NOTE_MAX} placeholder="Client notes for this iteration" value={draftOf(selected)} onChange={(text) => setDrafts((current) => ({ ...current, [selected.id]: text }))} />
                </IterationImageArea>
                {dirty(selected) ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" pending={commands.isPending("iteration-notes")} onClick={() => void save(selected)}>Save notes</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDrafts(({ [selected.id]: _gone, ...rest }) => rest)}>Discard</Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-2">
                {selected.note ? <FormattedText text={selected.note} className="text-sm" /> : selected.images.length ? null : <Text as="p" size="sm" tone="tertiary">{selected.state === "SENT" ? "The client's notes go here once they reply." : "No client notes recorded."}</Text>}
                <IterationImageList images={selected.images} />
              </div>
            )}
          </div>
        ) : <Text as="p" size="sm" tone="tertiary">Notes for each iteration appear here once the phase starts.</Text>}
      </div>
    </SectionCard>
  );
}
