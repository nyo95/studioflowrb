import { notFound } from "next/navigation";
import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { enabledModuleIds, isModuleEnabled } from "@platform/core/modules";
import { ideas } from "@/apps/ideas/runtime";
import { PageHeader, PageShell } from "@/platform/ui_engine";

import { IdeasBoard } from "./ideas-board";

/** Personal Ideas board (WO-SF-IDEAS-01): private to the signed-in user, used in a project's schedule as a copy. */
export default async function IdeasPage() {
  if (!(await isModuleEnabled("ideas"))) notFound();
  const session = await requirePrincipalGrants().catch(() => null);
  if (!session) redirect("/login");
  const { grants, principal } = session;
  const actor = { kind: "USER" as const, userId: principal.userId, label: principal.displayName };
  const [cards, targets, enabled] = await Promise.all([
    ideas.listIdeaCards({ grants, actor }),
    ideas.listIdeaTargets({ grants, actor }),
    enabledModuleIds(),
  ]);
  return (
    <PageShell measure="wide">
      <PageHeader title="Ideas" description="Your private board. Paste a screenshot (Ctrl+V), drop or pick images; add a title or note later, or never. Only you see it." divider />
      <IdeasBoard cards={cards} targets={targets} presentationEnabled={enabled.includes("presentation")} />
    </PageShell>
  );
}
