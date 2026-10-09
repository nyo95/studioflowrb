import Link from "next/link";
import { notFound } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { AppError } from "@platform/core/errors";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { DocumentPage, DocumentSheet, PrintButton, PrintFormatPicker, printFormatFromSearchParams } from "@/platform/ui_engine";
import { formatInstant } from "@platform/utilities/date";

export const dynamic = "force-dynamic";

/**
 * One slide per sheet, and the sheet is the paper: the screen shows exactly the pages the printer will give (same size, same
 * margins), so what is seen is what is printed. Each page: a quiet header, the image as large as the space allows with its
 * numbered pins, and a legend underneath set small, in columns, with a hairline between rows.
 */
/**
 * The legend grows sideways before it shrinks: more rows make more columns, and only a very long legend sets its type smaller. The
 * page never changes size; the picture above gives up height to make room, so nothing runs off the sheet.
 */
function legendTier(count: number) {
  if (count <= 4) return { columns: 1, font: "8.5pt", gap: "1.2mm", badge: "4.4mm" };
  if (count <= 12) return { columns: 2, font: "8.5pt", gap: "1.2mm", badge: "4.4mm" };
  if (count <= 24) return { columns: 3, font: "8pt", gap: "1mm", badge: "4mm" };
  if (count <= 40) return { columns: 4, font: "7.5pt", gap: "0.8mm", badge: "3.6mm" };
  return { columns: 5, font: "7pt", gap: "0.6mm", badge: "3.3mm" };
}

export default async function PresentationPrintPage({ params, searchParams }: { params: Promise<{ projectId: string; boardId: string }>; searchParams: Promise<{ paper?: string; orientation?: string }> }) {
  const { projectId, boardId } = await params;
  const printFormat = printFormatFromSearchParams(await searchParams);
  const { grants } = await requirePrincipalGrants();
  const [project, board] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }),
    studioFlow.presentation.getBoard({ grants, projectId, boardId }),
  ]).catch((error) => { if (error instanceof AppError && (error.kind === "NOT_FOUND" || error.kind === "FORBIDDEN")) notFound(); throw error; });
  const printed = formatInstant(new Date(), { locale: "id-ID", style: "date" });

  const header = (
    <header className="flex shrink-0 items-baseline justify-between gap-6 border-b border-black pb-[2.5mm]">
      <h1 className="m-0 min-w-0 truncate text-[10pt] font-semibold uppercase tracking-[0.16em]">
        <span className="text-neutral-500">Presentation · {project.name} · </span>
        <span>{board.title}</span>
      </h1>
      <p className="m-0 shrink-0 text-[8pt] text-neutral-500">{printed}</p>
    </header>
  );

  return (
    <>
    {/* The browser names a saved PDF after the page title: "project - board", not the address. */}
    <title>{`${project.name} - ${board.title}`}</title>
    <DocumentSheet
      paged
      printFormat={printFormat}
      toolbar={<><Link prefetch={false} href={STUDIOFLOW_ROUTES.projectPresentationBoard(projectId, boardId)} className="text-sm text-ink-secondary hover:underline">Back to presentation</Link><div className="flex items-center gap-3"><PrintFormatPicker value={printFormat} /><PrintButton /></div></>}
    >
      {board.slides.length === 0 ? (
        <DocumentPage className="flex flex-col" style={{ "--doc-pad": "11mm 13mm" } as React.CSSProperties}>
          {header}
          <p className="mt-6 text-sm text-neutral-500">This board has no slides yet.</p>
        </DocumentPage>
      ) : null}
      {board.slides.map((slide, slideIndex) => {
        const legend = slide.annotations.map((annotation, index) => ({
          id: annotation.id,
          number: index + 1,
          code: annotation.scheduleEntry?.code ?? null,
          name: annotation.scheduleEntry?.productName ?? (annotation.scheduleEntry ? null : annotation.note) ?? null,
          note: annotation.scheduleEntry && annotation.note ? annotation.note : null,
        }));
        const tier = legendTier(legend.length);
        return (
          <DocumentPage key={slide.id} className="flex flex-col" style={{ "--doc-pad": "11mm 13mm" } as React.CSSProperties}>
            {header}
            <div className="min-h-0 flex-1 py-[3.5mm] [container-type:size]">
              <div className="grid h-full w-full place-items-center">
                {slide.imageUrl ? (
                  <div className="relative inline-block leading-[0] outline outline-[0.25mm] outline-black/15">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slide.imageUrl} alt={`Slide ${slideIndex + 1}`} className="block h-auto w-auto" style={{ maxWidth: "100cqw", maxHeight: "100cqh" }} />
                    {slide.annotations.map((annotation, index) => (
                      <span
                        key={annotation.id}
                        style={{ left: `${annotation.pinX}%`, top: `${annotation.pinY}%` }}
                        className="absolute grid size-[6mm] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black text-[8.5pt] font-bold leading-none text-white ring-[0.6mm] ring-white"
                      >
                        {index + 1}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400">No image</p>
                )}
              </div>
            </div>
            {legend.length > 0 ? (
              <div className="shrink-0 border-t border-black pt-[2mm]">
                <p className="mb-[1mm] text-[7pt] font-semibold uppercase tracking-[0.22em] text-neutral-500">Legend</p>
                <ol className="m-0 list-none p-0" style={{ columnCount: tier.columns, columnGap: "10mm", fontSize: tier.font }}>
                  {legend.map((item) => (
                    <li key={item.id} className="flex break-inside-avoid items-baseline gap-[2.5mm] border-b border-neutral-200 leading-tight" style={{ paddingBlock: tier.gap }}>
                      <span className="grid shrink-0 translate-y-[0.4mm] place-items-center rounded-full bg-black font-bold leading-none text-white" style={{ width: tier.badge, height: tier.badge, fontSize: `calc(${tier.font} * 0.8)` }}>{item.number}</span>
                      <span className="min-w-0">
                        {item.code ? <span className="mr-[1.5mm] font-semibold tabular-nums">{item.code}</span> : null}
                        {item.name ? <span className="text-neutral-800">{item.name}</span> : null}
                        {item.note ? <span className="text-neutral-500"> · {item.note}</span> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </DocumentPage>
        );
      })}
    </DocumentSheet>
    </>
  );
}
