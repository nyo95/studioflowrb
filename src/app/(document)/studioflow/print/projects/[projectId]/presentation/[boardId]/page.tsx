import Link from "next/link";
import { notFound } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { AppError } from "@platform/core/errors";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { DocumentBlock, DocumentSheet, PrintButton, PrintFormatPicker, printFormatFromSearchParams } from "@/platform/ui_engine";

export const dynamic = "force-dynamic";

export default async function PresentationPrintPage({ params, searchParams }: { params: Promise<{ projectId: string; boardId: string }>; searchParams: Promise<{ paper?: string; orientation?: string }> }) {
  const { projectId, boardId } = await params;
  const printFormat = printFormatFromSearchParams(await searchParams);
  const { grants } = await requirePrincipalGrants();
  const [project, board] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }),
    studioFlow.presentation.getBoard({ grants, projectId, boardId }),
  ]).catch((error) => { if (error instanceof AppError && (error.kind === "NOT_FOUND" || error.kind === "FORBIDDEN")) notFound(); throw error; });
  return <DocumentSheet printFormat={printFormat} toolbar={<><Link prefetch={false} href={STUDIOFLOW_ROUTES.projectPresentationBoard(projectId, boardId)} className="text-sm text-ink-secondary hover:underline">Back to presentation</Link><div className="flex items-center gap-3"><PrintFormatPicker value={printFormat} /><PrintButton /></div></>}>
    <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4"><div><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Presentation</p><h1 className="mt-1 font-ui-sans text-3xl font-black uppercase leading-tight">{board.title}</h1><p className="mt-1 text-sm">{project.name}</p></div><div className="text-right text-sm"><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Printed</p><p className="mt-1">{new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p></div></header>
    {board.slides.map((slide, slideIndex) => <section key={slide.id} className="break-after-page pt-6"><DocumentBlock><div className="relative overflow-hidden border border-neutral-300">{slide.imageUrl ? <img src={slide.imageUrl} alt={`Slide ${slideIndex + 1}`} className="block h-auto w-full" /> : null}{slide.annotations.map((annotation, index) => <span key={annotation.id} style={{ left: `${annotation.pinX}%`, top: `${annotation.pinY}%` }} className="absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black text-xs font-bold text-white">{index + 1}</span>)}</div><div className="mt-3 grid gap-1 text-sm">{slide.annotations.map((annotation, index) => <div key={annotation.id} className="grid grid-cols-[1.5rem_1fr] gap-2"><span className="font-bold">{index + 1}</span><span>{annotation.scheduleEntry ? `${annotation.scheduleEntry.code}${annotation.scheduleEntry.productName ? ` — ${annotation.scheduleEntry.productName}` : ""}` : annotation.note || ""}{annotation.scheduleEntry && annotation.note ? ` — ${annotation.note}` : ""}</span></div>)}</div></DocumentBlock></section>)}
  </DocumentSheet>;
}
