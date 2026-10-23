"use client";

import { Copy, Trash2, X } from "lucide-react";
import { useState } from "react";
import { shownOptionOf, type ScheduleEntryView } from "@/apps/studioflow/domain/schedule";
import {
  Button,
  Dialog,
  Field,
  IconButton,
  InlineError,
  Input,
  type RowActionItem,
  Select,
  Text,
  Textarea,
} from "@/platform/ui_engine";
import { importScheduleCsvAction, scheduleImportTemplateAction, moveScheduleEntryToCategoryAction } from "../../../actions";
import { type Command, Footer, type Section, Thumb } from "./schedule-shared";

/** The inspector while several items are ticked: what is picked, and what can be done with all of them at once. */
export function BulkPanel({ picked, total, allPicked, onToggleAll, onClear, onDelete, onCopy, marks, brandLinks, deleting }: { picked: readonly ScheduleEntryView[]; total: number; allPicked: boolean; onToggleAll: () => void; onClear: () => void; onDelete: () => void; onCopy: () => void; marks: readonly RowActionItem[]; brandLinks: readonly RowActionItem[]; deleting: boolean }) {
  const count = picked.length;
  const items = `${count} item${count === 1 ? "" : "s"}`;
  return (
    <>
      <header className="flex shrink-0 items-center gap-1 border-b border-line-subtle py-2.5 pl-4 pr-2">
        <h2 className="m-0 mr-auto text-base font-semibold text-ink" role="status">{count} selected</h2>
        <Button size="sm" variant="ghost" onClick={onToggleAll}>{allPicked ? "Clear all" : `Select all ${total}`}</Button>
        <IconButton size="sm" variant="ghost" label="Clear selection" icon={<X aria-hidden="true" />} onClick={onClear} />
      </header>
      <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain p-4">
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Selected items">
          {picked.map((entry) => {
            const shown = shownOptionOf(entry);
            return (
              <li key={entry.id} className="inline-flex max-w-full items-center gap-1.5 rounded-action bg-surface-muted py-1 pl-1 pr-2 text-xs">
                <Thumb url={shown?.imageUrl ?? null} alt="" className="h-6 w-5" />
                <span className="font-ui-mono font-semibold tabular-nums text-ink">{entry.code}</span>
                <span className="truncate text-ink-secondary">{shown?.productName ?? "No product yet"}</span>
              </li>
            );
          })}
        </ul>
        {brandLinks.length ? (
          <div className="grid gap-2 rounded-control border border-line-subtle p-3">
            <Text size="sm" weight="semibold">Brand not in Master Data</Text>
            <Text size="sm" tone="secondary">These items share a typed Brand that now exists in Master Data. Linking uses the Master Data Brand and its contacts.</Text>
            <div className="flex flex-wrap gap-1.5">
              {brandLinks.map((link) => <Button key={link.label} size="sm" variant="secondary" onClick={link.onSelect}>{link.label}</Button>)}
            </div>
          </div>
        ) : null}
        {marks.length ? (
          <div className="grid gap-2 rounded-control border border-line-subtle p-3">
            <Text size="sm" weight="semibold">Hide or highlight</Text>
            <div className="flex flex-wrap items-center gap-1.5">
              {marks.filter((mark) => !mark.items).map((mark) => <Button key={mark.label} size="sm" variant="secondary" leadingIcon={mark.icon} onClick={mark.onSelect}>{mark.label} {items}</Button>)}
              {marks.flatMap((mark) => mark.items ?? []).map((choice) => (
                <IconButton key={choice.label} size="sm" variant="ghost" label={`Highlight ${items}: ${choice.label}`} icon={choice.icon} onClick={choice.onSelect} />
              ))}
            </div>
          </div>
        ) : null}
        <div className="grid gap-2 rounded-control border border-line-subtle p-3">
          <Text size="sm" weight="semibold">Copy for the sheet</Text>
          <Text size="sm" tone="secondary">Rows come in the sheet&apos;s column order, ready to paste. Photos are copied one at a time from each row&apos;s menu.</Text>
          <Button size="sm" variant="secondary" className="justify-self-start" leadingIcon={<Copy className="h-3.5 w-3.5" />} onClick={onCopy}>Copy {items}</Button>
        </div>
        <div className="grid gap-2 rounded-control border border-danger-line bg-danger-surface p-3">
          <Text size="sm" weight="semibold" className="text-danger">Delete {items}</Text>
          <Text size="sm" tone="secondary">Each item and all its options are removed. Their codes are left empty; other codes do not shift.</Text>
          <Button size="sm" variant="danger-primary" className="justify-self-start" leadingIcon={<Trash2 className="h-3.5 w-3.5" />} pending={deleting} onClick={onDelete}>Delete {items}</Button>
        </div>
      </div>
    </>
  );
}

