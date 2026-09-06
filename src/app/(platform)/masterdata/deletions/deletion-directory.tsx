"use client";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { DirectoryShell,DraftDialog,InlineError,Pagination,RowActionMenu,Text,usePagination } from "@/platform/ui_engine";


import { Button,ConfirmDialog,DataTable,EmptyState,Field,FormActions,Input,SearchField,StatusBadge,TableBody,TableCell,TableHead,TableHeader,TableRow,TableToolbar } from "@/platform/ui_engine";
import { useState,useTransition } from "react";
import { approveDeletionAction,rejectDeletionAction } from "./actions";

type DeletionRow = { id: string; target_type: string; target_id: string; requester_label: string; reason: string | null; requested_at: Date };

export function DeletionDirectory({ pendingRequests, canApprove }: { pendingRequests: DeletionRow[]; canApprove: boolean }) {
  const [query, setQuery] = useState("");
  const [approve, setApprove] = useState<DeletionRow | null>(null);
  const [reject, setReject] = useState<DeletionRow | null>(null);
  const [reason, setReason] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const rows = pendingRequests.filter((row) => `${row.target_type} ${row.target_id} ${row.requester_label} ${row.reason ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const { locale, timezone } = useDisplaySettings();
  const [sortKey, setSortKey] = useState<"Requested" | "Record type" | "Requested by">("Requested");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const sortValues: Record<"Requested" | "Record type" | "Requested by", (r: DeletionRow) => string | number | null> = {"Requested": (r) => new Date(r.requested_at).getTime(), "Record type": (r) => r.target_type, "Requested by": (r) => r.requester_label};
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const orderedRows = [...rows].sort((a, b) => {
    const left = sortValues[sortKey](a), right = sortValues[sortKey](b);
    if (left === null || right === null) return left === right ? a.id.localeCompare(b.id) : left === null ? 1 : -1;
    const result = typeof left === "number" && typeof right === "number" ? left - right : collator.compare(String(left), String(right));
    return (sortDirection === "asc" ? result : -result) || a.id.localeCompare(b.id);
  });
  const paging = usePagination(orderedRows.length, 25, JSON.stringify([query, sortKey, sortDirection]));
  const visibleRows = orderedRows.slice(paging.offset, paging.offset + 25);
  const pageFooter = <div className="grid gap-2"><Text tone="secondary" size="sm">{orderedRows.length ? paging.offset + 1 : 0}–{Math.min(paging.offset + 25, orderedRows.length)} of {orderedRows.length} records</Text>{paging.pageCount > 1 ? <Pagination page={paging.page} pageCount={paging.pageCount} onPageChange={paging.setPage} /> : null}</div>;

  const run = (id: string, command: () => Promise<unknown>, onSuccess?: () => void) => {
    if (pendingId) return;
    setPendingId(id); setRowError(null);
    startTransition(async () => {
      try {
        const result = await command();
        if (result && typeof result === "object" && "ok" in result && !result.ok) {
          const failure = result as { error?: { safeMessage?: string } };
          setRowError(failure.error?.safeMessage ?? "The action could not be completed."); return;
        }
        onSuccess?.();
      } catch { setRowError("The action could not be completed. Please try again."); }
      finally { setPendingId(null); }
    });
  };
  return <DirectoryShell header={rowError ? <InlineError>{rowError}</InlineError> : undefined} surface pagination={pageFooter} toolbar={<TableToolbar framed={false}><SearchField value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Search deletion requests..." /></TableToolbar>}>
    {rows.length === 0 ? <EmptyState title="No pending deletion requests" description="Archived records remain protected until a request is submitted and approved." /> : <DataTable framed={false} density="compact" stickyHeader maxBodyHeight="60vh" minWidth={760}><TableHeader><TableRow><TableHead sortable sortDirection={sortKey === "Record type" ? sortDirection : null} onSortChange={(direction) => { setSortKey("Record type"); setSortDirection(direction); }}>Record type</TableHead><TableHead sortable sortDirection={sortKey === "Requested by" ? sortDirection : null} onSortChange={(direction) => { setSortKey("Requested by"); setSortDirection(direction); }}>Requested by</TableHead><TableHead>Reason</TableHead><TableHead sortable sortDirection={sortKey === "Requested" ? sortDirection : null} onSortChange={(direction) => { setSortKey("Requested"); setSortDirection(direction); }}>Requested</TableHead><TableHead>Status</TableHead>{canApprove && <TableHead stickyEnd align="end">Actions</TableHead>}</TableRow></TableHeader><TableBody>{visibleRows.map((row) => <TableRow key={row.id}><TableCell><span className="font-medium">{row.target_type}</span></TableCell><TableCell>{row.requester_label}</TableCell><TableCell>{row.reason ?? "-"}</TableCell><TableCell>{new Intl.DateTimeFormat(locale, { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(row.requested_at)}</TableCell><TableCell><StatusBadge tone="warning">Pending approval</StatusBadge></TableCell>{canApprove && <TableCell stickyEnd align="end"><RowActionMenu label={`Actions for  requested by ${row.id}`} pending={pendingId === row.id} items={[...(pendingId === row.id ? [] : []),...[{ label: "Approve", onSelect: () => setApprove(row), disabled: pendingId === row.id, danger: false, separatorBefore: false }],...[{ label: "Reject", onSelect: () => setReject(row), disabled: pendingId === row.id, danger: true, separatorBefore: true }]]} /></TableCell>}</TableRow>)}</TableBody></DataTable>}
    {approve && <ConfirmDialog error={rowError} pending={pendingId !== null} open onOpenChange={(open) => !open && setApprove(null)} title="Approve permanent deletion?" description="This permanently removes the archived record. This action cannot be undone." confirmLabel="Approve deletion" tone="danger" onConfirm={() => { const value = approve;  run(value.id, () => approveDeletionAction(value.id), () => { setApprove(null); }); }} />}
    {reject && <DraftDialog open onOpenChange={(open) => !open && setReject(null)} title="Reject deletion request" description="The archived record will remain available for restore."><div className="grid gap-4"><Field label="Reason"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional context for the requester" /></Field><FormActions><Button data-dialog-cancel variant="ghost" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" onClick={() => { const value = reject; const note = reason;   run(value.id, () => rejectDeletionAction(value.id, note), () => { setReject(null); setReason(""); }); }}>Reject request</Button></FormActions></div></DraftDialog>}
  </DirectoryShell>;
}
