import { PageHeader, PageShell } from "@/platform/ui_engine";

import { MessengerClient } from "./messenger-client";

export const dynamic = "force-dynamic";

export default function MessengerPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Platform"
        title="Messenger"
        description="Private 1:1 messages across the web app."
        divider
      />
      <MessengerClient />
    </PageShell>
  );
}
