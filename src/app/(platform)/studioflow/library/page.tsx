import { studioFlow } from "@/apps/studioflow/runtime";
import { PageHeader } from "@/platform/ui_engine";

import { pageSession } from "../_components/session";
import { LibraryDirectory } from "./library-directory";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const { grants } = await pageSession();
  const brands = await studioFlow.library.listBrands({ grants });
  return (
    <>
      <PageHeader title="Library" description="Browse Master Data's Brand catalog for reference — read-only, nothing here writes back to Master Data." divider />
      <LibraryDirectory brands={brands} />
    </>
  );
}
