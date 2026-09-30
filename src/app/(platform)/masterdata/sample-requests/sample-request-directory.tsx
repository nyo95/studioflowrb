"use client";

import { useState, useTransition } from "react";

import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { formatInstant } from "@platform/utilities/date";
import { createMoney, formatMoney } from "@platform/utilities/money";
import {
  Button,
  CreatableSearch,
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

import { VendorQuickCreateDialog, type VendorTypeOption } from "../vendor-quick-create-dialog";
import { createPricingVendorQuickAction } from "../pricing/actions";

import {
  declineSampleRequestAction,
  markSampleRequestPricedAction,
  recordSampleQuoteAction,
  syncSampleQuoteToPriceAction,
  takeSampleRequestAction,
} from "./actions";

const PAGE_SIZE = 25;

function specOf(row: SampleQueueRow): string {
  return [row.product.brandName, row.product.color, row.product.pattern, row.product.finishing, row.product.dimension]
    .filter(Boolean)
    .join(" · ");
}

/** Staff is still working a request the designer already marked received directly in StudioFlow. */
function alreadyReceived(row: SampleQueueRow): boolean {
  return row.state === "IN_PROGRESS" && row.sourceStatus === "RECEIVED";
}

function statusBadge(row: SampleQueueRow) {
  const primary = row.state === "NEW" ? <StatusBadge tone="warning">New</StatusBadge>
    : row.state === "IN_PROGRESS" ? <StatusBadge tone="neutral">In progress · {row.intake?.handledBy.label}</StatusBadge>
    : row.state === "PRICED" ? <StatusBadge tone="success">Priced</StatusBadge>
    : <StatusBadge tone="danger">Declined</StatusBadge>;
  if (!alreadyReceived(row)) return primary;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {primary}
      <StatusBadge tone="danger">Already received</StatusBadge>
    </div>
  );
}

type ActionResultLike = { ok: boolean; error?: { safeMessage?: string } };

type SkuChoice = { id: string; name: string | null; code: string | null; brandName: string | null };

function skuLabel(sku: SkuChoice): string {
  return [sku.code, sku.name, sku.brandName ? `(${sku.brandName})` : null].filter(Boolean).join(" ") || "Unnamed SKU";
}

/** A quote can be added to the price list once it has a supplier, a SKU, and an amount with a currency. */
function readyForPriceList(row: SampleQueueRow): boolean {
  const intake = row.intake;
  return Boolean(intake && intake.vendorId && intake.skuId && intake.quotedAmount && intake.quotedCurrency);
}

