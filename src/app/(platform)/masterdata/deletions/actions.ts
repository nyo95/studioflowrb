"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requirePrincipalGrants } from "@platform/core/auth"
import { runSafeAction, type ActionResult } from "@platform/core/actions"
import { validationError } from "@platform/core/validation"
import { masterDataService } from "@/apps/masterdata/runtime"

function revalidateDeletions(): void {
  revalidatePath("/masterdata/deletions")
  // also refresh related masterdata routes that may have been altered by a purge
  revalidatePath("/masterdata")
  revalidatePath("/masterdata/brands")
  revalidatePath("/masterdata/vendors")
  revalidatePath("/masterdata/skus")
  revalidatePath("/masterdata/units")
  revalidatePath("/masterdata/categories")
}

export async function approveDeletionAction(
  requestId: string,
): Promise<ActionResult<{ requestId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants()
    const schema = z.object({ requestId: z.string().uuid() })
    const parsed = schema.safeParse({ requestId })
    if (!parsed.success) throw validationError(parsed.error)

    const result = await masterDataService.approveDeletion({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      requestId: parsed.data.requestId,
    })
    revalidateDeletions()
    return result
  })
}

export async function rejectDeletionAction(
  requestId: string,
  reason?: string,
): Promise<ActionResult<{ requestId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants()
    const schema = z.object({ requestId: z.string().uuid(), reason: z.string().max(1000).optional().nullable() })
    const parsed = schema.safeParse({ requestId, reason: reason ?? null })
    if (!parsed.success) throw validationError(parsed.error)

    const result = await masterDataService.rejectDeletion({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      requestId: parsed.data.requestId,
      reason: parsed.data.reason ?? undefined,
    })
    revalidateDeletions()
    return result
  })
}
