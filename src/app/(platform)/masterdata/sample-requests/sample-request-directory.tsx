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
  retrySampleReceivedAction,
  shelveSampleRequestAction,
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
  const shelved = row.intake?.shelvedSample;
  const base = row.state === "NEW" ? <StatusBadge tone="warning">New</StatusBadge>
    : row.state === "IN_PROGRESS" ? <StatusBadge tone="neutral">In progress · {row.intake?.handledBy.label}</StatusBadge>
    : row.state === "PRICED" ? <StatusBadge tone="success">Priced</StatusBadge>
    : <StatusBadge tone="danger">Declined</StatusBadge>;
  const primary = shelved ? (
    <div className="grid gap-0.5">
      {base}
      <span className="text-xs text-ink-tertiary">On the shelf: {shelved.rack} / {shelved.box}{row.sourceStatus === "REQUESTED" ? " · StudioFlow not told yet" : ""}</span>
    </div>
  ) : base;
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

export function SampleRequestDirectory({ rows, vendors, skus, canPrice, canManageVendors, vendorTypes, canShelve = false, racks = [] }: { rows: SampleQueueRow[]; vendors: readonly { id: string; name: string }[]; skus: readonly SkuChoice[]; canPrice: boolean; canManageVendors: boolean; vendorTypes: readonly VendorTypeOption[]; canShelve?: boolean; racks?: readonly string[] }) {
  const [shelveTarget, setShelveTarget] = useState<SampleQueueRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
      header={rowError ? <InlineError>{rowError}</InlineError> : notice ? <Text size="sm" tone="secondary" role="status">{notice}</Text> : undefined}
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
              const stateItems = row.state === "NEW"
                ? [{ label: "Take", onSelect: () => run(row.sourceRequestId, () => takeSampleRequestAction(row.sourceRequestId)), disabled: busy, danger: false, separatorBefore: false }]
                : row.state === "PRICED" && canPrice && readyForPriceList(row) && !row.intake?.priceMaterialId
                  ? [{ label: "Add to price list", onSelect: () => run(row.sourceRequestId, () => syncSampleQuoteToPriceAction(row.intake!.id)), disabled: busy, danger: false, separatorBefore: false }]
                : row.state === "IN_PROGRESS"
                  ? [
                      { label: "Record quote", onSelect: () => openQuote(row), disabled: busy, danger: false, separatorBefore: false },
                      { label: "Decline", onSelect: () => { setDeclineReason(""); setDeclineTarget(row); }, disabled: busy, danger: true, separatorBefore: true },
                    ]
                  : [];
              // A requested sample that arrived goes onto the shelf from here; a declined one cannot.
              const canPutOnShelf = canShelve && row.state !== "DECLINED" && !row.intake?.shelvedSample && !(row.state === "NEW" && row.sourceStatus !== "REQUESTED");
              const shelfItems = [
                ...(canPutOnShelf ? [{ label: "Put on shelf", onSelect: () => { setNotice(null); setShelveTarget(row); }, disabled: busy, danger: false, separatorBefore: stateItems.length > 0 }] : []),
                ...(canShelve && row.intake?.shelvedSample && row.sourceStatus === "REQUESTED"
                  ? [{ label: "Tell StudioFlow it arrived", onSelect: () => run(row.sourceRequestId, () => retrySampleReceivedAction(row.sourceRequestId)), disabled: busy, danger: false, separatorBefore: stateItems.length > 0 }]
                  : []),
              ];
              const items = [...stateItems, ...shelfItems];
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

      {shelveTarget ? (
        <ShelveDialog
          key={shelveTarget.sourceRequestId}
          row={shelveTarget}
          skus={skus}
          racks={racks}
          pending={pendingId === shelveTarget.sourceRequestId}
          error={rowError}
          onCancel={() => setShelveTarget(null)}
          onSubmit={(input) => {
            const target = shelveTarget;
            run(target.sourceRequestId, async () => {
              const result = await shelveSampleRequestAction(target.sourceRequestId, input);
              if (result.ok) {
                const data = result.data as { sample: { rack: string; box: string }; studioFlowUpdated: boolean; reason?: string };
                const where = `${data.sample.rack} / ${data.sample.box}`;
                setNotice(data.studioFlowUpdated ? `On the shelf at ${where}. The designer now sees it as received.`
                  : data.reason ? `On the shelf at ${where}. StudioFlow already had it as received or the project is archived, so nothing changed there.`
                  : `On the shelf at ${where}, but StudioFlow could not be told. Use “Tell StudioFlow it arrived” on the row.`);
              }
              return result;
            }, () => setShelveTarget(null));
          }}
        />
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

type ShelveInput = { skuId: string; rack: string; box: string; quantity: number; locationNote?: string };

/** Put a requested sample on the shelf: its SKU (prefilled from the quote) and where it goes. */
function ShelveDialog({ row, skus, racks, pending, error, onCancel, onSubmit }: { row: SampleQueueRow; skus: readonly SkuChoice[]; racks: readonly string[]; pending: boolean; error: string | null; onCancel: () => void; onSubmit: (input: ShelveInput) => void }) {
  const [skuId, setSkuId] = useState(row.intake?.skuId ?? "");
  const [rack, setRack] = useState("");
  const [box, setBox] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [locationNote, setLocationNote] = useState("");
  const qty = Number(quantity);
  const qtyValid = Number.isInteger(qty) && qty >= 1 && qty <= 999;
  const valid = Boolean(skuId && rack.trim() && box.trim() && qtyValid);
  const rackOptions = [...new Set([...racks, ...(rack.trim() ? [rack] : [])])].map((name) => ({ id: name, label: name }));
  return (
    <DraftDialog open onOpenChange={(open) => !open && onCancel()} title="Put on shelf" description={`${row.product.name} · ${row.project.name}`} pending={pending} watchedValue={JSON.stringify({ skuId, rack, box, quantity, locationNote })}>
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit({ skuId, rack, box, quantity: qty, locationNote: locationNote.trim() || undefined }); }}>
        {error ? <InlineError>{error}</InlineError> : null}
        <Text size="sm" tone="secondary">The sample goes onto the shelf, and the designer&apos;s Schedule shows it as received with where it is.</Text>
        <Field label="Product in the catalogue" required>
          <div className="grid gap-1">
            <CreatableSearch label="SKU" options={skus.map((sku) => ({ id: sku.id, label: skuLabel(sku) }))} value={skuId} onValueChange={setSkuId} placeholder="Pick a SKU" searchPlaceholder="Search SKUs…" emptyLabel="No SKU matches this search." className="w-full" />
            <p className="text-xs text-ink-secondary">Not there yet? A SKU is created with its price on Pricing.</p>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rack" required>
            <CreatableSearch label="Rack" options={rackOptions} value={rack} onValueChange={setRack} onCreate={(name) => name.trim()} createLabel={(name) => `New rack “${name}”`} placeholder="Pick or type a rack" searchPlaceholder="Search racks…" emptyLabel="No rack yet. Type a new one." className="w-full" />
          </Field>
          <Field label="Box" required><Input value={box} onChange={(event) => setBox(event.target.value)} maxLength={40} placeholder="e.g. 3" /></Field>
        </div>
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <Field label="Quantity" required error={qtyValid ? undefined : "1 to 999."}><Input type="number" inputMode="numeric" min={1} max={999} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field>
          <Field label="Where in the box"><Input value={locationNote} onChange={(event) => setLocationNote(event.target.value)} maxLength={200} /></Field>
        </div>
        <FormActions>
          <Button type="button" variant="ghost" data-dialog-cancel disabled={pending}>Cancel</Button>
          <Button type="submit" pending={pending} disabled={!valid}>Put on shelf</Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}
