"use server";

import { revalidatePath } from "next/cache";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction } from "@platform/core/actions";
import type { ActionResult } from "@platform/core/actions";
import { studioFlowService } from "@/apps/studioflow/runtime";

export async function updateNamingTemplateAction(
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.updateNamingTemplate(
      grants,
      { kind: "USER", userId: principal.userId, label: principal.displayName },
      { naming_template: String(formData.get("naming_template") ?? "") },
    );
    revalidatePath("/studioflow/settings");
  });
}
