import { redirect } from "next/navigation";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { brandMarkStorage, objectStorage, prisma } from "@platform/runtime";
import { studioFlow } from "@/apps/studioflow/runtime";
import { ErrorState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { SettingsFrame } from "@/app/(platform)/settings/settings-navigation";
import { canOpenSettingsSection } from "@/app/(platform)/settings/settings-sections";
import { pageSession } from "../../_components/session";
import { STUDIOFLOW_SETTINGS_TRAIL, studioFlowSettingsGroups } from "../sections";
import { DocumentLetterheadForm } from "./document-letterhead-form";

export const dynamic = "force-dynamic";
export default async function DocumentLetterheadPage() {
  const session = await pageSession().catch(() => null); if (!session) redirect("/login");
  const groups = studioFlowSettingsGroups(session.grants); const allowed = canOpenSettingsSection(groups, "document-letterhead");
  if (!allowed) return <SettingsFrame appMark="SF" trail={STUDIOFLOW_SETTINGS_TRAIL} title="Document letterhead" groups={groups} active="document-letterhead"><SectionCard><ErrorState title="Access denied" description="Only people who manage StudioFlow settings can change the document letterhead." /></SectionCard></SettingsFrame>;
  const [settings, platform] = await Promise.all([studioFlow.documentIdentity.getDocumentIdentity(), readPlatformGeneralSettings(prisma, (key) => brandMarkStorage.createPublicReadUrl(key))]);
  const logoUrl = settings.logoKey ? await objectStorage.createSignedReadUrl(settings.logoKey, 600).catch(() => null) : null;
  return <SettingsFrame appMark="SF" trail={STUDIOFLOW_SETTINGS_TRAIL} title="Document letterhead" description="The identity printed on StudioFlow documents." groups={groups} active="document-letterhead"><PageHeader eyebrow="StudioFlow" title="Document letterhead" divider /><DocumentLetterheadForm settings={settings} logoUrl={logoUrl} organizationName={platform.organizationName} /></SettingsFrame>;
}
