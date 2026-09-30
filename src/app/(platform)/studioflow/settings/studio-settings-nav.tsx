import { ContextNavHeading, ContextNavLink } from "@/platform/ui_engine";

const SECTIONS = [
  { href: "#archive-retention", label: "Archived files" },
  { href: "#checklist-templates", label: "Checklist Templates" },
  { href: "#phase-templates", label: "Phase Templates" },
] as const;

/** In-page section jump list, shown under the shared settings sidebar. */
export function StudioSettingsAnchors() {
  return (
    <div className="grid gap-1">
      <ContextNavHeading>On this page</ContextNavHeading>
      {SECTIONS.map((item) => (
        <ContextNavLink key={item.href} href={item.href}>{item.label}</ContextNavLink>
      ))}
    </div>
  );
}
