"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { createAssemblyAction, libraryItemAction, templateAction } from "./actions";
import type { BqLibItemRead, BqTemplateRead } from "@/apps/bq/public";
import { Button, ConfirmDialog, Dialog, Field, FormActions, InlineError, Input, Select, Spinner, Textarea } from "@/platform/ui_engine";

type ItemType = BqLibItemRead["type"];
function useCommand() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return { pending, startTransition, error, setError, router };
}

export function LibraryItemCreateButton() {
  return <LibraryItemDialog />;
}

export function AssemblyCreateButton() {
  const [open, setOpen] = useState(false); const [error, setError] = useState<string | null>(null); const [pending, startTransition] = useTransition(); const router = useRouter();
  return <><Button type="button" variant="primary" leadingIcon={<Plus aria-hidden="true" />} onClick={() => setOpen(true)}>Add assembly</Button><Dialog open={open} onOpenChange={setOpen} title="Add Assembly Template" description="Reusable L2 breakdown. Its L3 lines are copied into each project." size="sm"><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(async () => { const result = await createAssemblyAction(null, data); if (!result.ok) setError(result.error.safeMessage); else { setOpen(false); router.refresh(); } }); }}>{error ? <InlineError>{error}</InlineError> : null}<Field label="Name" required><Input name="name" required maxLength={160} autoFocus /></Field><Field label="Description"><Textarea name="description" maxLength={2000} /></Field><FormActions><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" pending={pending}>Add assembly</Button></FormActions></form></Dialog></>;
}

export function LibraryItemActions({ item }: { item: BqLibItemRead }) {
  const [editOpen, setEditOpen] = useState(false);
  return (
    <div className="flex justify-end gap-1">
      <Button type="button" size="sm" variant="ghost" title="Edit item" onClick={() => setEditOpen(true)}><Pencil size={15} aria-hidden="true" /></Button>
      <DeleteItemButton item={item} />
      <LibraryItemDialog item={item} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

function DeleteItemButton({ item }: { item: BqLibItemRead }) {
  const [open, setOpen] = useState(false);
  const command = useCommand();
  const submit = () => {
    const data = new FormData();
    data.set("operation", "delete"); data.set("type", item.type); data.set("id", item.id);
    data.set("name", item.name); data.set("purchaseUnit", item.purchaseUnit); data.set("harga", item.harga);
    data.set("currency", item.currency); data.set("defaultKoefisien", item.defaultKoefisien);
    command.startTransition(async () => {
      const result = await libraryItemAction(null, data);
      if (!result.ok) command.setError(result.error.safeMessage);
      else { setOpen(false); command.router.refresh(); }
    });
  };
  return <>
    <Button type="button" size="sm" variant="ghost" title="Delete item" onClick={() => { command.setError(null); setOpen(true); }}><Trash2 size={15} aria-hidden="true" /></Button>
    <ConfirmDialog open={open} onOpenChange={setOpen} title={`Delete ${item.name}?`} description={command.error ?? "This library item will be permanently removed."} confirmLabel="Delete" tone="danger" pending={command.pending} onConfirm={submit} />
  </>;
}

function LibraryItemDialog({ item, open: controlledOpen, onOpenChange }: { item?: BqLibItemRead; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [type, setType] = useState<ItemType>(item?.type ?? "material");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => (onOpenChange ? onOpenChange(next) : setInternalOpen(next));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await libraryItemAction(null, formData);
      if (!result.ok) setError(result.error.safeMessage);
      else { setOpen(false); router.refresh(); }
    });
  };
  return <>
    {!item ? <Button type="button" variant="primary" leadingIcon={<Plus aria-hidden="true" />} onClick={() => { setType("material"); setError(null); setOpen(true); }}>Add library item</Button> : null}
    <Dialog open={open} onOpenChange={setOpen} title={item ? "Edit library item" : "Add library item"} description="Library items can be used as recommendations in BQ templates." size="md">
      <form onSubmit={submit} className="grid gap-4">
        {error ? <InlineError>{error}</InlineError> : null}
        <input type="hidden" name="operation" value={item ? "update" : "create"} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="id" value={item?.id ?? ""} />
        <Field label="Type" required><Select name="typeSelector" value={type} onChange={(event) => setType(event.target.value as ItemType)} disabled={Boolean(item)}><option value="material">Material</option><option value="labor">Upah</option><option value="material_labor">Material + Upah</option><option value="custom">Custom cost</option></Select></Field>
        <Field label="Name" required><Input name="name" defaultValue={item?.name} maxLength={160} required autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
          <Field label="Purchase unit" required><Input name="purchaseUnit" defaultValue={item?.purchaseUnit} placeholder="m2, hour, lot" required /></Field>
          <Field label="Base unit"><Input name="baseUnit" defaultValue={item?.baseUnit ?? ""} placeholder="Optional" disabled={type === "custom"} /></Field>
          <Field label="Price" required><Input name="harga" defaultValue={item?.harga ?? "0"} inputMode="decimal" required /></Field>
          <Field label="Currency" required><Input name="currency" defaultValue={item?.currency ?? "IDR"} maxLength={3} required /></Field>
          <Field label="Default coefficient" required><Input name="defaultKoefisien" defaultValue={item?.defaultKoefisien ?? "1"} inputMode="decimal" required /></Field>
          <Field label="Category" required><Select name="kategori" defaultValue={item?.kategori ?? (type === "custom" ? "BIAYA_UMUM" : "MATERIAL")}><option value="MATERIAL">Material</option><option value="UPAH">Upah</option><option value="MATERIAL_UPAH">Material + Upah</option><option value="BIAYA_UMUM">Biaya Umum</option><option value="TRANSPORTASI_AKOMODASI">Transportasi / Akomodasi</option><option value="ALAT">Alat</option></Select></Field>
        </div>
        <Field label="Notes"><Textarea name="notes" defaultValue={item?.notes ?? ""} maxLength={2000} /></Field>
        <FormActions><Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? <Spinner /> : item ? "Save changes" : "Add item"}</Button></FormActions>
      </form>
    </Dialog>
  </>;
}

