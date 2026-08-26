import { PageHeader, PageShell, SectionCard, Text } from "@/platform/ui_engine";

export const metadata = { title: "Master Data" };

export default function MasterDataPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="StudioFlow"
        title="Master Data"
        description="Manage canonical reference data: parties, brands, categories, SKUs, and pricing."
      />
      <SectionCard>
        <Text as="p" tone="secondary">
          Select a section from the navigation to begin.
        </Text>
      </SectionCard>
    </PageShell>
  );
}
