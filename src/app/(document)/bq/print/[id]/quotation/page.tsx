import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { prisma } from "@platform/core/db";
import { hasAnyPermission } from "@platform/core/rbac";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { brandMarkStorage, objectStorage } from "@platform/runtime";
import {
  BQ_DEFAULT_QUOTATION_TERMS,
  BQ_PERMISSIONS,
  BQ_PRICE_MODE_LABEL,
  bqSectionTotal,
  isMarkerPriceMode,
  type BqItemDetail,
  type BqSectionDetail,
} from "@/apps/bq/public";
import { bqPublicRead, bqService } from "@/apps/bq/runtime";
import { DEFAULT_VALID_DAYS, addDaysIso, paymentTermRows, quotationTotals, scheduleRow, type QuotationTotals } from "@/apps/bq/lib/quotation-letter";
import { DocumentSheet, PrintButton, PrintFormatPicker, printFormatFromSearchParams } from "@/platform/ui_engine";

export const dynamic = "force-dynamic";

/*
 * The quotation prints as the studio's own quotation (owner 2026-10-14, reference "BOQ TEST 2 - PDF"): the logo at the
 * top right of every page; page 1 the letter (QUOTATION, To / Date / Ref# / Valid box, project information, the
 * summary of Section subtotals and the total); page 2 the terms, closing words and the signature box; then the
 * BILL OF QUANTITY: No / Description / Specification / Qty / Unit / Unit Price IDR / Total IDR, a lettered heading per
 * Section, one box per Subsection (roman numerals) with its "SUBTOTAL B.I", "SUBTOTAL B" per Section and
 * "GRAND TOTAL A+B+C". Arial, black lines, amounts without "Rp" (the columns say IDR).
 */
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
const FONT = { fontFamily: "Arial, Helvetica, \"Liberation Sans\", sans-serif" };

const amount = (value: string | null) =>
  value === null ? "" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(Number(value)));
const qty = (value: string) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
const dmy = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };

function Logo({ url, name, small }: { url: string | null; name: string; small?: boolean }) {
  return url
    // A short-lived public-read URL; next/image optimization would cache it.
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={url} alt={name} className={`ml-auto block object-contain object-right ${small ? "h-[9mm]" : "h-[13mm]"}`} />
    : <p className={`text-right font-bold uppercase tracking-[0.18em] ${small ? "text-[17pt]" : "text-[26pt]"}`}>{name}</p>;
}

/* ── page 1 ── */

const lines = (text: string | null) => (text ?? "").split("\n").map((line) => line.trimEnd());

