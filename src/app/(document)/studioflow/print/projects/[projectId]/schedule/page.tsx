import Link from "next/link";
import { notFound } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { AppError } from "@platform/core/errors";
import {
  SCHEDULE_SECTION_LABEL,
  SCHEDULE_SECTIONS,
  cardFieldLabel,
  cardFieldValuesOf,
  effectiveCardFields,
  extraChoicesOf,
  shownOptionOf,
  type ScheduleEntryView,
} from "@/apps/studioflow/domain/schedule";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { DocumentBlock, DocumentSheet, PrintButton, PrintFormatPicker, printFormatFromSearchParams } from "@/platform/ui_engine";

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
  searchParams: Promise<{ paper?: string; orientation?: string }>;
}) {
  const { projectId } = await params;
  const printFormat = printFormatFromSearchParams(await searchParams);
  const { grants } = await requirePrincipalGrants();

  const load = async () => {
    try {
      return await Promise.all([
        studioFlow.projects.getProject({ grants, projectId }),
        studioFlow.schedule.listSchedule({ grants, projectId }),
      ]);
    } catch (error) {
      if (error instanceof AppError && (error.kind === "NOT_FOUND" || error.kind === "FORBIDDEN")) notFound();
      throw error;
    }
  };
  const [project, entries] = await load();
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
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
          <div className="min-w-0">
            <p className={LABEL}>Product Schedule</p>
            <h1 className="mt-1 font-serif text-3xl font-bold uppercase leading-tight">{project.name}</h1>
            {project.client ? <p className="mt-1 text-sm">{project.client.name}</p> : null}
          </div>
          <div className="shrink-0 text-right">
            <p className={LABEL}>Printed</p>
            <p className="mt-1 text-sm font-semibold">{new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </header>

        {SCHEDULE_SECTIONS.map((section) => {
          const sectionEntries = entries.filter((entry) => entry.section === section);
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
                      const details = effectiveCardFields(entry).map((key) => [cardFieldLabel(key, extras), fieldValue[key]] as const);
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
                          {shown ? (
                            <p className="text-xs font-semibold uppercase leading-tight">{shown.productName}</p>
                          ) : (
                            <p className="text-xs italic text-neutral-500">Reserved — no product yet</p>
                          )}
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
