"use client";

import { useState } from "react";

import {
  ARCHIVE_RETENTION_MAX_DAYS,
  ARCHIVE_RETENTION_MIN_DAYS,
  isValidRetentionDays,
} from "@/apps/studioflow/domain/retention";
import { Button, ConfirmDialog, Dialog, Field, FormActions, Input, Notice, SectionCard, Text } from "@/platform/ui_engine";

import { getAssetCleanupPreviewAction, runAssetCleanupAction, setArchiveRetentionAction } from "../../actions";
import { useCommand } from "../../_components/use-command";

/** Most projects one manual cleanup handles; the action accepts 1 to 100. */
const MANUAL_CLEANUP_LIMIT = 100;

type CleanupSummary = {
  projectsPurged: number;
  blobsRemoved: number;
  blobsKeptShared: number;
  blobFailures: number;
  previousFailuresResolved: number;
  previousFailuresStillFailing: number;
};

type Stage =
  | { name: "closed" }
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "empty"; retentionDays: number }
  | { name: "confirm"; projects: number; retentionDays: number; running: boolean; error: string | null }
  | { name: "done"; summary: CleanupSummary };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * How long an archived project's files are kept, and the owner's manual cleanup. The daily cleanup
 * runs by itself; this card only sets the window and lets the owner run it early, after seeing
 * exactly how many projects are affected and typing DELETE to confirm an action that cannot be undone.
 */
export function ArchiveRetentionSettings({
  retentionDays,
  canManage,
  canCleanup,
}: {
  retentionDays: number;
  canManage: boolean;
  canCleanup: boolean;
}) {
  const { run, pendingKey, error } = useCommand();
  const [draft, setDraft] = useState(String(retentionDays));
  const [seenSaved, setSeenSaved] = useState(retentionDays);
  const [stage, setStage] = useState<Stage>({ name: "closed" });

  // After a save the server sends the stored value back; adopt it during render (no effect needed).
  if (retentionDays !== seenSaved) {
    setSeenSaved(retentionDays);
    setDraft(String(retentionDays));
  }

  const parsed = draft.trim() === "" ? Number.NaN : Number(draft);
  const valid = isValidRetentionDays(parsed);
  const dirty = valid && parsed !== retentionDays;
  const saving = pendingKey === "retention";

  async function openReview() {
    setStage({ name: "loading" });
    try {
      const result = await getAssetCleanupPreviewAction();
      if (!result.ok) return setStage({ name: "error", message: result.error.safeMessage });
      const { eligibleProjects, retentionDays: days } = result.data;
      setStage(eligibleProjects === 0
        ? { name: "empty", retentionDays: days }
        : { name: "confirm", projects: eligibleProjects, retentionDays: days, running: false, error: null });
    } catch {
      setStage({ name: "error", message: "The cleanup check could not be completed. Please try again." });
    }
  }

  async function runCleanup(current: Extract<Stage, { name: "confirm" }>) {
    setStage({ ...current, running: true, error: null });
    try {
      const result = await runAssetCleanupAction(MANUAL_CLEANUP_LIMIT);
      if (!result.ok) return setStage({ ...current, running: false, error: result.error.safeMessage });
      setStage({ name: "done", summary: result.data });
    } catch {
      setStage({ ...current, running: false, error: "The cleanup could not be completed. Please try again." });
    }
  }

  const close = () => setStage({ name: "closed" });

  return (
    <SectionCard id="archive-retention" className="scroll-mt-20" title="Archived project files" padded>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid max-w-xl gap-1">
            <Field
              label="Keep an archived project's files for (days)"
              description={`A whole number from ${ARCHIVE_RETENTION_MIN_DAYS} to ${ARCHIVE_RETENTION_MAX_DAYS}. Changing it also changes the date for projects that are already archived.`}
              error={draft !== "" && !valid ? `Enter a whole number from ${ARCHIVE_RETENTION_MIN_DAYS} to ${ARCHIVE_RETENTION_MAX_DAYS}.` : undefined}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={ARCHIVE_RETENTION_MIN_DAYS}
                max={ARCHIVE_RETENTION_MAX_DAYS}
                step={1}
                className="w-32"
                value={draft}
                disabled={!canManage || saving}
                onChange={(event) => setDraft(event.target.value)}
              />
            </Field>
          </div>
          {canManage ? (
            <Button
              variant="primary"
              disabled={!dirty}
              pending={saving}
              onClick={() => void run("retention", () => setArchiveRetentionAction(parsed))}
            >
              Save
            </Button>
          ) : null}
        </div>

        <Text size="sm" tone="secondary">
          After that time an archived project&apos;s deliverables, meeting-note images and schedule photos are removed. The project,
          its text and its history stay. Client logos and studio templates are never touched. Restoring a project before its date keeps everything.
        </Text>

        {error && pendingKey === null ? <Notice tone="danger" title="Could not save">{error}</Notice> : null}

        {canCleanup ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-3">
            <Text size="sm" tone="secondary">Cleanup runs by itself every day. You can also run it now, after seeing what it would remove.</Text>
            <Button onClick={() => void openReview()} pending={stage.name === "loading"}>Review cleanup…</Button>
          </div>
        ) : null}
      </div>

      <Dialog
        open={stage.name === "error" || stage.name === "empty" || stage.name === "done"}
        onOpenChange={(open) => { if (!open) close(); }}
        title={stage.name === "done" ? "Cleanup finished" : stage.name === "empty" ? "Nothing to clean up" : "Cleanup check failed"}
        description={stage.name === "error" ? "Nothing was removed." : undefined}
      >
        <div className="grid gap-3">
          {stage.name === "error" ? <Notice tone="danger" title="Could not check">{stage.message}</Notice> : null}
          {stage.name === "empty" ? (
            <Text>No archived project is older than {stage.retentionDays} days, so there are no files to remove.</Text>
          ) : null}
          {stage.name === "done" ? <CleanupResult summary={stage.summary} /> : null}
          <FormActions><Button variant="primary" onClick={close}>Close</Button></FormActions>
        </div>
      </Dialog>

      <ConfirmDialog
        open={stage.name === "confirm"}
        onOpenChange={(open) => { if (!open && !(stage.name === "confirm" && stage.running)) close(); }}
        title={stage.name === "confirm" ? `Delete the files of ${plural(stage.projects, "archived project", "archived projects")}?` : "Delete files?"}
        description={stage.name === "confirm" ? (
          <>
            {plural(stage.projects, "archived project is", "archived projects are")} past the {stage.retentionDays}-day window. This permanently
            deletes {stage.projects === 1 ? "its" : "their"} deliverables, meeting-note images and schedule photos.
            The {stage.projects === 1 ? "project, its" : "projects, their"} text and history are kept. This cannot be undone.
          </>
        ) : null}
        tone="danger"
        confirmLabel="Delete files"
        requireTypedConfirmation="DELETE"
        pending={stage.name === "confirm" && stage.running}
        error={stage.name === "confirm" ? stage.error : null}
        onConfirm={() => { if (stage.name === "confirm") void runCleanup(stage); }}
      />
    </SectionCard>
  );
}