function InfoBox({ contact, client, address, date, number, validUntil }: { contact: string | null; client: string; address: string | null; date: string; number: string | null; validUntil: string }) {
  const cell = "border-black px-1 align-top";
  const addressLines = lines(address).filter(Boolean);
  return (
    <table className="mt-2 w-full border-collapse border-[1.5px] border-black text-[9pt]">
      <colgroup><col style={{ width: "7.5%" }} /><col style={{ width: "42.5%" }} /><col style={{ width: "7.5%" }} /><col style={{ width: "42.5%" }} /></colgroup>
      <tbody>
        <tr>
          <td className={`${cell} border-r font-bold`}>To</td>
          <td className={`${cell} border-r`}>{contact ? <>{contact}<br /></> : null}{client}</td>
          <td className={`${cell} border-r font-bold`}>Date<br /><br />Ref#</td>
          <td className={cell}>{dmy(date)}<br /><br />{number ?? ""}</td>
        </tr>
        <tr>
          <td className={`${cell} border-r pt-3 font-bold`}>Add</td>
          <td className={`${cell} border-r pt-3`}>{addressLines.map((line, index) => <span key={index} className="block">{line}</span>)}</td>
          <td className={`${cell} border-r`} />
          <td className={cell} />
        </tr>
        <tr>
          <td className={`${cell} border-r`} />
          <td className={`${cell} border-r`} />
          <td className={`${cell} border-r pt-1 font-bold`}>Valid</td>
          <td className={`${cell} pt-1`}>{dmy(validUntil)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function SummaryBox({ sections, totals }: { sections: BqSectionDetail[]; totals: QuotationTotals | null }) {
  const row = "border-[1.5px] border-t-0 border-black px-1 text-right font-bold";
  return (
    <div className="mt-10 text-[9pt]">
      <table className="w-full border-collapse border-[1.5px] border-black">
        <colgroup><col style={{ width: "73%" }} /><col style={{ width: "27%" }} /></colgroup>
        <thead>
          <tr className="border-b-[1.5px] border-black">
            <th className="border-r-[1.5px] border-black py-0.5 font-bold">Description</th>
            <th className="px-1 py-0.5 text-right font-bold">IDR</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section, index) => (
            <tr key={section.id}>
              <td className="border-r-[1.5px] border-black px-1 pt-4">
                <span className="inline-block w-[22mm]">SUBTOTAL {LETTERS[index] ?? index + 1}</span>{section.name}
              </td>
              <td className="px-1 pt-4 text-right">{amount(bqSectionTotal(section))}</td>
            </tr>
          ))}
          {/* The studio's box keeps its height whatever the number of Sections. */}
          <tr><td className="border-r-[1.5px] border-black" style={{ height: `${Math.max(12, 62 - sections.length * 9)}mm` }} /><td /></tr>
        </tbody>
      </table>
      <table className="ml-auto border-collapse" style={{ width: "38.5%" }}>
        <colgroup><col style={{ width: "30%" }} /><col style={{ width: "70%" }} /></colgroup>
        <tbody>
          {totals === null ? (
            <tr><td className={`${row} pb-2 pt-3`}>TOTAL</td><td className={`${row} pb-2 pt-3`}>Incomplete</td></tr>
          ) : <>
            <tr><td className={row}>Subtotal</td><td className={`${row} font-normal`}>{amount(totals.subtotal)}</td></tr>
            {totals.rounding !== null ? <tr><td className={row}>Rounding</td><td className={row}>{amount(totals.rounding)}</td></tr> : null}
            {Number(totals.ppnPct) > 0 ? <tr><td className={row}>PPN</td><td className={`${row} font-normal`}>{amount(totals.ppn)}</td></tr> : null}
            <tr><td className={`${row} pb-2 pt-3`}>TOTAL</td><td className={`${row} pb-2 pt-3`}>{amount(totals.total)}</td></tr>
          </>}
        </tbody>
      </table>
    </div>
  );
}

/* ── page 2 ── */

function LetterBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6" style={{ breakInside: "avoid" }}>
      <h2 className="font-bold uppercase">{title}</h2>
      <div className="ml-[7mm]">{children}</div>
    </div>
  );
}

