"use client";
import { IconButton } from "@/platform/ui_engine";
import { DraftDialog,useFormDraftGuard } from "@/platform/ui_engine";

import { Copy,Pencil,Plus,Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef,useState,useTransition,type FormEvent } from "react";

import type { BqAssemblyLineRead,BqAssemblyTemplateDetail,BqAssemblyTemplateRead,BqLibItemRead,BqTemplateRead } from "@/apps/bq/public";
import type { UnitRead } from "@/apps/masterdata/public";
import { Button,ConfirmDialog,Field,FormActions,InlineError,Input,RowActionMenu,Select,Textarea } from "@/platform/ui_engine";
import { addAssemblyLineAction,createAssemblyAction,deleteAssemblyAction,deleteAssemblyLineAction,getAssemblyDetailAction,libraryItemAction,templateAction,updateAssemblyAction,updateAssemblyLineAction } from "./actions";

type ItemType = BqLibItemRead["type"];
function useCommand() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return { pending, startTransition, error, setError, router };
}

export function LibraryItemCreateButton({ units }: { units: UnitRead[] }) {
  return <LibraryItemDialog units={units} />;
}

export function AssemblyCreateButton() {
  const [open, setOpen] = useState(false); const [error, setError] = useState<string | null>(null); const [pending, startTransition] = useTransition(); const router = useRouter();
  return <><Button type="button" variant="primary" leadingIcon={<Plus aria-hidden="true" />} onClick={() => setOpen(true)}>Add assembly</Button><DraftDialog pending={pending} open={open} onOpenChange={setOpen} title="Add Assembly Template" description="Reusable Component Group breakdown. Its Cost Components are copied into each project." size="sm"><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(async () => { const result = await createAssemblyAction(null, data); if (!result.ok) setError(result.error.safeMessage); else { setOpen(false); router.refresh(); } }); }}>{error ? <InlineError>{error}</InlineError> : null}<Field label="Name" required><Input name="name" required maxLength={160} autoFocus /></Field><Field label="Description"><Textarea name="description" maxLength={2000} /></Field><FormActions><Button data-dialog-cancel type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" pending={pending}>Add assembly</Button></FormActions></form></DraftDialog></>;
}

