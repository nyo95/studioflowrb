"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipalGrants } from "@platform/core/auth";
import { platformSettings } from "@platform/runtime";
import { parsePlatformGeneralSettingsInput } from "@platform/core/settings";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { saveBrandMarkPng } from "@platform/core/settings/brand-mark";

export async function updateGeneralSettingsAction(
  _prev: ActionResult<{ changed: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ changed: boolean }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const uploaded = formData.get("brandMarkFile");
    const brandMarkUrl = uploaded instanceof File && uploaded.size > 0 ? await saveBrandMarkPng(uploaded) : String(formData.get("brandMarkUrl") ?? "").trim() || null;
    const values = parsePlatformGeneralSettingsInput({
      organizationName: String(formData.get("organizationName") ?? ""),
      appTitle: String(formData.get("appTitle") ?? ""),
      locale: String(formData.get("locale") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
      currency: String(formData.get("currency") ?? ""),
      weekStartsOn: Number(formData.get("weekStartsOn") ?? "1"),
      brandMarkUrl,
    });
    const result = await platformSettings.update({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      values,
    });
    revalidatePath("/settings/general");
    revalidatePath("/login");
    revalidatePath("/", "layout");
    return { changed: result.changed };
  });
}
