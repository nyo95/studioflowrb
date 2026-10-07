"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { formatInstant } from "@platform/utilities/date";
import type { SampleRead } from "@/apps/masterdata/public";
import {
  Button,
  ContextActionMenu,
  CreatableSearch,
  DataTable,
  DirectoryShell,
  DraftDialog,
  Drawer,
  EmptyState,
  Field,
  FilterChip,
  FormActions,
  GroupHeader,
  InlineError,
  Input,
  PageHeader,
  PillTabs,
  RowActionMenu,
  SearchField,
  StatusBadge,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Text,
  Textarea,
  useConfirm,
  type RowActionItem,
  type SemanticTone,
} from "@/platform/ui_engine";

import { ShelfSkuPicker, type ShelfSkuRefs } from "./shelf-sku-dialog";
import { createSampleAction, deleteSampleAction, getSampleHistoryAction, setSampleStatusAction, updateSampleLocationAction } from "./actions";

type Status = SampleRead["status"];
type SkuChoice = { id: string; name: string | null; code: string | null; brandName: string | null };
type ProjectChoice = { id: string; name: string };
type Movement = { id: string; kind: string; statusAfter: Status; holderName: string | null; holderProjectName: string | null; fromRack: string | null; fromBox: string | null; toRack: string | null; toBox: string | null; note: string | null; actorLabel: string; createdAt: Date };
type ActionResultLike = { ok: boolean; error?: { safeMessage?: string } };

const STATUS: Record<Status, { label: string; tone: SemanticTone }> = {
  AVAILABLE: { label: "On the shelf", tone: "success" },
  BORROWED: { label: "Borrowed", tone: "warning" },
  SENT_TO_CLIENT: { label: "With a client", tone: "warning" },
  LOST: { label: "Lost", tone: "danger" },
  DISCARDED: { label: "Discarded", tone: "neutral" },
};
const STATUS_ORDER: Status[] = ["AVAILABLE", "BORROWED", "SENT_TO_CLIENT", "LOST", "DISCARDED"];
/** Held statuses name who has the sample (legacy rule: a sample out without a name is a lost sample). */
const HELD = new Set<Status>(["BORROWED", "SENT_TO_CLIENT"]);

const MOVEMENT_LABEL: Record<string, string> = {
  IN: "Put on the shelf",
  OUT: "Went out",
  RETURN: "Back on the shelf",
  STATUS: "Status changed",
  MOVED: "Moved",
  REMOVED: "Removed from the shelf",
};

type Filter = "ALL" | "AVAILABLE" | "BORROWED" | "SENT_TO_CLIENT" | "OFF";

function productLabel(sample: Pick<SampleRead, "skuCode" | "skuName">): string {
  return [sample.skuCode, sample.skuName].filter(Boolean).join(" · ") || "Unnamed SKU";
}

/** Rack and box sort as a person reads a shelf: "BOX 2" before "BOX 10". */
const naturally = (a: string, b: string) => a.localeCompare(b, "id-ID", { numeric: true });

