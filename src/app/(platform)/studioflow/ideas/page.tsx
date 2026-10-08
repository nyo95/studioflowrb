import { studioFlow } from "@/apps/studioflow/runtime";
import { PageHeader, PageShell } from "@/platform/ui_engine";

import { pageSession } from "../_components/session";
import { IdeasBoard } from "./ideas-board";

export const dynamic = "force-dynamic";

/** Personal Ideas board (WO-SF-IDEAS-01): private to the signed-in user, used in a project's schedule as a copy. */
export default async function IdeasPage() {
  const { grants, actor } = await pageSession();
  const [cards, targets] = await Promise.all([
    studioFlow.ideas.listIdeaCards({ grants, actor }),
    studioFlow.ideas.listIdeaTargets({ grants, actor }),
  ]);
  return (
    <PageShell measure="wide">
      <PageHeader title="Ideas" description="Your private board. Paste a screenshot (Ctrl+V), drop or pick images; add a title or note later, or never. Only you see it." divider />
      <IdeasBoard cards={cards} targets={targets} />
    </PageShell>
  );
}
