import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";

import { UiEngineShowcase } from "./ui-engine-showcase";

export const dynamic = "force-dynamic";

/** An internal component gallery: a valid session is required, like every page outside sign-in. */
export default async function UiEnginePage() {
  if (!(await requirePrincipalGrants().catch(() => null))) redirect("/login");
  return <UiEngineShowcase />;
}
