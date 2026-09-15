import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { AppError } from "@platform/core/errors";
import { formatDateOnly } from "@platform/utilities/date";
import { pointMarkers } from "@/apps/studioflow/domain/mom";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { DocumentBlock, DocumentSheet, PrintButton } from "@/platform/ui_engine";

export const dynamic = "force-dynamic";

const LABEL = "text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-500";

export default async function MomPrintPage({ params }: { params: Promise<{ projectId: string; momId: string }> }) {
  const { projectId, momId } = await params;
  const { grants } = await requirePrincipalGrants();
  const load = async () => {
    try {
      return await Promise.all([
        studioFlow.projects.getProject({ grants, projectId }),
        studioFlow.mom.getDocument({ grants, projectId, documentId: momId }),
      ]);
    } catch (error) {
      if (error instanceof AppError && (error.kind === "NOT_FOUND" || error.kind === "FORBIDDEN")) notFound();
      throw error;
    }
  };
  const [project, doc] = await load();

  return (
    <>
      <title>{`${doc.topic} — ${project.name}`}</title>
      <DocumentSheet
        toolbar={
          <>
            <Link prefetch={false} href={STUDIOFLOW_ROUTES.projectMomDocument(projectId, doc.id)} className="text-sm text-ink-secondary hover:text-ink hover:underline">
              ← Back to editor
            </Link>
            <PrintButton />
          </>
        }
      >
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
          <div className="min-w-0">
            <p className={LABEL}>Minutes of meeting</p>
            <h1 className="mt-1 font-serif text-3xl font-bold uppercase leading-tight">{doc.topic}</h1>
            <p className="mt-1 text-sm">{project.name}</p>
            {project.client ? <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">{project.client.name}</p> : null}
          </div>
          <div className="shrink-0 text-right">
            <p className={LABEL}>Date</p>
            <p className="mt-1 text-sm font-semibold">{formatDateOnly(doc.meetingDate, { locale: "id-ID" })}</p>
          </div>
        </header>

        <section className="grid grid-cols-3 gap-6 border-b border-black py-3 text-sm">
          <div><p className={LABEL}>Venue</p><p className="mt-1">{doc.venue || "—"}</p></div>
          <div><p className={LABEL}>Attendees</p><p className="mt-1 whitespace-pre-wrap">{doc.attendees || "—"}</p></div>
          <div><p className={LABEL}>Prepared by</p><p className="mt-1 font-semibold uppercase">{doc.preparedByName}</p></div>
        </section>

        <div className="mt-5 grid gap-5">
          {doc.items.map((item, index) => {
            const markers = pointMarkers(item.listStyle, item.points.map((p) => p.style));
            const images = item.isTextOnly ? [] : item.images;
            const columns = item.isTextOnly ? "grid-cols-1" : images.length >= 2 ? "grid-cols-[1fr_1fr_1.3fr]" : "grid-cols-[1fr_1.6fr]";
            return (
              <DocumentBlock key={item.id} className="border-b border-neutral-300 pb-5">
                <div className={`grid gap-4 ${columns}`}>
                  {!item.isTextOnly ? (
                    images.length === 0 ? (
                      <div className="aspect-[4/3] border border-dashed border-neutral-300" />
                    ) : (
                      images.map((image) => (
                        <div key={image.id} className="relative aspect-[4/3] overflow-hidden border border-neutral-200">
                          {image.url ? <Image src={image.url} alt={`Section ${index + 1} photo ${image.slot + 1}`} fill unoptimized sizes="60mm" className="object-cover" /> : null}
                        </div>
                      ))
                    )
                  ) : null}
                  <div className="min-w-0">
                    <p className={`${LABEL} mb-2`}>Section {String(index + 1).padStart(2, "0")}</p>
                    <div className="grid gap-1.5">
                      {item.points.map((point, pointIndex) => (
                        <div key={point.id} className="flex gap-2 text-sm leading-6">
                          {item.listStyle !== "NONE" ? <span className="w-6 shrink-0 font-semibold text-neutral-700">{markers[pointIndex]}</span> : null}
                          <p className="m-0 min-w-0 whitespace-pre-wrap">{point.text || "—"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </DocumentBlock>
            );
          })}
        </div>

        <footer className="mt-8 flex justify-between border-t border-black pt-2">
          <span className={LABEL}>Internal document</span>
          <span className={LABEL}>StudioFlow MOM</span>
        </footer>
      </DocumentSheet>
    </>
  );
}
