import { redirect } from "next/navigation";

/**
 * Per UX spec: iteration management is inline on the project detail page.
 * Redirect any direct access back to the project.
 */
export default async function IterationDetailPage({
  params,
}: {
  params: Promise<{ id: string; phaseId: string; iterationId: string }>;
}) {
  const { id } = await params;
  redirect(`/studioflow/projects/${id}`);
}
