"use client";

import { useEffect, useState } from "react";

import { Button, Dialog, EmptyState, Field, InlineError, Text, Textarea } from "@/platform/ui_engine";

import { listPhaseNotesAction } from "../actions";
import { usePhaseCommands } from "./phase-commands";

type Note = { phaseId: string; phaseName: string; note: string | null };

/**
 * One free-text note per phase (replaces the old sub-to-do list). Opened from a project card;
 * loads on demand so the home page does not carry every note of every project.
 */
export function PhaseNotesDialog({ projectId, open, onOpenChange, canEdit }: { projectId: string; open: boolean; onOpenChange: (open: boolean) => void; canEdit: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Pinned notes" description="One pinned note per phase: what holds for the whole phase, whatever the round.">
      {open ? <NotesBody projectId={projectId} canEdit={canEdit} /> : null}
    </Dialog>
  );
}

// Mounted only while the dialog is open, so every opening starts from a fresh load.
function NotesBody({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const commands = usePhaseCommands(projectId);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listPhaseNotesAction(projectId).then((result) => {
      if (cancelled) return;
      if (!result.ok) { setLoadError(result.error.safeMessage); return; }
      setNotes(result.data);
      setDrafts(Object.fromEntries(result.data.map((note) => [note.phaseId, note.note ?? ""])));
    }).catch(() => { if (!cancelled) setLoadError("Could not load the notes. Close and reopen to try again."); });
    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <div className="grid gap-3">
      {loadError ? <InlineError>{loadError}</InlineError> : null}
      {!notes && !loadError ? <Text tone="tertiary" size="sm">Loading…</Text> : null}
      {notes && notes.length === 0 ? <EmptyState title="No phases" /> : null}
      {notes?.map((entry) => {
        const draft = drafts[entry.phaseId] ?? "";
        const changed = draft.trim() !== (entry.note ?? "").trim();
        return (
          <div key={entry.phaseId} className="grid gap-1.5">
            <Field label={entry.phaseName}>
              <Textarea
                rows={2}
                maxLength={2000}
                value={draft}
                disabled={!canEdit}
                placeholder={canEdit ? "No note yet" : "No note"}
                onChange={(event) => setDrafts((current) => ({ ...current, [entry.phaseId]: event.target.value }))}
              />
            </Field>
            {canEdit && changed ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  pending={commands.isPending(`note:${entry.phaseId}`)}
                  onClick={async () => {
                    const text = draft.trim();
                    const ok = await commands.exec(`note:${entry.phaseId}`, { command: "setPhaseNote", phaseId: entry.phaseId, note: text ? text : null }, `${entry.phaseName} note saved`);
                    if (ok) setNotes((current) => current?.map((item) => item.phaseId === entry.phaseId ? { ...item, note: text ? text : null } : item) ?? current);
                  }}
                >
                  Save note
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDrafts((current) => ({ ...current, [entry.phaseId]: entry.note ?? "" }))}>Discard</Button>
              </div>
            ) : null}
          </div>
        );
      })}
      {commands.error ? <InlineError>{commands.error}</InlineError> : null}
    </div>
  );
}
