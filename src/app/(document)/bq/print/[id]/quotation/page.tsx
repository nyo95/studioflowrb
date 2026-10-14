import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { prisma } from "@platform/core/db";
import { hasAnyPermission } from "@platform/core/rbac";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { formatDateOnly, formatInstant } from "@platform/utilities/date";
import { brandMarkStorage } from "@platform/runtime";
import {
  BQ_DEFAULT_QUOTATION_TERMS,
  BQ_PERMISSIONS,
  BQ_PRICE_MODE_LABEL,
  bqSectionTotal,
  isMarkerPriceMode,
  type BqItemDetail,
  type BqSectionDetail,
} from "@/apps/bq/public";
import { bqPublicRead } from "@/apps/bq/runtime";
import { DocumentBlock, DocumentSheet, PrintButton, PrintFormatPicker, printFormatFromSearchParams } from "@/platform/ui_engine";

export const dynamic = "force-dynamic";

/*
 * The quotation prints like the estimator's workbook (owner 2026-10-14, "seperti Excel di print ... persis"): a
 * SUMMARY page (NO. / DESCRIPTION / TOTAL, one "BILL NO" row per Section), then one bill per Section on its own page
 * with the workbook's grid: NO. / DESCRIPTION / VOL / SAT / SPECIFICATION / RATE / TOTAL RATE, Subsections as lettered
 * groups numbered from 1 with a "SUB TOTAL" row, and the Section "TOTAL". Arial Narrow 10 pt, black grid lines,
 * accounting-style Rp columns, the column header repeated on every printed page, page "n / N" at the foot.
 */
const SECTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SHEET_FONT = { fontFamily: '"Arial Narrow", "Liberation Sans Narrow", "Roboto Condensed", Arial, sans-serif', fontSize: "10pt" };
const CELL = "border border-black px-1.5 py-[3px] align-top";
const HEAD = "border-[1.5px] border-black px-1.5 py-1.5 text-center align-middle font-bold";
const STRONG_ROW = "border-y-[1.5px] border-black";

const number = (value: string, digits: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value));

/** Excel's accounting format: "Rp" against the left edge, the amount against the right, "-" for nothing. */
function Rupiah({ amount, digits }: { amount: string | null; digits: number }) {
  const zero = amount === null || Number(amount) === 0;
  return (
    <span className="flex items-baseline justify-between gap-2 tabular-nums">
      <span>Rp</span>
      <span>{zero ? "-" : number(amount!, digits)}</span>
    </span>
  );
}

function hasSpecification(section: BqSectionDetail) {
  return [...section.items, ...section.subsections.flatMap((subsection) => subsection.items)].some((item) => Boolean(item.specification));
}

/** One Work Item as the client sees it: rate and total only (bq-contract §6.4), or its TBC / By Owner marker. */
function ItemLine({ number: no, item, withSpec }: { number: number; item: BqItemDetail; withSpec: boolean }) {
  const marker = isMarkerPriceMode(item.priceMode);
  return (
    <tr className="break-inside-avoid">
      <td className={`${CELL} text-center`}>{no}</td>
      <td className={CELL}>{item.name}</td>
      <td className={`${CELL} text-right tabular-nums`}>{number(item.qty, 2)}</td>
      <td className={`${CELL} text-center`}>{item.unit}</td>
      {withSpec ? <td className={`${CELL} whitespace-pre-line`}>{item.specification}</td> : null}
      <td className={CELL}>{marker ? <span className="block text-right">{BQ_PRICE_MODE_LABEL[item.priceMode]}</span> : <Rupiah amount={item.rate} digits={2} />}</td>
      <td className={CELL}><Rupiah amount={marker ? null : item.total} digits={0} /></td>
    </tr>
  );
}

/** A Subsection's (or the Section's own Work Items') total, the same way the Section total is taken. */
function groupTotal(items: BqItemDetail[]): string | null {
  return bqSectionTotal({ id: "", name: "", sortOrder: 0, items, subsections: [] });
}

function SpanRow({ label, amount, columns, strong }: { label: ReactNode; amount: string | null; columns: number; strong?: boolean }) {
  return (
    <tr className={`break-inside-avoid ${strong ? STRONG_ROW : ""}`}>
      <td className={CELL} />
      <td colSpan={columns - 2} className={`${CELL} text-center font-bold`} style={{ fontSize: "11pt" }}>{label}</td>
      <td className={`${CELL} font-bold`}><Rupiah amount={amount} digits={0} /></td>
    </tr>
  );
}

