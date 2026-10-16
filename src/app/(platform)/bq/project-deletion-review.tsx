"use client";

import { useState, useTransition } from "react";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { DataTable, DirectoryShell, EmptyState, InlineError, Pagination, RowActionMenu, usePagination, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/platform/ui_engine";
import { decideProjectDeletionAction } from "./actions";

export type ProjectDeletionRequestRow = { id: string; projectTitle: string; requesterLabel: string; requestedAt: string };

export function ProjectDeletionReview({ requests }: { requests: ProjectDeletionRequestRow[] }) {
  const { locale, timezone } = useDisplaySettings();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const decide = (row: ProjectDeletionRequestRow, decision: "approve" | "reject") => {
    const data = new FormData(); data.set("requestId", row.id); data.set("decision", decision); if (decision === "reject") data.set("reason", "Rejected by deletion approver");
    startTransition(async () => { const result = await decideProjectDeletionAction(data); if (result.ok === false) setError(result.error.safeMessage); else setError(null); });
  };
  // Same 25-row page as every other dense directory.
  const paging = usePagination(requests.length, 25, String(requests.length));
  const pageRequests = requests.slice(paging.offset, paging.offset + 25);

  return <DirectoryShell surface header={error ? <InlineError>{error}</InlineError> : undefined} pagination={<Pagination page={paging.page} pageCount={paging.pageCount} total={requests.length} pageSize={25} onPageChange={paging.setPage} label="Deletion review pages" />}>
    {requests.length === 0 ? <EmptyState title="No pending project deletions" description="Archived BQ projects stay protected until a holder of the deletion permission acts." /> : <DataTable framed={false} density="compact" stickyHeader minWidth={680}>
      <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Requested by</TableHead><TableHead>Requested</TableHead><TableHead stickyEnd align="end">Actions</TableHead></TableRow></TableHeader>
      <TableBody>{pageRequests.map((row) => <TableRow key={row.id}><TableCell><span className="font-medium">{row.projectTitle}</span></TableCell><TableCell>{row.requesterLabel}</TableCell><TableCell>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(row.requestedAt))}</TableCell><TableCell stickyEnd align="end"><RowActionMenu label={`Actions for ${row.projectTitle}`} pending={pending} items={[
        { label: "Delete permanently", danger: true, onSelect: () => { setError(null); decide(row, "approve"); } },
        { label: "Reject request", separatorBefore: true, onSelect: () => { setError(null); decide(row, "reject"); } },
      ]} /></TableCell></TableRow>)}</TableBody>
    </DataTable>}
  </DirectoryShell>;
}
