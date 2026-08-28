import Link from "next/link";

import { PageHeader, PageShell, SectionCard, Text, buttonClasses } from "@/platform/ui_engine";

export default function HomePage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="StudioFlow Rebuild"
        title="Foundation workspace"
        description="Product implementation remains paused while shared contracts are reviewed."
      />
      <SectionCard>
        <Text as="p" tone="secondary">Review the shared interface foundations before product work begins.</Text>
        <Link className={buttonClasses("primary") + " mt-4"} href="/ui-engine">
          <span>Open UI Engine</span>
        </Link>
      </SectionCard>
    </PageShell>
  );
}
