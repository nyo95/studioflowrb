"use client";

import { useState } from "react";

import { Button, InlineError, SectionCard, Text, Textarea } from "@/platform/ui_engine";

import { UndoBar, usePhaseCommands } from "./phase-commands";

/**
 * What the client said, per iteration (owner, 2026-10-05; replaces per-point feedback). The open iteration's notes
 * are edited here; the iteration before it is shown above as its brief — a Revision answers those notes, so nothing
 * is copied or ticked off. Every iteration's notes also stay in the Iterations list.
 */
export function ClientNotes({
  projectId,
  phaseId,
  current,
  previous,
  phaseStatus,
  canEdit,
}: {
  projectId: string;
  phaseId: string;
  current: { id: string; name: string; note: string | null } | null;
  previous: { name: string; note: string | null } | null;
  phaseStatus: "PENDING" | "ACTIVE" | "DONE";
  canEdit: boolean;
}) {
  const commands = usePhaseCommands(projectId);
  const [draft, setDraft] = useState(current?.note ?? "");
  const [savedFor, setSavedFor] = useState(current?.id ?? null);
  // A different open iteration (after a Revision) starts from its own notes.
  if ((current?.id ?? null) !== savedFor) {
    setSavedFor(current?.id ?? null);
    setDraft(current?.note ?? "");
  }
  const changed = draft.trim() !== (current?.note ?? "").trim();

  return (
    <SectionCard
      title={current ? `Client notes on ${current.name}` : "Client notes"}
      description="What the client said about the iteration. Choosing Revision opens the next iteration with these notes as its brief."
    >
      <div className="grid gap-3 px-(--ui-section-px) py-3">
        {previous?.note ? (
          <div className="grid gap-1 rounded-control border border-line bg-surface-muted px-3 py-2">
            <Text size="sm" weight="semibold">Brief from {previous.name}</Text>
            <Text size="sm" tone="secondary" className="whitespace-pre-line">{previous.note}</Text>
          </div>
        ) : null}
        {current ? (
          <>
            <Textarea
              aria-label={`Client notes on ${current.name}`}
              rows={5}
              maxLength={4000}
              value={draft}
              disabled={!canEdit}
              placeholder={canEdit ? "Nothing recorded yet. One point per line is easiest to read later." : "Nothing recorded yet"}
              onChange={(event) => setDraft(event.target.value)}
            />
            {canEdit && changed ? (
              <div className="flex gap-2">
                <Button size="sm" variant="primary" pending={commands.isPending("notes")} onClick={() => void commands.exec("notes", { command: "setIterationNote", phaseId, iterationId: current.id, note: draft.trim() ? draft.trim() : null }, `${current.name}: notes saved`)}>Save notes</Button>
                <Button size="sm" variant="ghost" onClick={() => setDraft(current.note ?? "")}>Discard</Button>
              </div>
            ) : null}
          </>
        ) : (
          <Text tone="secondary" size="sm">{phaseStatus === "PENDING" ? "Start the phase to open the first iteration." : "There is no open iteration. Every iteration's notes are in the Iterations list."}</Text>
        )}
        <UndoBar commands={commands} />
        {commands.error ? <InlineError>{commands.error}</InlineError> : null}
      </div>
    </SectionCard>
  );
}