function CleanupResult({ summary }: { summary: CleanupSummary }) {
  const more = summary.projectsPurged >= MANUAL_CLEANUP_LIMIT;
  return (
    <div className="grid gap-2">
      <Notice tone="success" title={`Files removed for ${plural(summary.projectsPurged, "project", "projects")}`}>
        {plural(summary.blobsRemoved, "file was", "files were")} deleted.
        {summary.blobsKeptShared > 0 ? ` ${plural(summary.blobsKeptShared, "file was", "files were")} kept because something else still uses ${summary.blobsKeptShared === 1 ? "it" : "them"}.` : ""}
      </Notice>
      {summary.previousFailuresResolved > 0 ? (
        <Notice tone="success" title="Also cleared earlier failures">
          {plural(summary.previousFailuresResolved, "file", "files")} that could not be deleted in an earlier run {summary.previousFailuresResolved === 1 ? "was" : "were"} removed now.
        </Notice>
      ) : null}
      {summary.blobFailures > 0 || summary.previousFailuresStillFailing > 0 ? (
        <Notice tone="warning" title="Some files could not be deleted">
          {plural(summary.blobFailures + summary.previousFailuresStillFailing, "file", "files")} could not be deleted from disk. They are no
          longer linked to any project; cleanup will keep retrying automatically.
        </Notice>
      ) : null}
      {more ? <Text size="sm" tone="secondary">More projects may be waiting. Run the cleanup again to continue.</Text> : null}
    </div>
  );
}
