"use client";

import Link from "next/link";
import { useState } from "react";

import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";
import { Button, Dialog, Field, FormActions, InlineError, Notice, Select, buttonClasses } from "@/platform/ui_engine";
import type { ActionResult } from "@platform/core/actions";

type Target = { id: string; name: string };
export type MoodboardResult = ActionResult<{ boardId: string; slideId: string; created: boolean }>;

/** "Add to moodboard": pick the project, and a copy of the image becomes the last slide of its Moodboard board. */
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
            <Link href={STUDIOFLOW_ROUTES.projectPresentationBoard(done.projectId, done.boardId)} prefetch={false} className={buttonClasses("primary")}>Open moodboard</Link>
          </FormActions>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }} title="Add to moodboard" description="A copy goes on the project's Moodboard board (the Presentation tab). Changing or deleting the original later does not change it.">
      <form className="grid gap-3" onSubmit={async (event) => {
        event.preventDefault();
        if (!projectId) return;
        setPending(true); setError(null);
        const result = await apply(projectId);
        setPending(false);
        if (!result.ok) { setError(result.error.safeMessage); return; }
        setDone({ projectId, boardId: result.data.boardId, created: result.data.created });
      }}>
        <Field label="Project" required description="Projects whose documents you may change.">
          <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Choose a project…</option>
            {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
          </Select>
        </Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending} disabled={!projectId}>Add to moodboard</Button>
        </FormActions>
      </form>
    </Dialog>
  );
}