export function SampleShelf({ samples, skus, skuRefs, projects, canManage }: { samples: SampleRead[]; skus: readonly SkuChoice[]; skuRefs: ShelfSkuRefs | null; projects: readonly ProjectChoice[]; canManage: boolean }) {
  const { locale, timezone } = useDisplaySettings();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [view, setView] = useState<"rack" | "list">("rack");
  const [form, setForm] = useState<{ sample: SampleRead | null } | null>(null);
  const [statusTarget, setStatusTarget] = useState<SampleRead | null>(null);
  const [historyTarget, setHistoryTarget] = useState<SampleRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const racks = useMemo(() => [...new Set(samples.map((sample) => sample.rack))].sort(naturally), [samples]);
  const counts = useMemo(() => ({
    ALL: samples.length,
    AVAILABLE: samples.filter((s) => s.status === "AVAILABLE").length,
    BORROWED: samples.filter((s) => s.status === "BORROWED").length,
    SENT_TO_CLIENT: samples.filter((s) => s.status === "SENT_TO_CLIENT").length,
    OFF: samples.filter((s) => s.status === "LOST" || s.status === "DISCARDED").length,
  }), [samples]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("id-ID");
    return samples
      .filter((s) => filter === "ALL" || (filter === "OFF" ? s.status === "LOST" || s.status === "DISCARDED" : s.status === filter))
      .filter((s) => !q || [s.rack, s.box, s.skuCode, s.skuName, s.brandName, s.holderName, s.holderProjectName, s.locationNote].some((v) => v?.toLocaleLowerCase("id-ID").includes(q)))
      .sort((a, b) => naturally(a.rack, b.rack) || naturally(a.box, b.box) || productLabel(a).localeCompare(productLabel(b)));
  }, [samples, query, filter]);
  const byRack = useMemo(() => {
    const groups = new Map<string, SampleRead[]>();
    for (const sample of visible) groups.set(sample.rack, [...(groups.get(sample.rack) ?? []), sample]);
    return [...groups.entries()];
  }, [visible]);

  function run(key: string, command: () => Promise<ActionResultLike>, onSuccess?: () => void) {
    if (pending) return;
    setPending(key);
    setError(null);
    startTransition(async () => {
      try {
        const result = await command();
        if (!result.ok) { setError(result.error?.safeMessage ?? "The action could not be completed."); return; }
        onSuccess?.();
      } catch {
        setError("The action could not be completed. Please try again.");
      } finally {
        setPending(null);
      }
    });
  }

  async function remove(sample: SampleRead) {
    const ok = await confirm.confirm({
      title: `Remove ${productLabel(sample)} from the shelf?`,
      description: `${sample.rack} / ${sample.box}. Its history is kept.`,
      confirmLabel: "Remove sample",
      tone: "danger",
    });
    if (ok) run(sample.id, () => deleteSampleAction(sample.id));
  }

  function itemsFor(sample: SampleRead): RowActionItem[] {
    const history = { label: "History", onSelect: () => setHistoryTarget(sample) };
    if (!canManage) return [history];
    return [
      { label: "Change status", onSelect: () => setStatusTarget(sample) },
      { label: "Move or edit", onSelect: () => setForm({ sample }) },
      history,
      // Legacy rule: a sample that is out cannot be removed; the item says why instead of failing.
      { label: HELD.has(sample.status) ? "Remove (return it first)" : "Remove", danger: true, separatorBefore: true, disabled: HELD.has(sample.status), onSelect: () => void remove(sample) },
    ];
  }

  function table(rows: SampleRead[], showRack: boolean) {
    return (
      <DataTable framed={false} density="compact" minWidth={760}>
        <TableHeader>
          <TableRow>
            {showRack ? <TableHead>Rack</TableHead> : null}
            <TableHead>Box</TableHead>
            <TableHead>Product</TableHead>
            <TableHead align="end">Qty</TableHead>
            <TableHead>Status</TableHead>
            <TableHead stickyEnd align="end"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((sample) => (
            <ContextActionMenu key={sample.id} items={itemsFor(sample)}>
              <TableRow>
                {showRack ? <TableCell className="font-ui-mono text-sm">{sample.rack}</TableCell> : null}
                <TableCell>
                  <span className="block font-ui-mono text-sm">{sample.box}</span>
                  {sample.locationNote ? <span className="block text-xs text-ink-tertiary">{sample.locationNote}</span> : null}
                </TableCell>
                <TableCell>
                  <span className="block font-medium text-ink">{productLabel(sample)}</span>
                  <span className="block text-xs text-ink-tertiary">
                    {[sample.brandName, sample.notes].filter(Boolean).join(" · ")}
                    {sample.skuArchived ? <span className="text-danger">{sample.brandName || sample.notes ? " · " : ""}SKU archived</span> : null}
                  </span>
                </TableCell>
                <TableCell align="end" className="tabular-nums">{sample.quantity}</TableCell>
                <TableCell>
                  <StatusBadge tone={STATUS[sample.status].tone}>{STATUS[sample.status].label}</StatusBadge>
                  {HELD.has(sample.status) ? (
                    <span className="block text-xs text-ink-tertiary">
                      {[sample.holderName, sample.holderProjectName].filter(Boolean).join(" · ")}
                      {sample.outSince ? ` · since ${formatInstant(sample.outSince, { locale, timeZone: timezone, style: "date" })}` : ""}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell stickyEnd align="end">
                  <RowActionMenu label={`Actions for ${productLabel(sample)}`} pending={pending === sample.id} items={itemsFor(sample)} />
                </TableCell>
              </TableRow>
            </ContextActionMenu>
          ))}
        </TableBody>
      </DataTable>
    );
  }

  const filters: Array<[Filter, string]> = [["ALL", "All"], ["AVAILABLE", "On the shelf"], ["BORROWED", "Borrowed"], ["SENT_TO_CLIENT", "With a client"], ["OFF", "Lost or discarded"]];

  return (
    <>
      <PageHeader
        title="Samples"
        description={`Physical samples in the office, by rack and box. ${racks.length} ${racks.length === 1 ? "rack" : "racks"} in use.`}
        actions={canManage ? <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setForm({ sample: null })}>Add sample</Button> : undefined}
        divider
      />
      <DirectoryShell
        surface
        header={error ? <InlineError>{error}</InlineError> : undefined}
        toolbar={
          <TableToolbar framed={false}>
            <SearchField value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Search rack, box, product, brand, holder, project…" />
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Status filter">
              {filters.map(([key, label]) => <FilterChip key={key} selected={filter === key} count={counts[key]} onClick={() => setFilter(key)}>{label}</FilterChip>)}
            </div>
            <PillTabs label="Sample view" items={[{ key: "rack", label: "By rack", active: view === "rack", onSelect: () => setView("rack") }, { key: "list", label: "List", active: view === "list", onSelect: () => setView("list") }]} />
          </TableToolbar>
        }
      >
        {visible.length === 0 ? (
          <EmptyState
            title={samples.length === 0 ? "No samples on the shelf yet" : "No samples match"}
            description={samples.length === 0 ? (canManage ? "Add a sample, or put a requested one on the shelf from Sample requests." : "Samples the studio keeps will appear here.") : "Try another search or status."}
            className="py-10"
          />
        ) : view === "list" ? table(visible, true) : (
          <div className="grid gap-6 p-(--ui-section-px)">
            {byRack.map(([rack, rows]) => (
              <section key={rack} className="grid gap-2" aria-label={rack}>
                <GroupHeader title={rack} count={rows.length} />
                {table(rows, false)}
              </section>
            ))}
          </div>
        )}
      </DirectoryShell>

      {form ? <SampleFormDialog key={form.sample?.id ?? "new"} sample={form.sample} skus={skus} skuRefs={skuRefs} racks={racks} pending={pending === "form"} error={error} onCancel={() => setForm(null)} onSubmit={(input) => run("form", () => (form.sample ? updateSampleLocationAction({ sampleId: form.sample.id, ...input }) : createSampleAction(input)), () => setForm(null))} /> : null}
      {statusTarget ? <StatusDialog key={statusTarget.id} sample={statusTarget} projects={projects} pending={pending === "status"} error={error} onCancel={() => setStatusTarget(null)} onSubmit={(input) => run("status", () => setSampleStatusAction({ sampleId: statusTarget.id, ...input }), () => setStatusTarget(null))} /> : null}
      {historyTarget ? <HistoryDrawer key={historyTarget.id} sample={historyTarget} onClose={() => setHistoryTarget(null)} /> : null}
      {confirm.dialog}
    </>
  );
}

