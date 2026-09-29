"use client";

import { useState, useTransition } from "react";

import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { formatInstant } from "@platform/utilities/date";
import { createMoney, formatMoney } from "@platform/utilities/money";
import {
  Button,
  DirectoryShell,
  DraftDialog,
  EmptyState,
  Field,
  FormActions,
  InlineError,
  Input,
  Pagination,
  RowActionMenu,
  SearchField,
  StatusBadge,
  Switch,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Text,
  Textarea,
  usePagination,
  DataTable,
} from "@/platform/ui_engine";

import type { SampleQueueRow } from "@/application/sample-request-coordinator";

import {
  declineSampleRequestAction,
  markSampleRequestPricedAction,
  recordSampleQuoteAction,
  takeSampleRequestAction,
} from "./actions";

const PAGE_SIZE = 25;

function specOf(row: SampleQueueRow): string {
  return [row.product.brandName, row.product.color, row.product.pattern, row.product.finishing, row.product.dimension]
    .filter(Boolean)
    .join(" · ");
}

function statusBadge(row: SampleQueueRow) {
  if (row.state === "NEW") return <StatusBadge tone="warning">New</StatusBadge>;
  if (row.state === "IN_PROGRESS") return <StatusBadge tone="neutral">In progress · {row.intake?.handledBy.label}</StatusBadge>;
  if (row.state === "PRICED") return <StatusBadge tone="success">Priced</StatusBadge>;
  return <StatusBadge tone="danger">Declined</StatusBadge>;
}

type ActionResultLike = { ok: boolean; error?: { safeMessage?: string } };

