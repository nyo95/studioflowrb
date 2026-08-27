import type { ReactNode } from "react";
import { AppShell, Text } from "@/platform/ui_engine";
import { MasterDataNavigation, MasterDataUtilityNavigation } from "./masterdata-navigation";

// Master Data reads request-scoped identity and live database state. It must
// never be evaluated as static build-time content.
export const dynamic = "force-dynamic";

function MasterDataBrand() {
  return <Text as="span" style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>Master Data</Text>;
}

export default function MasterDataLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      brand={<MasterDataBrand />}
      collapsedBrand={<Text as="span" style={{ fontWeight: 700 }}>MD</Text>}
      collapsible
      navigationLabel="Master Data navigation"
      navigation={<MasterDataNavigation />}
      utility={<MasterDataUtilityNavigation />}
    >
      {children}
    </AppShell>
  );
}
