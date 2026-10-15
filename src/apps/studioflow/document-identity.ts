import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";
import type { AuditActor } from "@platform/core/audit";

import { enqueueObjectCleanup } from "./asset-cleanup";
import { P, writeAudit, type StudioFlowPorts, type Db } from "./shared";
import { readStudioFlowDocumentIdentity } from "./public/document-identity";

export const STUDIOFLOW_SETTINGS_ID = "studio";
export const LETTER_TEXT_MAX = 2000;

export type ImageChange = { kind: "keep" } | { kind: "remove" } | { kind: "set"; key: string };

function letterText(value: string | null, field: string): string | null {
  const text = value?.trim() ?? "";
  if (text.length > LETTER_TEXT_MAX) throw new AppError("VALIDATION", "studioflow.document-identity.text-too-long", `${field} can be at most ${LETTER_TEXT_MAX} characters.`);
  return text || null;
}

function nextKey(change: ImageChange, current: string | null): string | null {
  return change.kind === "keep" ? current : change.kind === "set" ? change.key : null;
}

export function createDocumentIdentityService(db: Db, ports: StudioFlowPorts) {
  return {
    getDocumentIdentity: () => readStudioFlowDocumentIdentity(db),
    async updateDocumentIdentity(input: { grants: PermissionGrants; actor: AuditActor; companyName: string | null; companyAddress: string | null; companyEmail: string | null; logo: ImageChange }): Promise<{ replacedLogoKey: string | null }> {
      requirePermission(input.grants, P.settingsManage);
      const email = letterText(input.companyEmail, "E-mail");
      if (email !== null && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new AppError("VALIDATION", "studioflow.document-identity.email-invalid", "Enter a valid e-mail address.");
      const companyName = letterText(input.companyName, "Company name");
      if (companyName !== null && companyName.length > 120) throw new AppError("VALIDATION", "studioflow.document-identity.company-too-long", "Company name can be at most 120 characters.");
      return ports.runTransaction(async (tx) => {
        const current = await tx.sfSettings.findUnique({ where: { id: STUDIOFLOW_SETTINGS_ID } });
        const logoKey = nextKey(input.logo, current?.logo_key ?? null);
        await tx.sfSettings.upsert({
          where: { id: STUDIOFLOW_SETTINGS_ID },
          create: { id: STUDIOFLOW_SETTINGS_ID, company_name: companyName, company_address: letterText(input.companyAddress, "Address"), company_email: email, logo_key: logoKey },
          update: { company_name: companyName, company_address: letterText(input.companyAddress, "Address"), company_email: email, logo_key: logoKey },
        });
        await writeAudit(ports, tx, { action: "studioflow.document-identity.updated", entityType: "SfSettings", entityId: STUDIOFLOW_SETTINGS_ID, actor: input.actor });
        const replacedLogoKey = current?.logo_key && current.logo_key !== logoKey ? current.logo_key : null;
        if (replacedLogoKey) await enqueueObjectCleanup(tx, [replacedLogoKey]);
        return { replacedLogoKey };
      });
    },
  };
}