export function SampleRequestDirectory({ rows }: { rows: SampleQueueRow[] }) {
  const [query, setQuery] = useState("");
  const [showFinished, setShowFinished] = useState(false);
  const [detail, setDetail] = useState<SampleQueueRow | null>(null);
  const [quoteTarget, setQuoteTarget] = useState<SampleQueueRow | null>(null);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteCurrency, setQuoteCurrency] = useState("IDR");
  const [quoteNote, setQuoteNote] = useState("");
  const [declineTarget, setDeclineTarget] = useState<SampleQueueRow | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { locale, timezone } = useDisplaySettings();

  const visibleByStatus = rows.filter((row) => showFinished || row.state === "NEW" || row.state === "IN_PROGRESS");
  const filtered = visibleByStatus.filter((row) => {
    const haystack = `${row.product.name} ${row.project.name} ${row.requestedBy.name} ${row.requestedFrom}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const paging = usePagination(filtered.length, PAGE_SIZE, JSON.stringify([query, showFinished]));
  const visibleRows = filtered.slice(paging.offset, paging.offset + PAGE_SIZE);
  const pageFooter = (
    <div className="grid gap-2">
      <Text tone="secondary" size="sm">
        {filtered.length ? paging.offset + 1 : 0}–{Math.min(paging.offset + PAGE_SIZE, filtered.length)} of {filtered.length} requests
      </Text>
      {paging.pageCount > 1 ? <Pagination page={paging.page} pageCount={paging.pageCount} onPageChange={paging.setPage} /> : null}
    </div>
  );

  function run(id: string, command: () => Promise<ActionResultLike>, onSuccess?: () => void) {
    if (pendingId) return;
    setPendingId(id);
    setRowError(null);
    startTransition(async () => {
      try {
        const result = await command();
        if (!result.ok) {
          setRowError(result.error?.safeMessage ?? "The action could not be completed.");
          return;
        }
        onSuccess?.();
      } catch {
        setRowError("The action could not be completed. Please try again.");
      } finally {
        setPendingId(null);
      }
    });
  }

  function openQuote(row: SampleQueueRow) {
    setQuoteAmount(row.intake?.quotedAmount ?? "");
    setQuoteCurrency(row.intake?.quotedCurrency ?? "IDR");
    setQuoteNote(row.intake?.staffNote ?? "");
    setQuoteTarget(row);
  }

  return (
    <DirectoryShell
      fill
      header={rowError ? <InlineError>{rowError}</InlineError> : undefined}
      surface
      pagination={pageFooter}
      toolbar={
        <TableToolbar framed={false}>
          <SearchField value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Search product, project, requester..." />
          <Switch checked={showFinished} onCheckedChange={setShowFinished} label="Show finished" />
        </TableToolbar>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState title="No sample requests" description="Requests StudioFlow designers ask for will appear here for pricing." />
      ) : (
        <DataTable framed={false} density="compact" stickyHeader fill minWidth={860}>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Requested by</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Status</TableHead>
              <TableHead stickyEnd align="end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => {
              const busy = pendingId === row.sourceRequestId;
              const items = row.state === "NEW"
                ? [{ label: "Take", onSelect: () => run(row.sourceRequestId, () => takeSampleRequestAction(row.sourceRequestId)), disabled: busy, danger: false, separatorBefore: false }]
                : row.state === "IN_PROGRESS"
                  ? [
                      { label: "Record quote", onSelect: () => openQuote(row), disabled: busy, danger: false, separatorBefore: false },
                      { label: "Decline", onSelect: () => { setDeclineReason(""); setDeclineTarget(row); }, disabled: busy, danger: true, separatorBefore: true },
                    ]
                  : [];
              return (
                <TableRow key={row.sourceRequestId}>
                  <TableCell>
                    <button type="button" className="border-0 bg-transparent p-0 text-left" onClick={() => setDetail(row)}>
                      <span className="block font-medium text-ink underline-offset-2 hover:underline">{row.product.name}</span>
                      {specOf(row) ? <span className="block text-xs text-ink-tertiary">{specOf(row)}</span> : null}
                    </button>
                  </TableCell>
                  <TableCell>{row.project.name}</TableCell>
                  <TableCell>{row.requestedBy.name}</TableCell>
                  <TableCell>{formatInstant(row.requestedAt, { locale, timeZone: timezone, style: "datetime" })}</TableCell>
                  <TableCell>{statusBadge(row)}</TableCell>
                  <TableCell stickyEnd align="end">
                    {items.length > 0 ? <RowActionMenu label={`Actions for ${row.product.name}`} pending={busy} items={items} /> : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </DataTable>
      )}

      {detail ? (
        <DraftDialog open onOpenChange={(open) => !open && setDetail(null)} title={detail.product.name} description={detail.project.name}>
          <div className="grid gap-3 text-sm">
            {specOf(detail) ? <Text tone="secondary">{specOf(detail)}</Text> : null}
            <Text><strong>Requested from:</strong> {detail.requestedFrom}</Text>
            <Text><strong>Requested by:</strong> {detail.requestedBy.name}</Text>
            <Text><strong>Requested:</strong> {formatInstant(detail.requestedAt, { locale, timeZone: timezone, style: "datetime" })}</Text>
            {detail.note ? <Text><strong>Note:</strong> {detail.note}</Text> : null}
            {detail.intake?.status === "PRICED" ? (
              <Text>
                <strong>Quoted:</strong>{" "}
                {detail.intake.quotedAmount
                  ? formatMoney(createMoney(detail.intake.quotedAmount, detail.intake.quotedCurrency ?? "IDR"), { locale })
                  : "Linked material price"}
              </Text>
            ) : null}
            {detail.intake?.status === "DECLINED" ? <Text><strong>Decline reason:</strong> {detail.intake.staffNote}</Text> : null}
            {detail.intake?.staffNote && detail.intake.status !== "DECLINED" ? <Text><strong>Staff note:</strong> {detail.intake.staffNote}</Text> : null}
            <FormActions><Button variant="ghost" onClick={() => setDetail(null)}>Close</Button></FormActions>
          </div>
        </DraftDialog>
      ) : null}

      {quoteTarget ? (
        <DraftDialog open onOpenChange={(open) => !open && setQuoteTarget(null)} title="Record the vendor's quote" description={quoteTarget.product.name}>
          <div className="grid gap-4">
            {rowError ? <InlineError>{rowError}</InlineError> : null}
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <Field label="Quoted amount"><Input value={quoteAmount} onChange={(event) => setQuoteAmount(event.target.value)} placeholder="0" inputMode="decimal" /></Field>
              <Field label="Currency"><Input value={quoteCurrency} onChange={(event) => setQuoteCurrency(event.target.value.toUpperCase())} maxLength={3} /></Field>
            </div>
            <Field label="Staff note" description="Optional context for this quote."><Textarea value={quoteNote} onChange={(event) => setQuoteNote(event.target.value)} /></Field>
            <FormActions>
              <Button data-dialog-cancel variant="ghost" onClick={() => setQuoteTarget(null)}>Cancel</Button>
              <Button
                variant="secondary"
                disabled={pendingId !== null}
                onClick={() => {
                  const target = quoteTarget;
                  const input = { quotedAmount: quoteAmount || null, quotedCurrency: quoteCurrency || null, staffNote: quoteNote || null };
                  run(target.sourceRequestId, () => recordSampleQuoteAction(target.intake!.id, input), () => setQuoteTarget(null));
                }}
              >
                Save quote
              </Button>
              <Button
                disabled={pendingId !== null}
                onClick={() => {
                  const target = quoteTarget;
                  const input = { quotedAmount: quoteAmount || null, quotedCurrency: quoteCurrency || null, staffNote: quoteNote || null };
                  run(target.sourceRequestId, () => markSampleRequestPricedAction(target.intake!.id, input), () => setQuoteTarget(null));
                }}
              >
                Mark priced
              </Button>
            </FormActions>
          </div>
        </DraftDialog>
      ) : null}

      {declineTarget ? (
        <DraftDialog open onOpenChange={(open) => !open && setDeclineTarget(null)} title="Decline this sample request" description={declineTarget.product.name}>
          <div className="grid gap-4">
            {rowError ? <InlineError>{rowError}</InlineError> : null}
            <Field label="Reason" required><Textarea value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} placeholder="Why this request cannot be priced" /></Field>
            <FormActions>
              <Button data-dialog-cancel variant="ghost" onClick={() => setDeclineTarget(null)}>Cancel</Button>
              <Button
                variant="danger"
                disabled={pendingId !== null || declineReason.trim() === ""}
                onClick={() => {
                  const target = declineTarget;
                  const reason = declineReason;
                  run(target.sourceRequestId, () => declineSampleRequestAction(target.intake!.id, reason), () => { setDeclineTarget(null); setDeclineReason(""); });
                }}
              >
                Decline request
              </Button>
            </FormActions>
          </div>
        </DraftDialog>
      ) : null}
    </DirectoryShell>
  );
}