export function TemplateCreateButton() {
  return <TemplateDialog />;
}

export function TemplateActions({ template }: { template: BqTemplateRead }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const command = useCommand();
  const run = (operation: "duplicate" | "delete") => {
    const data = new FormData(); data.set("operation", operation); data.set("id", template.id); data.set("name", template.name); data.set("description", template.description ?? "");
    command.startTransition(async () => { const result = await templateAction(null, data); if (!result.ok) command.setError(result.error.safeMessage); else command.router.refresh(); });
  };
  return <div className="flex flex-wrap gap-1">
    <Button type="button" size="sm" variant="ghost" title="Edit template" onClick={() => setEditOpen(true)}><Pencil size={15} aria-hidden="true" /></Button>
    <Button type="button" size="sm" variant="ghost" title="Duplicate template" onClick={() => run("duplicate")} disabled={command.pending}><Copy size={15} aria-hidden="true" /></Button>
    <Button type="button" size="sm" variant="ghost" title="Delete template" onClick={() => setDeleteOpen(true)} disabled={command.pending}><Trash2 size={15} aria-hidden="true" /></Button>
    {command.error ? <InlineError>{command.error}</InlineError> : null}
    <TemplateDialog template={template} open={editOpen} onOpenChange={setEditOpen} />
    <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={`Delete ${template.name}?`} description={command.error ?? "This template and its scaffold sections will be permanently removed."} confirmLabel="Delete" tone="danger" pending={command.pending} onConfirm={() => { run("delete"); setDeleteOpen(false); }} />
  </div>;
}

function TemplateDialog({ template, open: controlledOpen, onOpenChange }: { template?: BqTemplateRead; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => (onOpenChange ? onOpenChange(next) : setInternalOpen(next));
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(null); const data = new FormData(event.currentTarget); startTransition(async () => { const result = await templateAction(null, data); if (!result.ok) setError(result.error.safeMessage); else { setOpen(false); router.refresh(); } }); };
  return <>
    {!template ? <Button type="button" variant="primary" leadingIcon={<Plus aria-hidden="true" />} onClick={() => { setError(null); setOpen(true); }}>Add template</Button> : null}
    <Dialog open={open} onOpenChange={setOpen} title={template ? "Edit template" : "Add template"} description="A template is a reusable section and subsection scaffold for new BQ projects." size="sm">
      <form onSubmit={submit} className="grid gap-4">
        {error ? <InlineError>{error}</InlineError> : null}
        <input type="hidden" name="operation" value={template ? "update" : "create"} /><input type="hidden" name="id" value={template?.id ?? ""} />
        <Field label="Template name" required><Input name="name" defaultValue={template?.name} maxLength={160} required autoFocus /></Field>
        <Field label="Description"><Textarea name="description" defaultValue={template?.description ?? ""} maxLength={2000} /></Field>
        <FormActions><Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? <Spinner /> : template ? "Save changes" : "Add template"}</Button></FormActions>
      </form>
    </Dialog>
  </>;
}
