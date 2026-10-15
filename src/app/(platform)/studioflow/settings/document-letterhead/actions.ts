"use server";

import { revalidatePath } from "next/cache";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { AppError } from "@platform/core/errors";
import { uploadPngWithBrandMarkPolicy } from "@platform/core/settings/brand-mark";
import { objectStorage, prisma } from "@platform/runtime";
import { discardObjects } from "@/apps/studioflow/asset-cleanup";
import { studioFlow } from "@/apps/studioflow/runtime";

export async function updateDocumentLetterheadAction(_prev: ActionResult<{ saved: true }> | null, formData: FormData): Promise<ActionResult<{ saved: true }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const value = formData.get("logoFile");
    const file = value instanceof File && value.size > 0 ? value : null;
    const remove = formData.get("removeLogo") === "on";
    if (remove && file) throw new AppError("VALIDATION", "studioflow.document-identity.image-conflict", "Choose either a new image or remove the current one.");
    let uploaded: string | null = null;
    try {
      uploaded = file ? await uploadPngWithBrandMarkPolicy(file, objectStorage, "studioflow/document-letterhead") : null;
      const result = await studioFlow.documentIdentity.updateDocumentIdentity({
        grants, actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
        companyName: String(formData.get("companyName") ?? ""), companyAddress: String(formData.get("companyAddress") ?? ""), companyEmail: String(formData.get("companyEmail") ?? ""),
        logo: uploaded ? { kind: "set", key: uploaded } : remove ? { kind: "remove" } : { kind: "keep" },
      });
      if (result.replacedLogoKey) await discardObjects(prisma, objectStorage, [result.replacedLogoKey]);
    } catch (error) {
      if (uploaded) await objectStorage.remove(uploaded).catch(() => undefined);
      throw error;
    }
    revalidatePath("/studioflow/settings/document-letterhead");
    return { saved: true as const };
  });
}
