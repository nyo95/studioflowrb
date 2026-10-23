import Link from "next/link";
import { notFound } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { AppError } from "@platform/core/errors";
import { formatInstant } from "@platform/utilities/date";
import {
  SCHEDULE_SECTION_LABEL,
  SCHEDULE_INITIALS_FIELDS,
  SCHEDULE_SECTIONS,
  cardFieldLabel,
  cardFieldValuesOf,
  effectiveCardFields,
  extraChoicesOf,
  scheduleCardTitle,
  shownOptionOf,
  type ScheduleEntryView,
} from "@/apps/studioflow/domain/schedule";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { DocumentBlock, DocumentSheet, PrintButton, PrintFormatPicker, printFormatFromSearchParams } from "@/platform/ui_engine";

import { LetterheadStrip, readConsultantLetterhead } from "@/apps/studioflow/public/letterhead";

export const dynamic = "force-dynamic";

const LABEL = "text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-500";

function groupByCategory(entries: readonly ScheduleEntryView[]) {
  const map = new Map<string, ScheduleEntryView[]>();
  for (const entry of entries) map.set(entry.category, [...(map.get(entry.category) ?? []), entry]);
  return [...map.entries()].map(([category, rows]) => ({ category, rows }));
}

export default async function SchedulePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ paper?: string; orientation?: string; hidden?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const printFormat = printFormatFromSearchParams(query);
  // Hidden items are printed only when the Print / PDF question asked for them (owner, 2026-10-23).
  const includeHidden = query.hidden === "include";
  const { principal, grants } = await requirePrincipalGrants();

  const load = async () => {
    try {
      return await Promise.all([
        studioFlow.projects.getProject({ grants, actorId: principal.userId, projectId }),
        studioFlow.schedule.listSchedule({ grants, projectId }),
      ]);
    } catch (error) {
      if (error instanceof AppError && (error.kind === "NOT_FOUND" || error.kind === "FORBIDDEN")) notFound();
      throw error;
    }
  };
  const [[project, allEntries], letterhead] = await Promise.all([load(), readConsultantLetterhead()]);
  const entries = includeHidden ? allEntries : allEntries.filter((entry) => !entry.hidden);
  const cardColumns = printFormat.orientation === "landscape" ? "grid-cols-4" : "grid-cols-3";

  return (
    <>
      <title>{`Product Schedule — ${project.name}`}</title>
      <DocumentSheet
        printFormat={printFormat}
        toolbar={
          <>
            <Link prefetch={false} href={STUDIOFLOW_ROUTES.projectSchedule(projectId)} className="text-sm text-ink-secondary hover:text-ink hover:underline">
              ← Back to schedule
            </Link>
            <div className="flex items-center gap-3">
              <PrintFormatPicker value={printFormat} />
              <PrintButton />
            </div>
          </>
        }
      >
        <LetterheadStrip letterhead={letterhead} />
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
          <div className="min-w-0">
            <p className={LABEL}>Product Schedule</p>
            <h1 className="mt-1 font-ui-sans text-3xl font-black uppercase leading-tight">{project.name}</h1>
            {project.client ? <p className="mt-1 text-sm">{project.client.name}</p> : null}
          </div>
          <div className="shrink-0 text-right">
            <p className={LABEL}>Printed</p>
            <p className="mt-1 text-sm font-semibold">{formatInstant(new Date(), { style: "date" })}</p>
          </div>
        </header>

        {SCHEDULE_SECTIONS.map((section) => {
          const sectionEntries = entries.filter((entry) => entry.section === section && shownOptionOf(entry));
          if (sectionEntries.length === 0) return null;
          return (
            <section key={section} className="mt-6">
              <h2 className="border-b border-black pb-1 text-sm font-bold uppercase tracking-[0.1em]">{SCHEDULE_SECTION_LABEL[section]}</h2>
              {groupByCategory(sectionEntries).map((group) => (
                <div key={group.category} className="mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">{group.category}</h3>
                  <div className={`mt-2 grid gap-4 ${cardColumns}`}>
                    {group.rows.map((entry) => {
                      const shown = shownOptionOf(entry);
                      const extras = extraChoicesOf(entry);
                      const fieldValue = cardFieldValuesOf(entry);
                      // Same title rule as the Board, the pre-print view: Type, or Initials type while there is no Type.
                      const heading = shown ? scheduleCardTitle(shown) : null;
                      const details = effectiveCardFields(entry)
                        .filter((key) => !(heading?.fromInitials && (SCHEDULE_INITIALS_FIELDS as readonly string[]).includes(key)))
                        .map((key) => [cardFieldLabel(key, extras), fieldValue[key]] as const);
                      return (
                        <DocumentBlock key={entry.id} className="border border-neutral-300 p-2">
                          <div className="relative mb-2 aspect-[4/5] w-full overflow-hidden bg-neutral-100">
                            {shown?.imageUrl ? (
                              // Signed private URLs are short-lived; next/image optimization would cache them.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={shown.imageUrl} alt={shown.productName} className="h-full w-full object-cover" />
                            ) : null}
                            <span className="absolute right-1 top-1 bg-white/90 px-1 font-mono text-[9px] font-bold">{entry.code}</span>
                          </div>
                            <p className="text-xs font-semibold uppercase leading-tight">{heading?.title}</p>
                          <div className="mt-1 grid gap-0.5">
                            {details.map(([label, value]) => (value ? (
                              <div key={label} className="flex justify-between gap-2 text-[10px]">
                                <span className="text-neutral-500">{label}</span>
                                <span className="text-right">{value}</span>
                              </div>
                            ) : null))}
                          </div>
                        </DocumentBlock>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </DocumentSheet>
    </>
  );
}
