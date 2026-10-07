"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";

import { sampleRequestCoordinator } from "@/app/sample-request-runtime";
import { MASTERDATA_ROUTES } from "@/apps/masterdata/public";

function revalidateSampleRequests(): void {
  revalidatePath(MASTERDATA_ROUTES.sampleRequests);
}

const QuoteInputSchema = z.object({
  vendorId: z.string().uuid().optional().nullable().or(z.literal("")),
  skuId: z.string().uuid().optional().nullable().or(z.literal("")),
  quotedAmount: z.string().max(32).optional().nullable().or(z.literal("")),
  quotedCurrency: z.string().max(8).optional().nullable().or(z.literal("")),
  staffNote: z.string().max(1000).optional().nullable().or(z.literal("")),
});
const ShelfInputSchema = z.object({ skuId: z.string().uuid(), rack: z.string().max(40), box: z.string().max(40), quantity: z.coerce.number().int().min(1).max(999).optional(), locationNote: z.string().max(200).optional().nullable() });

function actorOf(principal: { userId: string; displayName: string }) {
  return { kind: "USER" as const, userId: principal.userId, label: principal.displayName };
}

function normalize(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export async function takeSampleRequestAction(sourceRequestId: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const result = await sampleRequestCoordinator.take({ grants, actor: actorOf(principal), sourceRequestId });
    revalidateSampleRequests();
    return result;
  });
}

export async function recordSampleQuoteAction(intakeId: string, input: unknown): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = QuoteInputSchema.safeParse(input);
    if (!parsed.success) throw validationError(parsed.error);
    const result = await sampleRequestCoordinator.recordQuote({
      grants,
      actor: actorOf(principal),
      intakeId,
      vendorId: normalize(parsed.data.vendorId) ?? null,
      skuId: normalize(parsed.data.skuId) ?? null,
      quotedAmount: normalize(parsed.data.quotedAmount) ?? null,
      quotedCurrency: normalize(parsed.data.quotedCurrency) ?? null,
      staffNote: normalize(parsed.data.staffNote) ?? null,
    });
    revalidateSampleRequests();
    return result;
  });
}

export async function markSampleRequestPricedAction(intakeId: string, input: unknown): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = QuoteInputSchema.safeParse(input);
    if (!parsed.success) throw validationError(parsed.error);
    const result = await sampleRequestCoordinator.markPriced({
      grants,
      actor: actorOf(principal),
      intakeId,
      vendorId: normalize(parsed.data.vendorId) ?? null,
      skuId: normalize(parsed.data.skuId) ?? null,
      quotedAmount: normalize(parsed.data.quotedAmount) ?? null,
      quotedCurrency: normalize(parsed.data.quotedCurrency) ?? null,
      staffNote: normalize(parsed.data.staffNote) ?? null,
    });
    revalidateSampleRequests();
    return result;
  });
}

export async function declineSampleRequestAction(intakeId: string, reason: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = z.string().trim().min(1, "A reason is required").max(1000).safeParse(reason);
    if (!parsed.success) throw validationError(parsed.error);
    const result = await sampleRequestCoordinator.decline({ grants, actor: actorOf(principal), intakeId, reason: parsed.data });
    revalidateSampleRequests();
    return result;
  });
}

/** Copies the recorded quote to the material price list for the linked SKU and supplier. */
export async function syncSampleQuoteToPriceAction(intakeId: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = z.string().uuid().safeParse(intakeId);
    if (!parsed.success) throw validationError(parsed.error);
    const result = await sampleRequestCoordinator.syncPrice({ grants, actor: actorOf(principal), intakeId: parsed.data });
    revalidateSampleRequests();
    revalidatePath("/masterdata/pricing");
    return result;
  });
}

export async function shelveSampleRequestAction(sourceRequestId: string, input: unknown): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants(); const parsed = ShelfInputSchema.safeParse(input); if (!parsed.success) throw validationError(parsed.error);
    const result = await sampleRequestCoordinator.shelve({ grants, actor: actorOf(principal), sourceRequestId, ...parsed.data });
    revalidateSampleRequests(); revalidatePath("/masterdata/samples"); return result;
  });
}

export async function retrySampleReceivedAction(sourceRequestId: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { const { principal, grants } = await requirePrincipalGrants(); const result = await sampleRequestCoordinator.retryStudioFlowReceived({ grants, actor: actorOf(principal), sourceRequestId }); revalidateSampleRequests(); return result; });
}
