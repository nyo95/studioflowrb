import { redirect } from "next/navigation";

/** Lives in Master Data settings now (owner, 2026-10-06); kept so old links still land. */
export default function MovedToSettingsPage() {
  redirect("/masterdata/settings/categories");
}
