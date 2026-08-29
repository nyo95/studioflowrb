import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppError } from "@platform/core/errors";
import { ErrorState, PageShell } from "@/platform/ui_engine";
import { AppShell, Text } from "@/platform/ui_engine";
import { MasterDataNavigation, MasterDataUtilityNavigation } from "./masterdata-navigation";
import { MasterDataTopbar } from "./masterdata-topbar";
import { requireMasterDataRequestContext } from "@masterdata/infrastructure/request-context";

// Master Data reads request-scoped identity and live database state. It must
// never be evaluated as static build-time content.
export const dynamic = "force-dynamic";

export default async function MasterDataLayout({ children }: { children: ReactNode }) {
  let operatorLabel: string;
  try {
    // App entry fails closed without `masterdata.access` (Foundation F0 §9).
    const context = await requireMasterDataRequestContext();
    operatorLabel = context.actor.label;
  } catch (error) {
    if (error instanceof AppError && error.kind === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof AppError && error.kind === "FORBIDDEN") {
      return (
        <PageShell>
          <ErrorState
            title="No access to Master Data"
            description="Your account does not have the masterdata.access permission."
          />
        </PageShell>
      );
    }
    throw error;
  }

  return (
    <AppShell
      brand={<Text as="span" style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>Master Data</Text>}
      collapsedBrand={<Text as="span" style={{ fontWeight: 700 }}>MD</Text>}
      collapsible
      navigationLabel="Master Data navigation"
      navigation={<MasterDataNavigation />}
      utility={<MasterDataUtilityNavigation />}
      topbar={<MasterDataTopbar operatorLabel={operatorLabel} />}
    >
      {children}
    </AppShell>
  );
}