export function LibraryItemActions({ item, units }: { item: BqLibItemRead; units: UnitRead[] }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  return (
    <div className="flex justify-end gap-1">
      <RowActionMenu label={`Actions for ${item.name}`} items={[
        { label: "Edit", onSelect: () => setEditOpen(true) },
        { label: "Delete", danger: true, separatorBefore: true, onSelect: () => setDeleteOpen(true) },
      ]} />
      <DeleteItemDialog item={item} open={deleteOpen} onOpenChange={setDeleteOpen} />
      <LibraryItemDialog item={item} units={units} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

function DeleteItemDialog({ item, open, onOpenChange }: { item: BqLibItemRead; open: boolean; onOpenChange: (open: boolean) => void }) {
  const command = useCommand();
  const submit = () => {
    const data = new FormData();
    data.set("operation", "delete"); data.set("type", item.type); data.set("id", item.id);
    data.set("name", item.name); data.set("purchaseUnit", item.purchaseUnit); data.set("harga", item.harga);
    data.set("currency", item.currency); data.set("defaultKoefisien", item.defaultKoefisien);
    command.startTransition(async () => {
      const result = await libraryItemAction(null, data);
      if (!result.ok) command.setError(result.error.safeMessage);
      else { onOpenChange(false); command.router.refresh(); }
    });
  };
  return <>
    <ConfirmDialog open={open} onOpenChange={onOpenChange} title={`Delete ${item.name}?`} error={command.error} description={"This library item will be permanently removed."} confirmLabel="Delete" tone="danger" pending={command.pending} onConfirm={submit} />
  </>;
}

function LibraryItemDialog({ item, units, open: controlledOpen, onOpenChange }: { item?: BqLibItemRead; units: UnitRead[]; open?: boolean; onOpenChange?: (open: boolean) => void }) {
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
    <DraftDialog pending={pending} open={open} onOpenChange={setOpen} title={item ? "Edit library item" : "Add library item"} description="Library items can be used as recommendations in BQ templates." size="md">
      <form onSubmit={submit} className="grid gap-4">
        {error ? <InlineError>{error}</InlineError> : null}
        <input type="hidden" name="operation" value={item ? "update" : "create"} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="id" value={item?.id ?? ""} />
        <Field label="Type" required><Select name="typeSelector" value={type} onChange={(event) => setType(event.target.value as ItemType)} disabled={Boolean(item)}><option value="material">Material</option><option value="labor">Labor</option><option value="material_labor">Material + Labor</option><option value="custom">Other Cost</option></Select></Field>
        <Field label="Name" required><Input name="name" defaultValue={item?.name} maxLength={160} required autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
          <Field label="Purchase unit" required><Select name="purchaseUnit" defaultValue={item?.purchaseUnit ?? units[0]?.code ?? ""} required>{units.map((unit) => <option key={unit.id} value={unit.code}>{unit.code} — {unit.name}</option>)}</Select></Field>
          <Field label="Base unit"><Select name="baseUnit" defaultValue={item?.baseUnit ?? ""} disabled={type === "custom"}><option value="">None</option>{units.map((unit) => <option key={unit.id} value={unit.code}>{unit.code} — {unit.name}</option>)}</Select></Field>
          <Field label="Price" required><Input name="harga" defaultValue={item?.harga ?? "0"} inputMode="decimal" required /></Field>
          <Field label="Currency" required><Input name="currency" defaultValue={item?.currency ?? "IDR"} maxLength={3} required /></Field>
          <input type="hidden" name="defaultKoefisien" value={item?.defaultKoefisien ?? "1"} />
          {type === "custom" ? <Field label="Category" required><Select name="kategori" defaultValue={item?.kategori ?? "BIAYA_UMUM"}><option value="BIAYA_UMUM">Biaya Umum</option><option value="TRANSPORTASI_AKOMODASI">Transportasi &amp; Akomodasi</option><option value="ALAT">Alat</option></Select></Field> : <Field label="Category"><Input value={type === "material" ? "Material" : type === "labor" ? "Labor" : "Material + Labor"} disabled /></Field>}
        </div>
        <Field label="Notes"><Textarea name="notes" defaultValue={item?.notes ?? ""} maxLength={2000} /></Field>
        <FormActions><Button data-dialog-cancel type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button type="submit" variant="primary" pending={pending}>{item ? "Save changes" : "Add item"}</Button></FormActions>
      </form>
    </DraftDialog>
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
    command.startTransition(async () => { const result = await templateAction(null, data); if (!result.ok) command.setError(result.error.safeMessage); else { setDeleteOpen(false); command.router.refresh(); } });
  };
  return <div className="flex flex-wrap gap-1">
    <IconButton type="button" size="sm" variant="ghost"   onClick={() => setEditOpen(true)} label="Edit template" icon={<Pencil size={15} aria-hidden="true" />} />
    <IconButton type="button" size="sm" variant="ghost"   onClick={() => run("duplicate")} disabled={command.pending} label="Duplicate template" icon={<Copy size={15} aria-hidden="true" />} />
    <IconButton type="button" size="sm" variant="ghost"   onClick={() => setDeleteOpen(true)} disabled={command.pending} label="Delete template" icon={<Trash2 size={15} aria-hidden="true" />} />
    {command.error ? <InlineError>{command.error}</InlineError> : null}
    <TemplateDialog template={template} open={editOpen} onOpenChange={setEditOpen} />
    <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={`Delete ${template.name}?`} error={command.error} description={"This template and its scaffold sections will be permanently removed."} confirmLabel="Delete" tone="danger" pending={command.pending} onConfirm={() => run("delete")} />
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
    <DraftDialog pending={pending} open={open} onOpenChange={setOpen} title={template ? "Edit template" : "Add template"} description="A template is a reusable section and subsection scaffold for new BQ projects." size="sm">
      <form onSubmit={submit} className="grid gap-4">
        {error ? <InlineError>{error}</InlineError> : null}
        <input type="hidden" name="operation" value={template ? "update" : "create"} /><input type="hidden" name="id" value={template?.id ?? ""} />
        <Field label="Template name" required><Input name="name" defaultValue={template?.name} maxLength={160} required autoFocus /></Field>
        <Field label="Description"><Textarea name="description" defaultValue={template?.description ?? ""} maxLength={2000} /></Field>
        <FormActions><Button data-dialog-cancel type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button type="submit" variant="primary" pending={pending}>{template ? "Save changes" : "Add template"}</Button></FormActions>
      </form>
    </DraftDialog>
  </>;
}

// ─── ASSEMBLY CRUD ───────────────────────────────────────────────────────────

export function AssemblyActions({ assembly }: { assembly: BqAssemblyTemplateRead }) {
  const [editOpen, setEditOpen] = useState(false);
  const [linesOpen, setLinesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [detail, setDetail] = useState<BqAssemblyTemplateDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const command = useCommand();

  const openLines = () => {
    setLoadError(null);
    setLinesOpen(true);
    getAssemblyDetailAction(assembly.id).then((d) => {
      if (!d) setLoadError("Gagal memuat assembly");
      else setDetail(d);
    }).catch(() => setLoadError("Gagal memuat assembly"));
  };

  const runDelete = () => {
    const data = new FormData();
    data.set("id", assembly.id);
    command.startTransition(async () => {
      const result = await deleteAssemblyAction(null, data);
      if (!result.ok) command.setError(result.error.safeMessage);
      else { setDeleteOpen(false); command.router.refresh(); }
    });
  };

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      <IconButton type="button" size="sm" variant="ghost"  onClick={() => { command.setError(null); setEditOpen(true); }} label="Edit nama/deskripsi" icon={<Pencil size={14} aria-hidden="true" />} />
      <IconButton type="button" size="sm" variant="ghost" onClick={openLines} label="Manage Cost Components" icon={<Plus size={14} aria-hidden="true" />} />
      <IconButton type="button" size="sm" variant="ghost"  onClick={() => { command.setError(null); setDeleteOpen(true); }} disabled={command.pending} label="Hapus assembly" icon={<Trash2 size={14} aria-hidden="true" />} />

      {/* Edit name/desc dialog */}
      <DraftDialog pending={command.pending} open={editOpen} onOpenChange={setEditOpen} title="Edit Assembly" size="sm">
        <form className="grid gap-4" onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          command.startTransition(async () => {
            const result = await updateAssemblyAction(null, data);
            if (!result.ok) command.setError(result.error.safeMessage);
            else { setEditOpen(false); command.router.refresh(); }
          });
        }}>
          {command.error ? <InlineError>{command.error}</InlineError> : null}
          <input type="hidden" name="id" value={assembly.id} />
          <Field label="Nama" required><Input name="name" defaultValue={assembly.name} required maxLength={160} autoFocus /></Field>
          <Field label="Deskripsi"><Textarea name="description" defaultValue={assembly.description ?? ""} maxLength={2000} /></Field>
          <FormActions>
            <Button data-dialog-cancel type="button" variant="ghost" onClick={() => setEditOpen(false)}>Batal</Button>
            <Button type="submit" variant="primary" pending={command.pending}>Simpan</Button>
          </FormActions>
        </form>
      </DraftDialog>

      {/* Lines editor dialog */}
      <DraftDialog open={linesOpen} onOpenChange={setLinesOpen} title={`Cost Components — ${assembly.name}`} size="lg" description="Each Cost Component is copied into the project when this assembly is applied.">
        {loadError ? <InlineError>{loadError}</InlineError> : detail ? (
          <AssemblyLineList detail={detail} onRefresh={() => {
            getAssemblyDetailAction(assembly.id).then((d) => { if (d) setDetail(d); }).catch(() => setLoadError("Gagal memuat ulang assembly. Tutup dan buka kembali untuk mencoba lagi."));
            command.router.refresh();
          }} />
        ) : <div className="py-8 text-center text-sm text-ink-secondary">Memuat…</div>}
      </DraftDialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus "${assembly.name}"?`}
        error={command.error} description={"Assembly ini akan dihapus permanen beserta semua barisnya. Proyek yang sudah menggunakannya tidak terpengaruh."}
        confirmLabel="Hapus"
        tone="danger"
        pending={command.pending}
        onConfirm={runDelete}
      />
    </div>
  );
}

function AssemblyLineList({ detail, onRefresh }: { detail: BqAssemblyTemplateDetail; onRefresh: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const router = useRouter();

  const addLine = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    data.set("assemblyId", detail.id);
    startTransition(async () => {
      const result = await addAssemblyLineAction(null, data);
      if (!result.ok) setError(result.error.safeMessage);
      else { setAddOpen(false); setError(null); onRefresh(); }
    });
  };

  const deleteLine = (lineId: string) => {
    const data = new FormData();
    data.set("lineId", lineId);
    startTransition(async () => {
      const result = await deleteAssemblyLineAction(null, data);
      if (!result.ok) setError(result.error.safeMessage);
      else onRefresh();
    });
  };

  return (
    <div className="grid gap-4">
      {error ? <InlineError>{error}</InlineError> : null}
      {detail.lines.length === 0 ? (
        <p className="text-sm text-ink-secondary">No Cost Components yet. Add one below.</p>
      ) : (
        <div className="divide-y divide-line">
          {detail.lines.map((line) => (
            <AssemblyLineRow key={line.id} line={line} assemblyId={detail.id} pending={pending} onDelete={() => deleteLine(line.id)} onSaved={onRefresh} />
          ))}
        </div>
      )}

      {addOpen ? (
        <form className="grid gap-3 rounded-control border border-line p-3" onSubmit={addLine}>
          <div className="font-medium text-sm">New Cost Component</div>
          <div className="grid grid-cols-2 gap-2 max-[480px]:grid-cols-1">
            <Field label="Nama item" required><Input name="title" required maxLength={200} autoFocus /></Field>
            <Field label="Unit"><Input name="purchaseUnit" placeholder="m2, lot" defaultValue="ls" /></Field>
            <Field label="Harga"><Input name="harga" inputMode="decimal" defaultValue="0" /></Field>
            <Field label="Qty"><Input name="qty" inputMode="decimal" defaultValue="1" /></Field>
            <Field label="Koefisien"><Input name="koefisien" inputMode="decimal" defaultValue="1" /></Field>
            <Field label="Kategori">
              <Select name="kategori" defaultValue="MATERIAL">
                <option value="MATERIAL">Material</option>
                <option value="UPAH">Labor</option>
                <option value="MATERIAL_UPAH">Material + Labor</option>
                <option value="BIAYA_UMUM">Biaya Umum</option>
                <option value="TRANSPORTASI_AKOMODASI">Transportasi</option>
                <option value="ALAT">Alat</option>
              </Select>
            </Field>
          </div>
          <FormActions>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Batal</Button>
            <Button type="submit" variant="primary" size="sm" pending={pending}>Tambah baris</Button>
          </FormActions>
        </form>
      ) : (
        <Button type="button" variant="secondary" size="sm" leadingIcon={<Plus aria-hidden="true" />} onClick={() => setAddOpen(true)}>
          Tambah baris
        </Button>
      )}
    </div>
  );
}

function AssemblyLineRow({ line, assemblyId: _assemblyId, pending, onDelete, onSaved }: { line: BqAssemblyLineRead; assemblyId: string; pending: boolean; onDelete: () => void; onSaved: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, startTransition] = useTransition();

  const formRef = useRef<HTMLFormElement>(null);
  const draft = useFormDraftGuard({ formRef, resetKey: line.id, active: editOpen });
  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    data.set("lineId", line.id);
    startTransition(async () => {
      const result = await updateAssemblyLineAction(null, data);
      if (!result.ok) setError(result.error.safeMessage);
      else { draft.markSaved(); setEditOpen(false); setError(null); onSaved(); }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{line.title}</div>
        <div className="text-xs text-ink-secondary">{line.purchaseUnit} · qty {line.qty} · koef {line.koefisien} · {line.harga}</div>
      </div>
      <IconButton type="button" size="sm" variant="ghost"  onClick={() => { setError(null); setEditOpen(true); }} label="Edit baris" icon={<Pencil size={13} aria-hidden="true" />} />
      <IconButton type="button" size="sm" variant="ghost"  onClick={() => setDeleteOpen(true)} disabled={pending} label="Hapus baris" icon={<Trash2 size={13} aria-hidden="true" />} />

      {editOpen ? <div className="basis-full border-t border-line pt-3">
        <form ref={formRef} onChange={draft.onFormChange} className="grid gap-3" onSubmit={save}>
          {error ? <InlineError>{error}</InlineError> : null}
          <div className="grid grid-cols-2 gap-2 max-[480px]:grid-cols-1">
            <Field label="Nama item" required><Input name="title" defaultValue={line.title} required maxLength={200} autoFocus /></Field>
            <Field label="Unit"><Input name="purchaseUnit" defaultValue={line.purchaseUnit} /></Field>
            <Field label="Harga"><Input name="harga" defaultValue={line.harga} inputMode="decimal" /></Field>
            <Field label="Qty"><Input name="qty" defaultValue={line.qty} inputMode="decimal" /></Field>
            <Field label="Koefisien"><Input name="koefisien" defaultValue={line.koefisien} inputMode="decimal" /></Field>
            <Field label="Kategori">
              <Select name="kategori" defaultValue={line.kategori}>
                <option value="MATERIAL">Material</option>
                <option value="UPAH">Labor</option>
                <option value="MATERIAL_UPAH">Material + Labor</option>
                <option value="BIAYA_UMUM">Biaya Umum</option>
                <option value="TRANSPORTASI_AKOMODASI">Transportasi</option>
                <option value="ALAT">Alat</option>
              </Select>
            </Field>
          </div>
          <Field label="Catatan"><Input name="notes" defaultValue={line.notes ?? ""} /></Field>
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => void draft.requestDiscard(() => setEditOpen(false))}>Batal</Button>
            <Button type="submit" variant="primary" pending={editing}>Simpan</Button>
          </FormActions>
        </form>
      </div> : null}
      {draft.confirmDialog}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus baris ini?"
        description="This Assembly Cost Component will be permanently removed."
        confirmLabel="Hapus"
        tone="danger"
        pending={pending}
        onConfirm={onDelete}
      />
    </div>
  );
}
