"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { Dialog, FormattedInstant, FormattedText, InlineError, Text } from "@/platform/ui_engine";

import { listStarredPhaseNotesAction } from "../actions";

type StarredNote = { id: string; body: string; createdAt: Date; authorName: string | null; imageCount: number; iterationLabel: string | null };
type PhaseStarred = { phaseId: string; phaseName: string; notes: StarredNote[] };

/**
 * The starred messages of every phase (they replace the old one pinned note per phase, WO-SF-NOTEFEED-01). Opened from
 * a project card; loads on demand so the home page does not carry every note of every project. Notes are written and
 * starred on the phase page.
 */
export function PhaseNotesDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Starred notes" description="What each phase has starred in its notes. Star a note on the phase page to keep it here.">
      {open ? <StarredBody projectId={projectId} /> : null}
    </Dialog>
  );
}

// Mounted only while the dialog is open, so every opening starts from a fresh load.
function StarredBody({ projectId }: { projectId: string }) {
  const { locale, timezone } = useDisplaySettings();
  const [phases, setPhases] = useState<PhaseStarred[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listStarredPhaseNotesAction(projectId).then((result) => {
      if (cancelled) return;
      if (!result.ok) { setLoadError(result.error.safeMessage); return; }
      setPhases(result.data);
    }).catch(() => { if (!cancelled) setLoadError("Could not load the notes. Close and reopen to try again."); });
    return () => { cancelled = true; };
  }, [projectId]);

  const withNotes = phases?.filter((phase) => phase.notes.length > 0) ?? [];
  return (
    <div className="grid gap-4">
      {loadError ? <InlineError>{loadError}</InlineError> : null}
      {!phases && !loadError ? <Text tone="tertiary" size="sm">Loading…</Text> : null}
      {phases && withNotes.length === 0 ? <Text as="p" tone="tertiary" size="sm">Nothing starred yet.</Text> : null}
      {withNotes.map((phase) => (
        <section key={phase.phaseId} className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <Text weight="semibold">{phase.phaseName}</Text>
            <Link href={`/studioflow/projects/${projectId}?phase=${phase.phaseId}`} className="text-sm text-ink-secondary underline underline-offset-2 hover:text-ink">Open notes</Link>
          </div>
          <ul className="m-0 grid list-none gap-2 p-0">
            {phase.notes.map((note) => (
              <li key={note.id} className="grid gap-1 rounded-control border border-line-subtle px-3 py-2">
                {note.body ? <FormattedText text={note.body} className="text-sm" /> : null}
                <Text size="sm" tone="tertiary">
                  {[note.iterationLabel, note.authorName].filter(Boolean).join(" · ")}{note.iterationLabel || note.authorName ? " · " : ""}<FormattedInstant value={note.createdAt} locale={locale} timeZone={timezone} />{note.imageCount ? ` · ${note.imageCount} image${note.imageCount === 1 ? "" : "s"}` : ""}
                </Text>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
