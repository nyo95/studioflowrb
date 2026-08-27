import Link from "next/link";
import { Archive, BriefcaseBusiness, FileSpreadsheet, FolderTree, Ruler } from "lucide-react";
import { PageHeader, PageShell, SectionCard, Text } from "@/platform/ui_engine";

const settings = [
  { href: "/masterdata/settings/units", title: "Units", description: "Controlled measurement, purchase, usage, and rate units.", icon: Ruler },
  { href: "/masterdata/settings/business-types", title: "Business Types", description: "Editable Party classifications, separate from operational roles.", icon: BriefcaseBusiness },
  { href: "/masterdata/categories", title: "Categories", description: "PRODUCT classification and WORK pricing hierarchy.", icon: FolderTree },
  { href: "/masterdata/data", title: "Import & Export", description: "Versioned whole-schema workbook exchange.", icon: FileSpreadsheet },
  { href: "/masterdata/audit", title: "Audit Log", description: "Append-only Master Data change history.", icon: Archive },
] as const;

export default function MasterDataSettingsPage() {
  return (
    <PageShell>
      <PageHeader eyebrow="Master Data" title="General Settings" description="Controlled dictionaries, data exchange, and governance." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {settings.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} style={{ color: "inherit", textDecoration: "none" }}>
            <SectionCard title={title}>
              <Icon size={17} aria-hidden="true" />
              <Text tone="secondary">{description}</Text>
            </SectionCard>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
