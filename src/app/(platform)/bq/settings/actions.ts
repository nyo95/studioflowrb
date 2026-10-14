"use server";

import { revalidatePath } from "next/cache";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { AppError } from "@platform/core/errors";
import { createPrivateObjectKey } from "@platform/core/storage";
import { objectStorage } from "@platform/runtime";
import { bqService } from "@/apps/bq/runtime";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The issuer's logo or the signer's signature as a PNG (a transparent one prints best). */
async function storePng(file: File, folder: "bq/signatures" | "bq/logos", label: string): Promise<string> {
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new AppError("VALIDATION", "bq.quotation.image-size", `The ${label} must be a PNG up to 2 MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) throw new AppError("VALIDATION", "bq.quotation.image-format", `The ${label} must be a PNG file.`);
  const key = createPrivateObjectKey(folder, "png");
  await objectStorage.put({ key, body: bytes, bytes: bytes.length, contentType: "image/png" });
  return key;
}

/** The studio's quotation letterhead and defaults (owner 2026-10-14). */
export async function updateQuotationSettingsAction(
  _prev: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const picked = (name: string) => { const value = formData.get(name); return value instanceof File && value.size > 0 ? value : null; };
    const signatureFile = picked("signatureFile");
    const logoFile = picked("logoFile");
    const removeSignature = formData.get("removeSignature") === "on";
    const removeLogo = formData.get("removeLogo") === "on";
    if ((removeSignature && signatureFile) || (removeLogo && logoFile)) throw new AppError("VALIDATION", "bq.quotation.image-conflict", "Choose either a new image or remove the current one.");
    const text = (name: string) => String(formData.get(name) ?? "");
    const stored: string[] = [];
    try {
      const signatureKey = signatureFile ? await storePng(signatureFile, "bq/signatures", "signature") : null;
      if (signatureKey) stored.push(signatureKey);
      const logoKey = logoFile ? await storePng(logoFile, "bq/logos", "logo") : null;
      if (logoKey) stored.push(logoKey);
      const { replacedSignatureKey, replacedLogoKey } = await bqService.updateQuotationSettings({
        grants,
        actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
        companyName: text("companyName"),
        companyAddress: text("companyAddress"),
        companyEmail: text("companyEmail"),
        signerName: text("signerName"),
        defaultPaymentTerms: text("defaultPaymentTerms"),
        defaultPpnPct: text("defaultPpnPct") || "0",
        signature: signatureKey ? { kind: "set", key: signatureKey } : removeSignature ? { kind: "remove" } : { kind: "keep" },
        logo: logoKey ? { kind: "set", key: logoKey } : removeLogo ? { kind: "remove" } : { kind: "keep" },
      });
      // Old images go only after the new settings are saved.
      for (const key of [replacedSignatureKey, replacedLogoKey]) if (key) await objectStorage.remove(key).catch(() => undefined);
    } catch (error) {
      for (const key of stored) await objectStorage.remove(key).catch(() => undefined);
      throw error;
    }
    revalidatePath("/bq/settings");
    return { saved: true as const };
  });
}