function Signatures({ organization, signer, signatureUrl, contact, client }: { organization: string; signer: string | null; signatureUrl: string | null; contact: string | null; client: string }) {
  return (
    <table className="mt-12 w-full border-collapse border-[1.5px] border-black text-[9pt]" style={{ breakInside: "avoid" }}>
      <colgroup><col style={{ width: "38.5%" }} /><col style={{ width: "61.5%" }} /></colgroup>
      <tbody>
        <tr>
          <td className="h-[48mm] border-r-[1.5px] border-black px-1 align-top">
            <div className="flex h-full min-h-[46mm] flex-col justify-between">
              <span className="font-bold uppercase">{organization}</span>
              {signatureUrl ? (
                // A short-lived signed URL; next/image optimization would cache it.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signatureUrl} alt="" className="mx-auto h-[26mm] w-auto object-contain" />
              ) : null}
              <span>{signer ?? "\u00a0"}</span>
            </div>
          </td>
          <td className="px-1 align-top">
            <div className="flex h-full min-h-[46mm] flex-col justify-between"><span>Confirm the above mentioned</span><span>{contact ?? client}<br />Date :</span></div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/* ── bill of quantity ── */

const COLS = ["2.6%", "30.6%", "35.3%", "4.6%", "4.3%", "9.9%", "12.7%"];
const LINE = "border-x border-black px-[3px] align-top";

function BoqItem({ no, item }: { no: number; item: BqItemDetail }) {
  const marker = isMarkerPriceMode(item.priceMode);
  return (
    <tr style={{ breakInside: "avoid" }}>
      <td className={`${LINE} text-right`}>{no}</td>
      <td className={LINE}>{item.name}</td>
      <td className={`${LINE} whitespace-pre-line`}>{item.specification ?? ""}</td>
      <td className={`${LINE} text-right`}>{qty(item.qty)}</td>
      <td className={`${LINE} text-center`}>{item.unit}</td>
      <td className={`${LINE} text-right`}>{marker ? <span className="italic text-[#e00000]">{BQ_PRICE_MODE_LABEL[item.priceMode]}</span> : amount(item.rate)}</td>
      <td className={`${LINE} text-right`}>{marker ? "" : amount(item.total)}</td>
    </tr>
  );
}

/** One box of Work Items (a Subsection, or the Section's own), its column lines down to the bottom, then its subtotal. */
function BoqBox({ lead, roman, heading, items, subtotalLabel, subtotal }: { lead?: ReactNode; roman?: string; heading?: string; items: BqItemDetail[]; subtotalLabel?: string; subtotal: string | null }) {
  return (
    // A box, its subtotal and the Section heading before it stay on one page whenever they fit (owner 2026-10-14).
    <tbody style={{ breakInside: "avoid" }}>
        {lead}
        <tr><td colSpan={7} className="h-[3mm] p-0" /></tr>
        {heading ? (
          <tr style={{ breakAfter: "avoid" }}>
            <td className={`${LINE} border-t text-right font-bold`}>{roman}</td>
            <td className={`${LINE} border-t font-bold`}>{heading}</td>
            {[0, 1, 2, 3, 4].map((at) => <td key={at} className={`${LINE} border-t`} />)}
          </tr>
        ) : null}
        <tr>{COLS.map((_, at) => <td key={at} className={`${LINE} h-[3mm] ${heading ? "" : "border-t"}`} />)}</tr>
        {items.map((item, index) => <BoqItem key={item.id} no={index + 1} item={item} />)}
        <tr>{COLS.map((_, at) => <td key={at} className={`${LINE} h-[5mm] border-b`} />)}</tr>
        {subtotalLabel ? (
          <tr style={{ breakBefore: "avoid" }}>
            <td colSpan={5} />
            <td className="whitespace-nowrap border border-t-0 border-black px-[3px] text-center font-bold">{subtotalLabel}</td>
            <td className="border border-t-0 border-black px-[3px] text-right font-bold">{amount(subtotal)}</td>
          </tr>
        ) : null}
    </tbody>
  );
}

function groupTotal(items: BqItemDetail[]): string | null {
  return bqSectionTotal({ id: "", name: "", sortOrder: 0, items, subsections: [] });
}

function BillOfQuantity({ sections, grandTotal }: { sections: BqSectionDetail[]; grandTotal: string | null }) {
  const letters = sections.map((_, index) => LETTERS[index] ?? String(index + 1));
  return (
    <section style={{ breakBefore: "page" }} className="pt-1">
      <h2 className="mb-3 text-[10pt] font-bold uppercase">Bill of Quantity</h2>
      <table className="w-full border-collapse text-[7pt] leading-[1.5]">
        <colgroup>{COLS.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
        {/* Repeated on every printed page, as the workbook's print titles. */}
        <thead>
          <tr>
            {["No", "Description", "Specification", "Qty", "Unit", "Unit Price IDR", "Total IDR"].map((label, index) => (
              <th key={label} className={`whitespace-nowrap border-[2.5px] border-black px-[3px] py-[5px] font-bold ${index === 6 ? "text-right" : "text-center"}`}>{label}</th>
            ))}
          </tr>
        </thead>
        {sections.map((section, sectionIndex) => {
          const letter = letters[sectionIndex]!;
          const hasGroups = section.subsections.length > 0;
          // The Section heading travels with its first box, so it is never left alone at the foot of a page.
          const lead = (
            <>
              <tr><td colSpan={7} className="h-[4mm] p-0" /></tr>
              <tr style={{ breakAfter: "avoid" }}>
                <td className="px-[3px] text-center text-[7.5pt] font-bold">{letter}</td>
                <td colSpan={6} className="px-[3px] text-[7.5pt] font-bold uppercase">{section.name}</td>
              </tr>
            </>
          );
          const ownBox = section.items.length > 0;
          return [
            !ownBox && !hasGroups ? <tbody key={`${section.id}-head`}>{lead}</tbody> : null,
            ownBox ? (
              <BoqBox key={`${section.id}-own`} lead={lead} items={section.items} subtotalLabel={hasGroups ? undefined : `SUBTOTAL ${letter}`} subtotal={groupTotal(section.items)} />
            ) : null,
            ...section.subsections.map((subsection, index) => {
              const roman = ROMAN[index] ?? String(index + 1);
              return <BoqBox key={subsection.id} lead={index === 0 && !ownBox ? lead : undefined} roman={roman} heading={subsection.name} items={subsection.items} subtotalLabel={`SUBTOTAL ${letter}.${roman}`} subtotal={groupTotal(subsection.items)} />;
            }),
            hasGroups ? (
              <tbody key={`${section.id}-total`} style={{ breakInside: "avoid" }}>
                <tr><td colSpan={7} className="h-[3mm] p-0" /></tr>
                <tr>
                  <td colSpan={5} />
                  <td className="whitespace-nowrap border-[1.5px] border-black px-[3px] text-center font-bold">SUBTOTAL {letter}</td>
                  <td className="border-[1.5px] border-black px-[3px] text-right font-bold">{amount(bqSectionTotal(section))}</td>
                </tr>
              </tbody>
            ) : null,
          ];
        })}
        <tbody style={{ breakInside: "avoid" }}>
          <tr><td colSpan={7} className="h-[4mm] p-0" /></tr>
          <tr>
            <td colSpan={5} className="whitespace-nowrap pr-[3px] text-right font-bold">GRAND TOTAL {letters.join("+")}</td>
            <td colSpan={2} className="border-2 border-black px-[3px] text-right font-bold">{grandTotal === null ? "Incomplete" : amount(grandTotal)}</td>
          </tr>
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

  const [project, settings, letterhead] = await Promise.all([
    bqPublicRead.getProjectDetail(id),
    readPlatformGeneralSettings(prisma, (key) => brandMarkStorage.createPublicReadUrl(key)),
    bqService.getQuotationSettings(),
  ]);
  if (!project) notFound();
  const signatureUrl = letterhead.signatureKey ? await objectStorage.createSignedReadUrl(letterhead.signatureKey, 600).catch(() => null) : null;

  const q = project.quotation;
  const terms = lines(q.terms ?? BQ_DEFAULT_QUOTATION_TERMS);
  const payment = paymentTermRows(q.paymentTerms ?? letterhead.defaultPaymentTerms);
  const schedule = q.schedule ? scheduleRow(q.schedule) : null;
  const totals = project.grandTotal === null ? null : quotationTotals({ subtotal: project.grandTotal, rounding: q.rounding, ppnPct: q.ppnPct ?? letterhead.defaultPpnPct });
  const markers = (["TBC", "BY_OWNER"] as const).filter((mode) =>
    project.sections.some((section) => [...section.items, ...section.subsections.flatMap((subsection) => subsection.items)].some((item) => item.priceMode === mode)));
  const date = q.date ?? new Date().toISOString().slice(0, 10);
  const organization = settings.organizationName;

  return (
    <>
      <title>{`Quotation — ${project.title}`}</title>
      <style>{"@page { margin: 12mm 15mm 14mm; }"}</style>
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
        {/* The outer table's header is the logo, so it repeats at the top of every printed page. */}
        <table className="w-full border-collapse text-[9pt] leading-[1.35]" style={FONT}>
          <thead>
            <tr><td className="pb-4"><Logo url={settings.brandMarkUrl} name={organization} small /></td></tr>
          </thead>
          <tbody>
            <tr>
              <td>

                <section>
                  {letterhead.companyAddress || letterhead.companyEmail ? (
                    <div className="-mt-2 text-right text-[7.5pt] leading-[1.45]">
                      {lines(letterhead.companyAddress).map((line, index) => <span key={index} className="block">{line || "\u00a0"}</span>)}
                      {letterhead.companyEmail ? <span className="mt-2 block">E : {letterhead.companyEmail}</span> : null}
                    </div>
                  ) : null}
                  {project.status !== "LOCKED" ? (
                    <p className="mb-2 mt-3 border border-black px-2 py-0.5 text-center text-[8pt] font-bold uppercase tracking-[0.12em]">
                      Draft — this project is not locked yet; prices and quantities may still change
                    </p>
                  ) : null}
                  <h1 className="mt-2 text-[12pt] font-bold uppercase">Quotation</h1>
                  <InfoBox contact={q.clientContact} client={project.clientName} address={q.clientAddress} date={date} number={q.number} validUntil={q.validUntil ?? addDaysIso(date, DEFAULT_VALID_DAYS)} />

                  <h2 className="mt-4 font-bold uppercase">Project Information</h2>
                  <dl className="ml-[7mm] grid grid-cols-[22mm_1fr]">
                    <dt>Project</dt><dd>: {project.title}</dd>
                    {q.area ? <><dt>Area</dt><dd>: {q.area}</dd></> : null}
                    {q.location ? <><dt>Location</dt><dd>: {q.location}</dd></> : null}
                  </dl>

                  <p className="mt-8">With reference to the attached Bill of Quantity below, we are pleased to append our costs for your kind consideration as attached :</p>

                  <SummaryBox sections={project.sections} totals={totals} />
                  {markers.length > 0 ? (
                    <p className="mt-3 text-[8pt]">
                      {markers.map((mode) => mode === "TBC" ? "TBC: price to be confirmed, not included in the total." : "By Owner: supplied by the owner, not included in the total.").join(" ")}
                    </p>
                  ) : null}
                </section>

                <section style={{ breakBefore: "page" }}>
                  {schedule ? (
                    <LetterBlock title="Schedule">
                      <div className="grid grid-cols-[10mm_1fr]"><span>{schedule.lead}</span><span>{schedule.rest}</span></div>
                    </LetterBlock>
                  ) : null}
                  {payment.length > 0 ? (
                    <LetterBlock title="Payment Terms">
                      {payment.map((row, index) => <div key={index} className="grid grid-cols-[14mm_1fr]"><span>{row.share}</span><span>{row.what}</span></div>)}
                    </LetterBlock>
                  ) : null}
                  <LetterBlock title="Terms of Condition">
                    {terms.map((term, index) => <p key={index}>{term || "\u00a0"}</p>)}
                  </LetterBlock>

                  <p className="mt-8">
                    We trust the above quote will meet with your approval. We look forward to hear your favorable response. Kindly endorse and return us a copy of this quotation to confirm your acceptance of the above-mentioned.
                    <br />Thank you for your trust and kind attention.
                  </p>

                  <Signatures organization={organization} signer={letterhead.signerName} signatureUrl={signatureUrl} contact={q.clientContact} client={project.clientName} />
                </section>

                <BillOfQuantity sections={project.sections} grandTotal={project.grandTotal} />
              </td>
            </tr>
          </tbody>
        </table>
      </DocumentSheet>
    </>
  );
}