type FormInput = { skuId: string; rack: string; box: string; quantity: number; locationNote?: string; notes?: string };

function SampleFormDialog({ sample, skus, skuRefs, racks, pending, error, onCancel, onSubmit }: { sample: SampleRead | null; skus: readonly SkuChoice[]; skuRefs: ShelfSkuRefs | null; racks: readonly string[]; pending: boolean; error: string | null; onCancel: () => void; onSubmit: (input: FormInput) => void }) {
  const [skuId, setSkuId] = useState(sample?.skuId ?? "");
  const [rack, setRack] = useState(sample?.rack ?? "");
  const [box, setBox] = useState(sample?.box ?? "");
  const [quantity, setQuantity] = useState(String(sample?.quantity ?? 1));
  const [locationNote, setLocationNote] = useState(sample?.locationNote ?? "");
  const [notes, setNotes] = useState(sample?.notes ?? "");
  const qty = Number(quantity);
  const qtyValid = Number.isInteger(qty) && qty >= 1 && qty <= 999;
  const valid = Boolean(skuId && rack.trim() && box.trim() && qtyValid);
  const rackOptions = [...new Set([...racks, ...(rack.trim() ? [rack] : [])])].map((name) => ({ id: name, label: name }));

  return (
    <DraftDialog
      open
      onOpenChange={(open) => { if (!open) onCancel(); }}
      title={sample ? "Move or edit sample" : "Add a sample"}
      description={sample ? productLabel(sample) : "A sample hangs off one SKU; brand and price come from the SKU."}
      pending={pending}
      watchedValue={JSON.stringify({ skuId, rack, box, quantity, locationNote, notes })}
    >
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit({ skuId, rack, box, quantity: qty, locationNote: locationNote.trim() || undefined, notes: notes.trim() || undefined }); }}>
        {error ? <InlineError>{error}</InlineError> : null}
        {sample ? null : (
          <Field label="Product (SKU)" required>
            <ShelfSkuPicker skus={skus} value={skuId} onChange={setSkuId} refs={skuRefs} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rack" required description="Saved in capitals, so “rak a” and “RAK A” are one rack.">
            <CreatableSearch label="Rack" options={rackOptions} value={rack} onValueChange={setRack} onCreate={(name) => name.trim()} createLabel={(name) => `New rack “${name}”`} placeholder="Pick or type a rack" searchPlaceholder="Search racks…" emptyLabel="No rack yet. Type a new one." className="w-full" />
          </Field>
          <Field label="Box" required>
            <Input value={box} onChange={(event) => setBox(event.target.value)} maxLength={40} placeholder="e.g. 3" />
          </Field>
        </div>
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <Field label="Quantity" required error={qtyValid ? undefined : "1 to 999."}>
            <Input type="number" inputMode="numeric" min={1} max={999} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </Field>
          <Field label="Where in the box" description="Optional, e.g. bottom drawer, near the door.">
            <Input value={locationNote} onChange={(event) => setLocationNote(event.target.value)} maxLength={200} />
          </Field>
        </div>
        <Field label="Notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={2} /></Field>
        <FormActions>
          <Button type="button" variant="ghost" data-dialog-cancel disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending} disabled={!valid}>{sample ? "Save" : "Add to the shelf"}</Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}