function Bill({ section, letter }: { section: BqSectionDetail; letter: string }) {
  const withSpec = hasSpecification(section);
  const columns = withSpec ? 7 : 6;
  return (
    <section className="mt-10 break-before-page border-t-2 border-dashed border-neutral-300 pt-6 print:mt-0 print:border-0 print:pt-0">
      <h2 className="mb-3 font-bold uppercase" style={{ fontSize: "11pt" }}>BILL NO {letter}. {section.name}</h2>
      <table className="w-full border-collapse" style={SHEET_FONT}>
        <colgroup>
          <col style={{ width: "6%" }} />
          <col style={{ width: withSpec ? "26%" : "40%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "6%" }} />
          {withSpec ? <col style={{ width: "25%" }} /> : null}
          <col style={{ width: withSpec ? "14%" : "20%" }} />
          <col style={{ width: withSpec ? "16%" : "21%" }} />
        </colgroup>
        {/* A table header repeats at the top of every printed page, as the workbook's print titles do. */}
        <thead>
          <tr>
            <th className={HEAD}>NO.</th>
            <th className={HEAD}>DESCRIPTION</th>
            <th className={HEAD}>VOL</th>
            <th className={HEAD}>SAT</th>
            {withSpec ? <th className={HEAD}>SPECIFICATION</th> : null}
            <th className={HEAD}>RATE</th>
            <th className={HEAD}>TOTAL RATE</th>
          </tr>
        </thead>
        <tbody>
          {section.items.map((item, index) => <ItemLine key={item.id} number={index + 1} item={item} withSpec={withSpec} />)}
          {section.items.length > 0 && section.subsections.length > 0 ? (
            <SpanRow label="SUB TOTAL" amount={groupTotal(section.items)} columns={columns} strong />
          ) : null}
          {section.subsections.map((subsection, index) => [
            <tr key={subsection.id} className="break-after-avoid">
              <td className={`${CELL} text-center font-bold`}>{SECTION_LETTERS[index] ?? index + 1}</td>
              <td colSpan={columns - 1} className={`${CELL} font-bold`}>{subsection.name}</td>
            </tr>,
            ...subsection.items.map((item, itemIndex) => <ItemLine key={item.id} number={itemIndex + 1} item={item} withSpec={withSpec} />),
            <SpanRow key={`${subsection.id}-total`} label={`SUB TOTAL ${subsection.name}`} amount={groupTotal(subsection.items)} columns={columns} strong />,
          ])}
          <SpanRow label="TOTAL" amount={bqSectionTotal(section)} columns={columns} />
        </tbody>
      </table>
    </section>
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
      {/* Page "n / N" at the foot of every printed page, as the workbook's footer. */}
      <style>{"@page { margin: 13mm 6mm; @bottom-center { content: counter(page) \" / \" counter(pages); font: 9pt Arial, sans-serif; } }"}</style>
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
        <div style={SHEET_FONT}>
          {project.status !== "LOCKED" ? (
            <p className="mb-3 border-2 border-black px-3 py-1.5 text-center font-black uppercase tracking-[0.2em]">
              Draft — this project is not locked yet; prices and quantities may still change
            </p>
          ) : null}

          <header className="flex items-start justify-between gap-6 pb-4">
            <div className="flex min-w-0 items-start gap-3">
              {settings.brandMarkUrl ? (
                // A short-lived public-read URL; next/image optimization would cache it.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.brandMarkUrl} alt="" className="h-12 w-12 object-contain" />
              ) : null}
              <div className="min-w-0">
                <p className="font-bold uppercase">{settings.organizationName}</p>
                <p className="mt-2 font-bold uppercase" style={{ fontSize: "11pt" }}>PROJECT : {project.title}</p>
              </div>
            </div>
            <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
              <dt>No.</dt>
              <dd className="font-bold">{project.quotation.number ?? "—"}</dd>
              <dt>Date</dt>
              <dd className="font-bold">{project.quotation.date ? formatDateOnly(project.quotation.date) : formatInstant(new Date(), { style: "date" })}</dd>
              <dt>Client</dt>
              <dd className="font-bold">{project.clientName}</dd>
            </dl>
          </header>

          <table className="w-full border-collapse" style={{ ...SHEET_FONT, fontSize: "11pt" }}>
            <colgroup>
              <col style={{ width: "8%" }} />
              <col style={{ width: "60%" }} />
              <col style={{ width: "32%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className={HEAD}>NO.</th>
                <th className={HEAD}>DESCRIPTION</th>
                <th className={HEAD}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {project.sections.map((section, index) => {
                const letter = SECTION_LETTERS[index] ?? String(index + 1);
                return (
                  <tr key={section.id} className="break-inside-avoid" style={{ fontSize: "10pt" }}>
                    <td className={`${CELL} py-1.5 text-center font-bold`}>{letter}</td>
                    <td className={`${CELL} py-1.5 font-bold uppercase`}>BILL NO {letter}. {section.name}</td>
                    <td className={`${CELL} py-1.5 font-bold`}><Rupiah amount={bqSectionTotal(section)} digits={2} /></td>
                  </tr>
                );
              })}
              <tr><td colSpan={3} className="h-4" /></tr>
              <tr>
                <td />
                <td className={`${CELL} text-center font-bold`}>{project.grandTotal === null ? "TOTAL (INCOMPLETE)" : "TOTAL"}</td>
                <td className={`${CELL} font-bold`}><Rupiah amount={project.grandTotal} digits={0} /></td>
              </tr>
            </tbody>
          </table>

          {markers.length > 0 ? (
            <p className="mt-2" style={{ fontSize: "9pt" }}>
              {markers.map((mode) => mode === "TBC" ? "TBC: price to be confirmed, not included in the total." : "By Owner: supplied by the owner, not included in the total.").join(" ")}
            </p>
          ) : null}

          <DocumentBlock className="mt-8">
            <h2 className="border-b border-black pb-1 font-bold uppercase">Terms &amp; Conditions</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {terms.map((term, index) => <li key={index}>{term}</li>)}
            </ol>
          </DocumentBlock>

          <DocumentBlock className="mt-12 grid grid-cols-2 gap-12">
            <div>
              <p>Prepared by</p>
              <div className="mt-16 border-t border-black pt-1">{settings.organizationName}</div>
            </div>
            <div>
              <p>Approved by</p>
              <div className="mt-16 border-t border-black pt-1">{project.clientName}</div>
            </div>
          </DocumentBlock>

          {project.sections.map((section, index) => (
            <Bill key={section.id} section={section} letter={SECTION_LETTERS[index] ?? String(index + 1)} />
          ))}
        </div>
      </DocumentSheet>
    </>
  );
}