// ── Move / import ────────────────────────────────────────────────────────────

export function MoveDialog({ projectId, entry, categories, command, onClose }: { projectId: string; entry: ScheduleEntryView; categories: string[]; command: Command; onClose: () => void }) {
  const [category, setCategory] = useState("");
  const key = `${entry.id}-recategorize`;
  const pending = command.isPending(key);
  const save = async () => {
    const ok = await command.run(key, () => moveScheduleEntryToCategoryAction({ projectId, entryId: entry.id, category: category.trim() }));
    if (ok) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title={`Move ${entry.code} to another category`}
      description="The item gets the next code in the target category. Its old code is left empty; other codes do not change."
      size="sm"
      dismissible={!pending}
      footer={<Footer><Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button><Button variant="primary" pending={pending} disabled={!category.trim() || category.trim() === entry.category} onClick={save}>Move</Button></Footer>}
    >
      <div className="grid gap-2">
        <Field label="Target category" required>
          <Input list="schedule-move-categories" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={80} autoFocus />
        </Field>
        <datalist id="schedule-move-categories">{categories.filter((c) => c !== entry.category).map((c) => <option key={c} value={c} />)}</datalist>
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Dialog>
  );
}

export function ImportDialog({ projectId, section, command, onClose }: { projectId: string; section: Section; command: Command; onClose: () => void }) {
  const [target, setTarget] = useState<Section>(section);
  const [csv, setCsv] = useState("");
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  /** WO-SF-CATEGORY-SIMILAR-01: the user confirms that look-alike new categories in the file are intended. */
  const [acceptNewCategories, setAcceptNewCategories] = useState(false);
  const pending = command.isPending("import");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setCsv("");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    setFile({ name: file.name, base64: btoa(binary) });
  };

  const downloadTemplate = async (format: "xlsx" | "csv") => {
    await command.run("import-template", () => scheduleImportTemplateAction({ projectId, format }), (data) => {
      const { filename, mimeType, base64 } = data as { filename: string; mimeType: string; base64: string };
      const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], { type: mimeType }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    });
  };

  const submit = async () => {
    setResult(null);
    await command.run("import", () => importScheduleCsvAction({ projectId, section: target, acceptNewCategories, ...(file ? { file } : { csv }) }), (data) => setResult(data as { created: number; updated: number }));
  };

  return (
    <Dialog
      open
      onOpenChange={(value) => { if (!value) onClose(); }}
      title="Import schedule"
      description="Use an Excel (.xlsx) or CSV file: the Google Sheets export, or the plain template. Rows whose code already exists update that item's brand, type and notes (its photo, other specs and final choice stay). New codes are added under the same code."
      size="lg"
      dismissible={!pending}
      footer={<Footer><Button variant="ghost" onClick={onClose} disabled={pending}>{result ? "Close" : "Cancel"}</Button><Button variant="primary" pending={pending} disabled={!file && !csv.trim()} onClick={submit}>Import</Button></Footer>}
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sheet">
            <Select value={target} onChange={(e) => setTarget(e.target.value as Section)}>
              <option value="MATERIAL">Material (needs a Product Category column)</option>
              <option value="FIXTURE">Fixture</option>
            </Select>
          </Field>
          <Field label="Excel or CSV file" description={fileName ?? undefined}>
            <Input type="file" accept=".xlsx,.csv,text/csv" onChange={(e) => void pick(e.target.files?.[0])} />
          </Field>
        </div>
        <Field label="Or paste CSV">
          <Textarea rows={6} value={csv} onChange={(e) => { setCsv(e.target.value); setFileName(null); setFile(null); }} placeholder={"Code,Product Category,Ex,Type,Initials Type,Image,Location,Contact,Qty,Unit"} className="font-ui-mono text-xs" />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Text size="sm" tone="secondary">Need a blank sheet?</Text>
          <Button variant="ghost" size="sm" pending={command.isPending("import-template")} onClick={() => void downloadTemplate("xlsx")}>Excel template</Button>
          <Button variant="ghost" size="sm" pending={command.isPending("import-template")} onClick={() => void downloadTemplate("csv")}>CSV template</Button>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={acceptNewCategories} onChange={(event) => setAcceptNewCategories(event.target.checked)} />
          <span>Kategori baru di file ini memang dimaksudkan<span className="block text-xs text-ink-tertiary">Biarkan kosong: import berhenti dulu kalau ada kategori baru yang mirip kategori studio (misalnya HPL vs High Pressure Laminate).</span></span>
        </label>
        {result ? <Text size="sm">Imported: {result.created} new, {result.updated} updated.</Text> : null}
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Dialog>
  );
}