type StatusInput = { status: Status; holderName?: string; holderProjectId?: string; note?: string };

function StatusDialog({ sample, projects, pending, error, onCancel, onSubmit }: { sample: SampleRead; projects: readonly ProjectChoice[]; pending: boolean; error: string | null; onCancel: () => void; onSubmit: (input: StatusInput) => void }) {
  const [status, setStatus] = useState<Status>(sample.status);
  const [holderName, setHolderName] = useState(sample.holderName ?? "");
  const [projectId, setProjectId] = useState(sample.holderProjectId ?? "");
  const [note, setNote] = useState("");
  const held = HELD.has(status);
  const valid = !held || holderName.trim().length > 0;
  // A project that was archived since keeps showing by its snapshot name until changed.
  const projectOptions = [
    ...projects.map((project) => ({ id: project.id, label: project.name })),
    ...(sample.holderProjectId && !projects.some((p) => p.id === sample.holderProjectId) ? [{ id: sample.holderProjectId, label: `${sample.holderProjectName ?? "Project"} (archived)`, disabled: true }] : []),
  ];

  return (
    <DraftDialog
      open
      onOpenChange={(open) => { if (!open) onCancel(); }}
      title="Sample status"
      description={`${productLabel(sample)} · ${sample.rack} / ${sample.box}`}
      pending={pending}
      watchedValue={JSON.stringify({ status, holderName, projectId, note })}
    >
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit({ status, holderName: held ? holderName.trim() : undefined, holderProjectId: held && projectId ? projectId : undefined, note: note.trim() || undefined }); }}>
        {error ? <InlineError>{error}</InlineError> : null}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
          {STATUS_ORDER.map((key) => <FilterChip key={key} selected={status === key} onClick={() => setStatus(key)}>{STATUS[key].label}</FilterChip>)}
        </div>
        {held ? (
          <>
            <Field label="Who has it" required description="A person, a client or a contractor.">
              <Input autoFocus value={holderName} onChange={(event) => setHolderName(event.target.value)} maxLength={120} />
            </Field>
            <Field label="For project" description="Optional. The StudioFlow project it went out for.">
              <CreatableSearch label="Project" options={projectOptions} value={projectId} onValueChange={setProjectId} placeholder="No project" searchPlaceholder="Search projects…" emptyLabel="No project matches." allowClear clearLabel="No project" className="w-full" />
            </Field>
          </>
        ) : status === "LOST" || status === "DISCARDED" ? (
          <Text size="sm" tone="tertiary">Nobody holds a {status === "LOST" ? "lost" : "discarded"} sample, so no name is needed.</Text>
        ) : null}
        <Field label="Note" description="Optional, kept in the sample's history."><Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={2} /></Field>
        <FormActions>
          <Button type="button" variant="ghost" data-dialog-cancel disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending} disabled={!valid}>Save status</Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}

