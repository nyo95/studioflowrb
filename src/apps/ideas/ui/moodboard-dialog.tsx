"use client";

import Link from "next/link";
import { useState } from "react";

import { PRESENTATION_ROUTES } from "@/apps/presentation/public/nav";
import { Button, Dialog, Field, FormActions, InlineError, Notice, Select, Text, buttonClasses } from "@/platform/ui_engine";
import type { ActionResult } from "@platform/core/actions";

type Target = { id: string; name: string };
export type MoodboardResult = ActionResult<{ boardId: string; slideId: string; created: boolean }>;

/** Ideas-owned moodboard picker: a copy of the image becomes the last slide of the selected project's board. */
export function MoodboardDialog({ targets, apply, onClose }: { targets: Target[]; apply: (projectId: string) => Promise<MoodboardResult>; onClose: () => void }) {
  const [projectId, setProjectId] = useState(targets.length === 1 ? targets[0].id : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ projectId: string; boardId: string; created: boolean } | null>(null);
  const project = targets.find((target) => target.id === projectId);

  if (done) {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Added to the moodboard">
        <div className="grid gap-3">
          <Notice tone="success">{done.created ? `Started the Moodboard board of ${project?.name} and added the image.` : `Added the image to the Moodboard board of ${project?.name}.`}</Notice>
          <FormActions>
            <Button onClick={onClose}>Close</Button>
            <Link href={PRESENTATION_ROUTES.board(done.projectId, done.boardId)} prefetch={false} className={buttonClasses("primary")}>Open moodboard</Link>
          </FormActions>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open dismissible={!pending} onOpenChange={(open) => { if (!open) onClose(); }} title="Add to moodboard" description="A copy goes on the project's Moodboard board (the Presentation tab). Changing or deleting the original later does not change it.">
      <form className="grid gap-3" onSubmit={async (event) => {
        event.preventDefault();
        if (!project || pending) return;
        setPending(true); setError(null);
        try {
          const result = await apply(projectId);
          if (!result.ok) { setError(result.error.safeMessage); return; }
          setDone({ projectId, boardId: result.data.boardId, created: result.data.created });
        } catch {
          setError("Could not confirm the copy. Check the moodboard before trying again.");
        } finally {
          setPending(false);
        }
      }}>
        {targets.length === 1 && projectId === targets[0].id ? (
          <div className="grid gap-1" role="group" aria-label="Destination project">
            <Text size="sm" tone="secondary">Project</Text>
            <Text weight="semibold">{targets[0].name}</Text>
          </div>
        ) : <Field label="Project" required description="Projects whose documents you may change.">
          <Select disabled={pending} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Choose a project…</option>
            {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
          </Select>
        </Field>}
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending} disabled={!projectId}>Add to moodboard</Button>
        </FormActions>
      </form>
    </Dialog>
  );
}
