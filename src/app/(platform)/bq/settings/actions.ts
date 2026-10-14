"use server";

import { revalidatePath } from "next/cache";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { AppError } from "@platform/core/errors";
import { createPrivateObjectKey } from "@platform/core/storage";
import { objectStorage } from "@platform/runtime";
import { bqService } from "@/apps/bq/runtime";

const MAX_SIGNATURE_BYTES = 1024 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The signer's signature as a PNG (a transparent one prints best over the box). */
async function storeSignature(file: File): Promise<string> {
  if (file.size === 0 || file.size > MAX_SIGNATURE_BYTES) throw new AppError("VALIDATION", "bq.quotation.signature-size", "The signature must be a PNG up to 1 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) throw new AppError("VALIDATION", "bq.quotation.signature-format", "The signature must be a PNG file.");
  const key = createPrivateObjectKey("bq/signatures", "png");
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
    const uploaded = formData.get("signatureFile");
    const remove = formData.get("removeSignature") === "on";
    const file = uploaded instanceof File && uploaded.size > 0 ? uploaded : null;
    if (remove && file) throw new AppError("VALIDATION", "bq.quotation.signature-conflict", "Choose either a new signature or remove the current one.");
    const text = (name: string) => String(formData.get(name) ?? "");
    const newKey = file ? await storeSignature(file) : null;
    try {
      const { replacedSignatureKey } = await bqService.updateQuotationSettings({
        grants,
        actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
        companyAddress: text("companyAddress"),
        companyEmail: text("companyEmail"),
        signerName: text("signerName"),
        defaultPaymentTerms: text("defaultPaymentTerms"),
        defaultPpnPct: text("defaultPpnPct") || "0",
        signature: newKey ? { kind: "set", key: newKey } : remove ? { kind: "remove" } : { kind: "keep" },
      });
      // The old image goes only after the new settings are saved.
      if (replacedSignatureKey) await objectStorage.remove(replacedSignatureKey).catch(() => undefined);
    } catch (error) {
      if (newKey) await objectStorage.remove(newKey).catch(() => undefined);
      throw error;
    }
    revalidatePath("/bq/settings");
    return { saved: true as const };
  });
}
