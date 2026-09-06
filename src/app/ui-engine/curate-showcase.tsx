"use client";

import { useState } from "react";
import { Button, ConfirmDialog, DataTable, DirectoryShell, DraftDialog, EmptyState, Field, FormActions, Input, Heading, Pagination, RowActionMenu, SearchField, StatusBadge, TableBody, TableCell, TableHead, TableHeader, TableRow, TableToolbar, Text, usePagination } from "@/platform/ui_engine";

const records = Array.from({ length: 61 }, (_, index) => ({ id: index + 1, name: `Example ${String(index + 1).padStart(2, "0")}` }));

/** Local presentation fixtures: no database, permission or mutation endpoints. */
export function CurateShowcase() {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [edit, setEdit] = useState(false);
  const [tag, setTag] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState("No changes saved.");
  const rows = records.filter(row => row.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => direction === "asc" ? a.id - b.id : b.id - a.id);
  const paging = usePagination(rows.length, 25, JSON.stringify([query, direction]));
  return <section aria-label="Directory regression fixtures" className="grid gap-4">
    <DirectoryShell surface header={<div><Heading level={3}>Directory interactions</Heading><Text>Presentation-only fixtures for sorting, paging, drafts and retry. No records are persisted.</Text></div>} toolbar={<TableToolbar framed={false} actions={<Button onClick={() => { setTag(false); setEdit(true); }}>New example</Button>}><SearchField label="Search examples" value={query} onChange={event => setQuery(event.target.value)} onClear={() => setQuery("")} /></TableToolbar>} pagination={<><Text>{rows.length} examples</Text>{paging.pageCount > 1 ? <Pagination page={paging.page} pageCount={paging.pageCount} onPageChange={paging.setPage} label="Example pages" /> : null}</>}>
      <DataTable framed={false} density="compact" stickyHeader maxBodyHeight="320px" minWidth={600} state={!rows.length ? <EmptyState title="No examples match" /> : undefined}>
        <TableHeader><TableRow><TableHead sortable sortDirection={direction} onSortChange={setDirection}>Example</TableHead><TableHead>Status</TableHead><TableHead stickyEnd align="end">Actions</TableHead></TableRow></TableHeader>
        <TableBody>{rows.slice(paging.offset, paging.offset + 25).map(row => <TableRow key={row.id}><TableCell>{row.name}</TableCell><TableCell><StatusBadge tone="success">Active</StatusBadge></TableCell><TableCell stickyEnd align="end"><RowActionMenu label={`Actions for ${row.name}`} items={[{ label: "Preview confirmation", onSelect: () => { setError(null); setConfirm(true); } }]} /></TableCell></TableRow>)}</TableBody>
      </DataTable>
    </DirectoryShell>
    <Text role="status">{result}</Text>
    <DraftDialog open={edit} onOpenChange={setEdit} title="Example draft" watchedValue={String(tag)}>
      <form className="grid gap-4" onSubmit={event => { event.preventDefault(); setResult("Example saved locally."); setEdit(false); }}>
        <Field label="Example name"><Input name="name" defaultValue="Example" /></Field>
        <Button aria-pressed={tag} onClick={() => setTag(!tag)}>Toggle controlled tag</Button>
        <FormActions><Button data-dialog-cancel onClick={() => setEdit(false)}>Cancel</Button><Button type="submit" variant="primary">Save example</Button></FormActions>
      </form>
    </DraftDialog>
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Confirm example action?" description="This demonstration does not modify any stored record." error={error} pending={pending} confirmLabel={error ? "Retry example" : "Run example"} onConfirm={() => {
      setPending(true);
      setTimeout(() => { setPending(false); if (!error) setError("Example failure. Retry keeps the same context."); else { setConfirm(false); setResult("Example retry succeeded."); } }, 300);
    }} />
  </section>;
}
