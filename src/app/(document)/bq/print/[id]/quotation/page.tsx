import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { prisma } from "@platform/core/db";
import { hasAnyPermission } from "@platform/core/rbac";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { formatDateOnly, formatInstant } from "@platform/utilities/date";
import { createMoney, formatMoney } from "@platform/utilities/money";
import { brandMarkStorage } from "@platform/runtime";
import {
  BQ_DEFAULT_QUOTATION_TERMS,
  BQ_PERMISSIONS,
  BQ_PRICE_MODE_LABEL,
  bqSectionTotal,
  isMarkerPriceMode,
  type BqItemDetail,
} from "@/apps/bq/public";
import { bqPublicRead } from "@/apps/bq/runtime";
import { DocumentBlock, DocumentSheet, PrintButton, PrintFormatPicker, printFormatFromSearchParams } from "@/platform/ui_engine";

export const dynamic = "force-dynamic";

const LABEL = "text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-500";
const SECTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const idr = (amount: string | null) => (amount === null ? "—" : formatMoney(createMoney(amount, "IDR")));
const quantity = (value: string) => value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

/** One Work Item as the client sees it: rate and total only (bq-contract §6.4), or its TBC/By Owner marker. */
function ItemLine({ number, item }: { number: string; item: BqItemDetail }) {
  const marker = isMarkerPriceMode(item.priceMode);
  return (
    <tr className="break-inside-avoid border-b border-neutral-200 align-top">
      <td className="py-1.5 pr-2 tabular-nums text-neutral-500">{number}</td>
      <td className="py-1.5 pr-2">{item.name}</td>
      <td className="py-1.5 pr-2 text-right tabular-nums">{quantity(item.qty)}</td>
      <td className="py-1.5 pr-2">{item.unit}</td>
      <td className="py-1.5 pr-2 text-right tabular-nums">{marker ? BQ_PRICE_MODE_LABEL[item.priceMode] : idr(item.rate)}</td>
      <td className="py-1.5 text-right tabular-nums">{marker ? BQ_PRICE_MODE_LABEL[item.priceMode] : idr(item.total)}</td>
    </tr>
  );
}

