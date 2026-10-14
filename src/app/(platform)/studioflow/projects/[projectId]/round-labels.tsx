"use client";

import { useState } from "react";

import { Button, InlineError } from "@/platform/ui_engine";

import { saveNoteImageToIdeasAction, applyNoteImageToScheduleAction } from "@/apps/ideas/public/image-actions";
import { addWorkspaceImageToMoodboardAction } from "@/apps/presentation/public/image-actions";
import { UseInScheduleDialog } from "@/apps/ideas/public/use-in-schedule-dialog";
import type { IterationView } from "../../_components/phase-commands";
import { useStudioFlowModuleEnabled } from "../../module-state";

export type IterationRow = { id: string; name: string; shortName: string; state: IterationView["state"]; createdAt: Date; sentAt: Date | null; answeredAt: Date | null; doneAt: Date | null; visitDate: string | null };

export const ITERATION_STATE_LABEL: Record<IterationView["state"], string> = { NOT_SENT: "In progress", SENT: "With client", ANSWERED: "Client answered", REVISED: "Revision asked", DONE: "Approved" };
export const ITERATION_STATE_TONE: Record<IterationView["state"], "neutral" | "warning" | "success"> = { NOT_SENT: "neutral", SENT: "warning", ANSWERED: "success", REVISED: "neutral", DONE: "success" };

/**
 * Under a note image in the large viewer: keep a copy on the person's Ideas board, or put it in this project's schedule.
 * Both copy; the note is never changed. The Workspace uses it too, where a card may have no phase label.
 */
export function NoteImageActions({ image, projectId, projectName, phaseId, canUseIdeas, canUsePresentation }: { image: { id: string }; projectId: string; projectName: string; phaseId: string | null; canUseIdeas: boolean; canUsePresentation: boolean }) {
  const ideasEnabled = useStudioFlowModuleEnabled("ideas") && canUseIdeas;
  const presentationEnabled = useStudioFlowModuleEnabled("presentation") && canUsePresentation;
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [using, setUsing] = useState(false);
  const [moodboard, setMoodboard] = useState<"idle" | "pending" | "done">("idle");
  const addToMoodboard = async () => {
    setMoodboard("pending"); setError(null);
    try {
      const result = await addWorkspaceImageToMoodboardAction({ projectId, phaseId, imageId: image.id });
      if (result.ok) setMoodboard("done"); else { setMoodboard("idle"); setError(result.error.safeMessage); }
    } catch {
      setMoodboard("idle");
      setError("Could not confirm the copy. Check the moodboard before trying again.");
    }
  };
  const save = async () => {
    setPending(true); setError(null);
    try {
      const result = await saveNoteImageToIdeasAction({ projectId, phaseId, imageId: image.id });
      if (result.ok) setSaved(true); else setError(result.error.safeMessage);
    } catch {
      setError("Could not confirm the copy. Check Ideas before trying again.");
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      {ideasEnabled ? <Button size="sm" variant="secondary" pending={pending} disabled={saved} onClick={() => void save()}>{saved ? "Saved to Ideas" : "Save to Ideas"}</Button> : null}
      {ideasEnabled ? <Button size="sm" variant="secondary" onClick={() => setUsing(true)}>Use in schedule</Button> : null}
      {presentationEnabled ? <Button size="sm" variant="secondary" pending={moodboard === "pending"} disabled={moodboard === "done"} onClick={() => void addToMoodboard()}>{moodboard === "done" ? "Added to moodboard" : "Add to moodboard"}</Button> : null}
      {error ? <InlineError>{error}</InlineError> : null}
      {ideasEnabled && using ? (
        <UseInScheduleDialog
          initialName=""
          initialNotes=""
          targets={[{ id: projectId, name: projectName }]}
          apply={(input) => applyNoteImageToScheduleAction({ operationId: input.operationId, projectId, phaseId, imageId: image.id, target: input.target, option: input.option })}
          onClose={() => setUsing(false)}
        />
      ) : null}
    </>
  );
}
