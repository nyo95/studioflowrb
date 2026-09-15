import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";

export const dynamic = "force-dynamic";

/** Print/document routes: authenticated, but without the application shell. */
export default async function DocumentLayout({ children }: { children: ReactNode }) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  return children;
}
