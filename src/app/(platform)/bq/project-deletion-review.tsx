"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog, DataTable, DirectoryShell, EmptyState, InlineError, Pagination, RowActionMenu, usePagination, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/platform/ui_engine";
import { decideProjectDeletionAction } from "./actions";

export type ProjectDeletionRequestRow = { id: string; projectTitle: string; requesterLabel: string; requestedAt: string };

export function ProjectDeletionReview({ requests }: { requests: ProjectDeletionRequestRow[] }) {
  const [target, setTarget] = useState<{ row: ProjectDeletionRequestRow; decision: "approve" | "reject" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const decide = () => {
    if (!target) return;
    const data = new FormData(); data.set("requestId", target.row.id); data.set("decision", target.decision); if (target.decision === "reject") data.set("reason", "Rejected by deletion approver");
    startTransition(async () => { const result = await decideProjectDeletionAction(data); if (result.ok === false) setError(result.error.safeMessage); else { setError(null); setTarget(null); } });
  };
  // Same 25-row page as every other dense directory.
  const paging = usePagination(requests.length, 25, String(requests.length));
  const pageRequests = requests.slice(paging.offset, paging.offset + 25);

  return <DirectoryShell surface header={error ? <InlineError>{error}</InlineError> : undefined} pagination={<Pagination page={paging.page} pageCount={paging.pageCount} total={requests.length} pageSize={25} onPageChange={paging.setPage} label="Deletion review pages" />}>
    {requests.length === 0 ? <EmptyState title="No pending project deletions" description="Archived BQ projects stay protected until a deletion request is approved." /> : <DataTable framed={false} density="compact" stickyHeader minWidth={680}>
      <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Requested by</TableHead><TableHead>Requested</TableHead><TableHead stickyEnd align="end">Actions</TableHead></TableRow></TableHeader>
      <TableBody>{pageRequests.map((row) => <TableRow key={row.id}><TableCell><span className="font-medium">{row.projectTitle}</span></TableCell><TableCell>{row.requesterLabel}</TableCell><TableCell>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.requestedAt))}</TableCell><TableCell stickyEnd align="end"><RowActionMenu label={`Actions for ${row.projectTitle}`} pending={pending} items={[
        { label: "Approve permanent deletion", danger: true, onSelect: () => { setError(null); setTarget({ row, decision: "approve" }); } },
        { label: "Reject request", separatorBefore: true, onSelect: () => { setError(null); setTarget({ row, decision: "reject" }); } },
      ]} /></TableCell></TableRow>)}</TableBody>
    </DataTable>}
    <ConfirmDialog open={target !== null} onOpenChange={(open) => { if (!open) setTarget(null); }} title={target?.decision === "approve" ? `Permanently delete ${target.row.projectTitle}?` : `Reject deletion of ${target?.row.projectTitle ?? "project"}?`} description={target?.decision === "approve" ? "The complete project and its BQ structure will be removed. The approval record and audit event remain." : "The archived project remains available and can be restored."} confirmLabel={target?.decision === "approve" ? "Delete permanently" : "Reject request"} tone={target?.decision === "approve" ? "danger" : "primary"} pending={pending} error={error} requireTypedConfirmation={target?.decision === "approve" ? "DELETE" : undefined} onConfirm={decide} />
  </DirectoryShell>;
}
