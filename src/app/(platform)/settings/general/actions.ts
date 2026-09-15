"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipalGrants } from "@platform/core/auth";
import { brandMarkStorage, platformSettings } from "@platform/runtime";
import { parsePlatformGeneralSettingsInput } from "@platform/core/settings";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { uploadBrandMarkPng } from "@platform/core/settings/brand-mark";
import { requirePermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";

export async function updateGeneralSettingsAction(
  _prev: ActionResult<{ changed: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ changed: boolean }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    requirePermission(grants, "platform.settings.manage");
    const uploaded = formData.get("brandMarkFile");
    const removeBrandMark = formData.get("removeBrandMark") === "on";
    if (removeBrandMark && uploaded instanceof File && uploaded.size > 0) {
      throw new AppError("VALIDATION", "platform.brand-mark.conflicting-change", "Choose either a new Brand mark or remove the current one.");
    }
    const mainAppId = String(formData.get("mainAppId") ?? "").trim() || null;
    const landingAppId = String(formData.get("landingAppId") ?? "").trim() || null;
    const values = parsePlatformGeneralSettingsInput({
      organizationName: String(formData.get("organizationName") ?? ""),
      appTitle: String(formData.get("appTitle") ?? ""),
      locale: String(formData.get("locale") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
      currency: String(formData.get("currency") ?? ""),
      weekStartsOn: Number(formData.get("weekStartsOn") ?? "1"),
      // Theme is global, typed, and submitted from the read-only Appearance
      // surface; a tampered or missing value is rejected by the union.
      theme: String(formData.get("theme") ?? ""),
      // The browser never supplies a durable storage key or a signed URL.
      brandMarkUrl: null,
      mainAppId,
      landingAppId,
    });
    const result = await platformSettings.update({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      values,
      brandMarkChange: uploaded instanceof File && uploaded.size > 0
        ? { kind: "managed", storageKey: await uploadBrandMarkPng(uploaded, brandMarkStorage) }
        : removeBrandMark ? { kind: "remove" } : { kind: "preserve" },
    });
    revalidatePath("/settings/general");
    revalidatePath("/login");
    revalidatePath("/", "layout");
    return { changed: result.changed };
  });
}
