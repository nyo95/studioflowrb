"use client";

import { useState, useTransition } from "react";
import { Button, ConfirmDialog, DataTable, Dialog, EmptyState, Field, FormActions, Input, SearchField, SectionCard, Spinner, StatusBadge, TableBody, TableCell, TableHead, TableHeader, TableRow, TableToolbar } from "@/platform/ui_engine";
import { approveDeletionAction, rejectDeletionAction } from "./actions";

type DeletionRow = { id: string; target_type: string; target_id: string; requester_label: string; reason: string | null; requested_at: Date };

export function DeletionDirectory({ pendingRequests, canApprove }: { pendingRequests: DeletionRow[]; canApprove: boolean }) {
  const [query, setQuery] = useState("");
  const [approve, setApprove] = useState<DeletionRow | null>(null);
  const [reject, setReject] = useState<DeletionRow | null>(null);
  const [reason, setReason] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const rows = pendingRequests.filter((row) => `${row.target_type} ${row.target_id} ${row.requester_label} ${row.reason ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const run = (id: string, fn: () => Promise<unknown>) => { setPendingId(id); startTransition(async () => { try { await fn(); } finally { setPendingId(null); } }); };
  return <SectionCard><TableToolbar><SearchField value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Search deletion requests..." /></TableToolbar>
    {rows.length === 0 ? <EmptyState title="No pending deletion requests" description="Archived records remain protected until a request is submitted and approved." /> : <DataTable minWidth={760}><TableHeader><TableRow><TableHead>Record type</TableHead><TableHead>Requested by</TableHead><TableHead>Reason</TableHead><TableHead>Requested</TableHead><TableHead>Status</TableHead>{canApprove && <TableHead align="end">Actions</TableHead>}</TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><span className="font-medium">{row.target_type}</span></TableCell><TableCell>{row.requester_label}</TableCell><TableCell>{row.reason ?? "-"}</TableCell><TableCell>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(row.requested_at)}</TableCell><TableCell><StatusBadge tone="warning">Pending approval</StatusBadge></TableCell>{canApprove && <TableCell align="end"><div className="flex justify-end gap-2">{pendingId === row.id && <Spinner />}<Button size="sm" variant="primary" disabled={pendingId === row.id} onClick={() => setApprove(row)}>Approve</Button><Button size="sm" variant="danger" disabled={pendingId === row.id} onClick={() => setReject(row)}>Reject</Button></div></TableCell>}</TableRow>)}</TableBody></DataTable>}
    {approve && <ConfirmDialog open onOpenChange={(open) => !open && setApprove(null)} title="Approve permanent deletion?" description="This permanently removes the archived record. This action cannot be undone." confirmLabel="Approve deletion" tone="danger" onConfirm={() => { const value = approve; setApprove(null); run(value.id, () => approveDeletionAction(value.id)); }} />}
    {reject && <Dialog open onOpenChange={(open) => !open && setReject(null)} title="Reject deletion request" description="The archived record will remain available for restore."><div className="grid gap-4"><Field label="Reason"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional context for the requester" /></Field><FormActions><Button variant="ghost" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" onClick={() => { const value = reject; const note = reason; setReject(null); setReason(""); run(value.id, () => rejectDeletionAction(value.id, note)); }}>Reject request</Button></FormActions></div></Dialog>}
  </SectionCard>;
}
