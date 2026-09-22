import Link from "next/link";

import { ContextNavHeading, ContextNavLink } from "@/platform/ui_engine";

const SECTIONS = [
  { href: "#project-naming", label: "Project naming" },
  { href: "#checklist-templates", label: "Checklist Templates" },
  { href: "#phase-templates", label: "Phase Templates" },
  { href: "#product-schedule", label: "Product Schedule" },
] as const;

/** In-page section jump list plus a bridge back to platform-level settings. */
export function StudioSettingsNav() {
  return (
    <>
      <ContextNavHeading>On this page</ContextNavHeading>
      {SECTIONS.map((item) => (
        <ContextNavLink key={item.href} href={item.href}>{item.label}</ContextNavLink>
      ))}
      <ContextNavHeading>Settings</ContextNavHeading>
      <ContextNavLink component={Link} href="/settings/general">Platform Settings</ContextNavLink>
    </>
  );
}