function HistoryDrawer({ sample, onClose }: { sample: SampleRead; onClose: () => void }) {
  const { locale, timezone } = useDisplaySettings();
  const [rows, setRows] = useState<Movement[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Loaded once per open (the drawer unmounts on close); state is set in the promise callback, not the effect body.
  useEffect(() => {
    let live = true;
    void getSampleHistoryAction(sample.id).then((result) => {
      if (!live) return;
      if (result.ok) setRows(result.data as Movement[]); else setLoadError(result.error.safeMessage);
    });
    return () => { live = false; };
  }, [sample.id]);

  return (
    <Drawer open onOpenChange={(open) => { if (!open) onClose(); }} title="Sample history" description={`${productLabel(sample)} · ${sample.rack} / ${sample.box}`}>
      {loadError ? <InlineError>{loadError}</InlineError> : rows === null ? <Text tone="tertiary">Loading…</Text> : rows.length === 0 ? <Text tone="tertiary">No movements yet.</Text> : (
        <ol className="m-0 grid list-none gap-0 p-0">
          {rows.map((row) => (
            <li key={row.id} className="grid gap-0.5 border-t border-line py-2.5 first:border-t-0">
              <div className="flex items-baseline justify-between gap-3">
                <Text weight="semibold">{MOVEMENT_LABEL[row.kind] ?? row.kind}</Text>
                <Text size="sm" tone="tertiary">{formatInstant(row.createdAt, { locale, timeZone: timezone, style: "datetime" })}</Text>
              </div>
              <Text size="sm" tone="secondary">
                {row.kind === "MOVED" ? `${row.fromRack} / ${row.fromBox} → ${row.toRack} / ${row.toBox}`
                  : row.kind === "IN" ? `${row.toRack} / ${row.toBox}`
                  : [STATUS[row.statusAfter]?.label, row.holderName, row.holderProjectName].filter(Boolean).join(" · ")}
              </Text>
              {row.note ? <Text size="sm">{row.note}</Text> : null}
              <Text size="sm" tone="tertiary">by {row.actorLabel}</Text>
            </li>
          ))}
        </ol>
      )}
    </Drawer>
  );
}