export function SampleRequestDirectory({ rows, vendors, skus, canPrice, canManageVendors, vendorTypes }: { rows: SampleQueueRow[]; vendors: readonly { id: string; name: string }[]; skus: readonly SkuChoice[]; canPrice: boolean; canManageVendors: boolean; vendorTypes: readonly VendorTypeOption[] }) {
  const [query, setQuery] = useState("");
  const [showFinished, setShowFinished] = useState(false);
  const [detail, setDetail] = useState<SampleQueueRow | null>(null);
  const [quoteTarget, setQuoteTarget] = useState<SampleQueueRow | null>(null);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteCurrency, setQuoteCurrency] = useState("IDR");
  const [quoteVendorId, setQuoteVendorId] = useState("");
  const [quoteSkuId, setQuoteSkuId] = useState("");
  const [quoteNote, setQuoteNote] = useState("");
  const [createdVendors, setCreatedVendors] = useState<Array<{ id: string; name: string }>>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickVendorTypeId, setQuickVendorTypeId] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickPending, setQuickPending] = useState(false);
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

  async function addVendor() {
    setQuickError(null);
    setQuickPending(true);
    const data = new FormData();
    data.set("name", quickName);
    data.set("vendorTypeId", quickVendorTypeId);
    const result = await createPricingVendorQuickAction("material", data);
    setQuickPending(false);
    if (result.ok === false) {
      setQuickError(result.error.safeMessage);
      return;
    }
    setCreatedVendors((current) => [...current, { id: result.data.vendorId, name: quickName.trim() }]);
    setQuoteVendorId(result.data.vendorId);
    setQuickName("");
    setQuickVendorTypeId("");
    setQuickOpen(false);
  }

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
    setQuoteVendorId(row.intake?.vendorId ?? "");
    setQuoteSkuId(row.intake?.skuId ?? "");
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
                : row.state === "PRICED" && canPrice && readyForPriceList(row) && !row.intake?.priceMaterialId
                  ? [{ label: "Add to price list", onSelect: () => run(row.sourceRequestId, () => syncSampleQuoteToPriceAction(row.intake!.id)), disabled: busy, danger: false, separatorBefore: false }]
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
            {alreadyReceived(detail) ? (
              <InlineError>The designer already marked this sample as received directly in StudioFlow. Confirm it is still needed before pricing it.</InlineError>
            ) : null}
            <Text><strong>Requested from:</strong> {detail.requestedFrom || "Not specified. Please find a supplier."}</Text>
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
            {detail.intake?.skuId ? (
              <Text>
                <strong>Catalogue:</strong> {[detail.intake.linkedSkuCode, detail.intake.linkedSkuName].filter(Boolean).join(" ") || "Linked SKU"}
                {detail.intake.priceMaterialId && detail.intake.linkedPriceAmount ? ` · price list: ${detail.intake.linkedPriceAmount} ${detail.intake.quotedCurrency ?? ""}`.trimEnd() : " · not on the price list yet"}
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
            <Field label="Supplier" description="Optional. Link the supplier who gave this quote.">
              <CreatableSearch
                label="Supplier"
                options={[{ id: "", label: "No supplier linked" }, ...[...vendors, ...createdVendors.filter((created) => !vendors.some((vendor) => vendor.id === created.id))].map((vendor) => ({ id: vendor.id, label: vendor.name }))]}
                value={quoteVendorId}
                onValueChange={setQuoteVendorId}
                placeholder="No supplier linked"
                searchPlaceholder="Search suppliers…"
                emptyLabel="No suppliers match this search."
                onCreate={canManageVendors ? (name) => { setQuickName(name); setQuickVendorTypeId(""); setQuickError(null); setQuickOpen(true); return ""; } : undefined}
                createLabel={(name) => `Add “${name}” as a new supplier`}
                className="w-full"
              />
            </Field>
            <Field label="Product in the catalogue">
              <div className="grid gap-1">
              <CreatableSearch
                label="SKU"
                options={[{ id: "", label: "Not in the catalogue yet" }, ...skus.map((sku) => ({ id: sku.id, label: skuLabel(sku) }))]}
                value={quoteSkuId}
                onValueChange={setQuoteSkuId}
                placeholder="Not in the catalogue yet"
                searchPlaceholder="Search SKUs…"
                emptyLabel="No SKU matches this search."
                className="w-full"
              />
              <p className="text-xs text-ink-secondary">Pick the SKU to add this price to the price list. Not there yet? Create the SKU first in SKUs.</p>
              </div>
            </Field>
            <Field label="Staff note" description="Optional context for this quote."><Textarea value={quoteNote} onChange={(event) => setQuoteNote(event.target.value)} /></Field>
            <FormActions>
              <Button data-dialog-cancel variant="ghost" onClick={() => setQuoteTarget(null)}>Cancel</Button>
              <Button
                variant="secondary"
                disabled={pendingId !== null}
                onClick={() => {
                  const target = quoteTarget;
                  const input = { vendorId: quoteVendorId || null, skuId: quoteSkuId || null, quotedAmount: quoteAmount || null, quotedCurrency: quoteCurrency || null, staffNote: quoteNote || null };
                  run(target.sourceRequestId, () => recordSampleQuoteAction(target.intake!.id, input), () => setQuoteTarget(null));
                }}
              >
                Save quote
              </Button>
              {canPrice ? (
                <Button
                  variant="secondary"
                  disabled={pendingId !== null || !quoteVendorId || !quoteSkuId || !quoteAmount.trim() || !quoteCurrency.trim()}
                  onClick={() => {
                    const target = quoteTarget;
                    const input = { vendorId: quoteVendorId || null, skuId: quoteSkuId || null, quotedAmount: quoteAmount || null, quotedCurrency: quoteCurrency || null, staffNote: quoteNote || null };
                    run(target.sourceRequestId, async () => {
                      const saved = await recordSampleQuoteAction(target.intake!.id, input);
                      if (!saved.ok) return saved;
                      return syncSampleQuoteToPriceAction(target.intake!.id);
                    }, () => setQuoteTarget(null));
                  }}
                >
                  Save and add to price list
                </Button>
              ) : null}
              <Button
                disabled={pendingId !== null}
                onClick={() => {
                  const target = quoteTarget;
                  const input = { vendorId: quoteVendorId || null, skuId: quoteSkuId || null, quotedAmount: quoteAmount || null, quotedCurrency: quoteCurrency || null, staffNote: quoteNote || null };
                  run(target.sourceRequestId, () => markSampleRequestPricedAction(target.intake!.id, input), () => setQuoteTarget(null));
                }}
              >
                Mark priced
              </Button>
            </FormActions>
          </div>
        </DraftDialog>
      ) : null}

      <VendorQuickCreateDialog
        open={quickOpen}
        pending={quickPending}
        error={quickError}
        name={quickName}
        onNameChange={setQuickName}
        vendorTypeId={quickVendorTypeId}
        onVendorTypeIdChange={setQuickVendorTypeId}
        vendorTypes={vendorTypes}
        onSubmit={() => void addVendor()}
        onCancel={() => setQuickOpen(false)}
        description="Create a supplier and use it for this quote."
      />

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
