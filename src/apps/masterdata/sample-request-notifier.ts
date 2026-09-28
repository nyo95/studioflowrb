import type { NotificationWriter } from "@platform/core/notifications";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";

import type { SampleRequestResolution, TxClient } from "./services/shared";

function fit(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Tells the designer who asked that Master Data finished their sample request. The link goes to the
 * project's schedule in StudioFlow (a public route constant), where the request lives. A decline carries
 * the staff member's reason, so staff should write it knowing the requester will read it.
 */
export function createSampleRequestResolvedNotifier(deps: { writer: NotificationWriter }) {
  return {
    async resolved(tx: TxClient, { outcome, intake }: SampleRequestResolution): Promise<void> {
      const where = `${intake.productName} (${intake.sourceProjectName})`;
      const price = intake.quotedAmount && intake.quotedCurrency ? ` Quoted price: ${intake.quotedCurrency} ${intake.quotedAmount}.` : "";
      const reason = outcome === "declined" && intake.staffNote ? ` Reason: ${intake.staffNote}` : "";
      await deps.writer.notify(
        {
          recipientUserIds: [intake.requesterUserId],
          appId: "masterdata",
          kind: `masterdata.sample-request.${outcome}`,
          title: outcome === "priced" ? "Your sample request was priced" : "Your sample request was declined",
          body: fit(outcome === "priced" ? `Master Data priced ${where}.${price}` : `Master Data declined ${where}.${reason}`, 300),
          href: STUDIOFLOW_ROUTES.projectSchedule(intake.sourceProjectId),
          entity: { type: "sample_request_intake", id: intake.id },
        },
        tx,
      );
    },
  };
}