export default async function BqQuotationPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paper?: string; orientation?: string }>;
}) {
  const { id } = await params;
  const printFormat = printFormatFromSearchParams(await searchParams);
  const { grants } = await requirePrincipalGrants();
  if (!hasAnyPermission(grants, [BQ_PERMISSIONS.projectRead, BQ_PERMISSIONS.projectManage])) redirect("/bq");

  const [project, settings] = await Promise.all([
    bqPublicRead.getProjectDetail(id),
    readPlatformGeneralSettings(prisma, (key) => brandMarkStorage.createPublicReadUrl(key)),
  ]);
  if (!project) notFound();

  const terms = (project.quotation.terms ?? BQ_DEFAULT_QUOTATION_TERMS).split("\n").map((line) => line.trim()).filter(Boolean);
  const markers = (["TBC", "BY_OWNER"] as const).filter((mode) =>
    project.sections.some((section) => [...section.items, ...section.subsections.flatMap((subsection) => subsection.items)].some((item) => item.priceMode === mode)));

  return (
    <>
      <title>{`Quotation — ${project.title}`}</title>
      <DocumentSheet
        printFormat={printFormat}
        toolbar={
          <>
            <Link prefetch={false} href={`/bq/${project.id}`} className="text-sm text-ink-secondary hover:text-ink hover:underline">
              ← Back to BQ
            </Link>
            <div className="flex items-center gap-3">
              <PrintFormatPicker value={printFormat} />
              <PrintButton />
            </div>
          </>
        }
      >
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
          <div className="flex min-w-0 items-start gap-3">
            {settings.brandMarkUrl ? (
              // A short-lived public-read URL; next/image optimization would cache it.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.brandMarkUrl} alt="" className="h-12 w-12 object-contain" />
            ) : null}
            <div className="min-w-0">
              <p className="text-sm font-bold uppercase tracking-[0.08em]">{settings.organizationName}</p>
              <p className={`${LABEL} mt-3`}>Quotation</p>
              <h1 className="mt-1 font-ui-sans text-2xl font-black uppercase leading-tight">{project.title}</h1>
            </div>
          </div>
          <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-4 gap-y-1 text-right text-sm">
            <dt className={LABEL}>No.</dt>
            <dd className="font-semibold">{project.quotation.number ?? "—"}</dd>
            <dt className={LABEL}>Date</dt>
            <dd className="font-semibold">{project.quotation.date ? formatDateOnly(project.quotation.date) : formatInstant(new Date(), { style: "date" })}</dd>
            <dt className={LABEL}>Client</dt>
            <dd className="font-semibold">{project.clientName}</dd>
          </dl>
        </header>

        <table className="mt-6 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="w-10 py-1.5 pr-2 font-semibold">No.</th>
              <th className="py-1.5 pr-2 font-semibold">Description</th>
              <th className="w-14 py-1.5 pr-2 text-right font-semibold">Qty</th>
              <th className="w-12 py-1.5 pr-2 font-semibold">Unit</th>
              <th className="w-28 py-1.5 pr-2 text-right font-semibold">Rate</th>
              <th className="w-32 py-1.5 text-right font-semibold">Total</th>
            </tr>
          </thead>
          {project.sections.map((section, sectionIndex) => {
            const letter = SECTION_LETTERS[sectionIndex] ?? String(sectionIndex + 1);
            let counter = 0;
            const next = () => `${letter}.${++counter}`;
            return (
              <tbody key={section.id}>
                <tr className="break-after-avoid">
                  <td className="pb-1 pt-4 font-bold">{letter}</td>
                  <td colSpan={5} className="pb-1 pt-4 font-bold uppercase tracking-[0.06em]">{section.name}</td>
                </tr>
                {section.items.map((item) => <ItemLine key={item.id} number={next()} item={item} />)}
                {section.subsections.map((subsection) => [
                  <tr key={subsection.id} className="break-after-avoid">
                    <td />
                    <td colSpan={5} className="pb-0.5 pt-2 font-semibold text-neutral-700">{subsection.name}</td>
                  </tr>,
                  ...subsection.items.map((item) => <ItemLine key={item.id} number={next()} item={item} />),
                ])}
                <tr className="border-t border-black">
                  <td />
                  <td colSpan={4} className="py-1.5 pr-2 text-right font-semibold">Subtotal {letter}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{idr(bqSectionTotal(section))}</td>
                </tr>
              </tbody>
            );
          })}
          <tfoot>
            <tr className="border-y-2 border-black">
              <td />
              <td colSpan={4} className="py-2 pr-2 text-right text-sm font-bold uppercase tracking-[0.06em]">Grand total</td>
              <td className="py-2 text-right text-sm font-bold tabular-nums">{project.grandTotal === null ? "Incomplete" : idr(project.grandTotal)}</td>
            </tr>
          </tfoot>
        </table>

        {markers.length > 0 ? (
          <p className="mt-2 text-[10px] text-neutral-600">
            {markers.map((mode) => mode === "TBC" ? "TBC: price to be confirmed, not included in the total." : "By Owner: supplied by the owner, not included in the total.").join(" ")}
          </p>
        ) : null}

        <DocumentBlock className="mt-8">
          <h2 className="border-b border-black pb-1 text-sm font-bold uppercase tracking-[0.1em]">Terms &amp; Conditions</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
            {terms.map((term, index) => <li key={index}>{term}</li>)}
          </ol>
        </DocumentBlock>

        <DocumentBlock className="mt-12 grid grid-cols-2 gap-12 text-xs">
          <div>
            <p className={LABEL}>Prepared by</p>
            <div className="mt-16 border-t border-neutral-400 pt-1">{settings.organizationName}</div>
          </div>
          <div>
            <p className={LABEL}>Approved by</p>
            <div className="mt-16 border-t border-neutral-400 pt-1">{project.clientName}</div>
          </div>
        </DocumentBlock>
      </DocumentSheet>
    </>
  );
}
