import type { Metadata } from "next";

import { PageShell, PageHeader } from "@/platform/ui_engine";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in — StudioFlow" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <PageShell style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ width: "100%", display: "grid", justifyItems: "center", gap: 24 }}>
        <PageHeader
          eyebrow="StudioFlow Rebuild"
          title="Sign in"
          divider={false}
        />
        <LoginForm />
      </div>
    </PageShell>
  );
}
