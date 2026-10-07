"use client";

import { useState, type FormEvent } from "react";

import { Button, DraftDialog, Field, FormActions, InlineError, Input, Select, Textarea } from "@/platform/ui_engine";

import { setProjectPriorityAction, setProjectStatusAction, updateProjectAction } from "../actions";
import { ClientSelect } from "./client-select";
import { PersonSelect, type Person } from "../_components/people";
import { useCommand } from "../_components/use-command";

export type EditableProject = {
  id: string;
  name: string;
  client: { id: string; name: string } | null;
  status: "ACTIVE" | "ON_HOLD" | "COMPLETED";
  priority: "URGENT" | "NORMAL" | "LOW";
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
export function EditProjectDialog({ project, designers, drafters, clients, onClose }: { project: EditableProject; designers: Person[]; drafters: Person[]; clients: Array<{ id: string; name: string }>; onClose: () => void }) {
  const { run, pending, error } = useCommand();
  // The current PIC stays selectable even if they no longer hold the seat permission (the server only re-checks a changed PIC).
  const withCurrent = (list: Person[], current: Person) => (list.some((person) => person.id === current.id) ? list : [current, ...list]);
  const designerChoices = withCurrent(designers, project.designer);
  const drafterChoices = withCurrent(drafters, project.drafter);
  const [form, setForm] = useState({
    name: project.name,
    clientId: project.client?.id ?? "",
    picDesignerId: project.designer.id,
    picDrafterId: project.drafter.id,
    priority: project.priority,
    // Completion has its own confirmation (readiness, reason); this form only toggles Active / On hold.
    status: project.status === "COMPLETED" ? "ACTIVE" as const : project.status,
    clientContact: project.clientContact ?? "",
    address: project.address ?? "",
    area: project.area ?? "",
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run("edit", () => updateProjectAction({
      projectId: project.id,
      name: form.name,
      clientId: form.clientId || null,
      picDesignerId: form.picDesignerId,
      picDrafterId: form.picDrafterId,
      clientContact: form.clientContact || null,
      address: form.address || null,
      area: form.area || null,
    }));
    if (!ok) return;
    if (form.priority !== project.priority) await run("priority", () => setProjectPriorityAction(project.id, form.priority));
    if (project.status !== "COMPLETED" && form.status !== project.status) await run("status", () => setProjectStatusAction(project.id, form.status));
    onClose();
  };

  return (
    <DraftDialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Edit project" size="lg" pending={pending} watchedValue={JSON.stringify(form)}>
      <form className="grid gap-3.5" onSubmit={onSubmit}>
        <Field label="Project name" required>
          <Input value={form.name} maxLength={200} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
          <Field label="Client">
            <ClientSelect clients={clients} value={form.clientId} onChange={(v) => set("clientId", v)} />
          </Field>
          <Field label="Client contact"><Input value={form.clientContact} maxLength={200} onChange={(e) => set("clientContact", e.target.value)} /></Field>
          <Field label="Designer (PIC)" required><PersonSelect required people={designerChoices} value={form.picDesignerId} onChange={(v) => set("picDesignerId", v ?? "")} /></Field>
          <Field label="Drafter (PIC)" required><PersonSelect required people={drafterChoices} value={form.picDrafterId} onChange={(v) => set("picDrafterId", v ?? "")} /></Field>
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
            </Select>
          </Field>
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
