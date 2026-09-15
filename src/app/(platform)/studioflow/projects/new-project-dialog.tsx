"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";
import { Button, DraftDialog, Field, FormActions, InlineError, Input, Select, Text, Textarea } from "@/platform/ui_engine";

import { createProjectAction } from "../actions";
import { PersonSelect, type Person } from "../_components/people";
import { useCommand } from "../_components/use-command";

const NEW_CLIENT = "__new__";

export function NewProjectDialog({ people, clients, autoNaming, onClose }: { people: Person[]; clients: Array<{ id: string; name: string }>; autoNaming: boolean; onClose: () => void }) {
  const router = useRouter();
  const { run, pending, error } = useCommand();
  const [form, setForm] = useState({
    name: "",
    client: "",
    newClientName: "",
    picDesignerId: "",
    picDrafterId: "",
    openingDate: "",
    projectType: "RETAIL",
    priority: "NORMAL" as "URGENT" | "NORMAL" | "LOW",
    clientContact: "",
    address: "",
    area: "",
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <DraftDialog open onOpenChange={(open) => { if (!open) onClose(); }} title="New project" description="Creates the five phases, starts Moodboard at v1.0, and adds the Studio checklist." size="lg" pending={pending} watchedValue={JSON.stringify(form)}>
      <form className="grid gap-3.5" onSubmit={(event) => {
        event.preventDefault();
        void run("create", () => createProjectAction({
          name: form.name,
          clientId: form.client && form.client !== NEW_CLIENT ? form.client : null,
          newClientName: form.client === NEW_CLIENT ? form.newClientName : null,
          picDesignerId: form.picDesignerId,
          picDrafterId: form.picDrafterId,
          openingDate: form.openingDate || null,
          projectType: form.projectType,
          priority: form.priority,
          clientContact: form.clientContact || null,
          address: form.address || null,
          area: form.area || null,
        }), (data) => {
          const created = data as { projectId: string };
          onClose();
          router.push(STUDIOFLOW_ROUTES.project(created.projectId));
        });
      }}>
        <Field label="Project name" required description={autoNaming ? "Year and number are added automatically, e.g. 2026-012 Heloskin Cimanggu." : "Use the format [Year]-[Number] [Name], e.g. 2026-012 Heloskin Cimanggu."}>
          <Input autoFocus value={form.name} maxLength={200} placeholder={autoNaming ? "Heloskin Cimanggu" : "2026-012 Heloskin Cimanggu"} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
          <Field label="Client">
            <Select value={form.client} onChange={(e) => set("client", e.target.value)}>
              <option value="">No client yet</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value={NEW_CLIENT}>+ New client…</option>
            </Select>
          </Field>
          {form.client === NEW_CLIENT ? (
            <Field label="New client name" required>
              <Input value={form.newClientName} maxLength={200} onChange={(e) => set("newClientName", e.target.value)} />
            </Field>
          ) : (
            <Field label="Client contact"><Input value={form.clientContact} maxLength={200} onChange={(e) => set("clientContact", e.target.value)} /></Field>
          )}
          <Field label="Designer (PIC)" required><PersonSelect required people={people} value={form.picDesignerId || null} onChange={(v) => set("picDesignerId", v ?? "")} /></Field>
          <Field label="Drafter (PIC)" required><PersonSelect required people={people} value={form.picDrafterId || null} onChange={(v) => set("picDrafterId", v ?? "")} /></Field>
          <Field label="Opening date"><Input type="date" value={form.openingDate} onChange={(e) => set("openingDate", e.target.value)} /></Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => set("priority", e.target.value as typeof form.priority)}>
              <option value="URGENT">Urgent</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Low</option>
            </Select>
          </Field>
          <Field label="Project type">
            <Input list="sf-project-types" value={form.projectType} maxLength={60} onChange={(e) => set("projectType", e.target.value)} />
          </Field>
          <Field label="Area (m²)"><Input inputMode="decimal" value={form.area} onChange={(e) => set("area", e.target.value)} /></Field>
        </div>
        <datalist id="sf-project-types">
          <option value="RETAIL" /><option value="RESIDENTIAL" /><option value="OFFICE" /><option value="HOSPITALITY" /><option value="F&B" />
        </datalist>
        <Field label="Site address"><Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
        {people.length === 0 ? <Text size="sm" tone="secondary">No staff can be assigned yet. Grant “StudioFlow phase work” to a role in Platform Access first.</Text> : null}
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" data-dialog-cancel disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending} disabled={!form.name.trim() || !form.picDesignerId || !form.picDrafterId}>Create project</Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}
