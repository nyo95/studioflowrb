"use client";

import { useState } from "react";

import { Button, ButtonMenu, Dialog, DraftDialog, Field, FormActions, InlineError, Input, Select, Textarea } from "@/platform/ui_engine";

import {
  archiveProjectAction,
  restoreProjectAction,
  setProjectPriorityAction,
  setProjectStatusAction,
  syncChecklistAction,
  updateProjectAction,
} from "../../actions";
import { PersonSelect, type Person } from "../../_components/people";
import { useCommand } from "../../_components/use-command";

type Project = {
  id: string;
  name: string;
  readableName: string;
  client: { id: string; name: string } | null;
  status: "ACTIVE" | "ON_HOLD" | "COMPLETED";
  priority: "URGENT" | "NORMAL" | "LOW";
  projectType: string;
  openingDate: string | null;
  clientContact: string | null;
  address: string | null;
  area: string | null;
  designer: Person;
  drafter: Person;
  archivedAt: Date | null;
};

export function ProjectHeaderActions({ project, people, clients }: { project: Project; people: Person[]; clients: Array<{ id: string; name: string }> }) {
  const { run, pending, error } = useCommand();
  const [dialog, setDialog] = useState<null | "edit" | "archive" | "restore">(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  if (project.archivedAt) {
    return (
      <>
        <Button onClick={() => { setReason(""); setDialog("restore"); }}>Restore project</Button>
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
    <div className="flex flex-wrap items-center gap-2">
      {notice ? <span className="text-xs text-ink-secondary">{notice}</span> : null}
      {error && dialog === null ? <InlineError>{error}</InlineError> : null}
      <div className="w-28 shrink-0"><Select aria-label="Priority" density="compact" value={project.priority} disabled={pending} onChange={(e) => run("priority", () => setProjectPriorityAction(project.id, e.target.value))}>
        <option value="URGENT">Urgent</option>
        <option value="NORMAL">Normal</option>
        <option value="LOW">Low</option>
      </Select></div>
      <Button onClick={() => setDialog("edit")}>Edit details</Button>
      <ButtonMenu
        label="More"
        variant="secondary"
        items={[
          project.status === "ON_HOLD"
            ? { label: "Resume project", onSelect: () => run("status", () => setProjectStatusAction(project.id, "ACTIVE")) }
            : { label: "Put on hold", description: "Phases cannot be started while on hold.", onSelect: () => run("status", () => setProjectStatusAction(project.id, "ON_HOLD")), disabled: project.status === "COMPLETED" },
          project.status === "COMPLETED"
            ? { label: "Reactivate project", onSelect: () => run("status", () => setProjectStatusAction(project.id, "ACTIVE")) }
            : { label: "Mark project completed", onSelect: () => run("status", () => setProjectStatusAction(project.id, "COMPLETED")) },
          { label: "Apply checklist templates", description: "Adds template items missing from this project.", onSelect: () => run("sync", () => syncChecklistAction(project.id), (data) => setNotice(`${(data as { created: number }).created} checklist item(s) added`)) },
          { label: "Archive project…", onSelect: () => { setReason(""); setDialog("archive"); } },
        ]}
      />
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
    </div>
  );
}

function EditProjectDialog({ project, people, clients, onClose }: { project: Project; people: Person[]; clients: Array<{ id: string; name: string }>; onClose: () => void }) {
  const { run, pending, error } = useCommand();
  const [form, setForm] = useState({
    name: project.readableName,
    clientId: project.client?.id ?? "",
    picDesignerId: project.designer.id,
    picDrafterId: project.drafter.id,
    openingDate: project.openingDate ?? "",
    projectType: project.projectType,
    clientContact: project.clientContact ?? "",
    address: project.address ?? "",
    area: project.area ?? "",
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const code = project.name.slice(0, project.name.length - project.readableName.length).trim();
  return (
    <DraftDialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Edit project" size="lg" pending={pending} watchedValue={JSON.stringify(form)}>
      <form className="grid gap-3.5" onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run("edit", () => updateProjectAction({
          projectId: project.id,
          name: form.name,
          clientId: form.clientId || null,
          picDesignerId: form.picDesignerId,
          picDrafterId: form.picDrafterId,
          openingDate: form.openingDate || null,
          projectType: form.projectType,
          clientContact: form.clientContact || null,
          address: form.address || null,
          area: form.area || null,
        }));
        if (ok) onClose();
      }}>
        <Field label="Project name" required description={code ? `The number ${code} stays fixed.` : undefined}>
          <Input value={form.name} maxLength={200} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
          <Field label="Client">
            <Select value={form.clientId} onChange={(e) => set("clientId", e.target.value)}>
              <option value="">No client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Client contact"><Input value={form.clientContact} maxLength={200} onChange={(e) => set("clientContact", e.target.value)} /></Field>
          <Field label="Designer (PIC)" required><PersonSelect required people={people} value={form.picDesignerId} onChange={(v) => set("picDesignerId", v ?? "")} /></Field>
          <Field label="Drafter (PIC)" required><PersonSelect required people={people} value={form.picDrafterId} onChange={(v) => set("picDrafterId", v ?? "")} /></Field>
          <Field label="Opening date"><Input type="date" value={form.openingDate} onChange={(e) => set("openingDate", e.target.value)} /></Field>
          <Field label="Project type"><Input value={form.projectType} maxLength={60} onChange={(e) => set("projectType", e.target.value)} /></Field>
          <Field label="Area (m²)"><Input inputMode="decimal" value={form.area} onChange={(e) => set("area", e.target.value)} /></Field>
        </div>
        <Field label="Site address"><Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" data-dialog-cancel disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending}>Save changes</Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}
