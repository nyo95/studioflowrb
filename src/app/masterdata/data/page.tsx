import { Download } from "lucide-react";
import { PageHeader, PageShell, SectionCard, Text } from "@/platform/ui_engine";
import { ImportWorkbook } from "./import-workbook";

export default function MasterDataExchangePage() {
  return (
    <PageShell>
      <PageHeader eyebrow="General settings" title="Import & Export" description="Exchange the complete versioned Master Data workbook without making Excel a second source of truth." />
      <SectionCard title="Export">
        <Text tone="secondary">Exports every live Master Data resource you are permitted to read.</Text>
        <a className="ui-button ui-button--secondary" href="/masterdata/data/export"><Download size={16} aria-hidden="true" /> Download XLSX</a>
      </SectionCard>
      <SectionCard title="Import">
        <Text tone="secondary">Validate first. Apply rechecks every row and commits the whole workbook in one transaction; omitted rows are never deleted.</Text>
        <ImportWorkbook />
      </SectionCard>
    </PageShell>
  );
}
