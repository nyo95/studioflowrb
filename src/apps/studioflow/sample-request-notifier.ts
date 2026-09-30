import type { NotificationWriter } from "@platform/core/notifications";
import type { PeopleDirectory } from "@platform/core/rbac/people";
import { MASTERDATA_PERMISSIONS, MASTERDATA_ROUTES } from "@/apps/masterdata/public";

import type { SampleRequestedEvent, TxClient } from "./shared";

/** Keeps a sentence within a notification's length limit without cutting it mid-word badly. */
function fit(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Tells the Master Data staff who work sample requests that a new one arrived. StudioFlow may know the
 * permission that defines those people because it is part of Master Data's public vocabulary; it never
 * learns anything else about how Master Data handles the request. The person who asked is never told about
 * their own request. Looking the staff up is best effort: a failure there must not stop a designer from
 * requesting a sample, so it simply tells nobody.
 */
export function createSampleRequestNotifier(deps: { writer: NotificationWriter; people: PeopleDirectory }) {
  return {
    async requested(tx: TxClient, event: SampleRequestedEvent): Promise<void> {
      let staff: Array<{ id: string }>;
      try {
        staff = await deps.people.listHolders(MASTERDATA_PERMISSIONS.sampleRequestManage);
      } catch {
        return;
      }
      const recipients = staff.map((person) => person.id).filter((id) => id !== event.requestedById);
      if (recipients.length === 0) return;
      await deps.writer.notify(
        {
          recipientUserIds: recipients,
          appId: "studioflow",
          kind: "studioflow.sample-request.created",
          title: "New sample request",
          body: fit(event.requestedFrom
            ? `${event.requestedByName} asked ${event.requestedFrom} for a sample of ${event.productName} (${event.projectName}).`
            : `${event.requestedByName} needs a sample of ${event.productName} (${event.projectName}) and did not name a supplier.`, 300),
          href: MASTERDATA_ROUTES.sampleRequests,
          entity: { type: "sample_request", id: event.requestId },
        },
        tx,
      );
    },
  };
}
