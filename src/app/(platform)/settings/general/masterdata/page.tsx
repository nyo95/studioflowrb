import { redirect } from "next/navigation";

/** Master Data settings moved into Master Data (owner, 2026-10-06); kept so old links still land. */
export default function MasterDataSettingsMovedPage() {
  redirect("/masterdata/settings");
}
