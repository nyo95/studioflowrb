import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { objectStorage } from "@platform/runtime";
import { Breadcrumb, EmptyState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";
import { MomEditor } from "../../mom-editor";
import { MomCorrectionForm } from "../mom-correction-form";
import { PrintButton } from "../print-button";

export const dynamic = "force-dynamic";

function localDateTimeInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default async function MomPage({ params }: { params: Promise<{ id: string; momId: string }> }) {
  const { id, momId } = await params;
  const { grants } = await requirePrincipalGrants();
  if (!hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead)) {
    return <SectionCard><EmptyState icon={FileText} title="Access denied" description="You do not have permission to read this MOM." /></SectionCard>;
  }
  const mom = await studioFlowService.getMom(grants, id, momId).catch((error: { kind?: string }) => {
    if (error?.kind === "NOT_FOUND") return null;
    throw error;
  });
  if (!mom) notFound();
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.momManage) && mom.state === "DRAFT";
  const canCorrect = hasPermission(grants, STUDIOFLOW_PERMISSIONS.momIssue) && mom.state === "ISSUED";
  const items = await Promise.all(mom.items.map(async (item) => ({ ...item, images: await Promise.all(item.images.map(async (image) => ({ ...image, read_url: await objectStorage.createSignedReadUrl(image.storage_key, 600).catch(() => null) }))) })));
  const defaults = { topic: mom.topic, meeting_at: localDateTimeInput(mom.meeting_at), venue: mom.venue, attendees_text: mom.attendees_text, prepared_by_name: mom.prepared_by_name };

  return <>
    <Breadcrumb entries={[{ label: "Projects", href: "/studioflow/projects" }, { label: "Project", href: `/studioflow/${id}` }, { label: mom.topic }]} />
    <PageHeader eyebrow="StudioFlow · MOM" title={mom.topic} description={mom.state === "DRAFT" ? "Editable project meeting draft" : "Immutable project meeting record"} meta={<span className="text-xs text-ink-tertiary">{mom.state}{mom.sequence ? ` · MOM ${mom.sequence}` : ""}{mom.issued_at ? ` · issued ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(mom.issued_at)}` : ""}</span>} actions={<div className="flex gap-2 print:hidden"><Link href={`/studioflow/${id}`} className="rounded-action px-2 py-1 text-sm font-medium text-action hover:underline">Back to project</Link><PrintButton /></div>} divider />
    {canManage ? <SectionCard title="Edit MOM"><MomEditor projectId={id} momId={momId} metadata={defaults} initial={items.map((item) => ({ sort_order: item.sort_order, is_text_only: item.is_text_only, list_style: item.list_style, points: item.points.map((point) => ({ sort_order: point.sort_order, text: point.text, style: point.style })), images: item.images.map((image) => ({ sort_order: image.sort_order, storage_key: image.storage_key, alt_text: image.alt_text, read_url: image.read_url })) }))} /></SectionCard> : <SectionCard title="Meeting record"><article className="grid gap-4 print:border-0"><header><h2 className="font-serif text-2xl font-semibold">{mom.topic}</h2><p className="text-sm text-ink-secondary">{new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(mom.meeting_at)} · {mom.venue ?? "No venue"}</p><p className="text-sm text-ink-secondary">Prepared by {mom.prepared_by_name}{mom.attendees_text ? ` · Attendees: ${mom.attendees_text}` : ""}</p></header>{items.map((item) => <section key={item.id} className="grid gap-2">{item.points.map((point, index) => <p key={point.id} className="whitespace-pre-wrap">{point.style === "BULLET" ? "• " : point.style === "NUMBERED" ? `${index + 1}. ` : ""}{point.text}</p>)}{item.images.length ? <div className="grid gap-2 sm:grid-cols-2">{item.images.map((image) => image.read_url ? <Image key={image.id} src={image.read_url} alt={image.alt_text ?? "MOM supporting image"} width={900} height={600} unoptimized className="max-h-80 w-full object-contain" /> : <p key={image.id} className="text-sm text-ink-tertiary">Image unavailable</p>)}</div> : null}</section>)}</article></SectionCard>}
    {canCorrect ? <SectionCard title="Issue correction" description="Creates a new immutable MOM and preserves this record as superseded."><MomCorrectionForm projectId={id} momId={momId} defaults={defaults} /></SectionCard> : null}
  </>;
}
