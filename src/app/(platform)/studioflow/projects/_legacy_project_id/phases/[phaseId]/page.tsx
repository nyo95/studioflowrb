import { redirect } from "next/navigation";

/**
 * Per UX spec: tidak ada halaman fase terpisah.
 * All phase management is inline on the project detail page.
 * Redirect any direct access back to the project.
 */
export default async function PhaseDetailPage({
  params,
}: {
  params: Promise<{ id: string; phaseId: string }>;
}) {
  const { id } = await params;
  redirect(`/studioflow/projects/${id}`);
}
