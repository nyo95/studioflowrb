"use client";

import { useState, type FormEvent } from "react";

import { Button, DraftDialog, Field, FormActions, InlineError, Input, Select, Textarea } from "@/platform/ui_engine";

import { setProjectPriorityAction, setProjectStatusAction, updateProjectAction } from "../actions";
import { PersonSelect, type Person } from "../_components/people";
import { useCommand } from "../_components/use-command";

export type EditableProject = {
  id: string;
  name: string;
  readableName: string;
  client: { id: string; name: string } | null;
  status: "ACTIVE" | "ON_HOLD" | "COMPLETED";
  priority: "URGENT" | "NORMAL" | "LOW";
  projectType: string;
  openingDate: string | null;
  /** Gantt/timeline start; always a resolved date (falls back to createdAt server-side), never null on read. */
  timelineStartDate: string;
  clientContact: string | null;
  address: string | null;
  area: string | null;
  designer: Person;
  drafter: Person;
};

/** Moved off the project detail page (owner, 2026-09-23): administrative fields — name, client,
 * designer/drafter, opening date, type, area, address, priority, status — are edited from the
 * Projects list, not the project's own pages, which now show phase information only. */
export function EditProjectDialog({ project, people, clients, onClose }: { project: EditableProject; people: Person[]; clients: Array<{ id: string; name: string }>; onClose: () => void }) {
  const { run, pending, error } = useCommand();
  const [form, setForm] = useState({
    name: project.readableName,
    clientId: project.client?.id ?? "",
    picDesignerId: project.designer.id,
    picDrafterId: project.drafter.id,
    openingDate: project.openingDate ?? "",
    timelineStartDate: project.timelineStartDate,
    projectType: project.projectType,
    priority: project.priority,
    status: project.status,
    clientContact: project.clientContact ?? "",
    address: project.address ?? "",
    area: project.area ?? "",
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const code = project.name.slice(0, project.name.length - project.readableName.length).trim();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run("edit", () => updateProjectAction({
      projectId: project.id,
      name: form.name,
      clientId: form.clientId || null,
      picDesignerId: form.picDesignerId,
      picDrafterId: form.picDrafterId,
      openingDate: form.openingDate || null,
      timelineStartDate: form.timelineStartDate || null,
      projectType: form.projectType,
      clientContact: form.clientContact || null,
      address: form.address || null,
      area: form.area || null,
    }));
    if (!ok) return;
    if (form.priority !== project.priority) await run("priority", () => setProjectPriorityAction(project.id, form.priority));
    if (form.status !== project.status) await run("status", () => setProjectStatusAction(project.id, form.status));
    onClose();
  };

  return (
    <DraftDialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Edit project" size="lg" pending={pending} watchedValue={JSON.stringify(form)}>
      <form className="grid gap-3.5" onSubmit={onSubmit}>
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
          <Field label="Timeline start" description="Defaults to when the project was added; clear to reset it.">
            <Input type="date" value={form.timelineStartDate} onChange={(e) => set("timelineStartDate", e.target.value)} />
          </Field>
          <Field label="Project type"><Input list="sf-project-types" value={form.projectType} maxLength={60} onChange={(e) => set("projectType", e.target.value)} /></Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => set("priority", e.target.value as typeof form.priority)}>
              <option value="URGENT">Urgent</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Low</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set("status", e.target.value as typeof form.status)}>
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On hold</option>
              <option value="COMPLETED">Completed</option>
            </Select>
          </Field>
          <Field label="Area (m²)"><Input inputMode="decimal" value={form.area} onChange={(e) => set("area", e.target.value)} /></Field>
        </div>
        <datalist id="sf-project-types">
          <option value="RETAIL" /><option value="RESIDENTIAL" /><option value="OFFICE" /><option value="HOSPITALITY" /><option value="F&B" />
        </datalist>
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
