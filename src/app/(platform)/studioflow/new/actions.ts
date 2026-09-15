"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction } from "@platform/core/actions";
import type { ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { studioFlowService } from "@/apps/studioflow/runtime";

const ProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(200),
  client_id: z.string().uuid("Select a valid client").optional().or(z.literal("")),
  client_name: z.string().trim().max(200).optional().or(z.literal("")),
  lead_user_id: z.string().uuid().optional().or(z.literal("")),
  location: z.string().trim().max(100).optional(),
  address: z.string().trim().max(500).optional(),
  area: z.string().trim().optional(),
  opened_at: z.string().min(1, "Opening date is required"),
});

export async function createProjectAction(
  _prev: ActionResult<never> | null,
  formData: FormData,
): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = ProjectSchema.safeParse({
      name: String(formData.get("name") ?? ""),
      client_id: String(formData.get("client_id") ?? ""),
      client_name: String(formData.get("client_name") ?? ""),
      lead_user_id: String(formData.get("lead_user_id") ?? "") || undefined,
      location: String(formData.get("location") ?? "") || undefined,
      address: String(formData.get("address") ?? "") || undefined,
      area: String(formData.get("area") ?? "") || undefined,
      opened_at: String(formData.get("opened_at") ?? ""),
    });
    if (!parsed.success) throw validationError(parsed.error);
    const { opened_at, area, lead_user_id, client_id, client_name, ...rest } = parsed.data;
    const project = await studioFlowService.createProject(
      grants,
      { kind: "USER", userId: principal.userId, label: principal.displayName },
      {
        ...rest,
        client_id: client_id || undefined,
        client_name: client_name || undefined,
        lead_user_id: lead_user_id || undefined,
        area: area || undefined,
        opened_at: new Date(opened_at),
      },
    );
    revalidatePath("/studioflow");
    redirect(`/studioflow/projects/${project.id}`);
  });
}
