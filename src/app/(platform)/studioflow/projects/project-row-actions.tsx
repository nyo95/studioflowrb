"use client";

import { useState } from "react";

import { Button, Dialog, Field, FormActions, InlineError, RowActionMenu, Text, Textarea } from "@/platform/ui_engine";

import { archiveProjectAction, restoreProjectAction, syncChecklistAction } from "../actions";
import type { Person } from "../_components/people";
import { useCommand } from "../_components/use-command";
import { EditProjectDialog, type EditableProject } from "./edit-project-dialog";

/** Row-level equivalent of the administrative actions moved off the project detail page (owner, 2026-09-23). */
export function ProjectRowActions({ project, people, clients }: { project: EditableProject & { archivedAt: Date | null }; people: Person[]; clients: Array<{ id: string; name: string }> }) {
  const { run, pending, error } = useCommand();
  const [dialog, setDialog] = useState<null | "edit" | "archive" | "restore">(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  if (project.archivedAt) {
    return (
      <>
        <RowActionMenu label={`${project.readableName} actions`} pending={pending} items={[
          { label: "Restore project", onSelect: () => { setReason(""); setDialog("restore"); } },
        ]} />
        {dialog === "restore" ? (
          <Dialog open onOpenChange={(open) => { if (!open) setDialog(null); }} title="Restore project" description="The project becomes editable again.">
            <form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); if (await run("restore", () => restoreProjectAction(project.id, reason))) setDialog(null); }}>
              <Field label="Note (optional)"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              {error ? <InlineError>{error}</InlineError> : null}
              <FormActions><Button type="button" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" variant="primary" pending={pending}>Restore</Button></FormActions>
            </form>
          </Dialog>
        ) : null}
      </>
    );
  }

  return (
    <>
      {notice ? <Text size="sm" tone="secondary" className="mr-1 inline-block">{notice}</Text> : null}
      {error && dialog === null ? <InlineError className="mr-1 inline-block">{error}</InlineError> : null}
      <RowActionMenu label={`${project.readableName} actions`} pending={pending} items={[
        { label: "Edit details", onSelect: () => setDialog("edit") },
        { label: "Apply checklist templates", onSelect: () => void run("sync", () => syncChecklistAction(project.id), (data) => setNotice(`${(data as { created: number }).created} checklist item(s) added`)) },
        { label: "Archive project…", danger: true, separatorBefore: true, onSelect: () => { setReason(""); setDialog("archive"); } },
      ]} />
      {dialog === "archive" ? (
        <Dialog open onOpenChange={(open) => { if (!open && !pending) setDialog(null); }} title="Archive project" description="Archived projects are hidden from Today and become read-only. You can restore them later.">
          <form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); if (await run("archive", () => archiveProjectAction(project.id, reason))) setDialog(null); }}>
            <Field label="Reason" required><Textarea rows={2} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></Field>
            {error ? <InlineError>{error}</InlineError> : null}
            <FormActions><Button type="button" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" variant="danger" pending={pending} disabled={!reason.trim()}>Archive</Button></FormActions>
          </form>
        </Dialog>
      ) : null}
      {dialog === "edit" ? <EditProjectDialog project={project} people={people} clients={clients} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
