import { Calculator, Database, LayoutDashboard, Layers, type LucideIcon } from "lucide-react";

/**
 * The launcher icon vocabulary. Apps name an icon by key in their registration; the shell draws it. An unknown or missing
 * key falls back to a neutral icon, so a typo can never break the app switcher.
 */
const APP_ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  database: Database,
  calculator: Calculator,
};

export function AppIcon({ icon, size = 14, className }: { icon?: string; size?: number; className?: string }) {
  const Icon = (icon && APP_ICONS[icon]) || Layers;
  return <Icon size={size} aria-hidden="true" className={className} />;
}
