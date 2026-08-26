import type { ReactNode } from "react";
import {
  Archive,
  BookOpen,
  Box,
  Building2,
  DollarSign,
  FolderTree,
  LayoutDashboard,
  Tag,
} from "lucide-react";

import { AppShell, NavItem, Text } from "@/platform/ui_engine";

function MasterDataBrand() {
  return <Text as="span" style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>Master Data</Text>;
}

export default function MasterDataLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      brand={<MasterDataBrand />}
      collapsible
      navigationLabel="Master Data navigation"
      navigation={
        <>
          <NavItem href="/masterdata" icon={<LayoutDashboard size={16} />}>Overview</NavItem>
          <NavItem href="/masterdata/parties" icon={<Building2 size={16} />}>Parties</NavItem>
          <NavItem href="/masterdata/categories" icon={<FolderTree size={16} />}>Categories</NavItem>
          <NavItem href="/masterdata/brands" icon={<Tag size={16} />}>Brands</NavItem>
          <NavItem href="/masterdata/skus" icon={<Box size={16} />}>SKUs</NavItem>
          <NavItem href="/masterdata/pricing" icon={<DollarSign size={16} />}>Pricing</NavItem>
          <NavItem href="/masterdata/settings/units" icon={<BookOpen size={16} />}>Units</NavItem>
          <NavItem href="/masterdata/audit" icon={<Archive size={16} />}>Audit log</NavItem>
        </>
      }
    >
      {children}
    </AppShell>
  );
}
